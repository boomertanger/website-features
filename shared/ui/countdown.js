// shared/ui/countdown.js — .bt-timer (not .bt-countdown, the home hero's next-stream digits), the gold pill with a timer (docs/design-system.md §5
// "Countdown"): "Resets in 7h 12m", "Ch 3 in 10d 14h". Ticks once a minute; nothing moves under
// reduced motion (the text still updates, quietly).
//
//   timerHtml({ until, label, icon, locked })
//     until: the end (milliseconds); label: the words before the time ("Resets in"); locked: the grey form
//   fmtLeft(ms)            "10d 14h", "7h 12m", "12m", "now"
//   initTimers(root)   starts the minute tick for every .bt-timer[data-until] under root;
//                          when one runs out it shows data-done ("Open now") and fires bt:timer-done
import { escapeHtml as esc } from "./dom.js";

const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

export function fmtLeft(ms) {
  if (!(ms > 0)) return "now";
  if (ms >= DAY) return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`;
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MIN)}m`;
  return `${Math.max(1, Math.ceil(ms / MIN))}m`;
}

export function timerHtml({ until, label = "", icon = "⏳", locked = false, done = "" } = {}) {
  const left = Number(until) - Date.now();
  const text = `${label ? `${label} ` : ""}${fmtLeft(left)}`;
  return `<span class="bt-timer${locked ? " bt-timer--locked" : ""}" data-until="${Number(until)}" data-label="${esc(label)}"${done ? ` data-done="${esc(done)}"` : ""}>${icon ? `<span aria-hidden="true">${esc(icon)}</span>` : ""}<span class="bt-timer-t">${left <= 0 && done ? esc(done) : esc(text)}</span></span>`;
}

let timer = 0, start = 0;
export function initTimers(root = document) {
  const tick = () => {
    root.querySelectorAll(".bt-timer[data-until]").forEach((el) => {
      const left = Number(el.dataset.until) - Date.now();
      const t = el.querySelector(".bt-timer-t");
      if (!t) return;
      if (left <= 0 && el.dataset.done != null) {
        if (t.textContent !== el.dataset.done) { t.textContent = el.dataset.done; el.dispatchEvent(new CustomEvent("bt:countdown-done", { bubbles: true })); }
        return;
      }
      t.textContent = `${el.dataset.label ? `${el.dataset.label} ` : ""}${fmtLeft(left)}`;
    });
  };
  tick();
  clearInterval(timer); clearTimeout(start);
  // On the minute, so every pill on the page changes together.
  start = window.setTimeout(() => { tick(); timer = window.setInterval(tick, MIN); }, MIN - (Date.now() % MIN) + 50);
  return { tick };
}
