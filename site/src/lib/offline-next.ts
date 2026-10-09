// The next stream on the pages' small labels (docs/specs/header-nav.md): the Live Beacon in the header and the raised Live tab on phones. They start as
// plain "Offline" with no time and only learn a time from the real schedule (public/schedule and the published streams: lib/next-stream.ts), never from
// a placeholder in site.json. The answer is kept in sessionStorage for 5 minutes, so browsing the site costs one read round per visit, not per page.
import { formatStreamTime } from "./time.js";

const KEY = "bt-next-stream";
const TTL = 5 * 60_000;

interface Cached { at: number; start: number | null }

async function nextStart(): Promise<number | null> {
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY) || "null") as Cached | null;
    if (c && Date.now() - c.at < TTL && (c.start == null || c.start > Date.now())) return c.start;
  } catch { /* storage off */ }
  const n = await import("./next-stream").then((m) => m.loadNextStream()).catch(() => undefined);
  if (n === undefined) return null;                 // the read failed: show nothing rather than guess
  const start = n ? n.start : null;
  try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), start } satisfies Cached)); } catch { /* storage off */ }
  return start;
}

/** Fills the beacon and the raised tab when a stream is scheduled; leaves them at "Offline" otherwise. */
export async function paintNextLabels() {
  const start = await nextStart();
  if (!start) return;
  const iso = new Date(start).toISOString(), short = formatStreamTime(iso, "short");
  document.querySelectorAll<HTMLElement>("[data-next-label]").forEach((el) => { el.textContent = "Next stream"; });
  document.querySelectorAll<HTMLElement>("[data-next-sub]").forEach((el) => {
    const t = el.querySelector("time");
    if (t) { t.setAttribute("datetime", iso); t.textContent = short; } else el.textContent = short;
    el.hidden = false;
  });
}
