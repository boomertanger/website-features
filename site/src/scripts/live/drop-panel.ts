// The drop panel (docs/specs/live-drops.md §2 and §5 part 1; mockup docs/design/mockups/live-drops.html section 1, P1 "One card", and section 2,
// the helm strip). ONE module, mounted in two places: the owner's slot on /live/control (control.ts) and the Captain's "Drop a badge" button in
// the Mod Deck helm strip (mod-deck.ts), which opens it as a popover on desktop and a bottom sheet in a container under 640 px.
//
//   mountDropPanel(el, { role, streamId, io? })   draws the panel into el; returns { destroy() }
//   mountHelmDrop(host, { role, io?, phone })     the helm button (fuse, countdown, claim count while a drop is open) and its popover / sheet
//   realDropIo() / previewDropIo(live)            where the data comes from (the preview one is a local copy: no Firestore, no callable)
//
// Data (real): the badge catalog the Trophy Room reads (badges with a drop preset; a Captain only sees drop.by "captain", a missing by means
// owner), public/live from the one-per-tab listener (lib/live.ts onLive: state, drop, recruitRush.dropReady) and this stream's drops
// (sites/boomertanger/drops where streamId == the stream; owner and crew can read), read again when public/live.drop changes.
// Writes: dropOpen and dropAdjust only, through lib/call (the server checks every row again).
// The countdown ticks from closesAt every 250 ms and moves the fuse with setFuse(); the panel is redrawn only when its state changes, so a
// button never moves under the pointer. Times use the browser clock, as the check-in countdown on /live/control does.
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { medalHtml } from "../../../../shared/ui/medal.js";
import { dropFuseHtml, setFuse, formatDropTime } from "../../../../shared/ui/drop.js";
import { onLive } from "../../lib/live";
import { reasonOf } from "../../lib/errors";
import { esc, toast, messageFor, openLive, announceOverlay, modalHeader } from "./ui";
import type { PubDrop, PubLive } from "./model";

export type DropRole = "owner" | "captain";
export interface DropPreset { mode: "timed" | "streamEnd" | "draw"; minutes: number | null; cap: number | null; winners?: number; by: "owner" | "captain" }
export interface DropBadge { id: string; name: string; emoji: string | null; art: string | null; rarity: number; drop: DropPreset }
/** A drops/{id} document (history: kept after it closes). */
export interface DropDoc {
  id: string; badgeId: string; name: string; art: string | null; rarity: number; mode: DropPreset["mode"]; status: "open" | "closing" | "closed" | "drawn";
  openedAt: number | null; closesAt: number | null; closedAt: number | null; claims: number; cap: number | null; winners: string[]; closedBy: string | null;
}
/** What the panel needs from public/live. */
export interface DropLive { state: PubLive["state"]; streamId: string | null; drop: PubDrop | null; dropReady: string | null; rushGoal: number | null }
export interface DropIo {
  preview: boolean;
  call<T = any>(name: string, data?: unknown): Promise<T>;
  catalog(): Promise<DropBadge[]>;
  drops(streamId: string): Promise<DropDoc[]>;
  onLive(fn: (l: DropLive) => void): () => void;
}

// ------------------------------------------------------------------------------------------------ data
const msOf = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
export function presetOf(d: any): DropPreset | null {
  if (!d || typeof d !== "object" || !["timed", "streamEnd", "draw"].includes(d.mode)) return null;
  return { mode: d.mode, minutes: Number.isFinite(d.minutes) ? d.minutes : null, cap: Number.isFinite(d.cap) ? d.cap : null, winners: Number.isFinite(d.winners) ? d.winners : 1, by: d.by === "captain" ? "captain" : "owner" };
}
export const liveFrom = (p: PubLive): DropLive => ({
  state: p.state, streamId: p.streamId, drop: p.drop && typeof p.drop.id === "string" ? p.drop : null,
  dropReady: typeof p.recruitRush?.dropReady === "string" ? p.recruitRush.dropReady : null, rushGoal: p.recruitRush?.goal ?? null,
});
function docFrom(id: string, d: any): DropDoc {
  return {
    id, badgeId: String(d.badgeId || ""), name: String(d.name || d.badgeId || "Badge"), art: typeof d.art === "string" ? d.art : null, rarity: d.rarity || 1, mode: d.mode || "timed",
    status: d.status || "closed", openedAt: msOf(d.openedAt), closesAt: msOf(d.closesAt), closedAt: msOf(d.closedAt), claims: Number(d.claims) || 0, cap: d.cap ?? null,
    winners: Array.isArray(d.winnersOut) ? d.winnersOut.map((w: any) => w?.handle).filter(Boolean) : [], closedBy: d.closedBy || null,
  };
}

