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

// initFlow(flow)      a flow of role cards (.ai-flow / .ai-node / .ai-arr, data-role + data-links): hovering a role
//                     (a tap on touch) lights its arrows and dims the unrelated roles. Pages that already wire the
//                     flow themselves (the Arcade) don't call this.
export function initFlow(flow) {
  if (!flow || flow._flow) return;
  flow._flow = true;
  const nodes = [...flow.querySelectorAll(".ai-node")];
  const arrows = [...flow.querySelectorAll(".ai-arr")];
  let current = "";
  const light = (role = "") => {
    current = role;
    const lit = new Set([role]);
    arrows.forEach((a) => {
      const ends = (a.dataset.links || "").split(" ");
      const hit = !!role && ends.includes(role);
      a.classList.toggle("is-on", hit);
      if (hit) ends.forEach((e) => lit.add(e));
    });
    nodes.forEach((n) => {
      const r = n.dataset.role || "";
      n.classList.toggle("is-on", !!role && r === role);
      n.classList.toggle("is-dim", !!role && !lit.has(r));
    });
  };
  nodes.forEach((n) => {
    n.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") light(n.dataset.role); });
    n.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") light(""); });
    n.addEventListener("focus", () => light(n.dataset.role));
    n.addEventListener("blur", () => light(""));
    n.addEventListener("click", () => light(current === n.dataset.role ? "" : n.dataset.role));
  });
}

// initGlossary(wrap, { kicker, start })   [data-gloss] with a <dl class="ai-gloss"> becomes term chips and one
//                     definition card; the list stays in the HTML (search, screen readers) and is only hidden
//                     visually. kicker: the card's small label; start: the term shown first.
export function initGlossary(wrap, { kicker = "Glossary", start = "" } = {}) {
  if (!wrap || wrap._gloss) return;
  wrap._gloss = true;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const terms = [...wrap.querySelectorAll("dl > div")].map((d) => [d.querySelector("dt").textContent, d.querySelector("dd").textContent]);
  const chips = document.createElement("div");
  chips.className = "ai-gc-chips";
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Terms");
  const card = document.createElement("div");
  card.className = "ai-gc-card";
  card.setAttribute("aria-live", "polite");
  const show = (i) => {
    card.textContent = "";
    const inner = document.createElement("div");
    if (!reduced) inner.className = "ai-gc-in";
    const k = Object.assign(document.createElement("span"), { className: "k", textContent: kicker });
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
  wrap.append(chips, card);
  wrap.classList.add("is-enhanced");
  show(Math.max(0, terms.findIndex(([t]) => t === start)));
}
