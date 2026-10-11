// site/src/scripts/base-camp/skipper.ts — /base-camp/skipper (docs/specs/base-camp.md "Page 3"). Wires the built page: the How it works behaviour
// (BOOMBOT's chat), the quirk flip cards, the E1 stage cards (stage.ts), the clips (muted, looping, inline: they play only while on screen, and
// never under reduced motion, where the poster stays), a photo or poster that can't load fades out and leaves the frame, the reel (tap a tile for
// openGallery from shared/ui/lightbox.js) and the Skipper Cam (skipper-cam.ts). The Pup Post card is wired by layout.ts; the Paw Notes wall mounts
// itself into [data-kind-words="skipper"].
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { openGallery } from "../../../../shared/ui/lightbox.js";
import { initStageCards } from "./stage";
import { mountSkipperCam } from "./skipper-cam";
import { RM } from "./ui";

const page = document.querySelector<HTMLElement>("[data-sk-page]");
if (page) init(page);

function init(root: HTMLElement) {
  initHowItWorks(root as unknown as Document);   // the helper takes any root; its JS default (document) types it as Document
  initFlipCards(root);
  initStageCards(root);
  mountSkipperCam(root);

  // ---- clips: play while on screen ----
  const vids = [...root.querySelectorAll<HTMLVideoElement>("video[data-sk-video]")];
  if (!RM() && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const v = e.target as HTMLVideoElement;
      if (e.isIntersecting) { if (v.preload === "none") v.preload = "auto"; v.play().catch(() => {}); } else v.pause();
    }), { threshold: 0.35 });
    vids.forEach((v) => io.observe(v));
  }

  // ---- a photo or poster that can't load fades out (the frame keeps its shape) ----
  root.addEventListener("error", (e) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) el.classList.add("sk-missing");
  }, true);

  // ---- the reel ----
  const reel = root.querySelector<HTMLElement>("[data-sk-reel]");
  if (reel) {
    const items = JSON.parse(reel.dataset.items || "[]");
    reel.addEventListener("click", (e) => {
      const t = (e.target as Element).closest<HTMLElement>("[data-reel]");
      if (t) openGallery({ items, index: Number(t.dataset.reel), label: "Skipper's reel" });
    });
  }
}