export function realDropIo(): DropIo {
  return {
    preview: false,
    call: async (name, data) => (await import("../../lib/call")).call(name, data),
    async catalog() {
      const { loadCatalog } = await import("../trophies/data");
      const { badges } = await loadCatalog();
      return badges.map((b: any) => ({ id: b.id, name: b.name, emoji: b.emoji ?? null, art: b.art ?? null, rarity: b.rarity || 1, drop: presetOf(b.drop) }))
        .filter((b): b is DropBadge => !!b.drop);
    },
    async drops(streamId) {
      const { db, collection, getDocs, query, where, SITE_ID } = await import("../../lib/db");
      const snap = await getDocs(query(collection(db, "sites", SITE_ID, "drops"), where("streamId", "==", streamId)));
      return snap.docs.map((d: any) => docFrom(d.id, d.data()));
    },
    onLive: (fn) => onLive((p) => fn(liveFrom(p))),
  };
}

let previewIo: Promise<DropIo> | null = null;
/** The preview's local copy (one per tab, so the helm button and the panel share it). live() says what the page's sample data shows. */
export function previewDropIo(live: () => { state: PubLive["state"]; streamId: string | null }): Promise<DropIo> {
  if (!previewIo) previewIo = import("./drop-panel-preview").then((m) => m.makePreviewIo(live));
  return previewIo;
}

// ------------------------------------------------------------------------------------------------ words
const REASONS: Record<string, string> = {
  notCaptain: "Only the owner or the live Captain can drop a badge.",
  notLive: "Drops open while you're live.",
  noPreset: "That badge can't be dropped.",
  ownerOnly: "Only the owner can drop that badge.",
  dropped: "That badge was already dropped this stream.",
  busy: "One drop at a time. Close the open one first.",
  rushNotHit: "The Rush goal isn't hit yet.",
  rushBadge: "That isn't the Rush reward badge any more.",
  rushDropped: "The Rush drop is already out.",
  closed: "That drop has already closed.",
  maxed: "A drop can't run past 2 hours.",
  noDrop: "That drop isn't there any more.",
};
const errText = (err: unknown) => REASONS[reasonOf(err) || ""] || messageFor(err);
const CLOSED_BY: Record<string, string> = { timer: "the timer", cap: "the claim limit", manual: "hand", stop: "Stop", autoEnd: "the 12-hour auto-end" };
const isUrl = (s: string | null) => !!s && /^(https?:)?\//.test(s);
/** A badge-like object for medal.js: art is a URL, else it's the emoji the server copied. */
const face = (x: { art: string | null; emoji?: string | null; name: string; rarity: number }) => ({ art: isUrl(x.art) ? x.art! : "", emoji: x.emoji || (isUrl(x.art) ? "" : x.art || "✦"), rarity: x.rarity, name: x.name });
const minutesText = (m: number) => `${m} min`;
const presetText = (d: DropPreset) => (d.mode === "streamEnd" ? "Until end" : `${d.mode === "draw" ? "Draw · " : ""}${minutesText(d.minutes || 0)}`);
const clockTime = (t: number) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(t).toLowerCase();
const spoken = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60), r = s % 60; return [m ? `${m} minute${m === 1 ? "" : "s"}` : "", r || !m ? `${r} second${r === 1 ? "" : "s"}` : ""].filter(Boolean).join(" "); };
const ACTIVE = ["open", "closing", "drawing"];

// ------------------------------------------------------------------------------------------------ the panel
export interface DropPanel { destroy(): void }
type Chip = number | "end";

