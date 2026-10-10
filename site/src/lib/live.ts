// The live state, shared by every page (docs/specs/control-room.md §10 and §13). ONE listener per tab on public/live, however many parts of
// the page ask for it, and it is let go when the tab has been hidden for more than a minute (so a forgotten background tab costs nothing).
// It sets data-live = off | public | backstage on <body>, the page root (.bt-root.bt-site), which lights the header beacon, the mascot's aware
// lenses, the footer's LIVE dot and the Live tile in the Watch nav group (CSS in shared/bt-ui.css reads that attribute).
//
// Reads the public document only (rules: public/{docId} is public read); firebase/firestore (with listeners) is imported the first time it is
// needed, never on the critical path, because the rest of the site uses Firestore Lite.
// Non-production: the existing ?live=off|public|backstage switch keeps working. While it is on the address, this module never touches the
// body attribute and opens no listener: the /live page then draws sample data (scripts/live/pub-preview.ts).
import type { PubLive } from "../scripts/live/model";
import { isProduction } from "./env.js";

const HIDDEN_MS = 60_000;

const blank = (): PubLive => ({
  state: "off", look: "hull", streamId: null, title: null, beat: null, beats: {}, window: { open: false, closesAt: null, beat: null },
  counts: { total: 0, byBeat: {}, byRoom: {} }, viewers: { total: 0, byPlatform: {} }, peak: 0, game: null, nextGame: null,
  crew: { captain: null, chats: {}, onDuty: [], grades: [] }, firstIn: [], firstInBeat: null, chatGame: null, chatGameWaiting: [],
});

/** What public/live holds, with every field present (a missing document is the off-air state). */
export function normaliseLive(d: any): PubLive {
  if (!d || typeof d !== "object") return blank();
  const b = blank();
  return {
    ...b, ...d,
    state: d.state === "live" || d.state === "backstage" || d.state === "ended" ? d.state : "off",
    look: d.look === "crt" ? "crt" : "hull",
    beats: d.beats || {},
    window: { ...b.window, ...(d.window || {}) },
    counts: { total: d.counts?.total || 0, byBeat: d.counts?.byBeat || {}, byRoom: d.counts?.byRoom || {} },
    viewers: { total: d.viewers?.total || 0, byPlatform: d.viewers?.byPlatform || {} },
    crew: { captain: d.crew?.captain ?? null, chats: d.crew?.chats || {}, onDuty: d.crew?.onDuty || [], grades: Array.isArray(d.crew?.grades) ? d.crew.grades : [] },
    firstIn: Array.isArray(d.firstIn) ? d.firstIn.filter((h: unknown) => typeof h === "string").slice(0, 3) : [], firstInBeat: d.firstInBeat ?? null,
    peak: d.peak || 0,
    game: d.game || null, nextGame: d.nextGame || null,
    chatGame: d.chatGame && typeof d.chatGame.runId === "string" && typeof d.chatGame.formatId === "string" ? d.chatGame : null,
    chatGameWaiting: Array.isArray(d.chatGameWaiting) ? d.chatGameWaiting.filter((x: any) => x && typeof x.runId === "string").slice(0, 3) : [],
  };
}

/** The preview switch (non-production): ?live= (the shell's own) or ?state= (the live page's finer one). Null on production. */
export function livePreview(): { live: string | null; state: string | null } | null {
  if (isProduction) return null;
  const q = new URLSearchParams(location.search);
  const live = q.get("live"), state = q.get("state");
  return live || state ? { live, state } : null;
}

type Fn = (p: PubLive) => void;
const subs = new Set<Fn>();
let current: PubLive | null = null;     // null until the first answer
let unsub: (() => void) | null = null;
let opening = false;
let started = false;
let hiddenTimer = 0;

export const bodyLive = (p: PubLive | null) => (p?.state === "live" ? "public" : p?.state === "backstage" ? "backstage" : "off");

function apply(p: PubLive) {
  current = p;
  if (!livePreview()) {
    document.body.dataset.live = bodyLive(p);
    // The beacon's second line and the footer's LIVE dot (hooks in LiveBeacon.astro and SiteFooter.astro).
    const sub = p.game?.title || p.title || "";
    document.querySelectorAll<HTMLElement>("[data-live-sub]").forEach((el) => { el.textContent = sub; el.hidden = !sub; });
    document.querySelectorAll<HTMLElement>("[data-live-hook]").forEach((el) => { el.hidden = p.state !== "live"; });
  }
  subs.forEach((fn) => { try { fn(p); } catch (err) { console.error(err); } });
}

async function open() {
  if (unsub || opening) return;
  opening = true;
  try {
    const [fs, fb] = await Promise.all([import("firebase/firestore"), import("./firebase")]);
    unsub = fs.onSnapshot(
      fs.doc(fs.getFirestore(fb.app), "sites", fb.SITE_ID, "public", "live"),
      (snap) => apply(normaliseLive(snap.exists() ? snap.data() : null)),
      (err) => console.warn("live: public/live listener", err?.code || err),   // keep the last state; the page still works
    );
  } catch (err) { console.warn("live: couldn't open the listener", err); }
  finally { opening = false; }
}
function close() { unsub?.(); unsub = null; }

function onVisibility() {
  if (document.hidden) {
    clearTimeout(hiddenTimer);
    hiddenTimer = window.setTimeout(() => { hiddenTimer = 0; close(); }, HIDDEN_MS);
  } else {
    clearTimeout(hiddenTimer); hiddenTimer = 0;
    void open();
  }
}

/** Opens the one listener (once per tab). Safe to call from anywhere, any number of times. */
export function startLive() {
  if (started || livePreview()) return;
  started = true;
  document.addEventListener("visibilitychange", onVisibility);
  void open();
}

/** Calls fn with the current live state now (once it is known) and on every change. Returns an unsubscribe. */
export function onLive(fn: Fn): () => void {
  subs.add(fn);
  if (current) fn(current);
  startLive();
  return () => { subs.delete(fn); };
}
export const liveNow = () => current;

/** Runs startLive once the page has settled: the shell calls this so the listener never competes with first paint. */
export function startLiveWhenIdle() {
  if (livePreview()) return;
  const go = () => startLive();
  if ("requestIdleCallback" in window) (window as any).requestIdleCallback(go, { timeout: 2500 });
  else setTimeout(go, 800);
}
