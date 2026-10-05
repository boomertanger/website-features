// How it works (arcade-info.html layout 1, round 2 in how-it-works-round-2.html, sections 2-3
// in how-it-works-sections-2-3.html): the journey lights up to the step you're on, the
// version cycle is the kit's cycle wheel, the What's inside cards get the pointer spotlight, and
// the Versions timeline and its cartridges light each other on hover. The "On this page"
// menu comes from TocLayout.astro. The journey, the stage cards' spotlight and Ask BOOMBOT are
// the shared How it works behaviour (shared/ui/how-it-works.js). No Firestore reads.
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { initCycleWheels } from "../../../../shared/ui/cycle-wheel.js";

// 1 What's inside (spotlight), 2 How a game is born (the journey) and 9 FAQ (Ask BOOMBOT).
initHowItWorks(document);

// Versions: a cartridge lights its part of the line (data-hl + .is-lit stops); a stop lifts its card.
const linked = document.querySelector<HTMLElement>(".ai-linked");
if (linked) {
  const light = (kind = "") => {
    linked.dataset.hl = kind;
    linked.querySelectorAll<HTMLElement>(".ai-ct").forEach((c) => c.classList.toggle("is-on", !!kind && c.dataset.kind === kind));
    linked.querySelectorAll<HTMLElement>(".ai-st").forEach((st) => st.classList.toggle("is-lit", !!kind && st.dataset.kind === kind));
  };
  linked.querySelectorAll<HTMLElement>(".ai-ct, .ai-st").forEach((el) => {
    el.addEventListener("pointerenter", () => light(el.dataset.kind));
    el.addEventListener("pointerleave", () => light(""));
  });
}

// 3 How a game grows: the cycle wheel (tabs, arrows, Play).
initCycleWheels();

// ---- Sections 5-9 (docs/design/mockups/how-it-works-sections-5-9.html) ----
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// 5 Who does what: hovering a role (a tap on touch) lights its arrows and dims unrelated roles.
const flow = document.querySelector<HTMLElement>(".ai-flow");
if (flow) {
  const nodes = [...flow.querySelectorAll<HTMLElement>(".ai-node")];
  const arrows = [...flow.querySelectorAll<HTMLElement>(".ai-arr")];
  let current = "";
  const light = (role = "") => {
    current = role;
    const lit = new Set([role]);
    arrows.forEach((a) => {
      const ends = (a.dataset.links || "").split(" ");
      const hit = !!role && role !== "md" && ends.includes(role);
      a.classList.toggle("is-on", hit);
      if (hit) ends.forEach((e) => lit.add(e));
    });
    nodes.forEach((n) => {
      const r = n.dataset.role || "";
      n.classList.toggle("is-on", !!role && r === role);
      n.classList.toggle("is-dim", !!role && role !== "md" && r !== "md" && !lit.has(r));
    });
  };
  nodes.forEach((n) => {
    n.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") light(n.dataset.role); });
    n.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") light(""); });
    n.addEventListener("click", () => light(current === n.dataset.role ? "" : n.dataset.role));
  });
}

// 6 Badges: the kit's flip cards (hover or focus flips; a tap toggles).
initFlipCards();

// 8 Glossary: the <dl> becomes term chips and one gold definition card (the list stays for
// screen readers and search, visually hidden). Starts on "Boom Arcade".
const gloss = document.querySelector<HTMLElement>("[data-gloss]");
if (gloss) {
  const terms = [...gloss.querySelectorAll("dl > div")].map((d) => [d.querySelector("dt")!.textContent!, d.querySelector("dd")!.textContent!]);
  const chips = document.createElement("div");
  chips.className = "ai-gc-chips";
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Terms");
  const card = document.createElement("div");
  card.className = "ai-gc-card";
  card.setAttribute("aria-live", "polite");
  const show = (i: number) => {
    card.innerHTML = "";
    const inner = document.createElement("div");
    if (!reduced()) inner.className = "ai-gc-in";
    const k = Object.assign(document.createElement("span"), { className: "k", textContent: "Glossary" });
    const h = Object.assign(document.createElement("h3"), { textContent: terms[i][0] });
    const p = Object.assign(document.createElement("p"), { textContent: terms[i][1] });
    inner.append(k, h, p);
    card.append(inner);
    chips.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
  };
  terms.forEach(([t], i) => {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: t });
    b.addEventListener("click", () => show(i));
    b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(i); });
    chips.append(b);
  });
  gloss.append(chips, card);
  gloss.classList.add("is-enhanced");
  show(Math.max(0, terms.findIndex(([t]) => t === "Boom Arcade")));
}

