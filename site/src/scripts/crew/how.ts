// /crew/how-it-works behaviour (docs/specs/mod-machina.md §12). The shared How it works blocks (spotlight on the
// stage cards, the journey, Ask BOOMBOT: shared/ui/how-it-works.js), the stream-duty flow, the glossary chips, the
// flip medals and the grade ladder (shared/ui/ladder.js), plus three working examples: the time card, Pass the
// lantern and the Gears calculator. Every example is LOCAL ONLY: nothing is read or saved, no callable is called.
import { initHowItWorks, initFlow, initGlossary } from "../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { initLadder } from "../../../../shared/ui/ladder.js";
import { initRadioGroup } from "../../../../shared/ui/pref.js";
import { timecardHtml } from "../../../../shared/ui/crew.js";
import { medalHtml } from "../../../../shared/ui/medal.js";

const root = document.querySelector<HTMLElement>("[data-crew-how]");

// Spotlight, journey and Ask BOOMBOT; flip medals; the ladder; the flow; the glossary.
initHowItWorks(document);
initFlipCards();
initLadder(document);
initFlow(document.querySelector(".cw-flow"));
initGlossary(document.querySelector("[data-gloss]"), { kicker: "Crew word", start: "Crew" });

// ---- The example time card: tap an empty slot to punch up to it; Reset starts over ----
const host = document.querySelector<HTMLElement>("[data-tc-host]");
const slots: { stamp: string; text: string }[] = JSON.parse(root?.dataset.tcSlots || "[]");
const NEED = 2;
let punched = 1;
const drawCard = () => {
  if (!host) return;
  host.innerHTML = timecardHtml({
    month: "October", need: NEED, total: 4, slots: slots.slice(0, punched),
    bonusHtml: medalHtml({ emoji: "⏱️", rarity: 2, size: 36 }),
    foot: `<span class="cw-timecard-foot"><span><b>${punched} of ${NEED}</b> duties${punched > NEED ? ` · ${punched - NEED} extra` : ""}</span><button type="button" class="bt-link-btn" data-tc-reset>Reset</button></span>`,
  });
  host.querySelectorAll<HTMLElement>(".bt-timecard-slot").forEach((s, i) => {
    if (s.classList.contains("is-punched")) return;
    s.dataset.punch = String(i + 1);
    s.setAttribute("role", "button");
    s.tabIndex = 0;
    s.setAttribute("aria-label", `Punch duty ${i + 1}${i === 3 ? " (4 duties earns On the Clock)" : ""}`);
  });
};
host?.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("[data-tc-reset]")) { punched = 1; drawCard(); host.querySelector<HTMLElement>("[data-punch]")?.focus(); return; }
  const slot = t.closest<HTMLElement>("[data-punch]");
  if (!slot) return;
  const n = Number(slot.dataset.punch);
  punched = Math.min(4, Math.max(punched, n));
  drawCard();
  host.querySelector<HTMLElement>("[data-punch]")?.focus({ preventScroll: true });
});
host?.addEventListener("keydown", (e) => {
  const slot = (e.target as HTMLElement).closest<HTMLElement>("[data-punch]");
  if (slot && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); slot.click(); }
});
drawCard();

