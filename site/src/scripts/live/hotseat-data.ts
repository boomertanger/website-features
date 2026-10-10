// Hot Seat data for the site (docs/specs/chat-games.md §3, §5, §12; part 4): the run doc and the current round doc are watched live (cg-watch.ts);
// everything else is a one-off Firestore Lite read when a watched doc changes. The run (public) carries the display: seats and, in the vote, the nameless answers. A member's own plays/{uid} (r.{n}: seat, answer,
// answerId, vote, result) and volunteers/{streamId}_{uid}; the crew's staff/r{n} (answers with names, hidden). Every move goes through chatGamePlay,
// chatGameVolunteer, chatGameModerate and chatGameControl. Preview (staging, signed out, ?game=hot-seat): the sample round from hotseat-sample.ts on a
// loop, you as @gbo in seat 2; nothing is read or written.
import { db, doc, getDoc, getDocs, collection, query, where, SITE_ID } from "../../lib/db";
import { call } from "../../lib/call";
import { isProduction } from "../../lib/env.js";
import { hsDemoAt, hsSampleDisplay, type HsDisplay } from "./hotseat-sample";
import { watchDoc } from "./cg-watch";

const base = () => ["sites", SITE_ID, "chatGames", "main"] as const;
const ms = (v: any): number => (v == null ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : 0);
const q = () => new URLSearchParams(location.search);

export interface HsRun { id: string; state: string; phase: string; round: number; rounds: number; picker: string; nextPicker: string; paused: boolean; closesAt: number | null; display: HsDisplay | null; streamId: string; packId: string }
export interface HsPlay { seat?: boolean; answer?: string; answerId?: string; vote?: string; result?: { winner: boolean; votes: number; pct?: number; xp: number; capped: boolean; crew: boolean; hidden: boolean } }
export interface HsStaff { answers: Record<string, { text: string; handle: string }>; hidden: Record<string, { by: string; byHandle: string | null }> }
export interface HsRound { n: number; phase: string; card: string; seats: { uid: string; handle: string; status: string; volunteer?: boolean }[]; results?: { uid: string; handle: string; text: string | null; votes: number; pct: number; winner: boolean; xpPaid: number; capped: boolean; crew: boolean; hidden?: boolean }[]; noVotes?: boolean }
export interface HsPack { id: string; title: string; cards: { id: string; text: string; options?: string[]; lastUsed: number }[]; vaultGameIds: string[] }

/** The preview: staging only, signed out, asked for. */
export const hsPreview = (signedIn: boolean) => !isProduction && !signedIn && q().get("game") === "hot-seat";
const T0 = Date.now();
const pv = { volunteered: false, accepted: false, answer: "", vote: "", picker: "seance", paused: false };

function runFrom(id: string, d: any): HsRun {
  return { id, state: String(d.state || ""), phase: String(d.phase || "").replace(/^busy:/, ""), round: Number(d.round) || 0, rounds: Number(d.rounds) || 3, picker: d.picker || "seance", nextPicker: d.nextPicker || d.picker || "seance",
    paused: d.paused === true, closesAt: d.closesAt ? ms(d.closesAt) : null, display: d.display || null, streamId: String(d.streamId || ""), packId: String(d.packId || "") };
}
/** The preview round now (seat 2 is you, @gbo). */
function previewRun(): HsRun {
  const at = hsDemoAt(Date.now(), T0, q().get("hs"));
  const display = hsSampleDisplay(at.phase, { picker: pv.picker, closesAt: at.closesAt, into: at.into, paused: pv.paused });
  // you (@gbo) move only when you tap: I'm in, then Lock it in
  if (at.phase === "accept") display.seats = display.seats.map((s) => (s.handle === "gbo" ? { ...s, status: pv.accepted ? "in" : "picked" } : s));
  if (at.phase === "answer") display.seats = display.seats.map((s) => (s.handle === "gbo" ? { ...s, status: pv.answer ? "answered" : "in" } : s));
  return { id: "preview-hs", state: at.phase === "reveal" ? "revealed" : "open", phase: at.phase, round: 1, rounds: 3, picker: pv.picker, nextPicker: pv.picker, paused: pv.paused, closesAt: at.closesAt, display, streamId: "preview", packId: "general" };
}

// ---------- live listeners (cg-watch.ts): the run doc and the current round doc only ----------
/** fn(run) now and on every change of the run doc; the preview ticks its sample round every second instead (nothing is read). Returns a stop. */
export function watchHsRun(runId: string, preview: boolean, fn: (r: HsRun | null) => void, onErr?: () => void): () => void {
  if (preview || runId === "preview-hs") { fn(previewRun()); const t = window.setInterval(() => fn(previewRun()), 1000); return () => clearInterval(t); }
  return watchDoc([...base(), "runs", runId], (d) => fn(d ? runFrom(runId, d) : null), onErr);
}
export function watchHsRound(runId: string, n: number, preview: boolean, fn: (r: HsRound | null) => void): () => void {
  if (preview || runId === "preview-hs") { void getRound(runId, n, true).then(fn); const t = window.setInterval(() => void getRound(runId, n, true).then(fn), 1000); return () => clearInterval(t); }
  return watchDoc([...base(), "runs", runId, "rounds", String(n)], (d) => fn(d as HsRound | null));
}

