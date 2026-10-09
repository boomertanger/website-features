// shared/ui/control-room.js — the Control Room's wordmark icon and look helpers (docs/design-system.md §5 "Control Room pieces",
// docs/specs/control-room.md §7c). Text is escaped; arguments ending in Html are trusted markup.
//
//   CR_ICON   the wordmark icon, a radar scope (.bt-cr-icon). While the stream is live (body[data-live="public" | "backstage"], the
//             same state the beacon reads) the sweep turns and the blip lights in the live colour (red, green backstage); on hover,
//             focus or touch (.is-lit, added by shared/ui/wordmark.js) it sweeps faster, live or not. It is still under reduced
//             motion. Colours come from .bt-cr-icon in bt-ui.css.
//   crWordmarkHtml({ href, label })   the whole wordmark link:
//     <a class="bt-wordmark bt-wordmark--power" href="/live" aria-label="Control Room">
//       <span class="bt-wordmark-icon">${CR_ICON}</span>
//       <span class="bt-wordmark-text" aria-hidden="true">CONTROL <span class="bt-wordmark-accent">ROOM</span></span></a>
//     Put it in a .bt-topbar; call initPowerWordmarks(root) from shared/ui/wordmark.js for the touch power-on.
//   LOOKS            [{ value: "hull", label: "Hull map" }, { value: "crt", label: "CRT" }]: the two shipped looks
//   setLook(root, look)   sets data-look on the page root ("hull" | "crt"; anything else falls back to "hull"); returns the look
//   crBoot(root)     the CRT's switch-on, for a state change (live, break, ended): numbers the panels (--i) and adds .is-boot to the
//                    root for 2.2 s. Only the CRT look draws anything for it; reduced motion does nothing.
import { escapeHtml as esc } from "./dom.js";

export const CR_ICON = `<svg class="bt-cr-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle class="ring" cx="16" cy="16" r="13"/><circle class="ring2" cx="16" cy="16" r="8.5"/><path class="sweep" d="M16 16 L16 3 A13 13 0 0 1 27.3 9.5 Z"/><line class="arm" x1="16" y1="16" x2="16" y2="3"/><circle class="blip" cx="22" cy="11" r="1.8"/><circle class="hub" cx="16" cy="16" r="1.6"/></svg>`;

export const crWordmarkHtml = ({ href = "/live", label = "Control Room" } = {}) =>
  `<a class="bt-wordmark bt-wordmark--power" href="${esc(href)}" aria-label="${esc(label)}"><span class="bt-wordmark-icon">${CR_ICON}</span><span class="bt-wordmark-text" aria-hidden="true">CONTROL <span class="bt-wordmark-accent">ROOM</span></span></a>`;

export const LOOKS = [{ value: "hull", label: "Hull map" }, { value: "crt", label: "CRT" }];

export function setLook(root, look) {
  const v = LOOKS.some((l) => l.value === look) ? look : "hull";
  root.dataset.look = v;
  return v;
}

let bootTimer = 0;
export function crBoot(root = document.body) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.querySelectorAll(".bt-cr-panel, .bt-cr-viewport").forEach((el, i) => el.style.setProperty("--i", String(i)));
  root.classList.remove("is-boot");
  void root.offsetWidth;
  root.classList.add("is-boot");
  clearTimeout(bootTimer);
  bootTimer = setTimeout(() => root.classList.remove("is-boot"), 2200);
}