export function mountDropPanel(el: HTMLElement, { role, streamId = null, io: ioIn, level = 2 }: { role: DropRole; streamId?: string | null; io?: DropIo | Promise<DropIo>; level?: number }): DropPanel {
  let io: DropIo | null = null;
  let badges: DropBadge[] | null = null, catalogErr = false;
  let docs: DropDoc[] = [], docsFor = "";
  let live: DropLive = { state: "off", streamId, drop: null, dropReady: null, rushGoal: null };
  let mine: PubDrop | null = null, mineAt = 0;   // what our own call just did, until public/live catches up (20 s at most)
  let sel: string | null = null, chip: Chip | null = null, capOn = false, capN = 50;
  let armed = 0, armTimer = 0, busy = "";
  let rushHidden = (() => { try { return sessionStorage.getItem("dp-rush-hidden") || ""; } catch { return ""; } })();
  let lastKey = "", dead = false, unsub: (() => void) | null = null, flipNext = "";
  const span = new Map<string, number>();   // the drop's full window (for the fuse), by id + closesAt

  const allowed = () => (badges || []).filter((b) => role === "owner" || b.drop.by === "captain");
  const sid = () => live.streamId || streamId;
  const isLive = () => live.state === "live" || live.state === "backstage";
  /** The drop on screen: ours (just opened or changed) until public/live shows the same drop or a later one. */
  const drop = (): PubDrop | null => {
    const p = live.drop;
    if (!mine || Date.now() - mineAt > 20000) return p;
    return !p || p.id === mine.id || p.state === "closed" ? mine : p;
  };
  const setMine = (p: PubDrop) => { mine = p; mineAt = Date.now(); };
  const dropped = () => new Set([...docs.map((d) => d.badgeId), ...(drop() ? [drop()!.badgeId] : [])]);
  const lastDone = (): { d: DropDoc | null; p: PubDrop | null } => {
    const p = drop();
    if (p && p.state === "closed") return { d: docs.find((x) => x.id === p.id) || null, p };
    const done = docs.filter((x) => x.status === "closed" || x.status === "drawn").sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))[0] || null;
    return { d: done, p: null };
  };

  function refreshDocs(force = false) {
    const s = sid(), p = live.drop;
    const k = `${s}|${p?.id}|${p?.state}|${p?.closesAt}`;
    if (!io || !s || (!force && k === docsFor)) return;
    docsFor = k;
    void io.drops(s).then((d) => { if (!dead) { docs = d; render(); } }, (err) => console.warn("drops: couldn't read this stream's drops", err?.code || err));
  }

  // ---- markup
  function head() {
    const meta = isLive() ? `${role === "captain" ? "Captain · " : ""}Live` : "Off air";
    return { title: "Live drops", tag: `<span class="dp-meta">${esc(meta)}</span>` };
  }
  function picks(off: boolean) {
    const list = allowed(), gone = dropped();
    if (!list.length) return `<p class="dp-note">${role === "captain" ? "No badges are set for Captains to drop yet." : "No badges have a drop preset yet."}</p>`;
    return `<div><div class="bt-label" id="dp-badge-l">Badge</div><div class="dp-picks" role="group" aria-labelledby="dp-badge-l">${list.map((b) => {
      const d = gone.has(b.id);
      return `<button type="button" class="dp-pick" data-dp="pick" data-id="${esc(b.id)}" aria-pressed="${sel === b.id && !d}"${d || off ? " disabled" : ""}>${medalHtml(face(b))}<b>${esc(b.name)}</b><small>${d ? "Dropped" : esc(presetText(b.drop))}</small></button>`;
    }).join("")}</div>${role === "captain" ? `<p class="dp-note dp-note--gap">Owner-only badges don't show for Captains.</p>` : ""}</div>`;
  }
  function chips(b: DropBadge) {
    const d = b.drop;
    if (d.mode === "streamEnd") return [{ v: "end" as Chip, l: "Until stream ends", preset: true }];
    const base = [1, 3, 5, 10, 15];
    if (d.minutes && !base.includes(d.minutes)) base.push(d.minutes);
    base.sort((a, b2) => a - b2);
    const out: { v: Chip; l: string; preset: boolean }[] = base.map((m) => ({ v: m, l: minutesText(m), preset: m === d.minutes }));
    if (d.mode !== "draw") out.push({ v: "end", l: "Until stream ends", preset: false });
    return out;
  }
  function setup(off: boolean) {
    const b = allowed().find((x) => x.id === sel);
    if (!b || dropped().has(b.id)) return `<p class="dp-note">${off ? "" : "Pick a badge. Its preset window is picked for you, so a drop is two taps."}</p>`;
    const draw = b.drop.mode === "draw", c = chip ?? (b.drop.mode === "streamEnd" ? "end" : b.drop.minutes || 3);
    const label = c === "end" ? "until the stream ends" : minutesText(c);
    const dis = off || !!busy ? " disabled" : "";
    return `<div><div class="bt-label" id="dp-win-l">Window</div><div class="dp-chips" role="group" aria-labelledby="dp-win-l">${chips(b).map((x) => `<button type="button" class="bt-chip bt-chip--small${String(x.v) === String(c) ? " is-active" : ""}" data-dp="chip" data-v="${x.v}" aria-pressed="${String(x.v) === String(c)}"${x.preset ? ' data-preset title="Preset"' : ""}${dis}>${esc(x.l)}${x.preset ? '<span class="bt-sr-only"> (preset)</span>' : ""}</button>`).join("")}</div></div>`
      + (draw ? `<p class="dp-note">Members enter during the window. When it closes, ${b.drop.winners && b.drop.winners > 1 ? `${b.drop.winners} winners are` : "one winner is"} drawn at random from the entries.</p>`
        : `<div class="dp-cap"><button type="button" class="bt-switch" role="switch" aria-checked="${capOn}" aria-label="Limit claims" data-dp="cap"${dis}></button><span>Limit claims</span>${capOn ? `<span>to</span><input class="bt-input" type="number" inputmode="numeric" min="1" max="10000" step="1" value="${capN}" aria-label="Claim limit" data-dp="capn"${dis}>` : ""}</div>`)
      + `<button type="button" class="bt-btn bt-btn--primary bt-btn--block" data-dp="open"${dis}>${busy === "open" ? "Opening…" : `${draw ? "Open the draw" : "Open drop"} · ${esc(label)}`}</button>`;
  }
  function rushCard() {
    const id = live.dropReady, b = id ? allowed().find((x) => x.id === id) : null;
    if (!b || !isLive() || rushHidden === id || dropped().has(b.id) || (drop() && ACTIVE.includes(drop()!.state))) return "";
    return `<div class="dp-rush" role="group" aria-label="Recruit Rush reward">${medalHtml(face(b))}<div><b>Rush goal hit${live.rushGoal ? `: ${live.rushGoal} recruits` : ""}</b><span>Drop ${esc(b.name)} for everyone? Preset ${esc(b.drop.mode === "streamEnd" ? "until the stream ends" : b.drop.mode === "draw" ? `${minutesText(b.drop.minutes || 0)} draw` : minutesText(b.drop.minutes || 0))}.</span></div>`
      + `<div class="dp-actions"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-dp="rush-open"${busy ? " disabled" : ""}>${busy === "rush" ? "Opening…" : "Open drop"}</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-dp="rush-later">Not now</button></div></div>`;
  }
  function liveCard(p: PubDrop) {
    const draw = p.mode === "draw", untilEnd = p.mode === "streamEnd" || p.closesAt == null;
    const st = p.state, open = st === "open";
    let cd: string;
    if (st === "closing") cd = `<div class="bt-drop-timer" data-state="closing"><span>Last call</span><small>Claims still count for <span data-dp-grace>0:30</span> (stream delay)</small></div>`;
    else if (st === "drawing") cd = `<div class="bt-drop-timer" data-state="closing"><span>Drawing…</span><small>The winner shows within a minute</small></div>`;
    else if (untilEnd) cd = `<div class="bt-drop-timer dp-timer--words">Until stream ends<small>${role === "owner" ? "Closes when you press Stop" : "Closes when the stream stops"}</small></div>`;
    else cd = `<div class="bt-drop-timer"><span data-dp-cd>${formatDropTime((p.closesAt || 0) - Date.now())}</span><small>left · closes ${esc(clockTime(p.closesAt || 0))}</small></div>`;
    const noun = draw ? "entered" : "claimed";
    const cap = p.cap ? `<div class="dp-capbar" data-dp-capbar style="--f:${Math.min(1, (p.claims || 0) / p.cap)}"><i></i></div>` : "";
    const arm = armed > Date.now();
    const state = st === "drawing" ? "closing" : st;
    return `<div class="dp-live">${dropFuseHtml(face(p), { p: open ? fuseP(p) : 0, state })}<div class="dp-live-main">`
      + `<div class="dp-live-name">${esc(p.name)}<small>${draw ? "Draw" : untilEnd ? "Until stream ends" : "Timed"}</small></div>${cd}`
      + `<div class="dp-stats"><span><b data-dp-claims>${(p.claims || 0).toLocaleString("en-US")}</b>${noun}</span>${p.cap ? `<span><b>${p.cap.toLocaleString("en-US")}</b>limit</span>` : ""}</div>${cap}</div></div>`
      + `<div class="dp-actions">`
      + `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-dp="plus1"${open && !untilEnd && !busy ? "" : " disabled"}>${busy === "plus1" ? "Adding…" : "+1 min"}</button>`
      + `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-dp="plus5"${open && !untilEnd && !busy ? "" : " disabled"}>${busy === "plus5" ? "Adding…" : "+5 min"}</button>`
      + `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm${arm ? " is-arm" : ""}" data-dp="close"${open && !busy ? "" : " disabled"}>${busy === "close" ? "Closing…" : arm ? "Tap again to close" : "Close now"}</button>`
      + `</div>`;
  }
  function summary() {
    const { d, p } = lastDone();
    if (!d && !p) return "";
    const name = p?.name || d!.name, mode = p?.mode || d!.mode, art = p ? p.art : d!.art, rarity = p?.rarity || d!.rarity;
    const claims = p ? p.claims : d!.claims, winners = (p?.winners?.length ? p.winners : d?.winners) || [];
    const by = d?.closedBy ? CLOSED_BY[d.closedBy] || d.closedBy : "";
    const f = face({ art, name, rarity });
    if (mode === "draw") {
      const w = winners.length ? `${winners.map((h) => `@${esc(h)}`).join(", ")} ${winners.length > 1 ? "are" : "is"} ${esc(name)}` : (p?.state === "closed" || d?.status === "drawn") ? "Nobody entered the draw" : "Drawing…";
      return `<div class="dp-sum">${dropFuseHtml(f, { p: 1, state: winners.length ? "won" : "closed" })}<div><b>${w}</b><span>${claims.toLocaleString("en-US")} ${claims === 1 ? "entry" : "entries"}</span></div></div>`;
    }
    return `<div class="dp-sum">${dropFuseHtml(f, { p: 0, state: "closed" })}<div><b>Drop closed · ${claims.toLocaleString("en-US")} claimed</b><span>${esc(name)}${by ? ` · closed by ${esc(by)}` : ""}</span></div></div>`;
  }
  function body() {
    if (catalogErr) return `<div class="dp-off">Couldn't load the badges. Reload the page to try again.</div>`;
    if (!badges) return `<div class="dp-off" aria-busy="true">Loading badges…</div>`;
    const p = drop();
    if (!isLive()) return `<div class="dp-off">${role === "owner" ? "Drops open while you're live. Start the stream to drop a badge." : "Drops open while the stream is live."}</div>${picks(true)}`;
    if (p && ACTIVE.includes(p.state)) return liveCard(p);
    return `${rushCard()}${summary()}${picks(false)}${setup(false)}`;
  }
  function viewKey() {
    const p = drop();
    return JSON.stringify([catalogErr, !!badges, isLive(), live.state, p && [p.id, p.state, p.cap, p.mode, p.closesAt == null, p.state === "closed" ? [p.claims, p.winners] : 0, p.name],
      docs.map((d) => [d.id, d.status, d.claims, d.winners]), sel, chip, capOn, armed > Date.now(), busy, live.dropReady, live.rushGoal, rushHidden, role]);
  }
  function render(force = false) {
    if (dead) return;
    const k = viewKey();
    if (!force && k === lastKey) { tick(); return; }
    lastKey = k;
    const hadFocus = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.dp + "|" + ((document.activeElement as HTMLElement).dataset.id || (document.activeElement as HTMLElement).dataset.v || "") : "";
    const h = head();
    el.innerHTML = crPanelHtml({ cls: "dp-panel", title: h.title, icon: "drop", tagHtml: h.tag, level, bodyHtml: `<div class="dp-wrap"><div class="dp">${body()}</div></div>` });
    if (hadFocus) {
      const [act, v] = hadFocus.split("|");
      const back = [...el.querySelectorAll<HTMLElement>(`[data-dp="${act}"]`)].find((x) => !v || x.dataset.id === v || x.dataset.v === v);
      if (back && !(back as HTMLButtonElement).disabled) back.focus();
    }
    // the celebratory moment: the medal flips once when our drop opens
    const fz = flipNext && drop()?.id === flipNext ? el.querySelector<HTMLElement>(".dp-live .bt-dropfuse") : null;
    if (fz) { fz.classList.add("is-flip"); flipNext = ""; }
    tick();
  }

  // ---- the tick: the countdown, the fuse, the grace, the claim count (no redraw)
  function fuseP(p: PubDrop) {
    if (p.closesAt == null) return 1;
    const left = p.closesAt - Date.now(), k = `${p.id}|${p.closesAt}`;
    const doc = docs.find((d) => d.id === p.id);
    let full = doc?.openedAt ? p.closesAt - doc.openedAt : span.get(k) || 0;
    if (!full) { full = Math.max(left, 1); span.set(k, full); }
    return Math.max(0, Math.min(1, left / full));
  }
  function tick() {
    const p = drop();
    if (!p || dead) return;
    const now = Date.now();
    const cd = el.querySelector("[data-dp-cd]"); if (cd && p.closesAt) { const t = formatDropTime(p.closesAt - now); if (cd.textContent !== t) cd.textContent = t; }
    const gr = el.querySelector("[data-dp-grace]"); if (gr) { const t = formatDropTime((p.graceUntil || (p.closedAt || now) + 30000) - now); if (gr.textContent !== t) gr.textContent = t; }
    const fz = el.querySelector<HTMLElement>(".dp-live .bt-dropfuse"); if (fz && p.state === "open") setFuse(fz, fuseP(p));
    const n = el.querySelector("[data-dp-claims]"); if (n) { const t = (p.claims || 0).toLocaleString("en-US"); if (n.textContent !== t) n.textContent = t; }
    const bar = el.querySelector<HTMLElement>("[data-dp-capbar]"); if (bar && p.cap) bar.style.setProperty("--f", String(Math.min(1, (p.claims || 0) / p.cap)));
  }
  const timer = window.setInterval(() => { if (!document.hidden) render(); }, 250);

  // ---- actions
  async function run(kind: string, fn: () => Promise<void>) {
    if (busy || !io) return;
    busy = kind; render();
    try { await fn(); }
    catch (err) { toast(errText(err), { kind: "error" }); }
    finally { busy = ""; render(); }
  }
  function openArgs(b: DropBadge, c: Chip) {
    const a: Record<string, unknown> = { streamId: sid(), badgeId: b.id };
    if (c === "end") a.untilEnd = true; else a.minutes = c;
    if (b.drop.mode !== "draw" && capOn) a.cap = capN;
    return a;
  }
  function opened(b: DropBadge, r: any) {
    setMine({ id: r.dropId, badgeId: b.id, name: b.name, art: b.art || b.emoji, rarity: b.rarity, mode: r.mode, state: "open", closesAt: r.closesAt ?? null, graceUntil: null, cap: r.cap ?? null, claims: 0, winners: [], closedAt: null });
    flipNext = r.dropId; sel = null; chip = null; capOn = false;
    toast(`${b.name} is dropping${r.closesAt ? ` for ${formatDropTime(r.closesAt - Date.now())}` : " until the stream ends"}.`);
  }
  el.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-dp]");
    if (!t || !el.contains(t) || (t as HTMLButtonElement).disabled) return;
    const act = t.dataset.dp;
    if (act === "pick") { sel = sel === t.dataset.id ? null : t.dataset.id!; chip = null; capOn = false; render(); return; }
    if (act === "chip") { chip = t.dataset.v === "end" ? "end" : Number(t.dataset.v); render(); return; }
    if (act === "cap") { capOn = !capOn; render(); if (capOn) el.querySelector<HTMLInputElement>('[data-dp="capn"]')?.focus(); return; }
    if (act === "open") {
      const b = allowed().find((x) => x.id === sel); if (!b) return;
      if (capOn && (!Number.isInteger(capN) || capN < 1 || capN > 10000)) { toast("Set a claim limit from 1 to 10,000, or turn the limit off.", { kind: "error" }); return; }
      const c = chip ?? (b.drop.mode === "streamEnd" ? "end" : b.drop.minutes || 3);
      void run("open", async () => { const r = await io!.call("dropOpen", openArgs(b, c)); opened(b, r); refreshDocs(true); });
      return;
    }
    if (act === "rush-open") {
      const b = allowed().find((x) => x.id === live.dropReady); if (!b) return;
      void run("rush", async () => { const r = await io!.call("dropOpen", { streamId: sid(), badgeId: b.id, source: "rush" }); opened(b, r); refreshDocs(true); });
      return;
    }
    if (act === "rush-later") { rushHidden = live.dropReady || ""; try { sessionStorage.setItem("dp-rush-hidden", rushHidden); } catch { /* memory only */ } render(); return; }
    const p = drop(); if (!p) return;
    if (act === "plus1" || act === "plus5") {
      void run(act, async () => { const r = await io!.call("dropAdjust", { dropId: p.id, action: act }); setMine({ ...p, closesAt: r.closesAt ?? p.closesAt }); toast(`${act === "plus1" ? "One more minute" : "Five more minutes"} for ${p.name}.`); });
      return;
    }
    if (act === "close") {
      if (armed <= Date.now()) {
        armed = Date.now() + 3000; clearTimeout(armTimer); armTimer = window.setTimeout(() => render(), 3050); render(); return;
      }
      armed = 0; clearTimeout(armTimer);
      void run("close", async () => { const r = await io!.call("dropAdjust", { dropId: p.id, action: "close" }); setMine({ ...p, state: "closing", closedAt: Date.now(), graceUntil: r.graceUntil ?? Date.now() + 30000 }); toast(`${p.name} is closing. Claims still count for 30 seconds.`, { kind: "info" }); });
    }
  });
  el.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.dp === "capn") capN = Math.round(Number(t.value));
  });

  // ---- start
  void Promise.resolve(ioIn || realDropIo()).then((x) => {
    if (dead) return;
    io = x;
    io.catalog().then((b) => { badges = b; render(); }, (err) => { console.warn("drops: couldn't load the badge catalog", err); catalogErr = true; render(); });
    unsub = io.onLive((l) => {
      const ready = live.dropReady;
      live = l;
      const p = l.drop;
      // public/live caught up with our call (or moved past it): drop the local copy
      if (mine && p && p.id === mine.id && (p.state !== "open" || (mine.state === "open" && (p.closesAt ?? Infinity) >= (mine.closesAt ?? Infinity)))) mine = null;
      if (mine && p && p.id !== mine.id && p.state !== "closed") mine = null;
      if (ready !== l.dropReady && rushHidden && rushHidden !== l.dropReady) { rushHidden = ""; try { sessionStorage.removeItem("dp-rush-hidden"); } catch { /* fine */ } }
      refreshDocs();
      render();
    });
    refreshDocs();
  });
  render(true);

  return {
    destroy() { dead = true; clearInterval(timer); clearTimeout(armTimer); unsub?.(); },
  };
}