// ---------- reads ----------
export async function getHsRun(runId: string, preview = false): Promise<HsRun | null> {
  if (preview || runId === "preview-hs") return previewRun();
  const s = await getDoc(doc(db, ...base(), "runs", runId));
  return s.exists() ? runFrom(s.id, s.data()) : null;
}
export async function getMyPlay(runId: string, uid: string, n: number, preview = false): Promise<HsPlay> {
  if (preview) {
    const r = previewRun();
    return { seat: pv.accepted || r.phase !== "accept", answer: r.phase === "answer" ? pv.answer || undefined : "In plain sight, wearing a sign that says \"not here\".", answerId: "a2", vote: pv.vote || undefined,
      result: r.phase === "reveal" ? { winner: true, votes: 111, pct: 52, xp: 25, capped: false, crew: false, hidden: false } : undefined };
  }
  try { const s = await getDoc(doc(db, ...base(), "runs", runId, "plays", uid)); return ((s.data() as any)?.r || {})[n] || {}; } catch { return {}; }
}
export async function getRound(runId: string, n: number, preview = false): Promise<HsRound | null> {
  if (preview) {
    const r = previewRun(), d = r.display!;
    return { n: 1, phase: r.phase, card: d.card || "", seats: d.seats.map((s, i) => ({ uid: `u${i}`, handle: s.handle, status: s.status, volunteer: s.handle !== "lanternjaw" })),
      results: r.phase === "reveal" ? d.answers.map((a, i) => ({ uid: `u${i}`, handle: a.handle || "", text: a.text, votes: a.votes || 0, pct: a.pct || 0, winner: !!a.winner, xpPaid: a.winner ? 25 : 5, capped: false, crew: false })) : undefined };
  }
  const s = await getDoc(doc(db, ...base(), "runs", runId, "rounds", String(n)));
  return s.exists() ? (s.data() as HsRound) : null;
}
export async function getStaff(runId: string, n: number, preview = false): Promise<HsStaff> {
  if (preview) {
    const r = previewRun();
    const a = r.phase === "accept" ? {} : { u0: { text: "Under the bed. That is literally their office.", handle: "lanternjaw" }, u1: { text: "In plain sight, wearing a sign that says \"not here\".", handle: "gbo" }, ...(r.phase === "answer" && Date.now() % 2 ? {} : { u2: { text: "The monster's group chat. Nobody reads it.", handle: "ravenhex" } }) };
    return { answers: a, hidden: {} };
  }
  try { const s = await getDoc(doc(db, ...base(), "runs", runId, "staff", `r${n}`)); const d: any = s.data() || {}; return { answers: d.answers || {}, hidden: d.hidden || {} }; } catch { return { answers: {}, hidden: {} }; }
}
/** Am I checked in to the beat that's on now? (my own presence doc, and public/live for the beat) */
export async function checkedInNow(streamId: string, uid: string, preview = false): Promise<boolean> {
  if (preview) return q().get("as") !== "visitor";
  try {
    const [p, pub] = await Promise.all([getDoc(doc(db, "sites", SITE_ID, "streams", streamId, "presence", uid)), getDoc(doc(db, "sites", SITE_ID, "public", "live"))]);
    const beat = (pub.data() as any)?.beat;
    return !!(beat && (p.data() as any)?.beats?.[beat]);
  } catch { return false; }
}
/** Clocked in tonight (crew only can read private/duty; anyone else is simply not on duty). */
export async function onDutyNow(streamId: string, uid: string, preview = false): Promise<boolean> {
  if (preview) return q().get("duty") === "1";
  try { const s = await getDoc(doc(db, "sites", SITE_ID, "streams", streamId, "private", "duty")); return !!(s.data() as any)?.onDuty?.[uid]; } catch { return false; }
}
export async function myVolunteer(streamId: string, uid: string, preview = false): Promise<boolean> {
  if (preview) return pv.volunteered;
  try { return (await getDoc(doc(db, ...base(), "volunteers", `${streamId}_${uid}`))).exists(); } catch { return false; }
}

// ---------- the launch dialog ----------
/** Approved packs of a format with cards (the crew reads packs; Hot Seat, Would You Rather and Predictions use it), the default first: tagged to a game
 *  planned tonight, else General, else the first. */
