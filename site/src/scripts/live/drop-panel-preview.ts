// The drop panel's preview data (non-production, signed out, ?as=): the five drop badges from the seed (functions/data/trophy-room-badges.json)
// and a drop that runs here in the tab: dropOpen / dropAdjust act on it, claims tick up, the timer and the 30-second grace close it, a draw
// picks @nightowl. Nothing reaches Firestore or a callable. ?rush=1 adds a hit Recruit Rush with Boss Fight Believer as the reward badge.
import type { DropBadge, DropDoc, DropIo, DropLive } from "./drop-panel";
import type { PubDrop, PubLive } from "./model";

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
  const rush = q.get("rush") === "1";
  const snapshot = (): DropLive => {
    const l = liveOf();
    return { state: l.state, streamId: l.streamId, drop: ptr ? { ...ptr } : null, dropReady: rush && !rushOpened ? "boss-fight-believer" : null, rushGoal: rush ? 25 : null };
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
      if (docs.some((x) => x.badgeId === b.id && x.streamId === l.streamId)) throw fail("dropped", "That badge was already dropped this stream.");
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
    async drops(streamId: string) { return docs.filter((x) => x.streamId === streamId).map((x) => ({ ...x })); },
    onLive(fn) { subs.add(fn); fn(snapshot()); return () => { subs.delete(fn); }; },
  };
}
