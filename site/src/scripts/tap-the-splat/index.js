// Tap the Splat entry point, loaded with a dynamic import on the first splat tap
// (scripts/footer.js). The game's stylesheet comes with it: imported as a URL and
// attached here, because a plain CSS import would be hoisted into every page's
// <head> by the build and load before anyone plays.
import cssUrl from "./tap-the-splat.css?url";
import { createGame } from "./engine.js";
import { initPower } from "./power.js";

let styles;
function loadStyles() {
  styles ??= new Promise((resolve) => {
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: cssUrl });
    link.onload = link.onerror = () => resolve();
    document.head.append(link);
  });
  return styles;
}

/** Creates the game on the footer's play area (once) without starting a run (the live UI kit). */
export async function loadGame(root) {
  await loadStyles();
  root._ttsGame ??= createGame(root);
  initPower(root);
  return root._ttsGame;
}

/** Creates the game on the footer's play area (once) and starts a run. */
export async function startGame(root) {
  await loadStyles();
  root._ttsGame ??= createGame(root);
  initPower(root);   // Contact + Follow powers up when the chain pull reveals it
  root._ttsGame.start();
  return root._ttsGame;
}
