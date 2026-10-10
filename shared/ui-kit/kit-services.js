// shared/ui-kit/kit-services.js — the "Service Hub" section of the UI Kit page (/dev/ui-kit): every Service Hub piece in every state (docs/specs/service-hub.md
// §12; design-system.md §5 "Service Hub pieces"): .bt-rate (none, each value, the required error, plus a live one), .bt-talkback (member new, member rated,
// visitor, rate only, talk only), .bt-ask-pin, .bt-ind, .bt-filter-tile, .bt-rating-bar, .bt-cov-cell, .bt-wall, .bt-kanban and the map pieces, inside a frame
// with the Desktop / Tablet / Phone switcher (the frame is the "bt" container, so the pieces' container queries answer to it).
// Static sample data, no reads, no writes. ui-kit.js appends servicesKitHtml({ mascotHtml }) and calls initServicesKit(mount).
import { rateHtml, initRate, RATE_ICON } from "../ui/rate.js";
import { talkbackHtml, askPinHtml } from "../ui/talkback.js";

const WIDTHS = [["Desktop", "full"], ["Tablet", "800"], ["Phone", "390"]];
const IC = {
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></svg>`,
  novid: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 4l16 16"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>`,
  bug: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9h8v6a4 4 0 0 1-8 0z"/><path d="M12 9V6M9 4.5 10.5 6M15 4.5 13.5 6M4 12h4M16 12h4M5 17l3-1M19 17l-3-1"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/></svg>`,
  game: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3M6.5 12.5h3M15 12h.01M17 14h.01"/></svg>`,
};
/** The worst open bug's severity as the kit's .bt-level bars (four steps: cosmetic to critical). */
const level = (n) => `<span class="bt-level" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i${i <= n ? ' class="is-on"' : ""}></i>`).join("")}</span>`;
const sub = (t) => `<p class="kit-sub">${t}</p>`;
const bar = (lv, lk, np) => { const n = lv + lk + np, p = (x) => ((x / n) * 100).toFixed(0); return `<span class="bt-rating-bar"><span class="bt-rating-bar-track"><i data-v="love" style="width:${p(lv)}%"></i><i data-v="like" style="width:${p(lk)}%"></i><i data-v="nope" style="width:${p(np)}%"></i></span><small><b data-v="love">${lv}</b> · <b data-v="like">${lk}</b> · <b data-v="nope">${np}</b></small></span>`; };
const tile = (name, o = {}) => `<button type="button" class="bt-wall-tile${o.v ? " is-rated" : ""}${o.isNew ? " is-new" : ""}"${o.v ? ` data-v="${o.v}"` : ""}>${o.v ? `<span class="bt-wall-badge">${RATE_ICON[o.v]}</span>` : ""}${IC.game}<b>${name}</b>${o.isNew ? `<span class="bt-wall-q">New version</span>` : o.v ? "" : `<span class="bt-wall-q">Rate</span>`}</button>`;

export function servicesKitHtml({ mascotHtml = "" } = {}) {
  const tb = (o) => talkbackHtml({ service: "tap-the-splat", name: "Tap the Splat", mascotHtml, ...o });
  return `
  <section class="kit-section" id="kit-services">
    <h2 class="kit-h">Service Hub (.bt-rate, .bt-talkback, .bt-ask-pin, .bt-ind, .bt-filter-tile, .bt-rating-bar, .bt-cov-cell, .bt-wall, .bt-kanban, .bt-map-zone)</h2>
    <p class="kit-p">The Service Hub's pieces (<span class="kit-code">docs/specs/service-hub.md</span> §12): rating a service, the page strip at the end of every feature page, the Ask pin, and the admin views' chips, tiles, bars, cells, wall, board and map. Helpers: <span class="kit-code">shared/ui/rate.js</span> (rateHtml, initRate) and <span class="kit-code">shared/ui/talkback.js</span> (talkbackHtml, askPinHtml). Tones: Love it pink, Like it blue, Not for me gold (red stays for deleting).</p>
    <div class="kit-controls"><div class="kit-control"><span class="kit-control-label">Width</span><div class="kit-row" data-kit-sh-width>${WIDTHS.map(([l, v], i) => `<button type="button" class="bt-chip bt-chip--small${i === 0 ? " is-active" : ""}" data-value="${v}">${l}</button>`).join("")}</div></div></div>
    <div class="kit-sh-frame" data-kit-sh-frame>
      <div class="kit-sh-stack">
        <h3 class="kit-sub">Rate (.bt-rate)</h3>
        <div class="kit-sh-grid2">
          <div>${sub("None picked yet")}${rateHtml({ id: "kit-r0" })}</div>
          <div>${sub("Not for me: the comment turns required")}${rateHtml({ id: "kit-r1", value: "nope" })}</div>
          <div>${sub("Like it")}${rateHtml({ id: "kit-r2", value: "like" })}</div>
          <div>${sub("Love it")}${rateHtml({ id: "kit-r3", value: "love", commentText: "My favorite thing on the site." })}</div>
          <div data-kit-rate-error>${sub("The required error (validate())")}${rateHtml({ id: "kit-r4", value: "nope", commentText: "Meh" })}</div>
          <div data-kit-rate-live>${sub("Try it: pick, then Check")}${rateHtml({ id: "kit-r5" })}<div class="kit-row" style="margin-top:8px"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kit-rate-check>Check</button><span class="bt-meta" data-kit-rate-out></span></div></div>
        </div>

        <h3 class="kit-sub">The page strip (.bt-talkback)</h3>
        ${sub("Member, not rated yet")}${tb({ state: "new" })}
        ${sub("Member, rated (Love it)")}${tb({ state: "rated", rating: { value: "love", version: "1.0", date: "Oct 3" } })}
        ${sub("Visitor")}${tb({ state: "visitor" })}
        ${sub("Rate only (talkBack \"rate\", or the talkBack switch off)")}${tb({ state: "new", talk: false })}
        ${sub("Talk back only (the services switch off)")}${tb({ state: "new", rate: false })}

        <h3 class="kit-sub">Ask pin (.bt-ask-pin)</h3>
        <div class="bt-section-head"><span class="bt-section-head-ic" aria-hidden="true">🏆</span><span class="bt-section-head-text"><span class="bt-section-head-title">Leaderboard</span></span><span class="bt-section-head-rule"></span><span class="bt-section-head-tools">${askPinHtml({ section: "leaderboard", label: "Leaderboard" })}</span></div>

        <h3 class="kit-sub">Indicators (.bt-ind)</h3>
        <div class="bt-inds">
          <span class="bt-ind bt-ind--lime">${IC.play}Video</span><span class="bt-ind bt-ind--gold">${IC.play}Video stale</span><span class="bt-ind bt-ind--off">${IC.novid}No video</span>
          <span class="bt-ind bt-ind--lime">${IC.check}Tested v1.1</span><span class="bt-ind bt-ind--gold">${IC.check}Not on v1.1</span><span class="bt-ind bt-ind--off">${IC.check}Untested</span>
          <span class="bt-ind bt-ind--pink">${IC.bug}${level(3)}3</span><span class="bt-ind bt-ind--red">${IC.bug}${level(4)}1</span><span class="bt-ind bt-ind--blue">${IC.bulb}4</span>
        </div>

        <h3 class="kit-sub">Filter tiles (.bt-filter-tile)</h3>
        <div class="bt-filter-tiles" data-kit-tiles>${[["var(--bt-text-faint)", 45, "Services", true], ["var(--bt-rate-nope)", 3, "New Not for me"], ["var(--bt-gold)", 7, "Not tested on this version"], ["var(--bt-gray)", 21, "No video"], ["var(--bt-gold)", 2, "Stale video"], ["var(--bt-pink)", 5, "Open bugs"]].map(([c, n, l, on]) => `<button type="button" class="bt-filter-tile" style="--tone:${c}" aria-pressed="${!!on}"><b>${n}</b><span><i></i>${l}</span></button>`).join("")}</div>

        <h3 class="kit-sub">Rating bar (.bt-rating-bar)</h3>
        <div class="kit-row kit-sh-gap">${bar(15, 13, 4)}${bar(24, 9, 1)}${bar(2, 3, 7)}<span class="bt-meta">No ratings yet</span></div>

        <h3 class="kit-sub">Coverage cells (.bt-cov-cell)</h3>
        <div class="kit-row kit-sh-gap"><span class="bt-cov-cell" data-s="ok">${IC.check.replace("<svg", '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4"')}</span><span class="bt-cov-cell" data-s="old">v1.0</span><span class="bt-cov-cell" data-s="missing">–</span><span class="bt-cov-cell" data-s="bad">2</span><span class="bt-meta">ok · old · missing · bad</span></div>

        <h3 class="kit-sub">The collection wall (.bt-wall)</h3>
        <div class="bt-wall">${tile("Tap the Splat", { v: "love" })}${tile("Game Vault", { v: "like" })}${tile("Night Shift", { v: "nope" })}${tile("Trophy Room")}${tile("Feature Lab", { isNew: true })}${tile("Bug Zapper")}</div>

        <h3 class="kit-sub">Board (.bt-kanban)</h3>
        <div class="bt-kanban">${[["Planned", "var(--bt-gold)", ["Stream Library", "Contests"]], ["Building", "var(--bt-green)", ["Goal Tracker", "Hotline Boom"]], ["Live", "var(--bt-lime)", ["Tap the Splat", "Bug Zapper", "Feature Lab"]], ["Retired", "var(--bt-gray)", []]].map(([t, c, items]) => `<div class="bt-kanban-col" style="--tone:${c}"><div class="bt-kanban-h"><span class="bt-label"><i></i>${t}</span><span class="bt-meta">${items.length}</span></div>${items.length ? items.map((n) => `<div class="bt-card kit-sh-card"><b>${n}</b></div>`).join("") : `<p class="bt-meta">Nothing retired.</p>`}</div>`).join("")}</div>

        <h3 class="kit-sub">Map (.bt-map-zone, .bt-map-node)</h3>
        <div class="bt-map-zones">
          <div class="bt-map-zone bt-map-zone--wide"><div class="bt-map-zone-h"><span class="bt-label">Play</span><small>colour: popularity</small></div><div class="bt-map-nodes">
            <button type="button" class="bt-map-node" data-c="love">Tap the Splat <small>1.9</small></button><button type="button" class="bt-map-node is-sel" data-c="mid">Night Shift <small>0.8</small></button><button type="button" class="bt-map-node" data-c="nope">Chat Games <small>−0.4</small></button><button type="button" class="bt-map-node" data-c="none">Trophy Room</button></div></div>
          <div class="bt-map-zone"><div class="bt-map-zone-h"><span class="bt-label">Watch</span><small>2</small></div><div class="bt-map-nodes"><button type="button" class="bt-map-node" data-c="mid">Live <small>1.2</small></button><button type="button" class="bt-map-node" data-c="plan">Stream Library</button></div></div>
        </div>
      </div>
    </div>
  </section>`;
}

export function initServicesKit(mount) {
  const sec = mount.querySelector("#kit-services");
  if (!sec) return;
  const frame = sec.querySelector("[data-kit-sh-frame]");
  sec.querySelector("[data-kit-sh-width]").addEventListener("click", (e) => {
    const c = e.target.closest(".bt-chip"); if (!c) return;
    e.currentTarget.querySelectorAll(".bt-chip").forEach((x) => x.classList.toggle("is-active", x === c));
    frame.style.width = c.dataset.value === "full" ? "" : `${c.dataset.value}px`;
  });
  sec.querySelectorAll(".bt-rate-wrap").forEach((w) => { if (!w.closest("[data-kit-rate-error], [data-kit-rate-live]")) initRate(w); });
  const err = sec.querySelector("[data-kit-rate-error] .bt-rate-wrap");
  if (err) initRate(err).validate();
  const live = sec.querySelector("[data-kit-rate-live] .bt-rate-wrap");
  if (live) {
    const out = sec.querySelector("[data-kit-rate-out]");
    const r = initRate(live, { onChange: (v) => { out.textContent = `Picked: ${v}`; } });
    sec.querySelector("[data-kit-rate-check]").addEventListener("click", () => { out.textContent = r.validate() ? `OK: ${r.value()}${r.comment() ? ` · "${r.comment()}"` : ""}` : "Not yet: see the message"; });
  }
  sec.querySelector("[data-kit-tiles]").addEventListener("click", (e) => {
    const t = e.target.closest(".bt-filter-tile"); if (!t) return;
    e.currentTarget.querySelectorAll(".bt-filter-tile").forEach((x) => x.setAttribute("aria-pressed", String(x === t)));
  });
  sec.querySelectorAll(".bt-talkback-rb").forEach((b) => b.addEventListener("click", () => {
    b.closest(".bt-talkback-btns").querySelectorAll(".bt-talkback-rb").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));
  sec.querySelectorAll(".bt-map-node").forEach((n) => n.addEventListener("click", () => { sec.querySelectorAll(".bt-map-node").forEach((x) => x.classList.toggle("is-sel", x === n)); }));
}
