// shared/ui/seance.js — .bt-seance, Hot Seat's picker W2: a séance board of names and a planchette that glides to each pick in turn
// (docs/specs/chat-games.md §5, §14; mockup control-room-batch-4.html "Hot Seat on stream"). The animation only SHOWS the server's draw:
// the picks come from the round, never from here. Sized by its own width (container units), so the same markup fits a card and the
// 1920 px stream view. Text is escaped.
//
//   seanceHtml({ names, picks, state, shown, motion })
//     names   up to 10 handles on the board (the round's board; every pick is put on it if missing)
//     picks   [{ handle, status }] in seat order; status replaced or out strikes the name, anything else lights it
//     state   idle (planchette parked) · drawing (gliding) · landed (on the last pick) · replaced (a pick was swapped for a new draw)
//     shown   how many picks are already lit (default all; the rest are placed on the board for seanceDraw from: shown)
//     motion  true keeps the glide under prefers-reduced-motion (the stream view is video)
//   seanceDraw(el, { picks, from = 0, motion, step = 1300, onDone })   glides to picks[from..] one by one, lighting each name, then
//     data-state landed (replaced when any pick was replaced). Returns cancel(). Reduced motion: lands at once.
import { escapeHtml as esc } from "./dom.js";

// two arcs of five, like the letters on a talking board (percent of the board)
const SLOTS = [[14, 44], [32, 38], [50, 36], [68, 38], [86, 44], [14, 72], [32, 66], [50, 64], [68, 66], [86, 72]];
const PARK = [50, 86];
const PLANCH = '<svg viewBox="-110 -100 220 220" aria-hidden="true" focusable="false"><path class="bt-seance-pl" d="M0 -95 C 70 -95 110 -10 82 55 L 0 110 L -82 55 C -110 -10 -70 -95 0 -95Z"/><circle class="bt-seance-lens" cx="0" cy="0" r="40"/><circle class="bt-seance-tip" cx="0" cy="88" r="6"/></svg>';
const handleOf = (h) => String(h || "").replace(/^@/, "");
const gone = (s) => s === "replaced" || s === "out";
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The board's names: the given ones (up to 10), with every pick on it. */
function boardOf(names, picks) {
  const list = [...new Set((names || []).map(handleOf).filter(Boolean))].slice(0, 10);
  for (const p of picks || []) {
    const h = handleOf(p.handle);
    if (!h || list.includes(h)) continue;
    if (list.length < 10) list.push(h);
    else { const i = list.findIndex((x) => !(picks || []).some((q) => handleOf(q.handle) === x)); if (i >= 0) list[i] = h; }
  }
  return list;
}
const at = (pos) => `--x:${pos[0]}%;--y:${pos[1]}%`;

export function seanceHtml({ names = [], picks = [], state = "idle", shown = null, motion = false } = {}) {
  const board = boardOf(names, picks);
  const vis = state === "idle" ? [] : (picks || []).slice(0, shown == null ? undefined : shown);
  const lit = (h) => vis.find((p) => handleOf(p.handle) === h);
  const last = [...vis].reverse().find((p) => !gone(p.status));
  const where = last ? SLOTS[board.indexOf(handleOf(last.handle))] || PARK : PARK;
  const label = vis.length ? `Séance board: ${vis.filter((p) => !gone(p.status)).map((p) => "@" + handleOf(p.handle)).join(", ")} picked` : "Séance board";
  return `<div class="bt-seance" data-state="${esc(state)}"${motion ? ' data-motion="always"' : ""} role="img" aria-label="${esc(label)}"><div class="bt-seance-board">`
    + `<span class="bt-seance-word bt-seance-yes" aria-hidden="true">Yes</span><span class="bt-seance-word bt-seance-no" aria-hidden="true">No</span>`
    + `<span class="bt-seance-title" aria-hidden="true">Hot Seat</span><span class="bt-seance-word bt-seance-bye" aria-hidden="true">Goodbye</span>`
    + board.map((h, i) => { const p = lit(h); return `<span class="bt-seance-name${p ? (gone(p.status) ? " is-gone" : " is-hit") : ""}" data-h="${esc(h)}" style="${at(SLOTS[i])}" aria-hidden="true">@${esc(h)}</span>`; }).join("")
    + `<span class="bt-seance-planch" style="${at(where)}" aria-hidden="true">${PLANCH}</span></div></div>`;
}

export function seanceDraw(el, { picks = [], from = 0, motion = false, step = 1300, onDone = null } = {}) {
  const box = el && (el.matches(".bt-seance") ? el : el.querySelector(".bt-seance"));
  if (!box) { if (onDone) onDone(); return () => {}; }
  const pl = box.querySelector(".bt-seance-planch");
  const names = [...box.querySelectorAll(".bt-seance-name")];
  const nameOf = (h) => names.find((n) => n.dataset.h === handleOf(h));
  const settle = () => { box.dataset.state = (picks || []).some((p) => gone(p.status)) ? "replaced" : "landed"; if (onDone) onDone(); };
  const light = (p) => { const n = nameOf(p.handle); if (n) { n.classList.toggle("is-gone", gone(p.status)); n.classList.toggle("is-hit", !gone(p.status)); } };
  const todo = (picks || []).slice(from);
  if (!todo.length || (reduced() && !motion && box.dataset.motion !== "always")) {
    for (const p of picks || []) light(p);
    const last = [...(picks || [])].reverse().find((p) => !gone(p.status)), n = last && nameOf(last.handle);
    if (n && pl) pl.setAttribute("style", n.getAttribute("style"));
    settle();
    return () => {};
  }
  let i = 0, timer = 0, stopped = false;
  box.dataset.state = "drawing";
  const next = () => {
    if (stopped) return;
    if (i >= todo.length) { settle(); return; }
    const p = todo[i++], n = nameOf(p.handle);
    if (n && pl) pl.setAttribute("style", n.getAttribute("style"));
    timer = setTimeout(() => { light(p); timer = setTimeout(next, 450); }, step);
  };
  timer = setTimeout(next, 200);
  return () => { stopped = true; clearTimeout(timer); };
}
