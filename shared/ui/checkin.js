// shared/ui/checkin.js — .bt-checkin (the check-in card) and .bt-live-banner (the site-wide banner), docs/design-system.md §5
// "Control Room pieces", docs/specs/control-room.md §4. A check-in window is open for a few minutes per beat: the member types the
// word said on stream, confirms where they are watching, and the beat's stamp lands. Red is the open window's live colour
// (green backstage); "You're in" is green. Text is escaped; arguments ending in Html are trusted markup.
//
//   ROOMS / ROOM_KEYS    the five rooms, canonical names: twitch, ytLandscape, ytVertical, tiktok, site
//                        (labels Twitch, YouTube landscape, YouTube vertical, TikTok, On the site)
//   roomPickerHtml({ rooms, value, label })     .bt-checkin-rooms, a real radiogroup (roving tabindex, arrows, Home, End)
//   stampsHtml(stamps, label)                   the four beat stamps row (.bt-checkin-stamps)
//   checkinHtml({ state, beat, closesAt, lengthMs, time, count, id, wordLabel, value, tries, room, rooms, stamps, first,
//                 message, avatarHtml, xp, streak, title, text, countLabel })
//     state    "entry" (default) | "wrong" | "locked" | "success" | "visitor" | "closed"
//     beat     "start" | "break1" | "break2" | "end" (the live tag and "You're in for ..." use its name)
//     closesAt ms: the countdown ring and text tick to it (initCheckin); lengthMs the window's length (default 5 min)
//     time     fixed text instead of a ticking countdown ("4:31")
//     count    how many are checked in this beat;  tries  wrong tries left (wrong state);  stamps  { start, break1, break2, end } booleans
//     first    ["@gbo", ...] the first in;  value  the typed text;  room  the chosen room;  rooms  which rooms to offer
//     title / text  the heading and body of the locked and closed notes;  avatarHtml  the tile in the success row
//     dialog   true: the card without its panel chrome (no head, border or look), for use inside the check-in dialog, which looks the same
//              in every look
//   initCheckin(root, { onSubmit(word, room, el) })     wires every .bt-checkin under root: the form, the room radiogroup and the
//        countdown, which stops at closesAt (the form is disabled, "bt-checkin-closed" bubbles). onSubmit may return (or resolve to)
//        { ok: true } | { ok: false, left: 3 } | { locked: true } | { error: "text" }; the card shows the matching state.
//   applyCheckinResult(el, result)     the same, for a result that arrives some other way
//   setCheckinCount(el, n)             the "checked in this beat" number
//   fmtClock(ms)                       "4:31"
//   liveBannerHtml({ state, beat, closesAt, time, cta })    "open" (red, countdown and a Check in button) | "in" (green "You're in for Break 1")
//   initLiveBanner(root, { onCheckIn(banner) })   ticks the banner's countdown to closesAt and wires the button; also fires a bubbling
//        "bt-checkin-open" CustomEvent from the banner (the page opens the check-in dialog). At zero the banner gets .is-ended and hidden.
import { escapeHtml as esc } from "./dom.js";
import { platformIconHtml } from "./crew.js";
import { initRadioGroup } from "./pref.js";
import { BEAT_KEYS, BEAT_NAMES } from "./beats.js";
import { crPanelHeadHtml } from "./cr-panel.js";

export const ROOMS = {
  twitch: { label: "Twitch" },
  ytLandscape: { label: "YouTube landscape" },
  ytVertical: { label: "YouTube vertical" },
  tiktok: { label: "TikTok" },
  site: { label: "On the site" },
};
export const ROOM_KEYS = Object.keys(ROOMS);
const SITE_TILE = `<span class="bt-platform-icon bt-platform-icon--sm bt-platform-icon--site" aria-hidden="true">BT</span>`;
const roomIcon = (k) => (k === "site" ? SITE_TILE : platformIconHtml(k));
const CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>`;
const TICK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12l5 5 9-11"/></svg>`;
const STAMP_TEXT = { start: "S", break1: "B1", break2: "B2", end: "E" };
const DEFAULT_LEN = 5 * 60 * 1000;
let uid = 0;

