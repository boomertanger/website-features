// Cloud Stash's state and every action (docs/specs/cloud-stash.md §4, §8). Real admins read Firestore (data.ts) and call the stash callables; with the non-production ?as=admin preview
// (signed out) the page reads site/src/data/preview-stash.json and the actions change a local copy, so every layout and state can be checked without an account (?tier=owner|overseer|
// steward, ?usage=healthy|paused|over). Display only: the server checks every action.
import { call } from "../../lib/call";
import { getAuthState } from "../../lib/auth";
import { loadSnapshot, loadLog, loadItem, DEFAULT_SETTINGS, type Snapshot, type LogEntry, type Item, type Asset, type Rule, type Usage } from "./data";
import { isPreview, preview } from "./gate";
import type { Tier } from "./status";

export const S = { snap: null as Snapshot | null, log: [] as LogEntry[], tier: "overseer" as Tier, loaded: false, error: false };

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let demo: Snapshot | null = null;
let demoLog: LogEntry[] = [];
let demoUsageKey = "healthy";

function buildDemo(): Snapshot {
  const p = preview(), now = Date.now();
  const q = new URLSearchParams(location.search).get("usage");
  demoUsageKey = q === "paused" || q === "over" ? q : "healthy";
  const u = p.usage[demoUsageKey];
  const usage: Usage = { ...u, fetchedAt: now - u.fetchedAtAgo };
  return {
    usage, current: { totalBytes: p.current.totalBytes, byFeature: p.current.byFeature, recountedAt: now - p.current.recountedAgo },
    scan: { at: now - p.scan.agoMs, by: p.scan.by, counts: p.scan.counts, untracked: p.scan.untracked.map((x: any) => ({ publicId: x.publicId, type: x.type, bytes: x.bytes, createdAt: now - x.ageMs })), unrecorded: [], truncated: false },
    sweep: { lastRunAt: now - p.sweep.lastRunAgo, status: p.sweep.status, purged: p.sweep.purged, bytes: p.sweep.bytes, failures: [], perRule: {}, trigger: p.sweep.trigger },
    alerts: p.alerts.map((a: any) => ({ kind: a.kind, title: a.title, body: a.body, severity: a.severity, at: now - a.agoMs })),
    settings: { ...DEFAULT_SETTINGS, ...p.settings }, retentionDays: p.retentionDays,
    rules: p.rules.map((r: any) => ({ id: r.id, name: r.name, target: r.target, statuses: r.statuses, days: r.days, enabled: r.enabled, legacy: r.legacy, updatedAt: now - r.updatedAgo, lastRun: r.lastRun ? { at: now - r.lastRun.agoMs, purged: r.lastRun.purged, bytes: r.lastRun.bytes, failed: r.lastRun.failed } : null, legacyText: r.legacyText })),
    assets: p.assets.map((a: any) => ({ id: a.id, publicId: a.publicId, url: a.url, feature: a.feature, sizeBytes: a.sizeBytes, deliveryType: a.deliveryType, createdAt: now - a.ageMs, linkedDoc: a.linkedDoc, scan: a.scan })),
    assetsCapped: false,
  };
}
const demoLogBuild = (): LogEntry[] => preview().log.map((e: any, i: number) => ({ id: `l${i}`, action: e.action, actorName: e.actorName, reason: e.reason, createdAt: Date.now() - e.agoMs, itemTitle: e.itemTitle, details: e.details }));

export async function load(tier: Tier) {
  S.tier = tier;
  S.error = false;
  try {
    if (isPreview()) { demo ||= buildDemo(); demoLog = demoLog.length ? demoLog : demoLogBuild(); S.snap = demo; S.log = demoLog; }
    else { [S.snap, S.log] = await Promise.all([loadSnapshot(), loadLog()]); }
    S.loaded = true;
  } catch (err) {
    console.error("stash: the page didn't load", err);
    S.error = true;
  }
}

/** The title, kind and link of what a file belongs to (cached for the page). */
const itemCache = new Map<string, Promise<Item | null>>();
export function itemOf(a: Asset): Promise<Item | null> {
  if (!a.linkedDoc) return Promise.resolve(null);
  const key = `${a.linkedDoc.collection}/${a.linkedDoc.docId}`;
  let p = itemCache.get(key);
  if (!p) {
    p = isPreview() ? Promise.resolve((preview().items[key] as Item | undefined) || null) : loadItem(a);
    itemCache.set(key, p);
  }
  return p;
}

const logLocal = (action: string, itemTitle: string, details: Record<string, any> = {}, reason = "") => { demoLog.unshift({ id: `l${Date.now()}`, action, actorName: preview().me.name, reason, createdAt: Date.now(), itemTitle, details }); S.log = demoLog; };
const removeAsset = (id: string) => {
  if (!demo) return;
  const a = demo.assets.find((x) => x.id === id);
  if (!a) return;
  demo.assets = demo.assets.filter((x) => x.id !== id);
  if (demo.current) {
    const f = demo.current.byFeature[a.feature];
    if (f) { f.bytes = Math.max(0, f.bytes - a.sizeBytes); f.files = Math.max(0, f.files - 1); }
    demo.current.totalBytes = Math.max(0, demo.current.totalBytes - a.sizeBytes);
  }
  if (demo.scan && a.scan && (a.scan.state === "orphan" || a.scan.state === "stale")) demo.scan.counts[a.scan.state]--;
};

