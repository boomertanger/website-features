// shared/ui/launch.js — .bt-launch, the launch panel tiles (docs/design-system.md §5 "Control Room pieces", docs/specs/control-room.md §9).
// One tile per live activity (Questions, Hot Seat, a Chat Game, Drop a badge, Recruit Rush). Only one activity is on stream at a time:
// the running tile carries the live tag and the live edge. A tile is a real button (purple "Start" text, the kit's clickable colour);
// an unavailable tile is disabled and says why. Text is escaped; arguments ending in Html are trusted markup.
//
//   launchHtml({ tiles, label })
//     tiles   [{ id, icon, title, sub, state, action, statusText }]
//             state "idle" (default) | "running" | "off" (unavailable: disabled, sub explains why)
//             icon is a short string (an emoji); action the idle text (default "Start"); statusText the running tag (default "On stream")
//   initLaunch(root, { onLaunch(id, state, tile) })   click on an idle or running tile; off tiles never fire. Also fires a bubbling
//                                                     "bt-launch" CustomEvent { detail: { id, state } }.
import { escapeHtml as esc } from "./dom.js";

const STATES = ["idle", "running", "off"];

export function launchTileHtml({ id = "", icon = "", title = "", sub = "", state = "idle", action = "Start", statusText = "On stream" } = {}) {
  const s = STATES.includes(state) ? state : "idle";
  const tail = s === "running" ? `<span class="bt-live-tag"><i></i>${esc(statusText)}</span>` : s === "off" ? "" : `<span class="bt-launch-go">${esc(action)}</span>`;
  return `<button type="button" class="bt-launch-tile${s === "running" ? " is-running" : s === "off" ? " is-off" : ""}" data-launch="${esc(id)}" data-state="${s}"${s === "off" ? " disabled" : ""}${s === "running" ? ` aria-pressed="true"` : ""}>`
    + `<span class="bt-launch-ic" aria-hidden="true">${esc(icon)}</span><span class="bt-launch-main"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${tail}</button>`;
}

export const launchHtml = ({ tiles = [], label = "Launch panel" } = {}) =>
  `<div class="bt-launch" role="group" aria-label="${esc(label)}">${tiles.map(launchTileHtml).join("")}</div>`;

export function initLaunch(root = document, { onLaunch } = {}) {
  root.querySelectorAll(".bt-launch:not([data-launch-ready])").forEach((box) => {
    box.dataset.launchReady = "";
    box.addEventListener("click", (e) => {
      const tile = e.target.closest(".bt-launch-tile");
      if (!tile || !box.contains(tile) || tile.disabled) return;
      const detail = { id: tile.dataset.launch, state: tile.dataset.state };
      onLaunch?.(detail.id, detail.state, tile);
      box.dispatchEvent(new CustomEvent("bt-launch", { bubbles: true, detail }));
    });
  });
}