export const fmtClock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function roomPickerHtml({ rooms = ROOM_KEYS.filter((k) => k !== "site"), value = "", label = "Where are you watching?" } = {}) {
  const list = rooms.filter((k) => ROOMS[k]);
  const chosen = list.includes(value) ? value : list.length === 1 ? list[0] : "";
  return `<div class="bt-checkin-rooms" role="radiogroup" aria-label="${esc(label)}">${list.map((k, i) => {
    const on = k === chosen;
    return `<button type="button" class="bt-checkin-room" role="radio" aria-checked="${on}" tabindex="${on || (!chosen && i === 0) ? 0 : -1}" data-value="${k}">${roomIcon(k)}${esc(ROOMS[k].label)}</button>`;
  }).join("")}</div>`;
}

export const stampsHtml = (stamps = {}, label = "Your beats tonight") =>
  `<div class="bt-checkin-stamps"><span>${esc(label)}</span>${BEAT_KEYS.map((k) => {
    const got = !!stamps[k];
    return `<span class="bt-checkin-stamp${got ? " is-got" : ""}" data-beat="${k}" title="${esc(BEAT_NAMES[k])}" role="img" aria-label="${esc(BEAT_NAMES[k])}: ${got ? "stamped" : "not yet"}">${got ? "✓" : STAMP_TEXT[k]}</span>`;
  }).join("")}</div>`;

export function checkinHtml({
  state = "entry", beat = "break1", closesAt = 0, lengthMs = DEFAULT_LEN, time = "", count = 0, id = "", wordLabel = "The word from the stream",
  value = "", tries = 5, room = "", rooms, stamps = {}, first = [], message = "", avatarHtml = "", xp = 10, streak = "stream streak safe tonight",
  title = "", text = "", countLabel = "checked in this beat", dialog = false,
} = {}) {
  const uidv = id || `bt-ci-${++uid}`;
  const name = BEAT_NAMES[beat] || BEAT_NAMES.break1;
  const isOpen = ["entry", "wrong", "success", "visitor"].includes(state);
  const left = closesAt ? Math.max(0, closesAt - Date.now()) : 0;
  const ringTime = time || (closesAt ? fmtClock(left) : fmtClock(lengthMs));
  const ringFrac = closesAt ? Math.min(1, left / lengthMs) : 1;
  const top = `<div class="bt-checkin-top"><div class="bt-checkin-ring" style="--ring:${ringFrac.toFixed(3)}" role="timer" aria-label="Time left to check in"><span data-cd>${esc(ringTime)}</span></div><div class="bt-checkin-count"><span data-bc>${esc(String(count))}</span><small>${esc(countLabel)}</small></div></div>`;
  const wrongMsg = `That's not tonight's word. ${tries} ${tries === 1 ? "try" : "tries"} left for this beat.`;
  const form = `<form class="bt-checkin-form" autocomplete="off" novalidate><label class="bt-label" for="${uidv}-word">${esc(wordLabel)}</label>`
    + `<div class="bt-checkin-word${state === "wrong" ? " is-wrong" : ""}"><input class="bt-input" id="${uidv}-word" name="word" maxlength="24" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="type it here" value="${esc(value)}" aria-describedby="${uidv}-msg"><button class="bt-btn bt-btn--primary" type="submit">Check in</button></div>`
    + `<p class="bt-checkin-msg${state === "wrong" ? " is-bad" : ""}" id="${uidv}-msg" aria-live="polite">${esc(state === "wrong" ? message || wrongMsg : message)}</p>`
    + `<span class="bt-label">Where are you watching?</span>${roomPickerHtml({ rooms, value: room })}</form>`;
  const note = (t, p) => `<div class="bt-checkin-note">${CLOCK}<div><b>${esc(t)}</b>${esc(p)}</div></div>`;
  let body;
  if (state === "closed") body = note(title || "Check-in is closed", text || "It opens when the next beat starts. Passive Twitch presence still counts toward your stream streak.");
  else if (state === "locked") body = note(title || "Locked for this beat", text || "5 wrong words. You get 5 fresh tries at the next beat. Your Twitch presence still counts toward your streak.");
  else if (state === "visitor") body = `${top}<div class="bt-checkin-form"><p class="bt-checkin-msg">Check in to earn XP and keep a stream streak. A free account is all it takes.</p><button type="button" class="bt-btn bt-btn--primary" data-signin="join">Join free to check in</button></div>`;
  else if (state === "success") body = `${top}<div class="bt-checkin-done"><span class="bt-checkin-done-ic" aria-hidden="true">${avatarHtml || TICK}</span><div><strong>You're in for ${esc(name)}</strong>+${Number(xp)} XP${streak ? ` · ${esc(streak)}` : ""}</div></div>`;
  else body = `${top}${form}`;
  const firstHtml = isOpen && first.length ? `<div class="bt-checkin-first">First in: ${first.map((h) => `<b>${esc(h)}</b>`).join(" ")}</div>` : "";
  const tag = isOpen ? `<span class="bt-live-tag"><i></i>${esc(name)}</span>` : "";
  return `<section class="${dialog ? "bt-checkin bt-checkin--dialog" : "bt-cr-panel bt-checkin"}${isOpen ? " is-open" : ""}" data-state="${esc(state)}" data-beat="${esc(beat)}"${closesAt ? ` data-closes="${Number(closesAt)}" data-length="${Number(lengthMs)}"` : ""} aria-label="Check in">`
    + `${dialog ? "" : crPanelHeadHtml({ title: "Check in", icon: "checkin", tagHtml: tag })}${body}${firstHtml}${state === "visitor" ? "" : stampsHtml(stamps)}</section>`;
}

