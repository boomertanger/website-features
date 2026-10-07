// shared/ui/ticket.js — .bt-ticket, the W1 stream ticket (docs/design-system.md §5 "Scream Planner pieces").
// A stub (day) and a body: time (dual: Central, then your own), badge, theme and title, covers fan, platform icons or the
// Backstage badge, crew line. Text is escaped; arguments ending in Html are trusted markup.
//
//   ticketHtml({ id, day, num, month, state, title, icon, timeHtml, was, reason, coversHtml, more, platformsHtml,
//                backstage, crew, open, interactive })
//     state      "scheduled" (default) | "soon" (On air soon, with the stamp) | "tonight" (the spinning edge) |
//                "live" (red) | "ended" | "cancelled" (tape, reason) | "off" (a quiet day-off ticket)
//     day, num, month   the stub: "Wed", 7, "Oct" (dayParts() in scream-planner.js gives them)
//     timeHtml   dualTimeHtml({ start, end, was }) ; was (text) on a non-cancelled ticket adds "Delayed · reason"
//     coversHtml the game covers as .bt-cover markup (coverHtml from cover.js); only the first three show, `more` adds "+N"
//                (the planned count minus what is shown; "+1 picked on stream")
//     platformsHtml / backstage   platformsHtml() or, for a backstage stream, the .bt-velvet badge and a velvet rope
//     crew       plain text for the line under the row, e.g. "Captain NightOwl Kat" (escaped; pass crewHtml for markup)
//     open       adds is-open (the selected ticket); interactive adds data-ticket="id" + tabindex for initTickets
//   initTickets(root, { onOpen(id, el) })   click, Enter or Space on a [data-ticket] marks it is-open and calls onOpen;
//                                           also fires a bubbling "bt-ticket-open" { detail: { id } }
import { escapeHtml as esc } from "./dom.js";
import { velvetHtml, platformsHtml as plats } from "./scream-planner.js";
import { stampHtml } from "./stamp.js";

const BADGE = {
  scheduled: ["gold", "Scheduled"], soon: ["gold", "On air soon"], tonight: ["gold", "Tonight"], live: ["red", "Live", true],
  ended: ["lime", "Ended"], cancelled: ["gray", "Cancelled"],
};
const CLS = { soon: "is-soon", tonight: "is-tonight", live: "is-live", ended: "is-past", cancelled: "is-cancelled", off: "is-off" };
const ROPE = `<svg class="bt-ticket-rope" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true"><path d="M4 4 Q50 16 100 6 T196 4"/><circle cx="4" cy="4" r="3.5"/><circle cx="196" cy="4" r="3.5"/></svg>`;

export function ticketHtml({ id = "", day = "", num = "", month = "", state = "scheduled", title = "", icon = "", timeHtml = "", was, reason = "", coversHtml = "", more = 0, platformsHtml, backstage = false, crew = "", crewHtml = "", open = false, interactive = false } = {}) {
  const stub = `<div class="bt-ticket-stub"><small>${esc(day)}</small><b>${esc(num)}</b>${month ? `<span class="bt-ticket-month">${esc(month)}</span>` : ""}</div>`;
  const cls = ["bt-ticket", CLS[state], backstage && "is-backstage", open && "is-open"].filter(Boolean).join(" ");
  const attrs = `${interactive && state !== "off" ? ` data-ticket="${esc(id)}" tabindex="0"` : ""} aria-label="${esc(title)}, ${esc(day)} ${esc(num)}"`;
  if (state === "off") return `<article class="${cls}"${attrs}>${stub}<div class="bt-ticket-body"><span class="bt-ticket-title">💤 Day off</span>${reason ? `<span class="bt-meta">${esc(reason)}</span>` : ""}</div></article>`;
  const [tone, text, dot] = BADGE[state] || BADGE.scheduled;
  const badge = `<span class="bt-badge bt-badge--${tone}">${dot ? `<span class="bt-badge-dot"></span>` : ""}${text}</span>`;
  const delayed = was != null && state !== "cancelled" && state !== "ended";
  const fan = `<span class="bt-fan">${coversHtml}${more ? `<span class="bt-fan-more" title="${esc(`${more} more`)}">+${esc(more)}</span>` : ""}</span>`;
  const crewLine = crewHtml || (crew ? `<span class="bt-ticket-crew">${esc(crew)}</span>` : `<span class="bt-ticket-crew">&nbsp;</span>`);
  return `<article class="${cls}"${attrs}>${stub}<div class="bt-ticket-body">`
    + `<div class="bt-ticket-top"><span class="bt-ticket-time">${timeHtml}</span>${badge}</div>`
    + `<span class="bt-ticket-title">${icon ? `${esc(icon)} ` : ""}${esc(title)}</span>`
    + (delayed ? `<span class="bt-ticket-delay">⏱ Delayed${reason ? ` · ${esc(reason)}` : ""}</span>` : "")
    + (state === "cancelled" && reason ? `<span class="bt-meta">${esc(reason)}</span>` : "")
    + `<div class="bt-ticket-row">${fan}${backstage ? velvetHtml("Fan Club") : (platformsHtml ?? plats())}</div>${crewLine}`
    + (state === "cancelled" ? `<span class="bt-ticket-tape">Cancelled</span>` : "")
    + `</div>${backstage ? ROPE : ""}${state === "soon" ? stampHtml({ kicker: "On air", label: "soon", size: "sm" }) : ""}</article>`;
}

export function initTickets(root = document, { onOpen } = {}) {
  root.querySelectorAll("[data-ticket]:not([data-ticket-ready])").forEach((t) => {
    t.dataset.ticketReady = "";
    const act = () => {
      root.querySelectorAll(".bt-ticket.is-open").forEach((o) => o.classList.remove("is-open"));
      t.classList.add("is-open");
      onOpen?.(t.dataset.ticket, t);
      t.dispatchEvent(new CustomEvent("bt-ticket-open", { bubbles: true, detail: { id: t.dataset.ticket } }));
    };
    t.addEventListener("click", (e) => { if (!e.target.closest("a, button")) act(); });
    t.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === t) { e.preventDefault(); act(); } });
  });
}
