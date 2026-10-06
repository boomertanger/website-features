// shared/ui/stepper.js — .bt-stepper, a row of stages as machines on an assembly line (docs/design-system.md
// §5 "Stepper"; Night Shift builder's stage tracker, option A). Every machine is a button. A conveyor
// belt runs under them with a gold "done" stretch up to the current stage, where a crate sits. The rail
// form (.bt-stepper--rail) is a vertical list with progress rings, for narrow side panels.
//
//   stepperHtml({ steps, open, crate, rail, label })
//     steps: [{ key, icon, label, state: "done" | "now" | "todo", status, pct }]
//       status: the short line under the name ("4 chapters", "1 warning"); pct: 0-100 for the rail's ring
//     open: the key of the stage on screen (.is-open, aria-current="step")
//     crate: the crate's label (e.g. "S2"); rail: true for the compact rail
//   keepOpenInView(el)   on phones the line scrolls sideways; keeps the open stage in view
// Buttons carry data-step="<key>"; the page listens for clicks. Reduced motion: no belt, no blinking.
import { escapeHtml as esc } from "./dom.js";

export function stepperHtml({ steps = [], open = "", crate = "", rail = false, label = "Stages" } = {}) {
  const n = steps.length || 1;
  const at = Math.max(0, steps.findIndex((s) => s.state === "now"));
  const now = steps.some((s) => s.state === "now") ? at : steps.filter((s) => s.state === "done").length;
  const items = steps.map((s, i) => {
    const on = s.key === open;
    const pct = Math.max(0, Math.min(100, Number(s.pct ?? (s.state === "done" ? 100 : 0))));
    return `<li><button type="button" class="bt-stepper-step is-${esc(s.state || "todo")}${on ? " is-open" : ""}" data-step="${esc(s.key)}"${on ? ' aria-current="step"' : ""}>`
      + `<span class="bt-stepper-mach" aria-hidden="true">${esc(s.icon || "")}</span>`
      + `<span class="bt-stepper-ring" style="--v:${pct}" aria-hidden="true"><span>${s.state === "done" ? "✓" : i + 1}</span></span>`
      + `<span class="bt-stepper-n">Stage ${i + 1}</span><b>${esc(s.label)}</b>`
      + `<span class="bt-stepper-s">${s.state === "done" ? "✓ " : ""}${esc(s.status || "")}</span></button></li>`;
  }).join("");
  return `<div class="bt-stepper${rail ? " bt-stepper--rail" : ""}" style="--bt-stepper-n:${n};--bt-stepper-at:${now}">`
    + `<div class="bt-stepper-in"><span class="bt-stepper-belt" aria-hidden="true"></span><span class="bt-stepper-done" aria-hidden="true"></span>`
    + (crate ? `<span class="bt-stepper-crate" aria-hidden="true">${esc(crate)}</span>` : "")
    + `<ol class="bt-stepper-list" aria-label="${esc(label)}">${items}</ol></div></div>`;
}

export function keepOpenInView(el) {
  const box = el?.matches?.(".bt-stepper") ? el : el?.querySelector?.(".bt-stepper");
  const cur = box?.querySelector(".bt-stepper-step.is-open");
  if (!box || !cur || box.scrollWidth <= box.clientWidth + 1) return;
  const li = cur.parentElement;
  const left = li.offsetLeft - (box.clientWidth - li.offsetWidth) / 2;
  box.scrollTo({ left: Math.max(0, left), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
