// shared/ui/duty-bar.js — .bt-duty-bar, your duty on the Mod Deck (Mod Machina phase 3 part 3; docs/specs/mod-machina.md section 17a; docs/design-system.md §5 "Mod Deck pieces").
// Your avatar, handle and grade chip, your role and room, the minutes ring (it turns lime with a tick at 60 minutes: "Duty counted"), Step away / I'm back, and the Flag button. The Step
// away chooser (5 / 15 / 30 minutes, "I'm done for tonight") is a small popover under the bar (over it on phones, where the page pins the bar to the bottom).
//
//   dutyBarHtml({ state, handle, grade, avatarName, line, minutes, awayText, canFlag })   markup string (text escaped)
//     state       "off" (not clocked in: a Clock in button) · "on" (the ring, Step away, Flag) · "away" (gold: "Stepped away · back in 14:32", I'm back)
//     handle      "@gbo";  grade  { track, grade } for the grade chip (omit for none);  avatarName  for the initials (defaults to the handle)
//     line        the role and room: "Room Lead · Twitch";  minutes  held tonight (a number);  awayText  the gold line while away;  canFlag  false hides the Flag button
//   awayPopoverHtml({ lead })   the Step away chooser; lead: true says Deckhands in your room get "Take the lead?"
//   initDutyBar(root, { onClockIn, onAway(kind), onBack, onFlag }) -> { close }
//     Wires every [data-duty] button under root. Opening the chooser announces bt:overlay-open (source "duty-bar"); it closes on that event from anywhere else, on Escape (focus returns to
//     Step away) and on a click outside. kind is "5" | "15" | "30" | "done".
import { escapeHtml as esc, initials } from "./dom.js";
import { gradeChipHtml } from "./grade-chip.js";

export const COUNT_AT = 60;      // minutes a duty needs to count
const minText = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`);

export function dutyBarHtml({ state = "on", handle = "", grade = null, avatarName = "", line = "", minutes = 0, awayText = "", canFlag = true } = {}) {
  const st = ["off", "on", "away"].includes(state) ? state : "on";
  const m = Math.max(0, Math.floor(Number(minutes) || 0)), counted = m >= COUNT_AT;
  const who = `<span class="bt-duty-who"><b>${esc(handle)}${grade ? ` ${gradeChipHtml(grade)}` : ""}</b><small>${esc(st === "away" ? awayText || "Stepped away" : st === "off" ? line || "Not on duty yet" : line)}</small></span>`;
  const ring = st === "on" ? `<span class="bt-duty-min${counted ? " is-counted" : ""}"><span class="bt-duty-ring${counted ? " is-counted" : ""}" style="--v:${Math.min(100, (m / COUNT_AT) * 100)}" role="img" aria-label="${counted ? "Duty counted" : `${m} of ${COUNT_AT} minutes`}"></span><span><b>${esc(minText(m))}</b><small>${counted ? "Duty counted" : `${COUNT_AT - m} min to count`}</small></span></span>` : "";
  const act = st === "off" ? `<button type="button" class="bt-btn bt-btn--primary" data-duty="clockin">Clock in</button>`
    : st === "away" ? `<button type="button" class="bt-btn bt-btn--primary" data-duty="back">I'm back</button>`
      : `<button type="button" class="bt-btn bt-btn--secondary" data-duty="away" aria-expanded="false" aria-haspopup="dialog">Step away</button>`;
  const flag = canFlag && st !== "off" ? `<button type="button" class="bt-duty-flag" data-duty="flag" title="Flag to Boomer" aria-label="Flag to Boomer">⚑</button>` : "";
  return `<div class="bt-duty-bar is-${st}" data-state="${st}"><span class="bt-avatar-sm" aria-hidden="true">${esc(initials(avatarName || handle))}</span>${who}${ring}<span class="bt-duty-acts">${act}</span>${flag}</div>`;
}

export function awayPopoverHtml({ lead = false } = {}) {
  return `<div class="bt-duty-away" role="dialog" aria-label="Step away"><b>Step away</b><p>${lead ? "Deckhands in your room get “Take the lead?” and you get the room back when you return." : "Your minutes pause while you are away."}</p>`
    + `<div class="bt-duty-away-opts"><button type="button" data-away="5">5 min</button><button type="button" data-away="15">15 min</button><button type="button" data-away="30">30 min</button></div>`
    + `<button type="button" class="bt-btn bt-btn--secondary" data-away="done">I'm done for tonight</button></div>`;
}

/** @param {HTMLElement} root @param {{ onClockIn?: () => void, onAway?: (kind: string) => void, onBack?: () => void, onFlag?: () => void, lead?: boolean }} [opts] */
export function initDutyBar(root, { onClockIn, onAway, onBack, onFlag, lead = false } = {}) {
  const bar = root.matches?.(".bt-duty-bar") ? root : root.querySelector(".bt-duty-bar");
  if (!bar || bar._duty) return { close() {} };
  bar._duty = true;
  const trigger = () => bar.querySelector('[data-duty="away"]');
  const pop = () => bar.querySelector(".bt-duty-away");
  const close = ({ refocus = false } = {}) => {
    const p = pop(); if (!p) return;
    p.remove(); const t = trigger(); if (t) { t.setAttribute("aria-expanded", "false"); if (refocus) t.focus(); }
  };
  const open = () => {
    if (pop()) return close();
    const t = trigger(); if (!t) return;
    bar.insertAdjacentHTML("beforeend", awayPopoverHtml({ lead }));
    t.setAttribute("aria-expanded", "true");
    document.dispatchEvent(new CustomEvent("bt:overlay-open", { detail: { source: "duty-bar" } }));
    pop().querySelector("button")?.focus();
  };
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-duty], [data-away]");
    if (!b || !bar.contains(b)) return;
    if (b.dataset.away) { close(); onAway?.(b.dataset.away); return; }
    const k = b.dataset.duty;
    if (k === "away") open();
    else if (k === "clockin") onClockIn?.();
    else if (k === "back") onBack?.();
    else if (k === "flag") onFlag?.();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop()) { e.stopPropagation(); close({ refocus: true }); } }, true);
  document.addEventListener("pointerdown", (e) => { if (pop() && !bar.contains(e.target)) close(); });
  document.addEventListener("bt:overlay-open", (e) => { if (e.detail?.source !== "duty-bar" && pop()) close(); });
  return { close };
}