/* ---------- behaviour ---------- */

// One shared tick for every countdown on the page (cards and banners); each entry removes itself when its element leaves the page or time is up.
const clocks = new Set();
let clockTimer = 0;
function runClocks() {
  const now = Date.now();
  clocks.forEach((c) => {
    if (!c.el.isConnected) { clocks.delete(c); return; }
    const left = c.closesAt - now;
    c.onTick(Math.max(0, left));
    if (left <= 0) { clocks.delete(c); c.onEnd(); }
  });
  if (!clocks.size) { clearInterval(clockTimer); clockTimer = 0; }
}
function addClock(c) {
  clocks.add(c);
  runClocks();
  if (clocks.size && !clockTimer) clockTimer = setInterval(runClocks, 500);
}

export function setCheckinCount(el, n) {
  el.querySelectorAll("[data-bc]").forEach((e) => { e.textContent = String(n); });
}

function say(el, text, bad) {
  const m = el.querySelector(".bt-checkin-msg");
  if (m) { m.textContent = text; m.classList.toggle("is-bad", !!bad); }
}

export function applyCheckinResult(el, r = {}) {
  const word = el.querySelector(".bt-checkin-word");
  if (r.ok) {
    const beat = BEAT_NAMES[el.dataset.beat] || "this beat";
    el.dataset.state = "success";
    const form = el.querySelector("form.bt-checkin-form");
    const done = document.createElement("div");
    done.className = "bt-checkin-done";
    done.innerHTML = `<span class="bt-checkin-done-ic" aria-hidden="true">${TICK}</span><div><strong>You're in for ${esc(beat)}</strong>+${Number(r.xp ?? 10)} XP${r.streak === false ? "" : ` · ${esc(r.streak || "stream streak safe tonight")}`}</div>`;
    form?.replaceWith(done);
    const st = el.querySelector(`.bt-checkin-stamp[data-beat="${el.dataset.beat}"]`);
    if (st) { st.classList.add("is-got", "is-new"); st.textContent = "✓"; st.setAttribute("aria-label", `${beat}: stamped`); }
    if (typeof r.count === "number") setCheckinCount(el, r.count);
  } else if (r.locked) {
    el.dataset.state = "locked";
    el.classList.remove("is-open");
    el.querySelector(".bt-checkin-top")?.remove();
    const note = document.createElement("div");
    note.className = "bt-checkin-note";
    note.innerHTML = `${CLOCK}<div><b>Locked for this beat</b>5 wrong words. You get 5 fresh tries at the next beat. Your Twitch presence still counts toward your streak.</div>`;
    el.querySelector("form.bt-checkin-form")?.replaceWith(note);
  } else if (r.error) {
    say(el, r.error, true);
  } else {
    el.dataset.state = "wrong";
    const left = Number(r.left ?? 0);
    say(el, `That's not tonight's word. ${left} ${left === 1 ? "try" : "tries"} left for this beat.`, true);
    word?.classList.remove("is-wrong");
    void word?.offsetWidth;
    word?.classList.add("is-wrong");
    el.querySelector("input[name=word]")?.select();
  }
}

