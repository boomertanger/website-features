// The Add a game dialog (docs/specs/game-vault.md §3; round 2 D3 + D4). Filled in by part 5d.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { requireVerified } from "./gate";

export async function openAddGame(_q = "") {
  if (!(await requireVerified("Join to add games"))) return;
  openModal({ title: "Add a game", feature: "game-vault", content: `${modalHeader("Add a game")}<p class="bt-hint">Coming in the next part.</p>` });
}
