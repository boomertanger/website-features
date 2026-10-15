// shared/ui-kit/kit-scrubber.js — the ".bt-scrubber" section of the UI Kit page (/dev/ui-kit): the timeline scrubber (shared/ui/scrubber.js;
// docs/specs/base-camp.md Addendum 3) in every state: full (curve, four era bands in each tone, milestone dots, a big dot, the Today point,
// ticks) with a live read-out of the step and how it was reached; at the start and at the end; a plain track (no curve, no bands); a single
// step. Made-up demo numbers. No reads, no writes. ui-kit.js appends scrubberKitHtml() and calls initScrubberKit(mount).
import { scrubber } from "../ui/scrubber.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A made-up climb: 20 month steps and Today. */
function demo() {
  const vals = [160, 170, 180, 190, 200, 2500, 3600, 4700, 5700, 6400, 6600, 7000, 7600, 8200, 8600, 9200, 9500, 9700, 10200, 10600];
  const steps = vals.map((v, i) => ({ text: `${MONTHS[i % 12]} ${2025 + Math.floor(i / 12)}: ${v.toLocaleString("en-US")} followers`, v }));
  steps.push({ text: `Today: ${(10800).toLocaleString("en-US")} followers`, v: 10800 });
  const n = steps.length, max = 11000;
  steps.forEach((s, i) => (s.x = i / (n - 1)));
  return {
    steps,
    curve: steps.map((s) => ({ x: s.x, y: s.v / max })),
    bands: [
      { from: 0, to: 4.5 / (n - 1), label: "Before", tone: "gray" },
      { from: 4.5 / (n - 1), to: 12.5 / (n - 1), label: "The grind", tone: "gold" },
      { from: 12.5 / (n - 1), to: 19.5 / (n - 1), label: "The build", tone: "plain" },
      { from: 19.5 / (n - 1), to: 1, label: "Back on air", tone: "lime" },
    ],
    dots: [{ x: steps[5].x, y: steps[5].v / max }, { x: steps[8].x, y: steps[8].v / max }, { x: steps[18].x, y: steps[18].v / max, big: true }, { x: 1, y: 10800 / max, today: true }],
    ticks: [{ x: 0, label: "Jan 2025" }, { x: steps[5].x, label: "Jun 2025" }, { x: steps[12].x, label: "Jan 2026" }, { x: steps[18].x, label: "Jul 2026" }, { x: 1, label: "Today" }],
  };
}

export function scrubberKitHtml() {
  return `
  <section class="kit-section" id="kit-scrubber">
    <h2 class="kit-h">Timeline scrubber (.bt-scrubber)</h2>
    <p class="kit-p">A timeline you scrub one step at a time (shared/ui/scrubber.js). Drag or tap the track, or focus it and use the arrow keys (Shift + arrow: 3 steps), Home and End. The thumb is purple because it's the thing you move; the curve is gold, era bands are gray, gold, plain and lime, and the big milestone dot is lime. Screen readers hear each step's text. Reduced motion: no transitions.</p>
    <h3 class="kit-sub">Full: curve, era bands, milestone dots, Today, ticks</h3>
    <div data-kit-scrub="full"></div>
    <p class="bt-meta" data-kit-scrub-out aria-live="polite" style="margin-top:8px"></p>
    <h3 class="kit-sub">At the start, and at the end</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px"><div data-kit-scrub="start"></div><div data-kit-scrub="end"></div></div>
    <h3 class="kit-sub">Plain track (no curve or bands), and a single step</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px"><div data-kit-scrub="plain"></div><div data-kit-scrub="one"></div></div>
  </section>`;
}

export function initScrubberKit(mount) {
  const sec = mount.querySelector("#kit-scrubber");
  if (!sec) return;
  const box = (k) => sec.querySelector(`[data-kit-scrub="${k}"]`);
  const out = sec.querySelector("[data-kit-scrub-out]");
  const d = demo();
  const show = (i, how) => { out.textContent = `${d.steps[i].text} (${how})`; };
  scrubber(box("full"), { ...d, index: 8, label: "Demo climb, January 2025 to today", onInput: show });
  show(8, "start");
  scrubber(box("start"), { ...d, index: 0, label: "Demo climb at the start" });
  scrubber(box("end"), { ...d, index: d.steps.length - 1, label: "Demo climb at the end" });
  scrubber(box("plain"), { steps: d.steps, index: 4, label: "Plain demo timeline", ticks: [{ x: 0, label: "Start" }, { x: 1, label: "End" }] });
  scrubber(box("one"), { steps: [{ text: "Today: 10,800 followers" }], index: 0, label: "A single step", dots: [{ x: 0, y: 0.5, today: true }], ticks: [{ x: 0, label: "Today" }] });
}
