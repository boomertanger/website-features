// Boomertang's Paper / Ink (docs/specs/boomertang.md §5): the reader's choice, on <html data-tang-mode> before first paint (the inline script
// in BaseLayout reads localStorage "bt.tang.mode"). Signed in, the account's prefs.tangMode wins and follows the reader to every device
// (updatePrefs); this browser's copy is kept in step so the next visit paints right first time. Visitors keep it in this browser only.
import { call } from "../../lib/call";
import type { AuthState } from "../../lib/auth";

export type Mode = "paper" | "ink";
const KEY = "bt.tang.mode";
const listeners = new Set<(m: Mode) => void>();

export const modeNow = (): Mode => (document.documentElement.dataset.tangMode === "ink" ? "ink" : "paper");
function paint(m: Mode) {
  document.documentElement.dataset.tangMode = m;
  try { localStorage.setItem(KEY, m); } catch { /* blocked storage: this page only */ }
  listeners.forEach((f) => f(m));
}
export const onMode = (f: (m: Mode) => void) => { listeners.add(f); return () => listeners.delete(f); };

let signedIn = false;
/** The reader picked a mode on the switch. */
export async function setMode(m: Mode): Promise<"account" | "browser"> {
  paint(m);
  if (!signedIn) return "browser";
  try { await call("updatePrefs", { tangMode: m }); return "account"; } catch { return "browser"; }
}
/** Auth settled: a signed-in reader's saved mode (if any) wins over this browser's. */
export function followAccount(s: AuthState) {
  signedIn = !!s.user && !!s.profile;
  const saved = (s.account?.prefs as { tangMode?: string } | undefined)?.tangMode;
  if (signedIn && (saved === "paper" || saved === "ink") && saved !== modeNow()) paint(saved);
}
