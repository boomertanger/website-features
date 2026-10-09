// The stream view's scenes (docs/specs/control-room.md §8). The scene engine: given the feed's view it draws the scene the feed names (Auto follows the beat,
// or the owner's Scene card pins one). The scenes themselves arrive in the next commit; this one only keeps the canvas ready.
import type { ObsView } from "./obs";

export function createScenes(_box: HTMLElement, _shape: "wide" | "tall", _params: URLSearchParams) {
  return { render(_view: ObsView) { /* scenes follow */ } };
}
