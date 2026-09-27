// Rewrites stream times in the viewer's own timezone and keeps countdowns
// ticking. Markup:
//   <time data-stream-time="short|day|long" datetime="ISO">fallback</time>
//   <div data-countdown="ISO" data-countdown-style="full|mini">
//     <… data-cd="days|hours|minutes">…</…>
//   </div>
import { formatStreamTime, countdownParts, pad2 } from "../lib/time.js";

function localizeTimes() {
  document.querySelectorAll("time[data-stream-time]").forEach((el) => {
    const text = formatStreamTime(el.getAttribute("datetime"), el.dataset.streamTime);
    if (text) el.textContent = text;
  });
}

function tick() {
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    const { days, hours, minutes } = countdownParts(el.dataset.countdown);
    const mini = el.dataset.countdownStyle === "mini";
    const text = {
      days: mini ? `${days}d` : String(days),
      hours: mini ? `${pad2(hours)}h` : pad2(hours),
      minutes: mini ? `${pad2(minutes)}m` : pad2(minutes),
    };
    el.querySelectorAll("[data-cd]").forEach((part) => { part.textContent = text[part.dataset.cd]; });
  });
}

localizeTimes();
tick();
setInterval(tick, 30000);
