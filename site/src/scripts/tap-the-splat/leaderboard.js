// Tap the Splat leaderboard popover (members only): top 10 per device, with
// separate Desktop and Mobile boards because phones play a different game.
// Loaded by the footer's trophy button; no game code comes with it.
import { getBoard } from "./game-api.js";
import { fmtTime } from "./format.js";

const DEVICES = [["desktop", "🖥 Desktop"], ["mobile", "📱 Mobile"]];

async function render(list, device) {
  const board = await getBoard(device);
  const rows = board?.rows ?? [];
  list.querySelector("[data-lb-rows]").innerHTML = rows.length
    ? rows.slice(0, 10).map((r, k) => `<div class="bt-tts-lb-row"><b>${k + 1}</b><span>${r.name}</span><span>${fmtTime(r.secs)}</span></div>`).join("")
    : `<div class="bt-tts-lb-empty">No completed runs yet.</div>`;
  list.querySelector("[data-lb-preview]").hidden = !board?.preview;
  list.querySelectorAll("[data-dev]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.dev === device)));
}

function build(wrap) {
  const list = document.createElement("div");
  list.className = "bt-tts-lb-list";
  list.id = "bt-tts-lb-list";
  list.innerHTML = `<div class="bt-tts-lb-cap">Top 10 · members only<span class="bt-tts-lb-preview" data-lb-preview>Preview data</span></div>
    <div class="bt-tts-lb-tabs" role="tablist" aria-label="Board">${DEVICES.map(([d, label]) => `<button type="button" role="tab" data-dev="${d}" aria-selected="false">${label}</button>`).join("")}</div>
    <div role="tabpanel" data-lb-rows></div>`;
  list.addEventListener("click", (ev) => { const b = ev.target.closest("[data-dev]"); if (b) render(list, b.dataset.dev); });
  wrap.append(list);
  const btn = wrap.querySelector("[data-lb]");
  btn.setAttribute("aria-controls", list.id);
  // Close on a click outside or Escape.
  document.addEventListener("click", (ev) => { if (!list.hidden && !wrap.contains(ev.target)) toggle(wrap, false); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !list.hidden) { toggle(wrap, false); btn.focus(); } });
  return list;
}

/** Opens or closes the popover (on the device you're playing on). */
export function toggle(wrap, open) {
  const existing = wrap.querySelector(".bt-tts-lb-list"), list = existing || build(wrap);
  const show = open ?? (!existing || list.hidden);
  list.hidden = !show;
  wrap.querySelector("[data-lb]").setAttribute("aria-expanded", String(show));
  if (show) render(list, wrap.closest("[data-tts]").offsetWidth <= 640 ? "mobile" : "desktop");
}
