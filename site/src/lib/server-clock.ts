// The server's clock on this device (docs/specs/prize-box.md §4.5 "the spin is decided first"): a Prize Box spin starts at the server's startAt, so a
// device whose own clock is wrong would spin out of step. serverNow() is Date.now() corrected by this device's offset from the server clock.
// Samples, best first:
//   - a round trip that returned the server's time (obsFeed's serverNow, prizeMine { draw: true }'s serverNow): the offset at the midpoint of the
//     request, accurate to half the round trip
//   - a pointer whose serverNow changed while this page was open (written moments ago; accurate to the listener's delivery delay)
//   - this site's own HTTP Date header (the edge server's clock, to the second), fetched once when nothing better has come in
// The sample with the smallest uncertainty in the last 10 minutes wins. Until there is one, the offset is 0 (the device's own clock).
import { isProduction } from "./env.js";

type Sample = { offset: number; err: number; at: number };
let best: Sample | null = null, asked = false;
const FRESH_MS = 10 * 60 * 1000;

function take(s: Sample) {
  if (!Number.isFinite(s.offset) || !Number.isFinite(s.err)) return;
  const stale = !best || Date.now() - best.at > FRESH_MS;
  if (stale || s.err <= best!.err) best = s;
}
/** A server time from a request sent at `sentAt` and answered at `gotAt` (device clock, ms). */
export function noteRoundTrip(serverMs: unknown, sentAt: number, gotAt = Date.now()) {
  if (typeof serverMs !== "number" || !Number.isFinite(serverMs) || gotAt < sentAt) return;
  const half = (gotAt - sentAt) / 2;
  take({ offset: serverMs - (sentAt + half), err: half + 5, at: gotAt });
}
/** A server time written into a document that just arrived through a live listener (its delivery delay is the uncertainty, about 300 ms). */
export function noteFresh(serverMs: unknown, gotAt = Date.now()) {
  if (typeof serverMs !== "number" || !Number.isFinite(serverMs)) return;
  if (Math.abs(serverMs - gotAt) > 6 * 60 * 60 * 1000) return;   // not a plausible "moments ago"
  take({ offset: serverMs - gotAt + 150, err: 400, at: gotAt });
}
/** Once per page: the edge server's Date header (one-second precision), as a fallback when no better sample comes in. */
export function askEdge() {
  if (asked || typeof fetch !== "function") return;
  asked = true;
  const sentAt = Date.now();
  fetch(`${location.origin}/favicon.svg`, { method: "HEAD", cache: "no-store" }).then((r) => {
    const gotAt = Date.now(), d = Date.parse(r.headers.get("date") || "");
    if (!Number.isFinite(d)) return;
    take({ offset: d + 500 - (sentAt + gotAt) / 2, err: (gotAt - sentAt) / 2 + 500, at: gotAt });   // the header is truncated to the second: +500 ms is its middle
  }).catch(() => { /* offline or blocked: the device clock it is */ });
}
/** The server's time now, as best this device knows it. */
export const serverNow = () => Date.now() + (best ? best.offset : 0);
/** For tests and the UI kit: the current offset and its uncertainty (ms). */
export const clockInfo = () => (best ? { offset: best.offset, err: best.err } : { offset: 0, err: Infinity });
// staging and localhost only: a handle for the browser checks (a device clock set wrong on purpose must be corrected)
if (!isProduction && typeof window !== "undefined") (window as any).btServerClock = { serverNow, clockInfo, askEdge, noteRoundTrip };
