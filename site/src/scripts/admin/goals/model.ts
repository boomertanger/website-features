// /admin/goals: the draft plan in memory, and everything that talks to the server (docs/specs/goal-tracker.md §4, §6).
// Reads (admin only, by the rules): sites/{siteId}/goalTracker/config, goalItems, goalMetrics.
// Writes: only through the callables goalTrackerEdit, goalTrackerSetMetric and goalTrackerPublish; no client writes.
// The callables reply with the saved item, so the state is patched in place instead of re-read after every click.
import { call } from "../../../lib/call";
import type { Status, Level, Relaunch } from "../../goals/data";

export type Visibility = "public" | "members" | "private";
export interface DItem {
  id: string; type: "track" | "goal" | "milestone" | "task"; parentId: string | null; level: number | null;
  title: string; description: string; help: string; icon: string; status: Status | null;
  startDate: string | null; dueDate: string | null; visibility: Visibility; order: number; relaunch: Relaunch;
  metricId: string | null; target: number | null; changedSincePublish: boolean;
}
export interface DMetric { id: string; label: string; unit: string; source: string; value: number | null; updatedAt: number | null; visibility: Visibility }
export interface DConfig {
  northStar: string; story: string; result: string; levels: Level[];
  relaunchAt: number | null; nomineesAt: number | null; showAt: number | null;
  pendingChanges: number; lastPublishedAt: number | null;
}
export interface Draft { config: DConfig; items: DItem[]; metrics: Record<string, DMetric> }

export const state: { draft: Draft } = { draft: { config: emptyConfig(), items: [], metrics: {} } };
function emptyConfig(): DConfig {
  return { northStar: "", story: "", result: "", levels: [], relaunchAt: null, nomineesAt: null, showAt: null, pendingChanges: 0, lastPublishedAt: null };
}

const ms = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | number | null | undefined;
  return t == null ? null : typeof t === "number" ? t : typeof t.toMillis === "function" ? t.toMillis() : null;
};

/** Reads the whole draft. Throws if the rules or the network refuse. */
export async function loadDraft(): Promise<Draft> {
  const { db, doc, getDoc, collection, getDocs, SITE_ID } = await import("../../../lib/db");
  const [cfg, items, metrics] = await Promise.all([
    getDoc(doc(db, "sites", SITE_ID, "goalTracker", "config")),
    getDocs(collection(db, "sites", SITE_ID, "goalItems")),
    getDocs(collection(db, "sites", SITE_ID, "goalMetrics")),
  ]);
  const c = (cfg.exists() ? cfg.data() : {}) as Partial<DConfig>;
  const draft: Draft = {
    config: { ...emptyConfig(), ...c, levels: c.levels || [], pendingChanges: c.pendingChanges || 0, lastPublishedAt: ms(c.lastPublishedAt) },
    items: items.docs.map((d) => ({ ...(d.data() as Omit<DItem, "id">), id: d.id, relaunch: (d.data() as DItem).relaunch || { needed: false, weeks: 0, side: "site" } })),
    metrics: Object.fromEntries(metrics.docs.map((d) => [d.id, { ...(d.data() as Omit<DMetric, "id">), id: d.id, updatedAt: ms(d.data().updatedAt) }])),
  };
  state.draft = draft;
  return draft;
}