// ------------------------------------------------------------------------------------------------ the helm button (Mod Deck)
export interface HelmDrop { host: HTMLElement; button: HTMLButtonElement; destroy(): void; close(): void }

/** The "Drop a badge" button for the Captain's helm strip. One element for the page's life: mod-deck.ts moves it into each new helm row
 * (helmHtml leaves a [data-helm-drop] spot), so an open popover survives the strip being redrawn. phone(): is the Deck's container under 640 px. */
export function mountHelmDrop({ role, io: ioIn, phone }: { role: DropRole; io?: DropIo | Promise<DropIo>; phone: () => boolean }): HelmDrop {
  const host = document.createElement("span");
  host.className = "dp-helm";
  host.innerHTML = `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm dp-helm-btn" aria-haspopup="dialog" aria-expanded="false"><span class="dp-helm-in">✦ Drop a badge</span></button>`;
  const button = host.querySelector("button")!;
  let cur: PubDrop | null = null, live = false, dead = false, unsub: (() => void) | null = null, lastKey = "";
  let fullId = "", fullCloses = 0, full = 1;   // the fuse's whole window: the time left when the button first saw the drop, plus any extension
  let pop: { el: HTMLElement; panel: DropPanel } | null = null, sheet: { close(): void; panel: DropPanel } | null = null;
  const ioP = Promise.resolve(ioIn || realDropIo());

  function draw() {
    const p = cur && ACTIVE.includes(cur.state) && live ? cur : null;
    const k = p ? `${p.id}|${p.state}|${p.closesAt == null}` : "idle";
    if (k !== lastKey) {
      lastKey = k;
      const inner = host.querySelector(".dp-helm-in")!;
      inner.innerHTML = p
        ? `${dropFuseHtml(face(p), { p: p.state === "open" ? 1 : 0, state: p.state === "open" ? "open" : "closing" })}<b data-hd-t></b><span data-hd-n></span>`
        : "✦ Drop a badge";
      button.classList.toggle("is-live", !!p);
    }
    if (!p) { button.setAttribute("aria-label", "Drop a badge"); return; }
    const now = Date.now(), left = (p.closesAt || 0) - now;
    const t = p.state === "closing" ? "Last call" : p.state === "drawing" ? "Drawing…" : p.closesAt == null ? "Until end" : formatDropTime(left);
    const tEl = host.querySelector("[data-hd-t]"), nEl = host.querySelector("[data-hd-n]");
    if (tEl && tEl.textContent !== t) tEl.textContent = t;
    const n = `· ${(p.claims || 0).toLocaleString("en-US")}`;
    if (nEl && nEl.textContent !== n) nEl.textContent = n;
    const fz = host.querySelector<HTMLElement>(".bt-dropfuse");
    if (p.closesAt && p.id !== fullId) { fullId = p.id; fullCloses = p.closesAt; full = Math.max(left, 1); }
    else if (p.closesAt && p.closesAt !== fullCloses) { full += p.closesAt - fullCloses; fullCloses = p.closesAt; }
    if (fz && p.state === "open" && p.closesAt) setFuse(fz, left / full);
    const what = p.state === "closing" ? "last call" : p.state === "drawing" ? "drawing the winner" : p.closesAt == null ? "open until the stream ends" : `open, ${spoken(left)} left`;
    const label = `${p.name} ${p.mode === "draw" ? "draw" : "drop"} ${what}, ${(p.claims || 0).toLocaleString("en-US")} ${p.mode === "draw" ? "entered" : "claimed"}`;
    if (button.getAttribute("aria-label") !== label && (p.state !== "open" || Math.ceil(left / 1000) % 5 === 0 || !button.getAttribute("aria-label")?.startsWith(p.name))) button.setAttribute("aria-label", label);
  }
  const timer = window.setInterval(() => { if (!document.hidden && !dead) draw(); }, 250);

  function onKey(e: KeyboardEvent) { if (e.key === "Escape" && pop) { e.preventDefault(); close(); } }
  function onDown(e: PointerEvent) { if (pop && !pop.el.contains(e.target as Node) && !button.contains(e.target as Node)) close(false); }
  let opening = false;   // openLive announces bt:overlay-open itself: that one is ours
  function onOverlay(e: Event) { if (!opening && (e as CustomEvent).detail?.source !== "live-drops") close(false); }
  /** back: return focus to the button (Esc, a second tap); a tap elsewhere or another overlay leaves focus where it went. */
  function close(back = true) {
    if (pop) { pop.panel.destroy(); pop.el.remove(); pop = null; }
    if (sheet) { const s = sheet; sheet = null; s.panel.destroy(); s.close(); }
    document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown, true);
    if (button.getAttribute("aria-expanded") === "true") { button.setAttribute("aria-expanded", "false"); if (back && button.isConnected) button.focus(); }
  }
  function open() {
    if (phone()) {
      opening = true;
      let m: ReturnType<typeof openLive>;
      try { m = openLive({ variant: "sheet", title: "Live drops", content: `${modalHeader("Live drops", role === "captain" ? "Captain tools" : "")}<div class="bt-modal-body dp-sheet" data-dp-host></div>`, onClose: () => { if (sheet) { const s = sheet; sheet = null; s.panel.destroy(); } button.setAttribute("aria-expanded", "false"); if (button.isConnected) button.focus(); } }); }
      finally { opening = false; }
      const panel = mountDropPanel(m.modal.querySelector<HTMLElement>("[data-dp-host]")!, { role, io: ioP, level: 2 });
      sheet = { close: () => m.close(), panel };
    } else {
      announceOverlay("live-drops");
      const el = document.createElement("div");
      el.className = "dp-pop"; el.tabIndex = -1; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Live drops");
      host.appendChild(el);
      const panel = mountDropPanel(el, { role, io: ioP, level: 3 });
      pop = { el, panel };
      document.addEventListener("keydown", onKey); document.addEventListener("pointerdown", onDown, true);
      requestAnimationFrame(() => (el.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled])") || el).focus());
    }
    button.setAttribute("aria-expanded", "true");
  }
  button.addEventListener("click", () => { if (pop || sheet) close(); else open(); });
  document.addEventListener("bt:overlay-open", onOverlay);
  void ioP.then((io) => {
    if (dead) return;
    unsub = io.onLive((l) => { cur = l.drop; live = l.state === "live" || l.state === "backstage"; draw(); });
  });
  draw();
  return {
    host, button, close: () => close(false),
    destroy() { dead = true; close(false); clearInterval(timer); unsub?.(); document.removeEventListener("bt:overlay-open", onOverlay); host.remove(); },
  };
}
