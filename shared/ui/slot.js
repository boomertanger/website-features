// shared/ui/slot.js — T1 plan slot cards and the games tray (docs/design-system.md §5 "Scream Planner pieces").
// Text is escaped; arguments ending in Html are trusted markup.
//
//   roomsMiniHtml(rooms)    .bt-rooms-mini: { twitch, ytLandscape, ytVertical, tiktok } -> "covered" | "needed" | "off"
//                           (the dot is lime, gold for needed, never red)
//   slotHtml({ id, day, num, icon, label, timeText, timeHtml, badgeHtml, metaHtml, actionsHtml, reorder, state, count, games,
//              backstage, selected, published, roomsHtml, availHtml, requests, stampHtml })
//        .bt-slot: day tile, theme chip, time, badge, "1 of 2 games", game sockets (filled ones from games, empty ones
//        dashed up to `count`), then the right column (rooms, availability, mod-request flag).
//        games   [{ slug, coverHtml, src: "mod" | "vote" | "theme" | "you", srcExtra, fresh }]
//        availHtml   avatarsHtml(...) + text, e.g. "4 can make it · 1 maybe"
//        state   "Planned" (blue, default) | published adds gold "Scheduled"
//        timeHtml   trusted markup in place of the escaped timeText (dualTimeHtml: Central, then your time)
//        badgeHtml  replaces the Planned / Scheduled badge (Delayed, Cancelled...); metaHtml replaces "1 of 2 games"
//        actionsHtml  trusted buttons at the foot of the right column (Edit, Delay, Crew...)
//        reorder    adds ‹ › buttons on filled sockets (data-mv="slotId:index:-1|1"); the page reorders and re-renders
//   slotOffHtml({ day, num, actionHtml })      the dashed day-off row
//   trayHtml({ forHtml, filled, count, groups, searchValue, disabled })   .bt-tray (an <aside>)
//        groups  [{ kind: "mod" | "vote" | "theme" | "pick", items: [trayItem...], empty }]; the titles are fixed:
//                1 Mod requests · 2 Community votes · 3 Fits the theme · 4 Your picks. Always give all four in that order.
//        trayItem  { slug, title, coverHtml, lineHtml, kind, inSlot, also, full }
//                  lineHtml: the small line (trusted), e.g. `<b>@vex</b> · Captain, requested<q>note</q>`; also: "Wed" shows
//                  "Also Wed"; full disables Add ("Slot is full")
//   trayEmptyHtml(text, mascotHtml)           the empty-group line
//   initTray(root, { onAdd(slug, kind, itemEl, socketEl), onRemove(slotId, index, slug), onSearch(q) }) -> { destroy }
//        Add button (tap, Enter, Space) or, with a mouse or pen, drag a game onto a slot: a ghost cover follows the pointer,
//        a socket lights under it, and drop calls onAdd. Touch uses the Add button (dragging would fight scrolling).
//        .bt-sock-x calls onRemove. Fires bubbling "bt-tray-add" { detail: { slug, kind, slotId } } and "bt-tray-remove".
//        The page owns the data: re-render the slot and tray from onAdd.
import { escapeHtml as esc } from "./dom.js";
import { themeChipHtml, srcHtml, velvetHtml } from "./scream-planner.js";
import { platformIconHtml, PLATFORMS } from "./crew.js";

export function roomsMiniHtml(rooms = {}) {
  return `<span class="bt-rooms-mini">${Object.keys(PLATFORMS).filter((c) => rooms[c]).map((c) => `<span class="bt-rm" data-state="${esc(rooms[c])}" title="${esc(PLATFORMS[c].name)}: ${rooms[c] === "covered" ? "lead covered" : rooms[c] === "needed" ? "lead needed" : "off"}">${platformIconHtml(c)}</span>`).join("")}</span>`;
}