// ---------- the tree ----------
const byOrder = (a: DItem, b: DItem) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id);
export const childrenOf = (items: DItem[], id: string | null) => items.filter((i) => (i.parentId || null) === id).sort(byOrder);
export function descendants(items: DItem[], id: string): DItem[] {
  const out: DItem[] = [];
  const walk = (p: string) => { for (const c of childrenOf(items, p)) { out.push(c); walk(c.id); } };
  walk(id);
  return out;
}
/** Depth-first rows with their depth. */
export function flatten(items: DItem[]): { item: DItem; depth: number }[] {
  const out: { item: DItem; depth: number }[] = [];
  const walk = (p: string | null, depth: number) => { for (const c of childrenOf(items, p)) { out.push({ item: c, depth }); walk(c.id, depth + 1); } };
  walk(null, 0);
  return out;
}
export const CHILD_TYPE: Record<string, DItem["type"] | null> = { track: "goal", goal: "milestone", milestone: "task", task: null };
export const pathOf = (items: DItem[], item: DItem): DItem[] => {
  const map = new Map(items.map((i) => [i.id, i]));
  const out: DItem[] = [];
  for (let p = item.parentId ? map.get(item.parentId) : undefined, n = 0; p && n < 10; p = p.parentId ? map.get(p.parentId) : undefined, n++) out.unshift(p);
  return out;
};

/** Today as YYYY-MM-DD in the viewer's own timezone, for the Overdue label. */
export const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const isOverdue = (i: DItem) => !!i.dueDate && i.dueDate < todayKey() && i.status !== "done" && i.status !== "dropped" && i.type !== "track";

/** The card an item counts in on the readiness list: the goal above it, else its track. */
export function groupOf(items: DItem[], item: DItem): DItem {
  const map = new Map(items.map((i) => [i.id, i]));
  let track: DItem | null = null;
  for (let p = item.parentId ? map.get(item.parentId) : undefined, n = 0; p && n < 10; p = p.parentId ? map.get(p.parentId) : undefined, n++) {
    if (p.type === "goal") return p;
    if (p.type === "track") track = p;
  }
  return track || item;
}
export interface RelGroup { goal: DItem; icon: string; items: DItem[] }
/** Every item flagged for the relaunch (any visibility; the draft), grouped, in plan order. */
export function relaunchGroups(items: DItem[]): RelGroup[] {
  const flagged = items.filter((i) => i.relaunch?.needed && i.status !== "dropped");
  const map = new Map(items.map((i) => [i.id, i]));
  const groups = new Map<string, RelGroup>();
  for (const i of flagged) {
    const g = groupOf(items, i);
    let root = g; for (let n = 0; root.parentId && map.get(root.parentId) && n < 10; n++) root = map.get(root.parentId)!;
    const e = groups.get(g.id) || { goal: g, icon: root.icon || "", items: [] };
    e.items.push(i); groups.set(g.id, e);
  }
  const order = new Map(flatten(items).map((r, n) => [r.item.id, n]));
  return [...groups.values()].sort((a, b) => (order.get(a.goal.id) ?? 0) - (order.get(b.goal.id) ?? 0)).map((g) => ({ ...g, items: g.items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) }));
}

/** Income items: tied to a USD metric, or in the track that has one (the server enforces the same rule). */
export function incomeIds(items: DItem[], metrics: Record<string, DMetric>): Set<string> {
  const map = new Map(items.map((i) => [i.id, i]));
  const rootOf = (i: DItem) => { let x = i; for (let n = 0; x.parentId && map.get(x.parentId) && n < 10; n++) x = map.get(x.parentId)!; return x; };
  const usd = (mid: string | null) => !!mid && !!metrics[mid] && String(metrics[mid].unit).toUpperCase() === "USD";
  const tracks = new Set(items.filter((i) => usd(i.metricId)).map((i) => rootOf(i).id));
  return new Set(items.filter((i) => usd(i.metricId) || tracks.has(rootOf(i).id)).map((i) => i.id));
}

// ---------- calls (each patches the state from the reply) ----------
const bump = () => { state.draft.config.pendingChanges += 1; };