export async function refreshUsage() {
  if (isPreview()) { await wait(); if (demo?.usage) demo.usage.fetchedAt = Date.now(); return; }
  await call("stashUsageRefresh");
  await load(S.tier);
}
export async function scanNow() {
  if (isPreview()) { await wait(1200); if (demo?.scan) { demo.scan.at = Date.now(); demo.scan.by = preview().me.name; } return; }
  await call("stashScan");
  await load(S.tier);
}
/** A 10-minute signed link to a private file ("" in the preview, where a drawn placeholder stands in). */
export async function previewLink(assetId: string): Promise<{ url: string; expiresInS: number }> {
  if (isPreview()) { await wait(300); logLocal("preview", demo?.assets.find((a) => a.id === assetId)?.publicId || assetId); return { url: "", expiresInS: 600 }; }
  return call("stashPreview", { assetId });
}
export interface PurgeResult { assetId: string; ok: boolean; already?: boolean; error?: string; bytes?: number }
export async function purge(assetIds: string[]): Promise<{ results: PurgeResult[]; purged: number; bytes: number }> {
  if (isPreview()) {
    await wait(900);
    const results = assetIds.map((id) => { const a = demo?.assets.find((x) => x.id === id); const r = { assetId: id, ok: true, already: !a, bytes: a?.sizeBytes || 0 }; removeAsset(id); return r; });
    const purged = results.filter((r) => !r.already).length, bytes = results.reduce((n, r) => n + (r.bytes || 0), 0);
    logLocal("purge", `${purged} file${purged === 1 ? "" : "s"}`, { bytes });
    return { results, purged, bytes };
  }
  const res = await call<{ results: PurgeResult[]; purged: number; bytes: number }>("stashPurge", { assetIds });
  await load(S.tier);
  return res;
}
export async function purgeUntracked(publicId: string, type: string) {
  if (isPreview()) { await wait(700); if (demo?.scan) { demo.scan.untracked = demo.scan.untracked.filter((x) => x.publicId !== publicId); demo.scan.counts.untracked = Math.max(0, demo.scan.counts.untracked - 1); } logLocal("purge-untracked", publicId); return; }
  await call("stashPurgeUntracked", { publicId, type });
  await load(S.tier);
}
export interface Dry { count: number; bytes: number; examples: { title: string; link: string | null; days: number | null; bytes: number }[]; truncated?: boolean }
export interface RuleInput { name: string; target: string; statuses: string[]; days: number }
export async function dryRun(rule: RuleInput): Promise<Dry> {
  if (isPreview()) { await wait(700); return { ...preview().dry, count: preview().dry.count + (rule.days < 60 ? 6 : 0) }; }
  return call("stashRuleDryRun", { rule });
}
export async function saveRule(o: { op: "create" | "update" | "toggle" | "delete"; id?: string; rule?: RuleInput & { enabled?: boolean }; enabled?: boolean; expectCount?: number; updatedAtMs?: number }) {
  if (isPreview()) {
    await wait(500);
    if (demo) {
      if (o.op === "toggle") { const r = demo.rules.find((x) => x.id === o.id); if (r) r.enabled = !!o.enabled; }
      else if (o.op === "delete") demo.rules = demo.rules.filter((x) => x.id !== o.id);
      else if (o.rule) { const base = { name: o.rule.name, target: o.rule.target, statuses: o.rule.statuses, days: o.rule.days, legacy: false, updatedAt: Date.now(), lastRun: null as Rule["lastRun"] }; if (o.op === "update") { const r = demo.rules.find((x) => x.id === o.id); if (r) Object.assign(r, base); } else demo.rules.push({ id: `r${Date.now()}`, enabled: o.rule.enabled === true, ...base }); }
    }
    logLocal(o.op === "toggle" ? "rule-toggle" : o.op === "delete" ? "rule-delete" : "rule-save", o.rule?.name || o.id || "rule");
    return { ok: true };
  }
  const res = await call("stashRuleSave", o);
  await load(S.tier);
  return res;
}
export async function sweepNow() {
  if (isPreview()) {
    await wait(1500);
    const due = demo?.assets.filter((a) => a.scan?.due && demo!.rules.find((r) => r.id === a.scan!.due && r.enabled)) || [];
    let bytes = 0;
    due.forEach((a) => { bytes += a.sizeBytes; removeAsset(a.id); });
    if (demo) demo.sweep = { lastRunAt: Date.now(), status: "ok", purged: due.length, bytes, failures: [], perRule: {}, trigger: "manual" };
    logLocal("sweep-run", "Sweep", { purged: due.length, bytes, status: "ok" });
    return demo?.sweep;
  }
  const res: any = await call("stashSweepNow");
  await load(S.tier);
  return res.sweep;
}
export async function saveSettings(patch: { pauseAtPct?: number; manualPause?: boolean; reason?: string; retentionDays?: number }) {
  if (isPreview()) {
    await wait(400);
    if (demo) {
      if (patch.pauseAtPct !== undefined) demo.settings.pauseAtPct = patch.pauseAtPct;
      if (patch.manualPause !== undefined) { demo.settings.manualPause = patch.manualPause; demo.settings.manualPauseReason = patch.reason || ""; }
      if (patch.retentionDays !== undefined) demo.retentionDays = patch.retentionDays;
    }
    logLocal(patch.retentionDays !== undefined ? "retention" : patch.manualPause !== undefined ? "pause" : "limits", "Settings", {}, patch.reason || "");
    return;
  }
  await call("stashSettings", patch);
  await load(S.tier);
}

// ---------- derived numbers ----------
export const totals = () => {
  const bf = S.snap?.current?.byFeature || {};
  return { files: Object.values(bf).reduce((n, f) => n + f.files, 0), bytes: S.snap?.current?.totalBytes || 0 };
};
export const looseEnds = () => {
  const c = S.snap?.scan?.counts;
  return { orphan: c?.orphan || 0, stale: c?.stale || 0, untracked: c?.untracked || 0 };
};
void getAuthState;
