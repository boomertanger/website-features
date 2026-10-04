// Trophy Room How it works (docs/design/mockups/trophy-room-how-it-works.html): the flip cards,
// Ask BOOMBOT, section 3's collection and rarity chips (the cards are all in the HTML from the
// build; the chips only hide and show them), and the example live drop's countdown. No
// Firestore reads.
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { initChat } from "../../../../shared/ui/chat.js";
import { RARITY } from "../../../../shared/ui/medal.js";

initFlipCards(document);
initChat(document);

const filters = document.querySelector<HTMLElement>("[data-tr-filters]");
const grid = document.querySelector<HTMLElement>("[data-tr-grid]");
const empty = document.querySelector<HTMLElement>("[data-tr-empty]");
if (filters && grid && empty) {
  let coll = "loyalty", rar = 0;
  const cards = [...grid.querySelectorAll<HTMLElement>(".tr-card")];
  const heads = [...document.querySelectorAll<HTMLElement>("[data-head]")];
  const render = () => {
    let shown = 0;
    for (const c of cards) {
      const on = (coll === "all" || c.dataset.coll === coll) && (!rar || c.dataset.rar === String(rar));
      c.hidden = !on;
      if (on) shown++; else c.classList.remove("is-flipped");
    }
    heads.forEach((h) => { h.hidden = h.dataset.head !== coll; });
    empty.hidden = shown > 0;
    empty.textContent = shown ? "" : `No ${RARITY[rar]?.name ?? ""} badges in this collection yet.`;
  };
  const press = (group: Element, btn: Element) => group.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("is-active", b === btn);
    b.setAttribute("aria-pressed", String(b === btn));
  });
  filters.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!btn) return;
    if (btn.dataset.c) coll = btn.dataset.c;
    else if (btn.dataset.r) rar = Number(btn.dataset.r);
    else return;
    press(btn.parentElement!, btn);
    render();
  });
}

// The example drop banner counts down from 4:59 and starts again (not under reduced motion).
const drop = document.querySelector<HTMLElement>("[data-tr-drop]");
if (drop && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let t = 299;
  setInterval(() => {
    t = t <= 0 ? 299 : t - 1;
    drop.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  }, 1000);
}
