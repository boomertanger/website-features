// A game picker for the Control Room's dialogs and the game switcher: search the Game Vault (the one public/vault summary, filtered in the browser, as
// the Scream Planner's tray does), pick a result, or "Add it to the Vault" when the game is not there (the Vault's own Add dialog, openAddGame, with
// its onAdded option: the game lands as a wishlist entry and is picked in the same step).
import { coverHtml } from "../../../../shared/ui/cover.js";
import type { Ctx } from "./state";
import { esc } from "./ui";

export interface Pick { gameId: string; title: string }
const norm = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "");

export function gamePickerHtml(id: string, { placeholder = "Search the Game Vault", label = "Search the Game Vault" } = {}) {
  return `<div class="lc-gp" data-gp="${esc(id)}"><label class="bt-label" for="gp-${esc(id)}">${esc(label)}</label><input class="bt-input" id="gp-${esc(id)}" type="search" autocomplete="off" placeholder="${esc(placeholder)}" data-gp-q><div class="lc-gp-res" data-gp-res aria-live="polite"></div></div>`;
}

/** Wires one picker (call after its markup is in the page). `actionLabel` is the result button's text. */
export function initGamePicker(box: HTMLElement, ctx: Ctx, { onPick, actionLabel = "Pick" }: { onPick: (g: Pick) => void | Promise<void>; actionLabel?: string }) {
  const q = box.querySelector<HTMLInputElement>("[data-gp-q]")!, res = box.querySelector<HTMLElement>("[data-gp-res]")!;
  const draw = () => {
    const t = norm(q.value.trim());
    if (!t) { res.innerHTML = ""; return; }
    const hits = [...ctx.vault.values()].filter((g) => norm(g.title).includes(t) || (g.altNames || []).some((a) => norm(a).includes(t))).slice(0, 6);
    res.innerHTML = hits.map((g) => `<div class="lc-game-row">${coverHtml(g.cover ?? null, { alt: g.title, cls: "bt-cover--sm" })}<div><b>${esc(g.title)}</b><small>${esc(g.status === "wishlist" ? "Wishlist" : "In the Vault")}</small></div><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-gp-pick="${esc(g.slug)}">${esc(actionLabel)}</button></div>`).join("")
      + `<div class="lc-gp-add">${hits.length ? "Not the one?" : "Not in the Vault."} <button type="button" class="bt-link-btn" data-gp-add>Add it to the Vault</button></div>`;
  };
  q.addEventListener("input", draw);
  box.addEventListener("click", async (e) => {
    const p = (e.target as HTMLElement).closest<HTMLElement>("[data-gp-pick]");
    if (p) { const g = ctx.vault.get(p.dataset.gpPick!); if (g) await onPick({ gameId: g.slug, title: g.title }); return; }
    if ((e.target as HTMLElement).closest("[data-gp-add]")) {
      const { openAddGame } = await import("../vault/add");
      await openAddGame(q.value.trim(), {
        onAdded: async (g) => { ctx.vault.set(g.slug, { ...(ctx.vault.get(g.slug) || ({} as any)), slug: g.slug, title: g.title, status: "wishlist", altNames: [], cover: null } as any); await onPick({ gameId: g.slug, title: g.title }); return `${g.title} is picked.`; },
      });
    }
  });
}
