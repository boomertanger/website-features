// shared/ui/how-it-works.js — behaviour for the How it works blocks the Arcade's and the Game Vault's
// pages share (site/src/styles/how-it-works.css; docs/specs/game-vault-how-it-works.md §4):
//   initJourney(list)        the journey (.ai-jr[data-journey]): hover (mouse), focus or a tap lights a
//                            step, the line fills gold up to it (--p) and earlier steps stay lit
//   initHowItWorks(root)     every journey under root, the pointer spotlight on the stage cards, and
//                            the kit's BOOMBOT chat (one answer open at a time, a moment of "typing")
// Reduced motion is handled in the CSS (the journey and the chat just switch).
import { initSpotlights } from "./spotlight.js";
import { initChat } from "./chat.js";

export function initJourney(journey) {
  if (!journey || journey._journey) return;
  journey._journey = true;
  const items = [...journey.children];
  const set = (i) => {
    if (i < 0) journey.removeAttribute("data-active"); else journey.dataset.active = String(i);
    journey.style.setProperty("--p", String(Math.max(i, 0)));
    items.forEach((li, j) => { li.classList.toggle("is-on", j === i); li.classList.toggle("is-past", i >= 0 && j < i); });
  };
  items.forEach((li, i) => {
    li.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") set(i); });
    li.addEventListener("focus", () => set(i));
    li.addEventListener("click", () => set(i));
  });
  journey.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !journey.contains(document.activeElement)) set(-1); });
  journey.addEventListener("focusout", (e) => { if (!journey.contains(e.relatedTarget)) set(-1); });
}

export function initHowItWorks(root = document) {
  root.querySelectorAll(".ai-stage").forEach((s) => initSpotlights(s));
  root.querySelectorAll("[data-journey]").forEach(initJourney);
  initChat(root);
}
