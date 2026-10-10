// Questions data for the site (docs/specs/chat-games.md §4, §12; part 2): the lanes, my questions, the mod queue, my votes and the session run, read with
// Firestore Lite; votes are written straight to questions/{id}/votes/{uid} (the one member-writable path: { at } only); everything else goes through
// the callables (questionAsk, questionWithdraw, questionModerate, chatGameStart/Swap/Control). Preview (staging, signed out, ?game=questions or the
// /live/questions page with ?as=member|mod): sample questions and a sample session, nothing read or written.
import { db, doc, getDoc, getDocs, collection, query, where, orderBy, limit, getCount, SITE_ID } from "../../lib/db";
import { setDoc, deleteDoc, serverTimestamp } from "firebase/firestore/lite";
import { call } from "../../lib/call";
import { isProduction } from "../../lib/env.js";
import { watchDoc } from "./cg-watch";

export type QStatus = "held" | "tonight" | "standing" | "answered" | "hidden" | "merged" | "cleared" | "archived" | "withdrawn";
export interface Question { id: string; text: string; uid: string; handle: string; status: QStatus; lane: "tonight" | "standing"; votes: number; createdAt: number; onAir: boolean; xp: number | null; capped: boolean; mergedInto: string | null }
export interface QDisplay { questionId: string | null; text: string | null; handle: string | null; votes: number; here: boolean; lane: string | null; next: { text: string; votes: number } | null; ending: boolean; closesAt?: number | null }
export interface QRun { id: string; state: string; current: string | null; pinned: string | null; skipped: string[]; answeredIds: string[]; ending: boolean; closesAt: number | null; minutes: number; round: number; display: QDisplay | null; streamId: string }

const base = () => ["sites", SITE_ID, "chatGames", "main"] as const;
const ms = (v: any): number => (v == null ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : 0);
const q = () => new URLSearchParams(location.search);
export const OPEN: QStatus[] = ["held", "tonight", "standing"];

/** The preview: staging only, signed out, asked for. */
export const qPreview = (signedIn: boolean) => !isProduction && !signedIn && (q().get("game") === "questions" || q().has("as"));

export function fromDoc(id: string, d: any): Question {
  return { id, text: String(d.text || ""), uid: String(d.uid || ""), handle: String(d.handle || ""), status: d.status as QStatus, lane: d.lane === "standing" ? "standing" : "tonight",
    votes: Number(d.votes) || 0, createdAt: ms(d.createdAt), onAir: !!d.onAir, xp: d.xp == null ? null : Number(d.xp), capped: d.capped === true, mergedInto: d.mergedInto || null };
}
export function runFrom(id: string, d: any): QRun {
  return { id, state: String(d.state || ""), current: d.current || null, pinned: d.pinned || null, skipped: d.skipped || [], answeredIds: d.answeredIds || [], ending: d.ending === true,
    closesAt: d.closesAt ? ms(d.closesAt) : null, minutes: Number(d.options?.minutes) || 0, round: Number(d.round) || 0, display: d.display || null, streamId: String(d.streamId || "") };
}

// ---------- the preview ----------
const NOW = Date.now(), MIN = 60000;
const SAMPLE: Question[] = [
  { id: "p1", text: "If you could delete one horror trope forever, which one and why?", uid: "u1", handle: "cryptkeeper", status: "tonight", lane: "tonight", votes: 41, createdAt: NOW - 8 * MIN, onAir: true, xp: null, capped: false, mergedInto: null },
  { id: "p2", text: "What game made you actually quit for the night?", uid: "me", handle: "gbo", status: "tonight", lane: "tonight", votes: 27, createdAt: NOW - 22 * MIN, onAir: false, xp: null, capped: false, mergedInto: null },
  { id: "p3", text: "Would you play Alien: Isolation again on the hardest mode for a subathon?", uid: "u3", handle: "ravenhex", status: "tonight", lane: "tonight", votes: 14, createdAt: NOW - 5 * MIN, onAir: false, xp: null, capped: false, mergedInto: null },
  { id: "p4", text: "Favourite sound design moment in any horror game?", uid: "u4", handle: "mothgirl", status: "tonight", lane: "tonight", votes: 9, createdAt: NOW - 3 * MIN, onAir: false, xp: null, capped: false, mergedInto: null },
  { id: "p5", text: "does the tracker beeping ever stop being stressful", uid: "u5", handle: "newbie_77", status: "held", lane: "tonight", votes: 0, createdAt: NOW - MIN, onAir: false, xp: null, capped: false, mergedInto: null },
  { id: "p6", text: "Best jump scare that was earned, not cheap?", uid: "u6", handle: "lanternjaw", status: "standing", lane: "standing", votes: 19, createdAt: NOW - 4 * 1440 * MIN, onAir: false, xp: null, capped: false, mergedInto: null },
  { id: "p7", text: "Would you ever stream a horror game with the lights fully off?", uid: "u7", handle: "mothlight", status: "standing", lane: "standing", votes: 12, createdAt: NOW - 2 * 1440 * MIN, onAir: false, xp: null, capped: false, mergedInto: null },
  { id: "p8", text: "Which horror game has the best ending?", uid: "me", handle: "gbo", status: "standing", lane: "standing", votes: 8, createdAt: NOW - 6 * 1440 * MIN, onAir: false, xp: null, capped: false, mergedInto: null },
  { id: "p9", text: "What got you into horror games in the first place?", uid: "u9", handle: "fogbank", status: "answered", lane: "standing", votes: 31, createdAt: NOW - 9 * 1440 * MIN, onAir: false, xp: 15, capped: false, mergedInto: null },
];
export const SAMPLE_RUN: QRun = { id: "preview", state: "open", current: "p1", pinned: "p3", skipped: [], answeredIds: [], ending: false, closesAt: NOW + 6 * MIN + 12000, minutes: 10, round: 1, streamId: "preview",
  display: { questionId: "p1", text: SAMPLE[0].text, handle: "cryptkeeper", votes: 41, here: true, lane: "tonight", next: { text: SAMPLE[2].text, votes: 14 }, ending: false } };
