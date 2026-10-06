// shared/ui/season.js — markup for the season pieces (docs/design-system.md §5 "Task row, countdown,
// lock card, clock and path"; Night Shift's season pass). Pages and the UI kit build them here so
// they always match.
//
//   taskRowHtml({ icon, title, sub, n, of, xp, soon, done })   .bt-task-row: progress "n / of" or "Done ✓";
//                                                               soon: a "Soon" badge instead (is-soon)
//   lockCardHtml({ icon, title, text, href, label })           .bt-lock-card: the dashed gold upsell card
//   clockHtml({ streak, savers, cap, done, title, sub, label }) .bt-clock: streak flame, saver pips, button
//                                                               (data-clock-btn; .is-done once clocked in)
//   pathHtml({ nodes, label })                                 .bt-path: nodes on a line that fills gold;
//                                                               nodes: [{ icon, label, state: "done" | "now" | "" }]
import { escapeHtml as esc } from "./dom.js";

export function taskRowHtml({ icon = "", title = "", sub = "", n = 0, of = 1, xp = 0, soon = false, soonLabel = "Soon", done } = {}) {
  const target = Math.max(1, Number(of) || 1), count = Math.max(0, Math.min(target, Number(n) || 0));
  const isDone = done ?? count >= target;
  const pct = Math.round((count / target) * 100);
  const right = soon
    ? `<span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>${esc(soonLabel)}</span>`
    : `+${Number(xp) || 0} XP<span>${isDone ? "Done ✓" : `${count} / ${target}`}</span>`;
  return `<div class="bt-task-row${soon ? " is-soon" : isDone ? " is-done" : ""}"><span class="bt-task-row-ic" aria-hidden="true">${esc(icon)}</span>`
    + `<div class="bt-task-row-main"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}${soon ? "" : `<div class="bt-task-row-bar" role="img" aria-label="${count} of ${target}${isDone ? ", done" : ""}"><i style="--v:${pct}%"></i></div>`}</div>`
    + `<div class="bt-task-row-xp">${right}</div></div>`;
}

export function lockCardHtml({ icon = "⭐", title = "", text = "", href = "", label = "" } = {}) {
  return `<div class="bt-lock-card"><span class="bt-lock-card-ic" aria-hidden="true">${esc(icon)}</span><div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ""}</div>${href ? `<a class="bt-btn bt-btn--primary" href="${esc(href)}">${esc(label)}</a>` : ""}</div>`;
}

export function clockHtml({ streak = 0, savers = 0, cap = 2, done = false, title = "", sub = "", label = "Clock in", doneLabel = "Clocked in ✓", unit = "day streak", disabled = false } = {}) {
  const pips = Array.from({ length: Math.max(0, cap) }, (_, i) => `<i class="${i < savers ? "" : "is-empty"}"></i>`).join("");
  return `<div class="bt-clock${done ? " is-done" : ""}" data-clock><div class="bt-clock-flame"><b data-streak>${Number(streak) || 0}</b><span>${esc(unit)}</span></div>`
    + `<div class="bt-clock-txt"><b>${esc(title || (done ? "Clocked in for today" : "Clock in for today"))}</b><span>${sub ? esc(sub) : `Savers <span class="bt-clock-savers" role="img" aria-label="${savers} of ${cap} streak savers">${pips}</span>`}</span></div>`
    + `<button type="button" class="bt-btn bt-btn--primary${done ? " is-done" : ""}" data-clock-btn${done || disabled ? ' aria-disabled="true"' : ""}>${esc(done ? doneLabel : label)}</button></div>`;
}

export function pathHtml({ nodes = [], label = "Story path" } = {}) {
  const n = nodes.length || 1;
  const done = nodes.filter((x) => x.state === "done").length;
  const fill = n > 1 ? Math.min(1, done / (n - 1)) : 0;   // the line fills to the first node not done
  return `<ol class="bt-path" style="--n:${n};--fill:${fill.toFixed(3)}" aria-label="${esc(label)}">${nodes.map((x) => `<li class="bt-path-node${x.state ? ` is-${esc(x.state)}` : ""}"><i aria-hidden="true">${esc(x.icon || "•")}</i><b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}<span class="bt-sr-only">${x.state === "done" ? " (done)" : x.state === "now" ? " (next)" : ""}</span></li>`).join("")}</ol>`;
}