export async function launchPacks(streamId: string, preview = false, formatId = "hot-seat"): Promise<{ packs: HsPack[]; defaultId: string; tagged: boolean }> {
  if (preview && formatId === "would-you-rather") {
    const card = (id: string, a: string, b: string) => ({ id, text: "Would you rather…", options: [a, b], lastUsed: 0 });
    return { packs: [{ id: "classics", title: "Classics", vaultGameIds: [], cards: [card("w1", "Always hear footsteps behind you", "Never see your own reflection again"), card("w2", "Lose your flashlight", "Lose your map"), card("w3", "Be the last one alive", "Be the first one to see it")] }], defaultId: "classics", tagged: false };
  }
  if (preview && formatId === "predictions") {
    return { packs: [{ id: "re4", title: "Resident Evil 4", vaultGameIds: ["resident-evil-4"], cards: [{ id: "p1", text: "Does Boomer use the shotgun before the village bell?", options: ["Yes", "No"], lastUsed: 0 }, { id: "p2", text: "How many deaths before the first boss?", options: ["None", "1 or 2", "3 or more"], lastUsed: 0 }] }], defaultId: "re4", tagged: true };
  }
  if (preview) {
    const packs: HsPack[] = [
      { id: "re", title: "Resident Evil night", vaultGameIds: ["resident-evil-4"], cards: [{ id: "c1", text: "What's the worst thing to hear on a walkie-talkie at 3 a.m.?", lastUsed: 0 }, { id: "c2", text: "Pitch a terrible new item for the merchant.", lastUsed: 0 }] },
      { id: "general", title: "General", vaultGameIds: [], cards: [{ id: "g1", text: "What's the worst possible place to hide from a monster?", lastUsed: 0 }, { id: "g2", text: "Which horror villain would be the worst roommate?", lastUsed: 0 }, { id: "g3", text: "Describe your last nightmare in five words.", lastUsed: 0 }] },
    ];
    return { packs, defaultId: "re", tagged: true };
  }
  const snap = await getDocs(query(collection(db, ...base(), "packs"), where("formatId", "==", formatId), where("status", "==", "approved")));
  const packs: HsPack[] = snap.docs.map((d: any) => ({ id: d.id, title: String(d.get("title") || d.id), vaultGameIds: d.get("vaultGameIds") || [],
    cards: (d.get("cards") || []).map((c: any) => ({ id: String(c.id), text: String(c.text || ""), options: Array.isArray(c.options) ? c.options.map(String) : undefined, lastUsed: Math.max(0, ...((c.usedOn || []) as any[]).map((u) => ms(u.at))) })) }))
    .filter((p: HsPack) => p.cards.length).sort((a: HsPack, b: HsPack) => a.title.localeCompare(b.title));
  let tonight: string[] = [];
  try { tonight = (((await getDoc(doc(db, "sites", SITE_ID, "streams", streamId))).data() as any)?.plannedGames || []).map((g: any) => g.gameId).filter(Boolean); } catch { /* no plan: General */ }
  const tag = packs.find((p) => p.vaultGameIds.some((id) => tonight.includes(id)));
  const gen = packs.find((p) => p.title.trim().toLowerCase() === "general");
  return { packs, defaultId: (tag || gen || packs[0])?.id || "", tagged: !!tag };
}
/** A card to show first: one not used in the last 30 days at random (else the least recently used), never one of `skip`. */
export function pickCard(pack: HsPack, skip: string[] = []) {
  const left = pack.cards.filter((c) => !skip.includes(c.id));
  const pool = left.length ? left : pack.cards;
  const fresh = pool.filter((c) => !c.lastUsed || Date.now() - c.lastUsed > 30 * 86400000);
  if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
  return [...pool].sort((a, b) => a.lastUsed - b.lastUsed)[0];
}

// ---------- moves ----------
export async function hsPlay(runId: string, action: "accept" | "answer" | "vote", data: Record<string, unknown> = {}, preview = false) {
  if (preview) {
    if (action === "accept") pv.accepted = true;
    if (action === "answer") pv.answer = String(data.text || "");
    if (action === "vote") pv.vote = String(data.answerId || "");
    return { ok: true };
  }
  return call("chatGamePlay", { runId, action, ...data });
}
export async function hsVolunteer(on: boolean, preview = false) {
  if (preview) { pv.volunteered = on; return { ok: true, on }; }
  return call<{ ok: true; on: boolean }>("chatGameVolunteer", { on });
}
export const hsHide = (runId: string, uid: string) => call("chatGameModerate", { runId, uid });
export async function hsControl(runId: string, action: string, data: Record<string, unknown> = {}, preview = false) {
  if (preview) { if (action === "picker") pv.picker = String(data.picker); if (action === "pause") pv.paused = true; if (action === "resume") pv.paused = false; return { ok: true }; }
  return call("chatGameControl", { runId, action, data });
}
/** Checked in to the current beat, from public/live (for the launch warning: fewer than 2 can play). */
export async function eligibleNow(preview = false): Promise<number> {
  if (preview) return q().get("few") === "1" ? 1 : 14;
  try { const d: any = (await getDoc(doc(db, "sites", SITE_ID, "public", "live"))).data() || {}; return Number(d.beats?.[d.beat]?.checkins) || 0; } catch { return 0; }
}
