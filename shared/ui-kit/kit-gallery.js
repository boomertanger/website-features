// shared/ui-kit/kit-gallery.js — the "Gallery" section of the UI Kit page (/dev/ui-kit): shared/ui/lightbox.js openGallery, the full-screen viewer
// for a set of photos and clips (the Skipper reel on /base-camp/skipper). Three demo tiles open it at their own item; Previous / Next and the arrow
// keys move through the set. ui-kit.js appends galleryKitHtml() and calls initGalleryKit(mount, { shot }) with its demo screenshot.
import { openGallery } from "../ui/lightbox.js";

const CAPS = ["Nap time", "Frisbee run", "Noodle cruise"];

export function galleryKitHtml() {
  return `
  <section class="kit-section" id="kit-gallery">
    <h2 class="kit-h">Gallery (openGallery)</h2>
    <p class="kit-p"><span class="kit-code">openGallery({ items, index })</span> from <span class="kit-code">shared/ui/lightbox.js</span>: <span class="kit-code">items</span> are <span class="kit-code">{ type: "image" | "video", src, poster, alt, caption }</span>. Previous / Next (buttons and arrow keys, wrapping), the caption and "2 of 3" under the media, Tab stays inside, Escape or a click on the dark area closes it and focus goes back. Clips are muted, looping and inline with controls; no autoplay under reduced motion. It announces <span class="kit-code">bt:overlay-open</span> (source "lightbox") and closes when another overlay opens. <span class="kit-code">openLightbox()</span> is still the single-screenshot viewer.</p>
    <div class="kit-row">${CAPS.map((c, i) => `<button type="button" class="bt-btn bt-btn--secondary" data-kit-gallery="${i}">Open at ${c}</button>`).join("")}</div>
  </section>`;
}

export function initGalleryKit(mount, { shot = "" } = {}) {
  const items = CAPS.map((caption) => ({ type: "image", src: shot, alt: `Demo screenshot: ${caption}`, caption }));
  mount.querySelectorAll("[data-kit-gallery]").forEach((b) => b.addEventListener("click", () => openGallery({ items, index: Number(b.dataset.kitGallery), label: "Demo gallery" })));
}
