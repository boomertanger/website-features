// Cover suggestions (docs/specs/game-vault.md §6). Filled in by part 5e.
import { requireVerified } from "./gate";

export async function openCoverSuggest(_g: { slug: string; title: string }) {
  await requireVerified("Join to suggest a cover");
}
