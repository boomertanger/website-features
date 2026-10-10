// Live listeners for Chat Games (docs/specs/chat-games.md §3 "How pages follow a run"), the same pattern as lib/live.ts and the Mod Deck: the full
// firebase/firestore (with onSnapshot) is imported the first time a game needs it, never on the critical path; the rest of the site stays on Lite.
// One listener per document however many parts ask; each is let go when the tab has been hidden for more than a minute and reopened (with a fresh
// snapshot) when it comes back, so a forgotten tab costs nothing. Only the run doc and the current round doc are watched; anything else (a member's
// own play, the staff answers, my votes) is read once when the watched doc says something changed.
//
//   watchDoc(path, onData, onErr?)   onData(data | null) now and on every change; returns a stop
import { SITE_ID } from "../../lib/firebase";

const HIDDEN_MS = 60_000;
type Fn = (d: any | null) => void;
interface Watch { path: string; subs: Set<Fn>; errs: Set<() => void>; unsub: (() => void) | null; last: any | null; seen: boolean }
const watches = new Map<string, Watch>();
let sdk: Promise<{ fs: any; db: any }> | null = null;
let hiddenTimer = 0, wired = false;

const load = () => (sdk ||= Promise.all([import("firebase/firestore"), import("../../lib/firebase")]).then(([fs, fb]) => ({ fs, db: fs.getFirestore(fb.app) })));

async function open(w: Watch) {
  if (w.unsub || document.hidden) return;
  try {
    const { fs, db } = await load();
    if (w.unsub || !watches.has(w.path)) return;
    w.unsub = fs.onSnapshot(fs.doc(db, w.path), (snap: any) => {
      w.last = snap.exists() ? snap.data() : null; w.seen = true;
      w.subs.forEach((fn) => { try { fn(w.last); } catch (err) { console.error(err); } });
    }, (err: any) => { console.warn("chat games listener", w.path, err?.code || err); w.unsub = null; w.errs.forEach((fn) => fn()); });
  } catch (err) { console.warn("chat games: couldn't open the listener", err); w.errs.forEach((fn) => fn()); }
}
function onVisibility() {
  if (document.hidden) {
    clearTimeout(hiddenTimer);
    hiddenTimer = window.setTimeout(() => { hiddenTimer = 0; for (const w of watches.values()) { w.unsub?.(); w.unsub = null; } }, HIDDEN_MS);
  } else {
    clearTimeout(hiddenTimer); hiddenTimer = 0;
    for (const w of watches.values()) void open(w);
  }
}

/** path: segments under sites/{siteId}, e.g. ["chatGames", "main", "runs", runId]. */
export function watchDoc(path: string[], onData: Fn, onErr?: () => void): () => void {
  if (!wired) { wired = true; document.addEventListener("visibilitychange", onVisibility); }
  const key = ["sites", SITE_ID, ...path].join("/");
  let w = watches.get(key);
  if (!w) { w = { path: key, subs: new Set(), errs: new Set(), unsub: null, last: null, seen: false }; watches.set(key, w); }
  w.subs.add(onData);
  if (onErr) w.errs.add(onErr);
  if (w.seen) onData(w.last);
  void open(w);
  const mine = w;
  return () => {
    mine.subs.delete(onData); if (onErr) mine.errs.delete(onErr);
    if (!mine.subs.size) { mine.unsub?.(); mine.unsub = null; watches.delete(key); }
  };
}

/**
 * A query, same rules as watchDoc (one listener per query per tab, let go while the tab is hidden): docs under sites/{siteId}/{path...} matching every
 * [field, op, value] in `where`. onData([{ id, ...data }]) now and on every change; returns a stop. The Mod Deck's held-questions queue uses it.
 */
export function watchQuery(path: string[], where: [string, string, unknown][], onData: (docs: any[]) => void, onErr?: () => void): () => void {
  let unsub: (() => void) | null = null, stopped = false;
  const open = async () => {
    if (unsub || stopped || document.hidden) return;
    try {
      const { fs, db } = await load();
      if (unsub || stopped) return;
      const q = fs.query(fs.collection(db, ["sites", SITE_ID, ...path].join("/")), ...where.map(([f, op, v]) => fs.where(f, op, v)));
      unsub = fs.onSnapshot(q, (s: any) => onData(s.docs.map((d: any) => ({ id: d.id, ...d.data() }))), (err: any) => { console.warn("chat games query listener", path.join("/"), err?.code || err); unsub = null; onErr?.(); });
    } catch (err) { console.warn("chat games: couldn't open the query listener", err); onErr?.(); }
  };
  let hiddenAt = 0;
  const vis = () => {
    if (document.hidden) { clearTimeout(hiddenAt); hiddenAt = window.setTimeout(() => { unsub?.(); unsub = null; }, HIDDEN_MS); }
    else { clearTimeout(hiddenAt); void open(); }
  };
  document.addEventListener("visibilitychange", vis);
  void open();
  return () => { stopped = true; clearTimeout(hiddenAt); document.removeEventListener("visibilitychange", vis); unsub?.(); unsub = null; };
}
