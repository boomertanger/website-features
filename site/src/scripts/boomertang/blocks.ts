// The interactive magazine blocks on a Boomertang page (docs/specs/boomertang.md §4b, §6), wired once the page body is in place (static for
// public issues, rendered from Firestore for members-only ones). Each block finds its own markup and is a no-op when it isn't on the page.
import { initRedact } from "../../../../shared/ui/magazine.js";

export interface BlockCtx { issueId: string; slug: string; hrefFor: (slug: string) => string }

export function wireBlocks(scope: HTMLElement, _ctx: BlockCtx) {
  initRedact(scope);
  wireTree(scope);
}

/** The Family: tap anyone for what the games say and the source (one at a time; tap again to close). */
function wireTree(scope: HTMLElement) {
  const people = Array.from(scope.querySelectorAll<HTMLButtonElement>(".tg-person[data-person]"));
  if (!people.length) return;
  const show = (btn: HTMLButtonElement | null) => {
    for (const p of people) {
      const on = p === btn;
      p.setAttribute("aria-expanded", String(on));
      const say = scope.querySelector<HTMLElement>(`#${CSS.escape(p.getAttribute("aria-controls") || "")}`);
      if (say) say.hidden = !on;
    }
  };
  people.forEach((p) => p.addEventListener("click", () => show(p.getAttribute("aria-expanded") === "true" ? null : p)));
}
