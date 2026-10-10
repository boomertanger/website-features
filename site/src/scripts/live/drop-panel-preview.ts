// The drop panel's preview data (non-production, signed out, ?as=): the five drop badges from the seed (functions/data/trophy-room-badges.json)
// and a drop that runs here in the tab: dropOpen / dropAdjust act on it, claims tick up, the timer and the 30-second grace close it, a draw
// picks @nightowl. Nothing reaches Firestore or a callable. A hit Recruit Rush (the shared switch, ?rush=20; rush.ts previewRush) has Boss Fight
// Believer as its reward badge, so the one-tap prompt shows. &predrop=<badgeId> starts with that drop open (the prompt waits behind it);
// &dropped=<badgeId> marks a badge as dropped earlier this stream (the prompt never shows for it, the Rush picker disables it).
// Below it, the viewer's side (sampleDrop, viewerPreview): the banner, the /live card and the stream view callout, for ?drop=<kind>.
import type { DropBadge, DropDoc, DropIo, DropLive } from "./drop-panel";
import type { PubDrop, PubLive } from "./model";
import { previewRush } from "./rush";
import type { ClaimResult, WatchIo } from "./drop-watch";

const BADGES: DropBadge[] = [
  { id: "jump-scare-witness", name: "Jump-Scare Witness", emoji: "😱", art: null, rarity: 1, drop: { mode: "timed", minutes: 3, cap: null, by: "captain" } },
  { id: "glitchwitness", name: "The Glitchwitness", emoji: "💥", art: null, rarity: 2, drop: { mode: "timed", minutes: 5, cap: null, by: "captain" } },
  { id: "chosen-one", name: "The Chosen One", emoji: "🎲", art: null, rarity: 4, drop: { mode: "draw", minutes: 2, cap: null, winners: 1, by: "owner" } },
  { id: "boss-fight-believer", name: "Boss Fight Believer", emoji: "⚔️", art: null, rarity: 2, drop: { mode: "timed", minutes: 10, cap: null, by: "captain" } },
  { id: "anniversary-ember", name: "Anniversary Ember", emoji: "🕯", art: null, rarity: 4, drop: { mode: "streamEnd", minutes: null, cap: null, by: "owner" } },
];
const MIN = 60000, GRACE = 30000;
const fail = (reason: string, message: string) => Object.assign(new Error(message), { code: "functions/failed-precondition", details: { reason } });

