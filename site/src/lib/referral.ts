// Referral links (docs/specs/mod-machina.md §9): boomertanger.com/join/@handle keeps the handle in this
// browser for 30 days, the first link wins, and the signup sends it to completeSignup as refHandle.
// The server decides what counts (never your own link, never fails the signup). Reads and writes are
// wrapped in try/catch: private windows can block storage.
import { REF_KEY } from "./auth-keys";

export const REF_DAYS = 30;
const SHAPE = /^[a-z0-9_]{3,20}$/;

/** A handle from a link or an address, cleaned: no @, lower case, 3 to 20 letters, numbers or underscores; else "". */
export function cleanRef(raw: string | null | undefined) {
  const h = String(raw || "").replace(/^@/, "").toLowerCase();
  return SHAPE.test(h) ? h : "";
}

/** The saved handle, or "" when none or expired. */
export function getRef(now = Date.now()): string {
  try {
    const v = JSON.parse(localStorage.getItem(REF_KEY) || "null");
    if (v && typeof v.handle === "string" && typeof v.until === "number" && v.until > now) return cleanRef(v.handle);
  } catch { /* storage blocked or unreadable */ }
  return "";
}

/** Saves a handle unless a live one is already saved (first link wins). Returns the handle that is kept. */
export function saveRef(raw: string, now = Date.now()): string {
  const h = cleanRef(raw);
  if (!h) return getRef(now);
  const have = getRef(now);
  if (have) return have;
  try { localStorage.setItem(REF_KEY, JSON.stringify({ handle: h, until: now + REF_DAYS * 86400000 })); } catch { /* storage blocked */ }
  return h;
}

export function clearRef() {
  try { localStorage.removeItem(REF_KEY); } catch { /* storage blocked */ }
}
