// Brain Dump's Firestore store (docs/specs/brain-dump.md §2): one document per person at sites/boomertanger/brainDump/{uid}, written
// whole by the browser (a recorded narrow exception; firestore.rules checks the owner, access, the keys, updatedAt == request.time and
// the size limits). firebase/firestore (with onSnapshot) loads only on this page; the rest of the site stays on Lite.
//
//   const store = await openStore(uid, { status, remote });
//   store.initial        the board to start from: a pending local copy newer than the server's wins, else the server's, else null
//   store.save(state)    called by the engine after every change: kept locally at once, saved ~800 ms after the last change
//   store.flush()        save now (the tab went hidden)
//   store.listen(api)    another device's save is applied when nothing is pending here and nothing editable has focus; otherwise it
//                        waits (and the next save here wins: last save wins, one person, so that's acceptable)
//
// The local copy: localStorage "bt.braindump.v1.<uid>" = { state, pending, at }. pending means not on the server yet, so a change made
// with a bad signal survives a reload and goes up when the page is back online. Losing access leaves the document untouched (the page
// just shows the lock card).
import type { BoardApi, BoardState } from "./engine";
import { LIMITS } from "./engine";

const DEBOUNCE_MS = 800;
type Status = "saving" | "saved" | "offline" | "error";
interface Local { state: BoardState; pending: boolean; at: number }

const keyFor = (uid: string) => `bt.braindump.v1.${uid}`;
function readLocal(uid: string): Local | null {
  try { const raw = localStorage.getItem(keyFor(uid)); const l = raw ? JSON.parse(raw) : null; return l && l.state ? l : null; } catch { return null; }
}
function writeLocal(uid: string, l: Local) { try { localStorage.setItem(keyFor(uid), JSON.stringify(l)); } catch { /* blocked storage: the server copy still saves */ } }

/** The document exactly as the rules accept it (seven keys; updatedAt is added as the server's time). */
function toDoc(s: BoardState) {
  return {
    v: 1,
    goal: String(s.goal || "").slice(0, LIMITS.goal),
    goalDone: !!s.goalDone,
    startDate: String(s.startDate || "").slice(0, 10),
    inbox: { items: s.inbox.items.slice(0, LIMITS.inbox).map((it) => ({ id: it.id, text: it.text })) },
    categories: s.categories.slice(0, LIMITS.categories).map((c) => ({
      id: c.id, title: c.title, color: c.color, size: c.size, placeholder: c.placeholder,
      items: c.items.map((it) => ({ id: it.id, text: it.text, done: !!it.done, starred: !!it.starred })),
    })),
  };
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function openStore(uid: string, { status }: { status: (s: Status) => void }) {
  const [fs, fb] = await Promise.all([import("firebase/firestore"), import("../../lib/firebase")]);
  const db = fs.getFirestore(fb.app);
  const ref = fs.doc(db, "sites", fb.SITE_ID, "brainDump", uid);

  // Where to start: a pending local copy newer than the server's wins (it goes up below); otherwise the server's.
  let server: { state: BoardState; at: number } | null = null;
  try {
    const snap = await fs.getDoc(ref);
    if (snap.exists()) { const d = snap.data(); server = { state: d as BoardState, at: d.updatedAt?.toMillis?.() ?? 0 }; }
  } catch (err) { console.warn("brain dump: couldn't read the board", (err as { code?: string })?.code || err); }
  const local = readLocal(uid);
  const localWins = !!local?.pending && (!server || local.at > server.at);
  const initial: BoardState | null = localWins ? local!.state : server?.state ?? local?.state ?? null;

  let latest: BoardState | null = null, timer = 0, inflight: Promise<void> | null = null, lastSaved = initial ? JSON.stringify(toDoc(initial)) : "";
  let pending = localWins;
  let api: BoardApi | null = null, waitingRemote: BoardState | null = null;

  async function push() {
    timer = 0;
    if (!latest) return;
    const doc = toDoc(latest);
    const body = JSON.stringify(doc);
    if (inflight) { await inflight.catch(() => {}); if (timer) return; }   // a newer change scheduled its own save
    // Offline, Firestore would queue the write and never answer, so say so and wait for "online" (the local copy is already pending).
    if (!navigator.onLine) { status("offline"); return; }
    status("saving");
    inflight = fs.setDoc(ref, { ...doc, updatedAt: fs.serverTimestamp() }).then(() => {
      lastSaved = body;
      if (JSON.stringify(toDoc(latest!)) === body) { pending = false; writeLocal(uid, { state: latest!, pending: false, at: Date.now() }); }
      status("saved");
      applyWaiting();
    }, (err) => {
      console.warn("brain dump: save failed", err?.code || err);
      status(navigator.onLine ? "error" : "offline");
    }).finally(() => { inflight = null; });
    await inflight;
  }
  function schedule(ms = DEBOUNCE_MS) { clearTimeout(timer); timer = window.setTimeout(() => void push(), ms); }

  function save(state: BoardState) {
    latest = state;
    pending = true;
    writeLocal(uid, { state, pending: true, at: Date.now() });
    schedule();
  }
  function flush() { if (pending && latest) { clearTimeout(timer); void push(); } }

  function applyWaiting() {
    if (!api || !waitingRemote || pending || timer || inflight || api.isEditing()) return;
    const s = waitingRemote; waitingRemote = null;
    if (same(toDoc(s), toDoc(api.state()))) return;
    api.replace(s);
    writeLocal(uid, { state: api.state(), pending: false, at: Date.now() });
  }

  function listen(board: BoardApi, root: HTMLElement) {
    api = board;
    root.addEventListener("focusout", () => setTimeout(applyWaiting, 0));
    return fs.onSnapshot(ref, (snap) => {
      if (snap.metadata.hasPendingWrites || !snap.exists()) return;   // our own write echoing back, or nothing yet
      const d = snap.data() as BoardState;
      if (JSON.stringify(toDoc(d)) === lastSaved) return;               // what we just saved
      waitingRemote = d;
      applyWaiting();
    }, (err) => console.warn("brain dump: listener", err?.code || err));
  }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  addEventListener("online", () => { if (pending && latest) schedule(0); });
  addEventListener("offline", () => { if (pending) status("offline"); });
  if (localWins) { latest = local!.state; schedule(0); }   // a change made offline goes up now

  return { initial, save, flush, listen };
}
