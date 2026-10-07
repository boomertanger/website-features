// shared/ui/ladder.js — .bt-ladder, the grade ladder (docs/design-system.md §5 "Ladder"; Mod Machina How it
// works): clickable rungs on a drawn ladder beside a detail card. The rungs are a vertical tablist (roving
// tabindex, aria-selected; arrows, Home and End move and choose) and every detail card is a tabpanel, all in
// the HTML with the unselected ones hidden, so it reads without script. Rungs stack from the bottom (lowest)
// to the top; the first admin rung gets a dashed "Invitation only" gate under it.
//
//   ladderHtml({ rungs, selected, label, id, gate })
//     rungs: [{ rungHtml, tag, admin, detailHtml }] lowest first. rungHtml is a gradeChipHtml(); tag is the small
//            text on the right ("Rung 2", "Admin"); detailHtml is ladderDetailHtml(...) or any markup.
//     selected: index shown first (default 0); gate: the gate's text (default "Invitation only")
//   ladderDetailHtml({ chipHtml, meta, title, text, can, up, canLabel, upLabel, tags, admin })
//     the card body from the mockup: chip + a right-hand note, a heading, a line, "You can" and "To move up" lists
//     and tags. admin: true for the green card. All text is escaped.
//   initLadder(root, { onSelect(index, rung) })    wires every .bt-ladder under root
import { escapeHtml as esc } from "./dom.js";

let uid = 0;

export function ladderDetailHtml({ chipHtml = "", meta = "", title = "", text = "", can = [], up = [], canLabel = "You can", upLabel = "To move up", tags = [], admin = false } = {}) {
  const list = (cls, label, items) => items.length ? `<div class="${cls}"><span class="bt-label">${esc(label)}</span><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  const cols = can.length || up.length ? `<div class="bt-ladder-cols">${list("bt-ladder-can", canLabel, can)}${list("bt-ladder-up", upLabel, up)}</div>` : "";
  return `<div class="bt-ladder-detail-top">${chipHtml}${meta ? (admin ? `<span class="bt-admin-tag bt-admin-tag--small">${esc(meta)}</span>` : `<span class="bt-meta">${esc(meta)}</span>`) : ""}</div>`
    + `<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}${cols}`
    + (tags.length ? `<div class="bt-ladder-foot">${tags.map((t) => `<span class="bt-tag">${esc(t)}</span>`).join("")}</div>` : "");
}

export function ladderHtml({ rungs = [], selected = 0, label = "Grades", id = "", gate = "Invitation only" } = {}) {
  const base = id || `bt-ladder-${++uid}`;
  const firstAdmin = rungs.findIndex((r) => r.admin);
  const btns = rungs.map((r, i) => {
    const on = i === selected;
    return `${i === firstAdmin && i > 0 ? `<span class="bt-ladder-gate" role="presentation" aria-hidden="true">${esc(gate)}</span>` : ""}`
      + `<button type="button" role="tab" class="bt-ladder-rung${r.admin ? " is-admin" : ""}" id="${base}-t${i}" aria-controls="${base}-p${i}" aria-selected="${on}" tabindex="${on ? 0 : -1}" data-rung="${i}">${r.rungHtml || ""}${r.tag ? `<span>${esc(r.tag)}</span>` : ""}</button>`;
  }).join("");
  const panels = rungs.map((r, i) => `<div class="bt-ladder-detail${r.admin ? " is-admin" : ""}" role="tabpanel" id="${base}-p${i}" aria-labelledby="${base}-t${i}" tabindex="0"${i === selected ? "" : " hidden"}>${r.detailHtml || ""}</div>`).join("");
  return `<div class="bt-ladder" data-ladder><div class="bt-ladder-rungs" role="tablist" aria-orientation="vertical" aria-label="${esc(label)}">${btns}</div>${panels}</div>`;
}

export function initLadder(root = document, { onSelect } = {}) {
  root.querySelectorAll(".bt-ladder:not([data-ladder-ready])").forEach((ladder) => {
    ladder.dataset.ladderReady = "";
    const tabs = [...ladder.querySelectorAll("[role=tab]")];
    const show = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        const p = document.getElementById(t.getAttribute("aria-controls"));
        if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
      onSelect?.(tabs.indexOf(tab), tab);
    };
    ladder.addEventListener("click", (e) => { const t = e.target.closest("[role=tab]"); if (t && tabs.includes(t)) show(t); });
    ladder.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      // The ladder is drawn with the lowest rung at the bottom, so Up climbs and Down descends.
      const to = { ArrowUp: i + 1, ArrowRight: i + 1, ArrowDown: i - 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to == null) return;
      e.preventDefault();
      show(tabs[(to + tabs.length) % tabs.length], true);
    });
  });
}