export function initCheckin(root = document, { onSubmit } = {}) {
  root.querySelectorAll(".bt-checkin:not([data-ci-ready])").forEach((el) => {
    el.dataset.ciReady = "";
    const rooms = el.querySelector(".bt-checkin-rooms");
    const group = rooms ? initRadioGroup(rooms) : null;
    const form = el.querySelector("form.bt-checkin-form");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (el.classList.contains("is-ended")) return;
      const input = form.querySelector("input[name=word]");
      const word = input.value.trim();
      if (!word) { say(el, "Type the word first.", true); input.focus(); return; }
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const res = onSubmit ? await onSubmit(word, group?.get() ?? null, el) : { ok: false, left: 0 };
        applyCheckinResult(el, res || {});
      } catch { say(el, "Something went wrong. Try again.", true); }
      if (btn.isConnected && !el.classList.contains("is-ended")) btn.disabled = false;
    });
    const closes = Number(el.dataset.closes);
    if (closes) {
      const len = Number(el.dataset.length) || DEFAULT_LEN;
      const ring = el.querySelector(".bt-checkin-ring");
      addClock({
        el, closesAt: closes,
        onTick: (left) => {
          el.querySelectorAll("[data-cd]").forEach((e) => { e.textContent = fmtClock(left); });
          ring?.style.setProperty("--ring", Math.min(1, left / len).toFixed(3));
        },
        onEnd: () => {
          el.classList.add("is-ended");
          el.classList.remove("is-open");
          el.querySelectorAll("input, button[type=submit]").forEach((x) => { x.disabled = true; });
          if (el.dataset.state === "entry" || el.dataset.state === "wrong") say(el, "Check-in closed.", false);
          el.dispatchEvent(new CustomEvent("bt-checkin-closed", { bubbles: true }));
        },
      });
    }
  });
}

/* ---------- the site-wide banner ---------- */

export function liveBannerHtml({ state = "open", beat = "break1", closesAt = 0, time = "", cta = "Check in" } = {}) {
  const name = BEAT_NAMES[beat] || BEAT_NAMES.break1;
  const left = closesAt ? Math.max(0, closesAt - Date.now()) : 0;
  const t = time || (closesAt ? fmtClock(left) : "");
  const sep = `<span class="bt-live-banner-sep" aria-hidden="true">·</span>`;
  if (state === "in") {
    return `<div class="bt-live-banner" role="status" data-state="in"><span class="bt-live-banner-ic" aria-hidden="true">${TICK}</span><b>You're in for ${esc(name)}</b></div>`;
  }
  return `<div class="bt-live-banner" role="status" data-state="open"${closesAt ? ` data-closes="${Number(closesAt)}"` : ""}><span class="bt-live-banner-dot" aria-hidden="true"></span><b>Check-in is open</b>${sep}<span>${esc(name)}</span>${t ? `${sep}<span class="bt-live-banner-cd"><span data-cd>${esc(t)}</span> left</span>` : ""}<span class="bt-live-banner-sp"></span><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-checkin-open>${esc(cta)}</button></div>`;
}

export function initLiveBanner(root = document, { onCheckIn } = {}) {
  root.querySelectorAll(".bt-live-banner:not([data-lb-ready])").forEach((el) => {
    el.dataset.lbReady = "";
    el.querySelector("[data-checkin-open]")?.addEventListener("click", () => {
      onCheckIn?.(el);
      el.dispatchEvent(new CustomEvent("bt-checkin-open", { bubbles: true }));
    });
    const closes = Number(el.dataset.closes);
    if (closes) {
      addClock({
        el, closesAt: closes,
        onTick: (left) => el.querySelectorAll("[data-cd]").forEach((e) => { e.textContent = fmtClock(left); }),
        onEnd: () => { el.classList.add("is-ended"); el.hidden = true; el.dispatchEvent(new CustomEvent("bt-checkin-closed", { bubbles: true })); },
      });
    }
  });
}
