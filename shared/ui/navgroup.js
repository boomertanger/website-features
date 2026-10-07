// shared/ui/navgroup.js — header nav groups (.bt-navgroup, design-system.md §5 "Header nav groups").
//
// Markup (the site header renders it; the UI Kit shows every state):
//   <span class="bt-navgroup" data-navgroup="watch">
//     <a class="bt-navgroup-btn" href="/live" data-navgroup-trigger aria-controls="bt-ng-watch">Watch …</a>
//     <div class="bt-navgroup-panel" id="bt-ng-watch" hidden>…cards and a feature tile…</div>
//   </span>
//
// Without JavaScript the trigger stays a link to the group's first page and the panel stays hidden.
// With it, each trigger is upgraded to a <button> (a disclosure: aria-expanded + aria-controls, not an
// ARIA menu). Hover opens after ~140 ms (mouse only), click or tap toggles, only one panel is open at
// a time, and an outside click, a scroll, a resize or Escape closes it. Escape returns focus to the
// trigger. A panel opened by hover closes when the pointer leaves; one opened by click or key stays.

import { escapeHtml as esc } from "./dom.js";

const HOVER_MS = 140;
const LEAVE_MS = 220;

/**
 * initNavGroups(root, { onOpen, onClose }) -> { open(name), close(), destroy() }
 * onOpen(name, panel, { first }) runs each time a panel opens (first: the first time for that group),
 * onClose(name, panel) when it closes. Safe to call twice on the same root (groups already upgraded
 * are skipped).
 */
export function initNavGroups(root = document, { onOpen, onClose } = {}) {
  const groups = [...root.querySelectorAll("[data-navgroup]")].filter((g) => !g.dataset.ngReady);
  const state = new Map();   // group element -> { name, trigger, panel, seen, by }
  let current = null;        // the open group element
  let hoverTimer = 0;
  let leaveTimer = 0;
  let openWidth = 0;
  const cleanups = [];

  const upgrade = (trigger) => {
    if (trigger.tagName === "BUTTON") return trigger;
    const btn = document.createElement("button");
    btn.type = "button";
    for (const a of trigger.attributes) if (a.name !== "href") btn.setAttribute(a.name, a.value);
    btn.innerHTML = trigger.innerHTML;
    trigger.replaceWith(btn);
    return btn;
  };

  const place = (g) => {
    const { trigger, panel } = state.get(g);
    const host = panel.offsetParent;
    if (!host) return;
    const hr = host.getBoundingClientRect();
    const tr = trigger.getBoundingClientRect();
    const w = panel.offsetWidth || 720;
    const left = Math.max(16, Math.min(tr.left - hr.left - 16, hr.width - w - 16));
    panel.style.setProperty("--bt-ng-left", `${Math.round(left)}px`);
  };

  const close = ({ focus = false } = {}) => {
    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    if (!current) return;
    const g = current;
    const s = state.get(g);
    current = null;
    s.panel.hidden = true;
    s.trigger.setAttribute("aria-expanded", "false");
    s.by = "";
    if (focus) s.trigger.focus();
    if (onClose) onClose(s.name, s.panel);
  };

  const open = (g, by = "click") => {
    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    if (typeof g === "string") g = groups.find((x) => x.dataset.navgroup === g);
    if (!g || !state.has(g)) return;
    if (current === g) { state.get(g).by = by === "hover" ? state.get(g).by : by; return; }
    close();
    const s = state.get(g);
    current = g;
    s.by = by;
    openWidth = innerWidth;
    s.panel.hidden = false;
    s.trigger.setAttribute("aria-expanded", "true");
    place(g);
    const first = !s.seen;
    s.seen = true;
    if (onOpen) onOpen(s.name, s.panel, { first });
  };

  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  groups.forEach((g) => {
    const t = g.querySelector("[data-navgroup-trigger]");
    const panel = g.querySelector(".bt-navgroup-panel");
    if (!t || !panel) return;
    g.dataset.ngReady = "1";
    const trigger = upgrade(t);
    if (panel.id) trigger.setAttribute("aria-controls", panel.id);
    trigger.setAttribute("aria-expanded", "false");
    panel.hidden = true;
    const s = { name: g.dataset.navgroup, trigger, panel, seen: false, by: "" };
    state.set(g, s);

    on(trigger, "click", () => (current === g ? close() : open(g, "click")));
    on(g, "pointerenter", () => clearTimeout(leaveTimer));
    // Hovering a trigger opens its panel (and switches from another open one) after a short delay.
    on(trigger, "pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(hoverTimer);
      if (current !== g) hoverTimer = setTimeout(() => open(g, "hover"), HOVER_MS);
    });
    on(g, "pointerleave", (e) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(hoverTimer);
      if (current === g && s.by === "hover") leaveTimer = setTimeout(() => { if (current === g && s.by === "hover") close(); }, LEAVE_MS);
    });
    // Tabbing out of the group closes it.
    on(g, "focusout", (e) => {
      if (current === g && e.relatedTarget && !g.contains(e.relatedTarget)) close();
    });
  });

  if (groups.length) {
    on(document, "keydown", (e) => { if (e.key === "Escape" && current) { e.stopPropagation(); close({ focus: true }); } });
    on(document, "pointerdown", (e) => { if (current && !current.contains(e.target)) close(); });
    on(window, "scroll", () => { if (current) close(); }, { passive: true });
    on(window, "resize", () => { if (current && innerWidth !== openWidth) close(); });
  }

  return { open: (name) => open(name, "click"), close: () => close(), destroy: () => { close(); cleanups.forEach((f) => f()); } };
}

