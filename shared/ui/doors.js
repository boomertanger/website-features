// shared/ui/doors.js — the door styles of "This week at a glance" (docs/design-system.md §5 "Scream Planner pieces").
// NOT .bt-portal: that class is the modal portal (CLAUDE.md rule 6), so the doors are .bt-doors > .bt-door.
// Text is escaped; arguments ending in Html are trusted markup.
//
//   DOOR_STYLES   [["jaws","Jaws"],["elevator","Haunted elevator"],["coffins","Coffins"],["morgue","Morgue drawers"],["hinged","Hinged doors"]]
//   rollDoorStyle(current)                 a style other than current (Surprise me)
//   doorStateFor({ start, end, status, off }, now = Date.now(), tz)
//        -> "off" | "cancelled" | "ended" | "tonight" | "later". tonight = the stream starts today (Central unless tz)
//        and has not ended; status "cancelled" wins; off = a day with no stream.
//   doorHtml({ id, style, index, day, num, state, icon, title, timeText, coverHtml, backstage, open })
//        one .bt-door button. state: "later" (closed) | "tonight" (open a crack, light leaking) | "ended" (greyed, an Ended
//        stamp) | "cancelled" (chained, padlock, rattles on hover) | "off" (sealed, "Day off"). backstage dresses the door in
//        velvet (any state but off). index (0-6) floats the door out of step with its neighbours and sets the elevator dial.
//   doorsHtml({ style, days, openId })    .bt-doors: a row of seven (use sliderHtml from slider.js for the phone slider)
//   setDoorStyle(root, style)             restyle live doors in place (the ‹ › "flip styles for fun" control; nothing is saved)
//   initDoors(root, { onOpen(id, el) })   click on a .bt-door marks it is-open (aria-pressed) and calls onOpen; off doors
//                                         stay sealed. Also fires a bubbling "bt-door-open" { detail: { id } }.
import { escapeHtml as esc } from "./dom.js";
import { velvetHtml, CENTRAL } from "./scream-planner.js";

export const DOOR_STYLES = [["jaws", "Jaws"], ["elevator", "Haunted elevator"], ["coffins", "Coffins"], ["morgue", "Morgue drawers"], ["hinged", "Hinged doors"]];
export function rollDoorStyle(current) {
  const pool = DOOR_STYLES.map((s) => s[0]).filter((s) => s !== current);
  return pool[Math.floor(Math.random() * pool.length)];
}

const ymd = (d, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
export function doorStateFor({ start, end, status, off } = {}, now = Date.now(), tz = CENTRAL) {
  if (off) return "off";
  if (status === "cancelled") return "cancelled";
  if (end != null && new Date(end).getTime() < now) return "ended";
  if (start != null && ymd(start, tz) === ymd(now, tz)) return "tonight";
  return "later";
}

const rnd = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
function jagged(top) {
  const n = 8, pts = [];
  if (top) { pts.push("0 0", "100% 0"); for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(2)}% ${i % 2 ? 100 : 78}%`); }
  else { for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(2)}% ${i % 2 ? 22 : 0}%`); pts.push("100% 100%", "0 100%"); }
  return `polygon(${pts.join(",")})`;
}
const panels = (style, emb, { day, num, state }) => ({
  jaws: `<span class="pj t" style="clip-path:${jagged(true)}">${emb}</span><span class="pj b" style="clip-path:${jagged(false)}"></span><i class="seam"></i>`,
  elevator: `<span class="pe l">${emb}</span><span class="pe r"></span>`,
  coffins: `<span class="lid">${emb}<i class="nails"></i></span>`,
  morgue: `<span class="pm"><i class="hdl"></i><span class="tag"><b>${esc(String(day).toUpperCase())} ${esc(num)}</b><small>${state === "off" ? "EMPTY" : state === "ended" ? "CLOSED" : "OCCUPIED"}</small></span></span>`,
  hinged: `<span class="lf">${emb}<i class="peep"></i></span>`,
}[style] || "");