export const SAMPLE_POINTER = { runId: "preview", formatId: "questions", state: "open" as const, round: 1, title: "Questions" };
const previewVotes = new Set<string>(["p2x"]);

// ---------- reads ----------
export async function laneList(lane: "tonight" | "standing", sort: "top" | "new", preview = false): Promise<Question[]> {
  if (preview) return SAMPLE.filter((x) => x.status === lane).sort((a, b) => (sort === "new" ? b.createdAt - a.createdAt : b.votes - a.votes || a.createdAt - b.createdAt));
  const col = collection(db, ...base(), "questions");
  const qq = sort === "new" ? query(col, where("status", "==", lane), orderBy("createdAt", "desc"), limit(60)) : query(col, where("status", "==", lane), orderBy("votes", "desc"), orderBy("createdAt", "asc"), limit(60));
  return (await getDocs(qq)).docs.map((d) => fromDoc(d.id, d.data()));
}
export async function answeredList(preview = false): Promise<Question[]> {
  if (preview) return SAMPLE.filter((x) => x.status === "answered");
  return (await getDocs(query(collection(db, ...base(), "questions"), where("status", "==", "answered"), orderBy("createdAt", "desc"), limit(10)))).docs.map((d) => fromDoc(d.id, d.data()));
}
export async function mine(uid: string, preview = false): Promise<Question[]> {
  if (preview) return SAMPLE.filter((x) => x.uid === "me");
  return (await getDocs(query(collection(db, ...base(), "questions"), where("uid", "==", uid)))).docs.map((d) => fromDoc(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
}
export async function heldList(preview = false): Promise<Question[]> {
  if (preview) return SAMPLE.filter((x) => x.status === "held");
  return (await getDocs(query(collection(db, ...base(), "questions"), where("status", "==", "held"), limit(50)))).docs.map((d) => fromDoc(d.id, d.data())).sort((a, b) => a.createdAt - b.createdAt);
}
export async function myVotes(uid: string, ids: string[], preview = false): Promise<Set<string>> {
  if (preview) return new Set(ids.filter((i) => previewVotes.has(i)));
  const out = new Set<string>();
  await Promise.all(ids.map(async (id) => { try { if ((await getDoc(doc(db, ...base(), "questions", id, "votes", uid))).exists()) out.add(id); } catch { /* not readable: shown unvoted */ } }));
  return out;
}
/** Live listeners (cg-watch.ts, chat-games.md §3): the session's run doc, and the question on stream (its vote count; votes don't touch the run).
 *  The preview hands back the sample once; nothing is read. Each returns a stop. */
export function watchRun(runId: string, preview: boolean, fn: (r: QRun | null) => void): () => void {
  if (preview || runId === "preview") { fn(SAMPLE_RUN); return () => {}; }
  return watchDoc([...base(), "runs", runId], (d) => fn(d ? runFrom(runId, d) : null));
}
export function watchQuestion(qid: string, preview: boolean, fn: (q: Question | null) => void): () => void {
  if (preview) { fn(SAMPLE.find((x) => x.id === qid) || null); return () => {}; }
  return watchDoc([...base(), "questions", qid], (d) => fn(d ? fromDoc(qid, d) : null));
}
export async function getRun(runId: string, preview = false): Promise<QRun | null> {
  if (preview || runId === "preview") return SAMPLE_RUN;
  const s = await getDoc(doc(db, ...base(), "runs", runId));
  return s.exists() ? runFrom(s.id, s.data()) : null;
}
export async function waitingCount(preview = false): Promise<number> {
  if (preview) return SAMPLE.filter((x) => x.status === "tonight" || x.status === "standing").length;
  const col = collection(db, ...base(), "questions");
  const [t, s] = await Promise.all([getCount(query(col, where("status", "==", "tonight"))), getCount(query(col, where("status", "==", "standing")))]);
  return t.data().count + s.data().count;
}

// ---------- writes ----------
export async function setVote(qid: string, uid: string, on: boolean, preview = false) {
  if (preview) { if (on) previewVotes.add(qid); else previewVotes.delete(qid); return; }
  const ref = doc(db, ...base(), "questions", qid, "votes", uid);
  if (on) await setDoc(ref, { at: serverTimestamp() }); else await deleteDoc(ref);
}
export const askQuestion = (text: string) => call<{ ok: true; questionId: string; status: QStatus; lane: string }>("questionAsk", { text });
export const withdrawQuestion = (questionId: string) => call("questionWithdraw", { questionId });
export const moderateQuestion = (questionId: string, action: "approve" | "hide" | "toStanding" | "merge", targetId?: string) => call<{ ok: true; status?: string; votes?: number }>("questionModerate", { questionId, action, ...(targetId ? { targetId } : {}) });
export const controlRun = (runId: string, action: string, data: Record<string, unknown> = {}) => call("chatGameControl", { runId, action, data });

/** "8 min", "4 days", "just now". */
export function ago(t: number, now = Date.now()) {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h`;
  const d = Math.round(m / 1440);
  return `${d} ${d === 1 ? "day" : "days"}`;
}