export function slotHtml({ id = "", day = "", num = "", icon = "", label = "", timeText = "", timeHtml = "", badgeHtml = "", metaHtml = "", actionsHtml = "", reorder = false, count = 2, games = [], backstage = false, selected = false, published = false, roomsHtml = "", availHtml = "", requests = 0, stampHtml = "" } = {}) {
  const socks = Array.from({ length: count }, (_, k) => {
    const g = games[k];
    return g
      ? `<span class="bt-sock${g.fresh ? " is-new" : ""}" data-sock="${esc(id)}-${k}">${g.coverHtml}<button type="button" class="bt-sock-x" data-rm="${esc(id)}:${k}" data-slug="${esc(g.slug ?? "")}" aria-label="Remove ${esc(g.title ?? "game")}">×</button>${reorder && games.length > 1 ? `<span class="bt-sock-mv">${k > 0 ? `<button type="button" data-mv="${esc(id)}:${k}:-1" aria-label="Move ${esc(g.title ?? "game")} earlier">‹</button>` : ""}${k < games.length - 1 ? `<button type="button" data-mv="${esc(id)}:${k}:1" aria-label="Move ${esc(g.title ?? "game")} later">›</button>` : ""}</span>` : ""}${srcHtml(g.src || "you", g.srcExtra || "")}</span>`
      : `<span class="bt-sock" data-sock="${esc(id)}-${k}"><span class="bt-sock-empty" aria-label="Empty game spot">+</span><span class="bt-src bt-src--you">&nbsp;</span></span>`;
  }).join("");
  const right = backstage
    ? `<span class="bt-avail">${velvetHtml("Fan Club")}</span><span class="bt-avail">No chats to crew</span>`
    : `${roomsHtml}${availHtml ? `<span class="bt-avail">${availHtml}</span>` : ""}${requests ? `<span class="bt-req-flag">✋ ${esc(requests)} mod request${requests > 1 ? "s" : ""}</span>` : ""}`;
  const acts = actionsHtml ? `<div class="bt-slot-acts">${actionsHtml}</div>` : "";
  return `<div class="bt-slot${backstage ? " is-backstage" : ""}${published ? " is-published" : ""}${selected ? " is-sel" : ""}" data-slot="${esc(id)}" tabindex="0" role="group"${selected ? ' aria-current="true"' : ""} aria-label="${esc(label)}, ${esc(day)} ${esc(num)}">`
    + `<div class="bt-slot-day"><small>${esc(String(day).toUpperCase())}</small><b>${esc(num)}</b></div>`
    + `<div class="bt-slot-mid"><div class="bt-slot-l1">${themeChipHtml({ icon, label })}<span class="bt-slot-time">${timeHtml || esc(timeText)}</span>${badgeHtml || `<span class="bt-badge bt-badge--${published ? "gold" : "blue"}">${published ? "Scheduled" : "Planned"}</span>`}<span class="bt-meta">${metaHtml || `${games.length} of ${esc(count)} games`}</span></div><div class="bt-slot-socks">${socks}</div></div>`
    + `<div class="bt-slot-right">${right}${acts}</div>${stampHtml}</div>`;
}

export const slotOffHtml = ({ day = "", num = "", actionHtml = "" } = {}) => `<div class="bt-slot-off"><span><b>${esc(day)} ${esc(num)}</b> · day off in your usual week</span>${actionHtml}</div>`;

const GROUPS = { mod: [1, "Mod requests"], vote: [2, "Community votes"], theme: [3, "Fits the theme"], pick: [4, "Your picks"] };
export const trayEmptyHtml = (text = "", mascotHtml = "") => `<div class="bt-tray-empty"><span aria-hidden="true">${mascotHtml}</span><small class="bt-meta">${esc(text)}</small></div>`;

function itemHtml(it) {
  const side = it.inSlot ? `<span class="bt-tray-in">In this slot ✓</span>`
    : `<span class="bt-tray-side">${it.also ? `<span class="bt-tray-also">Also ${esc(it.also)}</span>` : ""}<button type="button" class="bt-tray-add" data-add="${esc(it.slug)}" data-kind="${esc(it.kind)}"${it.full ? ' disabled title="Slot is full"' : ""} aria-label="Add ${esc(it.title)}">+</button></span>`;
  return `<div class="bt-tray-item${it.kind === "mod" ? " is-mod" : ""}" data-slug="${esc(it.slug)}" data-kind="${esc(it.kind)}">${it.coverHtml}<span class="bt-tray-nm"><b>${esc(it.title)}</b><small>${it.lineHtml || ""}</small></span>${side}</div>`;
}

