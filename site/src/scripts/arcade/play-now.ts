// Play now (docs/specs/arcade-step1.md §3, D2): the game is the footer, so Play now
// scrolls to it and cues the splat for a few seconds ("Tap the splat to start",
// bt-ui.css .bt-tts[data-cue]). The player taps the splat as everywhere else.
const CUE_MS = 4500;
let timer = 0;

export function playNow() {
  const tts = document.querySelector<HTMLElement>("[data-tts]");
  const splat = tts?.querySelector<HTMLElement>('[data-tts-g="splat"]');
  if (!tts || !splat) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  splat.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  splat.focus({ preventScroll: true });
  if (tts.dataset.phase !== "idle") return;   // a run is already going
  tts.dataset.cue = "";
  clearTimeout(timer);
  const stop = () => { delete tts.dataset.cue; clearTimeout(timer); };
  timer = window.setTimeout(stop, CUE_MS);
  splat.addEventListener("click", stop, { once: true });
}
