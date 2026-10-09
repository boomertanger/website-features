// /cloud-stash/how-it-works (docs/specs/cloud-stash.md §9). The shared How it works behaviour (journey, spotlight, BOOMBOT, the roles flow) and Try it: close a pretend bug, skip ahead 60
// days, and the SWEPT stamp slams in with a burst. Local and writes nothing. Reduced motion: no counting up, no burst.
import { initHowItWorks, initFlow } from "../../../../shared/ui/how-it-works.js";
import { burst } from "../../../../shared/ui/burst.js";
import { reduce, badge, stamp } from "./ui";

const root = document.querySelector<HTMLElement>("[data-csh]");

function initTry(scope: HTMLElement) {
  const box = scope.querySelector<HTMLElement>("[data-try]");
  if (!box) return;
  let step = 0, days = 0, timer = 0;
  const draw = (burstIt = false) => {
    const gone = days >= 60;
    box.innerHTML = `<div class="bt-card ch-bug"><div class="ch-bug-top"><h3>Footer game freezes on Safari</h3>${step === 0 ? badge("blue", "Open") : badge("lime", "Fixed")}</div>
        <p class="bt-meta">Reported by @sam · 1 screenshot</p>
        ${gone ? `<div class="ch-bug-gone">Screenshot tidied away. The report stays.</div>` : ""}
        <div class="ch-bug-shot${gone ? " is-gone" : ""}"><span class="cs-art cs-art--shot"></span></div>
        ${gone ? stamp({ kicker: "Day 60", label: "Swept", tone: "lime", size: "sm" }) : ""}</div>
      <div class="bt-card ch-ctrl"><div class="ch-days"><b data-days>${days}</b><span>days since it was closed</span></div>
        ${step === 0 ? `<button type="button" class="bt-btn bt-btn--primary" data-act="close">Mark it fixed</button>` : !gone ? `<button type="button" class="bt-btn bt-btn--primary" data-act="skip">Skip ahead 60 days</button>` : `<button type="button" class="bt-btn bt-btn--secondary" data-act="reset">Start again</button>`}
        <p class="ch-note" aria-live="polite">${step === 0 ? "While a bug is open, its screenshot is always kept." : !gone ? "The clock starts when the report is closed. Reopen it and the clock stops." : "The next morning's sweep deleted the picture. The report, its comments and its history stay."}</p></div>`;
    if (burstIt) burst(box.querySelector<HTMLElement>(".bt-stamp"), { colors: ["var(--bt-lime)", "var(--bt-title)", "var(--bt-primary-soft)"], n: 18 });
  };
  box.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("[data-act]");
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "close") { step = 1; days = 0; draw(); }
    else if (act === "reset") { clearInterval(timer); step = 0; days = 0; draw(); }
    else if (act === "skip") {
      if (reduce()) { days = 60; draw(true); return; }
      b.disabled = true;
      const out = box.querySelector<HTMLElement>("[data-days]")!;
      let d = 0;
      timer = window.setInterval(() => { d = Math.min(60, d + 3); out.textContent = String(d); if (d >= 60) { clearInterval(timer); days = 60; draw(true); } }, 28);
    }
  });
  draw();
}

if (root) {
  initHowItWorks(root as unknown as Document);
  root.querySelectorAll<HTMLElement>("[data-flow]").forEach(initFlow);
  initTry(root);
}