export function trayHtml({ forHtml = "", filled = 0, count = 2, groups = [], searchValue = "", disabled = false } = {}) {
  const body = groups.map((g) => {
    const [n, title] = GROUPS[g.kind] || [0, g.kind];
    return `<div class="bt-tray-group" data-g="${esc(g.kind)}"><span class="k">${n}</span>${title}<span class="n">${g.items.length}</span></div>${g.items.length ? g.items.map(itemHtml).join("") : trayEmptyHtml(g.empty || "Nothing here yet.")}`;
  }).join("");
  if (disabled) return `<aside class="bt-tray" aria-label="Games for this slot"><div class="bt-tray-head"><span class="bt-label">Pick a slot</span></div></aside>`;
  return `<aside class="bt-tray" aria-label="Games for this slot"><div class="bt-tray-head"><span class="bt-label">Filling</span><span class="bt-tray-for">${forHtml} <small>${esc(filled)} of ${esc(count)}</small></span>`
    + `<label class="bt-tray-search"><span aria-hidden="true">🔍</span><input type="search" placeholder="Search the whole Vault" value="${esc(searchValue)}" aria-label="Search the whole Vault"></label></div><div class="bt-tray-list">${body}</div></aside>`;
}

export function initTray(root = document, { onAdd, onRemove, onSearch } = {}) {
  const ac = new AbortController(), sig = { signal: ac.signal };
  const slotOf = (el) => el.closest("[data-slot]")?.dataset.slot ?? "";
  const emptySock = (slotEl) => slotEl?.querySelector(".bt-sock-empty");
  const add = (slug, kind, item, sock) => {
    onAdd?.(slug, kind, item, sock);
    const sl = sock?.closest("[data-slot]") ?? root.querySelector(".bt-slot.is-sel");
    (sl || root).dispatchEvent(new CustomEvent("bt-tray-add", { bubbles: true, detail: { slug, kind, slotId: sl?.dataset.slot ?? "" } }));
  };
  root.addEventListener("click", (e) => {
    const a = e.target.closest(".bt-tray-add");
    if (a && root.contains(a) && !a.disabled) {
      const item = a.closest(".bt-tray-item"), sl = root.querySelector(".bt-slot.is-sel");
      add(a.dataset.add, a.dataset.kind, item, emptySock(sl));
      return;
    }
    const x = e.target.closest(".bt-sock-x");
    if (x && root.contains(x)) {
      e.stopPropagation();
      const [id, k] = x.dataset.rm.split(":");
      onRemove?.(id, Number(k), x.dataset.slug);
      x.dispatchEvent(new CustomEvent("bt-tray-remove", { bubbles: true, detail: { slotId: id, index: Number(k), slug: x.dataset.slug } }));
    }
  }, sig);
  root.addEventListener("input", (e) => { if (e.target.matches?.(".bt-tray-search input")) onSearch?.(e.target.value); }, sig);

  // mouse / pen drag
  let drag = null;
  root.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    const item = e.target.closest(".bt-tray-item");
    if (!item || e.target.closest("button") || !root.contains(item) || item.querySelector(".bt-tray-add")?.disabled) return;
    drag = { item, x: e.clientX, y: e.clientY, on: false, ghost: null, over: null };
  }, sig);
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.on = true; drag.item.classList.add("is-drag-src");
      const host = drag.item.closest(".bt-root") || document.body, cv = drag.item.querySelector(".bt-cover");
      const g = document.createElement("div"); g.className = "bt-tray-ghost"; g.setAttribute("aria-hidden", "true"); if (cv) g.appendChild(cv.cloneNode(true));
      host.appendChild(g); drag.ghost = g; drag.host = host;
    }
    const hb = drag.host.getBoundingClientRect();
    drag.ghost.style.left = e.clientX - hb.left + "px"; drag.ghost.style.top = e.clientY - hb.top + "px";
    const under = document.elementsFromPoint(e.clientX, e.clientY).map((n) => n.closest?.(".bt-slot")).find(Boolean);
    const sock = under ? emptySock(under) : null;
    if (sock !== drag.over) { drag.over?.classList.remove("is-over"); sock?.classList.add("is-over"); drag.over = sock; }
  }, sig);
  addEventListener("pointerup", () => {
    if (!drag) return;
    const d = drag; drag = null;
    d.ghost?.remove(); d.item.classList.remove("is-drag-src"); d.over?.classList.remove("is-over");
    if (d.on && d.over) {
      const a = d.item.querySelector(".bt-tray-add");
      if (a && !a.disabled) add(a.dataset.add, a.dataset.kind, d.item, d.over);
    }
  }, sig);
  return { destroy: () => ac.abort() };
}
