// The Academy hub: progress ring, the Continue button, and passed state on the journey and cards.
// Preview (?as=, non-production, signed out) uses data/preview-crew-academy.json.
import { initHowItWorks } from "../../../../../shared/ui/how-it-works.js";
import { onAccess } from "../layout";
import { isPreview, loadPassed } from "./progress";

initHowItWorks(document);

const $$ = <T extends HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];

onAccess(async (s) => {
  const passed = new Set(await loadPassed(s));
  const mods = $$<HTMLElement>("[data-mod]");
  const counted = mods.filter((m) => m.dataset.soon !== "true");
  const done = counted.filter((m) => passed.has(m.dataset.mod!)).length;
  mods.forEach((m) => {
    const ok = passed.has(m.dataset.mod!);
    m.classList.toggle("is-done", ok);
    const num = m.querySelector(".ai-jr-num");
    if (num) num.textContent = ok ? "✓" : m.dataset.n ?? "";
    const st = m.querySelector<HTMLElement>("[data-st]");
    if (st) st.hidden = !ok;
  });
  const ring = document.querySelector<HTMLElement>("[data-ring]");
  if (ring) {
    ring.style.setProperty("--v", String(counted.length ? (done / counted.length) * 100 : 0));
    ring.classList.toggle("bt-ring--done", done === counted.length);
    ring.setAttribute("aria-label", `${done} of ${counted.length} modules passed`);
    const b = ring.querySelector("b");
    if (b) b.textContent = `${done}/${counted.length}`;
  }
  // Continue: the first required module not yet passed, else the optional one, else a review link.
  const next = counted.find((m) => m.dataset.optional !== "true" && !passed.has(m.dataset.mod!)) ?? counted.find((m) => !passed.has(m.dataset.mod!));
  const go = document.querySelector<HTMLAnchorElement>("[data-continue]");
  const meta = document.querySelector<HTMLElement>("[data-continue-meta]");
  if (go) {
    if (next) { go.href = next.dataset.href!; go.textContent = `${done ? "Continue" : "Start"}: ${next.dataset.title}`; if (meta) meta.textContent = `About ${next.dataset.minutes} minutes`; }
    else { go.href = "/crew/academy/welcome/"; go.textContent = "Review a module"; if (meta) meta.textContent = "Every module passed. Thank you."; }
  }
  document.querySelector<HTMLElement>("[data-preview-note]")?.toggleAttribute("hidden", !isPreview(s));
});