export async function createItem(type: DItem["type"], parentId: string | null, changes: Record<string, unknown>, confirmVisible = false) {
  const r = await call<{ id: string; item: DItem }>("goalTrackerEdit", { action: "create", type, parentId, changes, confirmVisible });
  state.draft.items.push({ ...r.item, id: r.id, changedSincePublish: true });
  bump();
  return r.item;
}
export async function updateItem(id: string, changes: Record<string, unknown>, opts: { confirmVisible?: boolean; reason?: string } = {}) {
  const r = await call<{ item: DItem; changed: boolean }>("goalTrackerEdit", { action: "update", id, changes, ...opts });
  if (r.changed) patch(r.item);
  return r;
}
export async function setStatus(id: string, status: Status) {
  const r = await call<{ item: DItem; changed: boolean }>("goalTrackerEdit", { action: "setStatus", id, status });
  if (r.changed) patch(r.item);
}
function patch(item: DItem) {
  const i = state.draft.items.findIndex((x) => x.id === item.id);
  if (i >= 0) state.draft.items[i] = { ...state.draft.items[i], ...item, changedSincePublish: true };
  bump();
}
export async function deleteItem(id: string, reason = "") {
  await call("goalTrackerEdit", { action: "delete", id, reason });
  const gone = new Set([id, ...descendants(state.draft.items, id).map((d) => d.id)]);
  state.draft.items = state.draft.items.filter((i) => !gone.has(i.id));
  bump();
}
export async function moveItem(id: string, direction: "up" | "down") {
  const r = await call<{ moved: boolean }>("goalTrackerEdit", { action: "reorder", id, direction });
  if (!r.moved) return false;
  const it = state.draft.items.find((x) => x.id === id)!;
  const sibs = childrenOf(state.draft.items, it.parentId);
  const i = sibs.findIndex((s) => s.id === id), j = direction === "up" ? i - 1 : i + 1;
  if (sibs[j]) { const t = sibs[j].order; sibs[j].order = it.order; it.order = t; sibs[j].changedSincePublish = it.changedSincePublish = true; }
  bump();
  return true;
}
export async function saveConfig(changes: Partial<DConfig>) {
  const r = await call<{ changed: boolean }>("goalTrackerEdit", { action: "updateConfig", changes });
  if (r.changed) { Object.assign(state.draft.config, changes); bump(); }
}
export async function setMetric(metricId: string, value: number) {
  const r = await call<{ updatedAt: number }>("goalTrackerSetMetric", { metricId, value });
  const m = state.draft.metrics[metricId];
  if (m) { m.value = value; m.updatedAt = r.updatedAt; }
  bump();
}
export async function saveMetric(metricId: string | null, changes: Partial<Pick<DMetric, "label" | "unit" | "visibility">>, confirmVisible = false) {
  const r = await call<{ metricId: string; metric: DMetric; changed: boolean }>("goalTrackerEdit", { action: "metricSave", metricId, changes, confirmVisible });
  if (r.changed) { state.draft.metrics[r.metricId] = { ...state.draft.metrics[r.metricId], ...r.metric, id: r.metricId }; bump(); }
}
export async function deleteMetric(metricId: string) {
  await call("goalTrackerEdit", { action: "metricDelete", metricId });
  delete state.draft.metrics[metricId];
  for (const i of state.draft.items) if (i.metricId === metricId) { i.metricId = null; i.target = null; i.changedSincePublish = true; }
  bump();
}
export async function seedPlan() { return call<{ items: number }>("goalTrackerEdit", { action: "seed" }); }
export async function publish() { return call<{ publishedAt: number; items: number }>("goalTrackerPublish", {}); }

// ---------- America/Chicago date and time (the relaunch is set in the stream's home timezone) ----------
const TZ = "America/Chicago";
function offsetMs(at: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(at / 1000) * 1000;
}
/** "2027-02-06" and "19:00" as Chicago wall-clock time -> milliseconds. */
export function chicagoToMs(day: string, time: string): number {
  const [y, m, d] = day.split("-").map(Number), [h, mi] = (time || "00:00").split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let guess = wall - offsetMs(wall);
  guess = wall - offsetMs(guess);
  return guess;
}
/** Milliseconds -> { day: "2027-02-06", time: "19:00" } in Chicago. */
export function msToChicago(at: number | null): { day: string; time: string } {
  if (!at) return { day: "", time: "" };
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
