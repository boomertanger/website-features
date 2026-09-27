// Stream time formats, shared by the build (fallback text in the site's
// timezone) and the browser (rewritten in the viewer's own timezone by
// src/scripts/stream-time.js).
//   short: "Thu 7 PM"                    (beacon, tab bar)
//   day:   "Thursday, 7 PM"              (hero stream slide)
//   long:  "Thursday, Oct 1 at 7:00 PM"  (next livestream tile)

function parts(date, timeZone, options) {
  const out = {};
  new Intl.DateTimeFormat("en-US", { timeZone, ...options }).formatToParts(date).forEach((p) => { out[p.type] = p.value; });
  return out;
}

function clock(date, timeZone, { always } = {}) {
  const p = parts(date, timeZone, { hour: "numeric", minute: "2-digit", hour12: true });
  const hm = always || p.minute !== "00" ? `${p.hour}:${p.minute}` : p.hour;
  return `${hm} ${p.dayPeriod}`;
}

export function formatStreamTime(iso, style = "short", timeZone = undefined) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (style === "short") {
    return `${parts(date, timeZone, { weekday: "short" }).weekday} ${clock(date, timeZone)}`;
  }
  if (style === "day") {
    return `${parts(date, timeZone, { weekday: "long" }).weekday}, ${clock(date, timeZone)}`;
  }
  const d = parts(date, timeZone, { weekday: "long", month: "short", day: "numeric" });
  return `${d.weekday}, ${d.month} ${d.day} at ${clock(date, timeZone, { always: true })}`;
}

// Whole days / hours / minutes until iso (never negative).
export function countdownParts(iso, now = Date.now()) {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const mins = Math.floor(ms / 60000);
  return { days: Math.floor(mins / 1440), hours: Math.floor((mins % 1440) / 60), minutes: mins % 60 };
}

export const pad2 = (n) => String(n).padStart(2, "0");