// ---------------------------------------------------------------------------------------------
// Feature tiles (.bt-navgroup-feature). The builders return the tile's INNER html, so the site
// (site/src/scripts/nav-features.ts) and the UI Kit draw exactly the same markup in every state.
// ---------------------------------------------------------------------------------------------


const SKEL = `<span class="bt-skeleton bt-navgroup-skel bt-navgroup-skel--title"></span><span class="bt-skeleton bt-navgroup-skel bt-navgroup-skel--block"></span><span class="bt-skeleton bt-navgroup-skel"></span>`;
const COUNT = ["d:days", "h:hrs", "m:min", "s:sec"].map((s) => { const [u, l] = s.split(":"); return `<span><b data-u="${u}">00</b><small>${l}</small></span>`; }).join("");

/** Loading state: the label and a shimmer (.bt-skeleton). */
export const featureLoadingHtml = (label) => `<span class="bt-label">${esc(label)}</span>${SKEL}`;

/**
 * Watch tile, both states. Offline shows the next stream, a countdown and Add to calendar; live (shown
 * under data-live="public", or with .is-live on the tile) shows Live now and Watch now. whenHtml is the trusted
 * markup for the start time (the site passes a <time data-stream-time> element).
 */
export function watchFeatureHtml({ title, whenHtml, startsAt, liveHref = "/live", scheduleHref = "/schedule" }) {
  return `<span class="bt-label bt-navgroup-notlive">Next stream</span><span class="bt-label bt-navgroup-live-label bt-navgroup-livenow">Live now</span>
<strong>${esc(title)}</strong>
<p class="bt-navgroup-notlive">${whenHtml}</p>
<div class="bt-navgroup-count bt-navgroup-notlive" data-ng-count="${esc(startsAt)}" aria-hidden="true">${COUNT}</div>
<p class="bt-navgroup-livenow">Live right now, on any platform.</p>
<a class="bt-btn bt-btn--primary bt-btn--sm bt-navgroup-livenow" href="${esc(liveHref)}">Watch now</a>
<a class="bt-btn bt-btn--secondary bt-btn--sm bt-navgroup-notlive" href="${esc(scheduleHref)}" data-ng-cal>Add to calendar</a>
<a class="bt-btn bt-btn--secondary bt-btn--sm bt-navgroup-notlive" href="${esc(scheduleHref)}" data-ng-sched hidden>See the schedule</a>`;
}

/**
 * Play tile: today's Arcade game. best (e.g. "0:12.34") and bestNote ("Your best this week.") show the
 * member's score; without them the tile is a play call to action (signed out, or no score yet).
 */