export function doorHtml({ id = "", style = "jaws", index = 0, day = "", num = "", state = "later", icon = "", title = "", timeText = "", coverHtml = "", backstage = false, open = false } = {}) {
  const off = state === "off";
  const cls = ["bt-door", off && "is-off", state === "tonight" && "is-tonight", state === "ended" && "is-ended", state === "cancelled" && "is-cancelled", backstage && !off && "is-backstage", open && "is-open"].filter(Boolean).join(" ");
  const inside = off ? `<span class="bt-door-in is-empty"><i aria-hidden="true">💤</i><b>Day off</b></span>`
    : `<span class="bt-door-in">${coverHtml}<span class="bt-door-txt"><i aria-hidden="true">${esc(icon)}</i><b>${esc(title)}</b><small>${state === "cancelled" ? "Cancelled" : esc(timeText)}</small>${backstage ? velvetHtml("Fan Club") : ""}</span></span>`;
  const emb = `<i class="em" aria-hidden="true">${off ? "💤" : esc(icon)}</i>`;
  const ind = style === "elevator" ? `<span class="bt-door-ind" aria-hidden="true"><svg viewBox="0 0 60 32"><path class="arc" d="M6 30 A24 24 0 0 1 54 30"/>${[0, 1, 2, 3, 4, 5, 6].map((k) => { const a = Math.PI - (k * Math.PI) / 6; return `<circle class="${k === index ? "on" : ""}" cx="${(30 + Math.cos(a) * 20).toFixed(1)}" cy="${(30 - Math.sin(a) * 20).toFixed(1)}" r="1.6"/>`; }).join("")}<line class="ndl" x1="30" y1="30" x2="30" y2="13" style="--to:${-90 + index * 30}deg"/></svg><i class="lamp"></i></span>` : "";
  const over = state === "cancelled" ? `<span class="bt-door-chain" aria-hidden="true"><i></i><i></i><b>🔒</b></span>` : state === "ended" ? `<span class="bt-door-ended">Ended</span>` : "";
  const label = off ? "Day off" : title;
  return `<button type="button" class="${cls}" data-style="${esc(style)}" data-door="${esc(id)}" data-index="${index}" data-day="${esc(day)}" data-num="${esc(num)}" data-state="${esc(state)}" data-icon="${esc(icon)}" data-title="${esc(title)}" data-time="${esc(timeText)}" aria-pressed="${open}"${off ? " aria-disabled=\"true\"" : ""} style="--ph:${(-rnd(index, 11) * 4).toFixed(2)}s" aria-label="${esc(label)}, ${esc(day)} ${esc(num)}${state === "cancelled" ? ", cancelled" : state === "ended" ? ", ended" : state === "tonight" ? ", tonight" : ""}">`
    + `<span class="bt-door-day">${esc(day)}<b>${esc(num)}</b></span>${ind}<span class="bt-door-box">${inside}${panels(style, emb, { day, num, state })}${over}</span>`
    + `<span class="bt-door-lab">${esc(label)}<small>${off ? "&nbsp;" : state === "cancelled" ? "Cancelled" : esc(timeText)}</small></span></button>`;
}

export function doorsHtml({ style = "jaws", days = [], openId = "" } = {}) {
  return `<div class="bt-doors" role="group" aria-label="This week">${days.map((d, i) => doorHtml({ ...d, style, index: i, open: d.id === openId })).join("")}</div>`;
}

export function setDoorStyle(root, style) {
  root.querySelectorAll(".bt-door").forEach((el) => {
    const props = {
      id: el.dataset.door, style, index: Number(el.dataset.index ?? 0), day: el.dataset.day, num: el.dataset.num, state: el.dataset.state, icon: el.dataset.icon,
      title: el.dataset.title, timeText: el.dataset.time, coverHtml: el.querySelector(".bt-door-in .bt-cover")?.outerHTML ?? "", backstage: el.classList.contains("is-backstage"), open: el.classList.contains("is-open"),
    };
    const t = document.createElement("template"); t.innerHTML = doorHtml(props);
    el.replaceWith(t.content.firstElementChild);
  });
}

export function initDoors(root = document, { onOpen } = {}) {
  root.addEventListener("click", (e) => {
    const d = e.target.closest(".bt-door");
    if (!d || !root.contains(d) || d.classList.contains("is-off")) return;
    root.querySelectorAll(".bt-door.is-open").forEach((o) => { o.classList.remove("is-open"); o.setAttribute("aria-pressed", "false"); });
    d.classList.add("is-open"); d.setAttribute("aria-pressed", "true");
    onOpen?.(d.dataset.door, d);
    d.dispatchEvent(new CustomEvent("bt-door-open", { bubbles: true, detail: { id: d.dataset.door } }));
  });
}