// ---- Pass the lantern: step away, deckhands are asked, the first to accept carries it, Gears follow the minutes ----
const lantern = document.querySelector<HTMLElement>("[data-lantern]");
if (lantern) {
  const status = lantern.querySelector<HTMLElement>("[data-lstatus]")!;
  const acts = lantern.querySelector<HTMLElement>("[data-lacts]")!;
  const person = (k: string) => lantern.querySelector<HTMLElement>(`[data-p="${k}"]`)!;
  const roleEl = (k: string) => lantern.querySelector<HTMLElement>(`[data-role-${k}]`)!;
  const NAMES: Record<string, string> = { b: "Hannah", c: "Gabe" };
  const startHtml = acts.innerHTML;
  const lit = (k: string, on: boolean) => person(k).classList.toggle("has-lantern", on);
  const reset = () => {
    ["a", "b", "c"].forEach((k) => lit(k, k === "a"));
    roleEl("a").textContent = "Room Lead"; roleEl("b").textContent = "Deckhand"; roleEl("c").textContent = "Deckhand";
    status.textContent = "Mothman Mike is leading the YouTube vertical chat.";
    acts.innerHTML = startHtml;
  };
  lantern.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const step = t.closest<HTMLButtonElement>("[data-step]");
    if (step) {
      const mins = step.dataset.step!;
      lit("a", false);
      status.textContent = `Mike stepped away${mins === "done" ? " for tonight" : ` for ${mins} minutes`}. Asking the Deckhands: take the lead?`;
      acts.innerHTML = ["b", "c"].map((k) => `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-take="${k}" data-mins="${mins}">${NAMES[k]}: take the lead</button>`).join("");
      acts.querySelector<HTMLElement>("[data-take]")?.focus();
      return;
    }
    const take = t.closest<HTMLButtonElement>("[data-take]");
    if (take) {
      const k = take.dataset.take!, other = k === "b" ? "c" : "b", mins = take.dataset.mins!, done = mins === "done";
      lit(k, true);
      roleEl(k).textContent = done ? "Room Lead" : "Acting Room Lead";
      roleEl("a").textContent = done ? "Signed off · 2 h 10 m" : `Back in ${mins} min`;
      roleEl(other).textContent = "Deckhand (someone got there first)";
      status.innerHTML = `<b>${NAMES[k]} carries the lantern.</b> ${done ? "Mike's Gears stop at 2 h 10 m." : "When Mike's back, the lead hands back automatically."} ${NAMES[k]} earns Room Lead Gears (10 an hour, ×1.5 on YouTube) from now, plus 5 for taking over.`;
      acts.innerHTML = `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-lreset>Run it again</button>`;
      acts.querySelector<HTMLElement>("[data-lreset]")?.focus();
      return;
    }
    if (t.closest("[data-lreset]")) { reset(); acts.querySelector<HTMLElement>("[data-step]")?.focus(); }
  });
}

// ---- Gears calculator (spec §4a values): rate × hours × chat boost + the on-time bonus ----
const calc = document.querySelector<HTMLElement>("[data-calc]");
if (calc) {
  const SEAT: Record<string, string> = { "12": "Stream Captain", "10": "Room Lead", "6": "Deckhand" };
  const CHAT: Record<string, string> = { "1": "Twitch", "1.5-l": "YouTube landscape", "1.5-v": "YouTube vertical", "1-t": "TikTok" };
  const val: Record<string, string> = { role: "10", chat: "1.5-v", hours: "2", ontime: "1" };
  const eq = calc.querySelector<HTMLElement>("[data-calc-eq]")!;
  const sum = calc.querySelector<HTMLElement>("[data-calc-sum]")!;
  const title = calc.querySelector<HTMLElement>("[data-calc-title]")!;
  const num = (n: number) => String(Math.round(n * 100) / 100);
  const draw = () => {
    const rate = Number(val.role), boost = parseFloat(val.chat), asked = Number(val.hours), hours = Math.min(6, asked), bonus = val.ontime === "1" ? 5 : 0;
    const total = rate * hours * boost + bonus;
    const yt = boost > 1;
    eq.innerHTML = `<span>${rate}<small>per hour</small></span><i>×</i><span>${num(hours)}<small>hours</small></span>${yt ? `<i>×</i><span>${boost}<small>YouTube</small></span>` : ""}${bonus ? `<i>+</i><span>${bonus}<small>on time</small></span>` : ""}<i>=</i><span class="tot">${num(total)}</span>`;
    const what = `${asked} ${asked === 1 ? "hour" : "hours"} as ${SEAT[val.role]} in ${CHAT[val.chat]}${bonus ? ", on time" : ""}`;
    title.textContent = what.charAt(0).toUpperCase() + what.slice(1);
    const same = rate * hours + bonus;
    sum.textContent = `${num(total)} Gears: ${rate} × ${num(hours)}${yt ? ` × ${boost}` : ""}${bonus ? ` + ${bonus}` : ""}.`
      + (asked > 6 ? " Duty Gears stop at 6 hours a stream." : "")
      + (yt ? ` The same time on Twitch would be ${num(same)}. That's the YouTube boost doing its job.` : "");
  };
  calc.querySelectorAll<HTMLElement>("[data-ctl]").forEach((g) => {
    initRadioGroup(g, { onChange: (v) => { val[g.dataset.ctl!] = v; draw(); } });
  });
}