export function makePreviewIo(liveOf: () => { state: PubLive["state"]; streamId: string | null }): DropIo {
  const q = new URLSearchParams(location.search);
  const subs = new Set<(l: DropLive) => void>();
  const docs: (DropDoc & { streamId: string; graceUntil: number | null })[] = [];
  let ptr: PubDrop | null = null, rushOpened = false, last = "";
  const pr = previewRush(), rush = !!pr && pr.hitAt != null;
  // &dropped=: a closed drop from earlier tonight; &predrop=: a drop open now (5 minutes left)
  const t0 = Date.now();   // seeded docs belong to whatever stream the page shows (streamId "")
  for (const id of (q.get("dropped") || "").split(",").filter(Boolean)) {
    const b = BADGES.find((x) => x.id === id); if (!b) continue;
    docs.push({ id: `preview_${b.id}`, streamId: "", badgeId: b.id, name: b.name, art: b.emoji, rarity: b.rarity, mode: b.drop.mode, status: "closed", openedAt: t0 - 40 * MIN, closesAt: t0 - 35 * MIN, closedAt: t0 - 35 * MIN, claims: 41, cap: null, winners: [], closedBy: "timer", graceUntil: null });
  }
  const pre = BADGES.find((x) => x.id === q.get("predrop"));
  if (pre) {
    const id = `preview_${pre.id}`, closesAt = pre.drop.mode === "streamEnd" ? null : t0 + 5 * MIN;
    ptr = { id, badgeId: pre.id, name: pre.name, art: pre.emoji, rarity: pre.rarity, mode: pre.drop.mode, state: "open", closesAt, graceUntil: null, cap: null, claims: 12, winners: [], closedAt: null };
    docs.push({ id, streamId: "", badgeId: pre.id, name: pre.name, art: pre.emoji, rarity: pre.rarity, mode: pre.drop.mode, status: "open", openedAt: t0 - MIN, closesAt, closedAt: null, claims: 12, cap: null, winners: [], closedBy: null, graceUntil: null });
  }
  const snapshot = (): DropLive => {
    const l = liveOf();
    return { state: l.state, streamId: l.streamId, drop: ptr ? { ...ptr } : null, dropReady: rush && !rushOpened ? "boss-fight-believer" : null, rushGoal: rush ? pr!.goal : null };
  };
  const emit = () => { const s = snapshot(); last = JSON.stringify(s); subs.forEach((fn) => fn(s)); };
  // the sweep and the claims: once a second, like the server's sweep and liveFlush (sped up)
  setInterval(() => {
    const now = Date.now(), d = ptr && docs.find((x) => x.id === ptr!.id);
    if (ptr && d) {
      if (ptr.state === "open") {
        if (Math.random() < 0.5) { ptr.claims++; d.claims++; }
        if (ptr.cap && ptr.claims >= ptr.cap) { ptr.state = "closing"; ptr.closedAt = now; ptr.graceUntil = now + GRACE; d.status = "closing"; d.closedBy = "cap"; }
        else if (ptr.closesAt && now >= ptr.closesAt) { ptr.state = "closing"; ptr.closedAt = now; ptr.graceUntil = now + GRACE; d.status = "closing"; d.closedBy = "timer"; }
      } else if (ptr.state === "closing" && now >= (ptr.graceUntil || 0)) {
        if (ptr.mode === "draw") { ptr.state = "drawing"; setTimeout(() => { if (ptr && ptr.id === d.id) { ptr.state = "closed"; ptr.winners = ptr.claims ? ["nightowl"] : []; d.status = "drawn"; d.winners = ptr.winners; d.closedAt = Date.now(); emit(); } }, 4000); }
        else { ptr.state = "closed"; d.status = "closed"; d.closedAt = now; }
      } else if (ptr.state === "closed" && now - (ptr.closedAt || now) > 60000 + GRACE) ptr = null;
    }
    if (JSON.stringify(snapshot()) !== last) emit();
  }, 1000);

  async function call(name: string, data: any = {}): Promise<any> {
    await new Promise((r) => setTimeout(r, 300));
    const l = liveOf(), now = Date.now();
    if (name === "dropOpen") {
      if (l.state !== "live" && l.state !== "backstage") throw fail("notLive", "Drops open while you're live.");
      const b = BADGES.find((x) => x.id === data.badgeId); if (!b) throw fail("noPreset", "That badge can't be dropped.");
      if (docs.some((x) => x.badgeId === b.id && (x.streamId === l.streamId || !x.streamId))) throw fail("dropped", "That badge was already dropped this stream.");
      if (ptr && ptr.state !== "closed") throw fail("busy", "One drop at a time.");
      const untilEnd = data.untilEnd === true || (b.drop.mode === "streamEnd" && data.minutes == null);
      const minutes = untilEnd ? null : data.minutes ?? b.drop.minutes;
      const mode = b.drop.mode === "draw" ? "draw" : untilEnd ? "streamEnd" : "timed";
      const id = `${l.streamId}_${b.id}`, closesAt = minutes ? now + minutes * MIN : null;
      ptr = { id, badgeId: b.id, name: b.name, art: b.emoji, rarity: b.rarity, mode, state: "open", closesAt, graceUntil: null, cap: data.cap ?? null, claims: 0, winners: [], closedAt: null };
      docs.push({ id, streamId: l.streamId || "", badgeId: b.id, name: b.name, art: b.emoji, rarity: b.rarity, mode, status: "open", openedAt: now, closesAt, closedAt: null, claims: 0, cap: data.cap ?? null, winners: [], closedBy: null, graceUntil: null });
      if (data.source === "rush") rushOpened = true;
      setTimeout(emit, 600);   // public/live lags the callable a little, as it does for real
      return { ok: true, dropId: id, mode, closesAt, cap: data.cap ?? null };
    }
    if (name === "dropAdjust") {
      const d = docs.find((x) => x.id === data.dropId); if (!d || !ptr || ptr.id !== d.id) throw fail("noDrop", "That drop isn't there.");
      if (ptr.state !== "open") throw fail("closed", "That drop has closed.");
      if (data.action === "close") { ptr.state = "closing"; ptr.closedAt = now; ptr.graceUntil = now + GRACE; d.status = "closing"; d.closedBy = "manual"; setTimeout(emit, 600); return { ok: true, dropId: d.id, status: "closing", graceUntil: ptr.graceUntil }; }
      if (!ptr.closesAt) throw fail("untilEnd", "This drop runs until the stream ends.");
      const add = data.action === "plus5" ? 5 : 1;
      if (ptr.closesAt + add * MIN > (d.openedAt || now) + 120 * MIN) throw fail("maxed", "A drop can't run past 2 hours.");
      ptr.closesAt += add * MIN; d.closesAt = ptr.closesAt; setTimeout(emit, 600);
      return { ok: true, dropId: d.id, closesAt: ptr.closesAt };
    }
    throw fail("args", `The preview doesn't fake ${name}.`);
}

  return {
    preview: true,
    call: (name, data) => call(name, data),
    async catalog() { return BADGES; },
    async drops(streamId: string) { return docs.filter((x) => x.streamId === streamId || !x.streamId).map((x) => ({ ...x })); },
    onLive(fn) { subs.add(fn); fn(snapshot()); return () => { subs.delete(fn); }; },
  };
}

