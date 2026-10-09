// /bug-zapper/how-it-works (docs/specs/bug-zapper.md §8). The shared How it works behaviour (journey, spotlight, BOOMBOT, the roles flow), the hero's large porch-light scene with the
// all-time zapped count (one count query; the number is hidden if it can't be read), and Try it: fix a vague report (six fixes, a meter, a lime "Ready to zap" stamp). Try it is local
// and writes nothing. Reduced motion: no burst, the scene's animations stop in the CSS.
import { initHowItWorks, initFlow } from "../../../../shared/ui/how-it-works.js";
import { burst } from "../../../../shared/ui/burst.js";
import { levelBars } from "../../../../shared/ui/dom.js";
import { loadZapped } from "./data";
import { sceneHtml } from "./scene";
import { stamp } from "./ui";

const root = document.querySelector<HTMLElement>("[data-bzh]");

// ---------- 03 Try it: fix a vague report ----------
const VAGUE: Record<string, string> = { title: "it's broken", page: "", what: "doesnt work lol", expected: "", steps: "", sev: "" };
const GOOD: Record<string, string> = { title: "Tap the Splat timer keeps running after I pause", page: "/arcade/tap-the-splat", what: "I paused mid-run, and the timer kept counting while the game was paused.", expected: "The timer stops while paused.", steps: "1. Start a run  2. Press Pause  3. Wait ten seconds, then Resume", sev: "major" };
const LABELS: Record<string, string> = { title: "Name", page: "Page", what: "What happened", expected: "What should happen", steps: "Steps", sev: "How bad" };
const VERDICTS = ["Nobody could fix this yet. Try a fix below.", "A start. The team still has to guess.", "Getting there. They know where to look.", "Good. They can probably find it.", "Very good. One more fix.", "Nearly there.", "Ready to zap. The team can make it happen and fix it."];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function initTryIt(scope: HTMLElement) {
  const box = scope.querySelector<HTMLElement>("[data-try]");
  if (!box) return;
  const done = new Set<string>();
  const fields = box.querySelector<HTMLElement>("[data-try-fields]")!, meter = box.querySelector<HTMLElement>("[data-try-meter]")!, fill = meter.querySelector<HTMLElement>(".bt-meter-fill")!;
  const verdict = box.querySelector<HTMLElement>("[data-try-verdict]")!, stampSlot = box.querySelector<HTMLElement>("[data-try-stamp]")!;
  const draw = (fresh = "") => {
    fields.innerHTML = Object.keys(VAGUE).map((k) => {
      const good = done.has(k);
      let v = good ? esc(GOOD[k]) : esc(VAGUE[k]);
      if (k === "sev" && good) v = `<span class="bt-badge bt-badge--pink">${levelBars(3, 4)}Major</span>`;
      if (!v) v = "(left blank)";
      return `<div class="bzt-field${good ? " is-good" : " is-vague"}${fresh === k ? " is-new" : ""}"><small>${LABELS[k]}</small><span>${v}</span></div>`;
    }).join("");
    const pct = Math.max(8, Math.round((done.size / 6) * 100));
    fill.style.width = pct + "%";
    meter.querySelector("[role=meter]")!.setAttribute("aria-valuenow", String(pct));
    meter.className = `bt-meter bzt-meter bt-meter--${done.size >= 6 ? "green" : done.size >= 3 ? "blue" : "amber"}`;
    verdict.textContent = VERDICTS[done.size];
    stampSlot.innerHTML = done.size === 6 ? stamp("Zap", "Ready to", "", "lime", "sm") : "";
    if (done.size === 6 && fresh) burst(stampSlot, { colors: ["var(--bt-ice)", "var(--bt-lamp)", "var(--bt-lime)"], n: 18 });
  };
  box.addEventListener("click", (e) => {
    const t = e.target as Element;
    const b = t.closest<HTMLElement>("[data-fix]");
    if (b) {
      const k = b.dataset.fix!;
      if (done.has(k)) return;
      done.add(k);
      b.setAttribute("aria-pressed", "true");
      draw(k);
    }
    if (t.closest("[data-try-reset]")) {
      done.clear();
      box.querySelectorAll("[data-fix]").forEach((x) => x.setAttribute("aria-pressed", "false"));
      draw();
    }
  });
  draw();
}

if (root) {
  initHowItWorks(root);
  root.querySelectorAll<HTMLElement>("[data-flow]").forEach(initFlow);
  const scene = root.querySelector<HTMLElement>("[data-bz-how-scene]")!;
  scene.innerHTML = sceneHtml({ zapped: null, big: true });
  void loadZapped().then((n) => { if (n != null) scene.innerHTML = sceneHtml({ zapped: n, big: true }); });
  initTryIt(root);
}
