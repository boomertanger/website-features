// "I want this too" on wishlist games (docs/specs/game-vault.md §2): vaultWant { slug, on }.
// Visitors get the Join dialog titled "Join to vote", unverified members the verify prompt.
// The server keeps one want per member and never shows who wants what, so the page can't read
// whether you already want a game: this browser remembers the ones you pressed (a second press
// on another device is harmless, the server counts you once).
import { call } from "../../lib/call";
import { messageFor } from "../../lib/errors";
import { getAuthState, onAuth } from "../../lib/auth";
import { requireVerified } from "./gate";
import { I } from "./art";
import type { VCard } from "./data";

const key = () => `bt-vault-wants:${getAuthState().user?.uid || "anon"}`;
function mine(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key()) || "[]")); } catch { return new Set(); }
}
function remember(slug: string, on: boolean) {
  const s = mine();
  if (on) s.add(slug); else s.delete(slug);
  try { localStorage.setItem(key(), JSON.stringify([...s])); } catch { /* storage blocked */ }
}

export function wantButton(g: Pick<VCard, "slug" | "wanted" | "status">, { big = false } = {}) {
  if (g.status !== "wishlist") return "";
  const on = mine().has(g.slug);
  const visitor = getAuthState().status === "signedOut";
  const label = visitor ? "Join free to vote" : on ? "You want this" : "I want this too";
  return `<button type="button" class="bt-btn ${on ? "bt-btn--secondary" : big ? "bt-btn--primary" : "bt-btn--secondary"}${big ? "" : " bt-btn--sm"}" data-want="${g.slug}" aria-pressed="${on}">${I.heart}${label}</button>`;
}

/** Wires every [data-want] under root. onCount(slug, wantedCount) lets the page update its numbers. */
export function initWants(root: ParentNode, onCount?: (slug: string, n: number) => void) {
  root.querySelectorAll<HTMLButtonElement>("[data-want]:not([data-want-ready])").forEach((b) => {
    b.dataset.wantReady = "";
    b.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!(await requireVerified("Join to vote"))) return;
      const slug = b.dataset.want!, on = b.getAttribute("aria-pressed") !== "true";
      b.disabled = true;
      try {
        const r = await call<{ wantedCount: number }>("vaultWant", { slug, on });
        remember(slug, on);
        b.setAttribute("aria-pressed", String(on));
        b.innerHTML = `${I.heart}${on ? "You want this" : "I want this too"}`;
        onCount?.(slug, r.wantedCount);
      } catch (err) {
        b.title = messageFor(err, "Couldn't save that. Try again.");
      } finally { b.disabled = false; }
    });
  });
}

// The labels change with sign-in (visitors see "Join free to vote").
onAuth(() => document.querySelectorAll<HTMLButtonElement>("[data-want]").forEach((b) => {
  const visitor = getAuthState().status === "signedOut", on = mine().has(b.dataset.want!);
  b.setAttribute("aria-pressed", String(on));
  b.innerHTML = `${I.heart}${visitor ? "Join free to vote" : on ? "You want this" : "I want this too"}`;
}));