export function playFeatureHtml({ title, href, best = "", bestNote = "", text = "Quick horror games with leaderboards.", cta = "Play" }) {
  return `<span class="bt-label">Today in the Arcade</span>
<strong>${esc(title)}</strong>
${best ? `<span class="bt-navgroup-score">${esc(best)}</span><p>${esc(bestNote)}</p>` : `<p>${esc(text)}</p>`}
<a class="bt-btn bt-btn--primary bt-btn--sm" href="${esc(href)}">${esc(cta)}</a>`;
}

/**
 * Community tile: Mod of the Month (the latest crew award; winners: [{ role, handle }]), or, with no
 * award yet, the Join the crew call to action with the mascot (mascotHtml, trusted markup).
 */
export function communityFeatureHtml({ month = "", winners = [], mascotHtml = "", crewHref = "/crew", joinHref = "/crew/join" } = {}) {
  if (winners.length) {
    return `<span class="bt-label">Mod of the Month</span>
<span class="bt-navgroup-medal" aria-hidden="true">🏅</span>
<strong>${esc(month)}</strong>
<p>${winners.map((w) => `${esc(w.role)}: <b>@${esc(w.handle)}</b>`).join("<br>")}</p>
<a class="bt-btn bt-btn--secondary bt-btn--sm" href="${esc(crewHref)}">Meet the crew</a>`;
  }
  return `<span class="bt-label">The crew</span>
<strong>Help keep the chats fun</strong>
<p>Volunteer mods for Twitch, YouTube and TikTok. No experience needed.</p>
<a class="bt-btn bt-btn--primary bt-btn--sm" href="${esc(joinHref)}">Join the crew</a>
${mascotHtml ? `<span class="bt-navgroup-mascot" aria-hidden="true">${mascotHtml}</span>` : ""}`;
}

const pad2 = (n) => String(n).padStart(2, "0");

/** A calendar file (.ics) for one stream. No end time: the start is all the schedule promises. */
export function streamIcs({ title, startsAt, url, name = "" }) {
  const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const txt = (s) => String(s).replace(/([\;,])/g, "\$1").replace(/\r?\n/g, "\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${txt(name || "Stream")}//Header nav//EN`, "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${stamp(startsAt)}-stream@${(() => { try { return new URL(url).hostname; } catch { return "localhost"; } })()}`,
    `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(startsAt)}`,
    `SUMMARY:${txt(name ? `${name}: ${title}` : title)}`, `URL:${url}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}

/**
 * Brings a Watch tile to life: a ticking countdown (days, hours, minutes, seconds) and an Add to
 * calendar button that downloads an .ics (no backend). When the start has passed, the countdown and the
 * calendar button give way to See the schedule. Returns { start, stop } so the tick only runs while the
 * panel is open.
 */
export function initWatchTile(tile, { title, startsAt, url = location.origin + "/live", name = "" }) {
  const at = new Date(startsAt).getTime();
  const count = tile.querySelector("[data-ng-count]");
  const cal = tile.querySelector("[data-ng-cal]");
  const sched = tile.querySelector("[data-ng-sched]");
  const past = () => Number.isNaN(at) || at <= Date.now();
  let timer = 0;
  const tick = () => {
    if (past()) { stop(); if (count) count.hidden = true; if (cal) cal.hidden = true; if (sched) sched.hidden = false; return; }
    let s = Math.floor((at - Date.now()) / 1000);
    const v = { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
    count?.querySelectorAll("[data-u]").forEach((el) => { el.textContent = pad2(v[el.dataset.u]); });
  };
  const start = () => { stop(); tick(); if (!past()) timer = setInterval(tick, 1000); };
  const stop = () => { clearInterval(timer); timer = 0; };
  if (cal && !cal.dataset.ngBound) {
    cal.dataset.ngBound = "1";
    cal.addEventListener("click", (e) => {
      e.preventDefault();
      const blob = new Blob([streamIcs({ title, startsAt, url, name })], { type: "text/calendar;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "stream.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
  }
  return { start, stop };
}
