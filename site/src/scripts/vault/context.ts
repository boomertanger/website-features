// The list you came from (docs/specs/game-vault.md §9; round 3 N1 + P12). /games stores it in
// sessionStorage as you leave for a game: the exact /games URL (search, filters, sort), the scroll
// position, a short label ("Wishlist, A-Z") and the games in that list, in order. A game page uses it
// for Back to the Vault and for previous / next. A direct visit has none: Back goes to /games and
// the pager steps through the whole Vault in the default order (last streamed first).
import type { VCard } from "./data";

export interface VaultCtx { url: string; scroll: number; label: string; slugs: string[] }
const KEY = "bt-vault-ctx";
const RESTORE = "bt-vault-restore";

export const DEFAULT_LABEL = "All games, last streamed";

/** The Vault's default order: last streamed first, then most wanted, then A to Z. */
export const byLastStreamed = (a: VCard, b: VCard) => (b.last || 0) - (a.last || 0) || b.wanted - a.wanted || a.sortTitle.localeCompare(b.sortTitle);

export function saveCtx(ctx: VaultCtx) {
  try { sessionStorage.setItem(KEY, JSON.stringify(ctx)); } catch { /* storage blocked: the game page falls back */ }
}
export function loadCtx(): VaultCtx | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return c && typeof c.url === "string" && c.url.startsWith("/games") && Array.isArray(c.slugs) ? c : null;
  } catch { return null; }
}
/** Back to the Vault was used: the next /games load at that URL scrolls to where you were. */
export function markRestore() { try { sessionStorage.setItem(RESTORE, "1"); } catch { /* fine */ } }
export function takeRestore(): boolean {
  try { const on = sessionStorage.getItem(RESTORE) === "1"; sessionStorage.removeItem(RESTORE); return on; } catch { return false; }
}
