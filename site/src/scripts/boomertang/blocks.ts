// The interactive magazine blocks on a Boomertang page (docs/specs/boomertang.md §4b, §6), wired once the page body is in place (static for
// public issues, rendered from Firestore for members-only ones). Each block finds its own markup and is a no-op when it isn't on the page.
import { initRedact } from "../../../../shared/ui/magazine.js";

export interface BlockCtx { issueId: string; slug: string; hrefFor: (slug: string) => string }

export function wireBlocks(scope: HTMLElement, _ctx: BlockCtx) {
  initRedact(scope);
}
