// /live/how-it-works (pages/live/how-it-works.astro): the How it works blocks (the four-beat journey's lit stage cards, Ask BOOMBOT) and the
// practice check-in with "lantern". The rail is TocLayout's (the kit's .bt-toc and shared/ui/toc.js); the bar is the CONTROLROOM bar.
import { initHowItWorks } from "./pub-ui";
import { mountPractice } from "./pub-try";

const root = document.querySelector<HTMLElement>("[data-lh]");
if (root) {
  initHowItWorks(root);
  const host = root.querySelector<HTMLElement>("[data-lp-try]");
  if (host) mountPractice(host);
}