// ------------------------------------------------------------------------------------------------ the viewer's side (live drops part 5)
// ?drop=<kind> on any non-production page: the site-wide banner, the /live card (with ?live=public) and the stream view demo (/live/obs?demo=1)
// show a sample drop in that state, with the shell's ?as=visitor|member|admin deciding who is looking. Local data only: no Firestore, no callable.
//   open | until | closing | claimed | already | draw | entered | drawing | won | lost | closed | dropper     (&signup=1: an unfinished signup)
export const DROP_KINDS = ["open", "until", "closing", "claimed", "already", "draw", "entered", "drawing", "won", "lost", "closed", "dropper"];
const byId = (id: string) => BADGES.find((b) => b.id === id)!;
/** The sample public/live.drop for a kind. t0 is when the page started: the countdown and the claim count move from there, and loop. */
export function sampleDrop(kind: string, t0: number, now = Date.now()): PubDrop {
  const k = DROP_KINDS.includes(kind) ? kind : "open";
  const b = byId(k === "already" ? "glitchwitness" : k === "until" ? "anniversary-ember" : ["draw", "entered", "drawing", "won", "lost"].includes(k) ? "chosen-one" : k === "dropper" ? "boss-fight-believer" : "jump-scare-witness");
  const loop = 161_000, left = loop - ((now - t0) % loop);
  const claims = (k === "closed" ? 64 : ["drawing", "won", "lost"].includes(k) ? 212 : 37) + (["closed", "drawing", "won", "lost"].includes(k) ? 0 : Math.floor((now - t0) / 1500));
  const state: PubDrop["state"] = k === "closing" ? "closing" : k === "drawing" ? "drawing" : ["won", "lost", "closed"].includes(k) ? "closed" : "open";
  const graceLeft = 30_000 - ((now - t0) % 30_000);
  return {
    id: `preview_${b.id}`, badgeId: b.id, name: b.name, art: b.emoji, rarity: b.rarity, mode: b.drop.mode === "streamEnd" ? "streamEnd" : b.drop.mode,
    state, closesAt: state === "open" && b.drop.mode !== "streamEnd" ? now + left : null, graceUntil: k === "closing" ? now + graceLeft : null,
    cap: null, claims, winners: ["won", "lost"].includes(k) ? ["nightowl"] : [], closedAt: state === "closed" ? t0 : k === "closing" ? now + graceLeft - 30_000 : null,
  };
}

/** The viewer's io for drop-watch.ts in the preview. */
export function viewerPreview(): WatchIo {
  const q = new URLSearchParams(location.search), kind = q.get("drop") || "open", t0 = Date.now();
  const RESULT: Record<string, ClaimResult> = { claimed: "granted", already: "already", entered: "entered", drawing: "entered", won: "won", lost: "lost" };
  let result: ClaimResult | null = RESULT[kind] || null;
  const subs = new Set<(r: ClaimResult | null) => void>();
  return {
    preview: true,
    signup: q.get("signup") === "1",
    staff: kind === "dropper" || document.body.dataset.auth === "admin",
    decorate: (p: PubLive) => ({ ...p, state: p.state === "off" || p.state === "ended" ? "live" : p.state, drop: sampleDrop(kind, t0) }),
    async claim(_dropId: string) {
      await new Promise((r) => setTimeout(r, 400));
      result = ["draw", "entered"].includes(kind) ? "entered" : "granted";
      setTimeout(() => subs.forEach((fn) => fn(result)), 300);   // the claims listener catches up a moment later, as it does for real
      return { result };
    },
    watchClaim(_dropId: string, _uid: string, fn: (r: ClaimResult | null) => void) { subs.add(fn); setTimeout(() => fn(result), 200); return () => { subs.delete(fn); }; },
    async droppedBy() { return kind === "dropper" ? "preview" : "someone-else"; },
  };
}
