// Base Camp layout behaviour (docs/specs/base-camp.md): the sticky BASECAMP bar (a reading-progress line on these long pages), its seg nav, the
// wordmark's touch power-on, every Pup Post card on the page, and the Fan Club lock cards: Try again after an error, and a visitor's Join free
// writes the lock card's #section into the address first, so the sign-in dialog's "come back here" lands on what they clicked.
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { mountPupPosts } from "./pup-post";
import { retryMember } from "./member";

initSegNavs();
initPowerWordmarks();
const dock = document.querySelector<HTMLElement>("[data-bc-dock]");
if (dock) initStickyBar(dock, { progress: !!document.querySelector(".tl-wrap") });
mountPupPosts();
// Kind Words boards ([data-kind-words]): the engine loads only on a page that has one.
if (document.querySelector("[data-kind-words]")) void import("./kind-words").then((m) => m.mountAllKindWords());

document.addEventListener("click", (e) => {
  const t = (e.target as Element).closest<HTMLElement>("[data-return], [data-bc-retry]");
  if (!t) return;
  if (t.matches("[data-bc-retry]")) { retryMember(); return; }
  const ret = t.dataset.return || "";
  if (!ret.startsWith("#")) return;
  const url = new URL(location.href);
  url.hash = ret;
  history.replaceState(history.state, "", url);   // the sign-in dialog opens next (account/ui.ts, [data-signin]) and remembers this address
}, true);
