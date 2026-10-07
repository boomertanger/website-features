// shared/ui/crew.js — Mod Machina markup builders (docs/design-system.md §5 "Mod Machina pieces", §8m;
// docs/specs/mod-machina.md §12, §16). Each returns a markup string, like the other *Html helpers; text is
// escaped, `*Html` arguments are trusted markup (use gradeChipHtml, medalHtml, platformIconHtml for them).
//
//   PLATFORMS                       the four chats the crew moderates: twitch, ytLandscape, ytVertical, tiktok
//   platformIconHtml(chat, { logo }) a small .bt-platform-icon--sm tile (logo: a URL for the real mark)
//   roomHtml({ chat, name, state, text, logo })      .bt-room: state "covered" | "needed" | "off"
//   crewCardHtml({ name, handle, href, avatar, gradeHtml, staff, onBreak, chats, meta })   .bt-crew-card
//        chats: { twitch: "favourite" | "happy" | "ifNeeded" | "no", ytLandscape, ytVertical, tiktok }
//   podiumHtml({ places })           .bt-podium, places: [{ rank, name, handle, avatar, gradeHtml, value, unit, sub }]
//   timecardHtml({ month, need, slots, state, bonusHtml, foot, badge })   .bt-timecard
//   ringHtml({ value, centre, caption, label, size, done })               .bt-ring (value 0-100)
import { escapeHtml as esc, initials } from "./dom.js";

export const PLATFORMS = {
  twitch: { key: "twitch", tile: "TW", name: "Twitch" },
  ytLandscape: { key: "youtube", tile: "YT", name: "YouTube landscape", orient: "l" },
  ytVertical: { key: "youtube", tile: "YT", name: "YouTube vertical", orient: "v" },
  tiktok: { key: "tiktok", tile: "TT", name: "TikTok" },
};
const PREF_NAME = { favourite: "favourite", happy: "happy to help", ifNeeded: "only if needed", no: "no" };

export function platformIconHtml(chat, { logo = "" } = {}) {
  const p = PLATFORMS[chat] || PLATFORMS.twitch;
  const or = p.orient ? `<span class="bt-platform-or is-${p.orient}" aria-hidden="true"><i></i></span>` : "";
  return `<span class="bt-platform-icon bt-platform-icon--${p.key} bt-platform-icon--sm${logo ? " has-logo" : ""}" title="${esc(p.name)}" aria-hidden="true">${logo ? `<img alt="" src="${esc(logo)}">` : p.tile}${or}</span>`;
}

const ROOM_TEXT = { covered: "covered", needed: "needs help", off: "off" };
export function roomHtml({ chat = "twitch", name, state = "covered", text, logo = "" } = {}) {
  const s = ROOM_TEXT[state] ? state : "covered";
  return `<span class="bt-room" data-state="${s}">${platformIconHtml(chat, { logo })}${esc(name ?? PLATFORMS[chat]?.name ?? chat)} <small>${esc(text ?? ROOM_TEXT[s])}</small></span>`;
}

function avatarHtml(name, avatar, cls = "bt-avatar-md") {
  return avatar
    ? `<span class="${cls}" aria-hidden="true"><img src="${esc(avatar)}" alt=""></span>`
    : `<span class="${cls}" aria-hidden="true">${esc(initials(name))}</span>`;
}

export function crewCardHtml({ name = "", handle = "", href = "", avatar = "", gradeHtml = "", staff = false, onBreak = false, chats = null, meta = "" } = {}) {
  const who = `<b>${esc(name)}</b>${handle ? `<small>@${esc(handle)}</small>` : ""}`;
  const tags = `${gradeHtml}${staff ? `<span class="bt-badge bt-badge--admin">Staff</span>` : ""}${onBreak ? `<span class="bt-badge bt-badge--gray">On a break</span>` : ""}`;
  const plats = chats
    ? `<span class="bt-crew-plats">${Object.keys(PLATFORMS).filter((c) => chats[c]).map((c) => `<span class="bt-crew-plat${chats[c] === "favourite" ? " is-fav" : ""}${chats[c] === "no" ? " is-no" : ""}">${platformIconHtml(c)}<span class="bt-sr-only">${esc(PLATFORMS[c].name)}: ${PREF_NAME[chats[c]] || ""}</span></span>`).join("")}</span>`
    : "";
  const top = `<div class="bt-crew-card-top">${avatarHtml(name, avatar)}<span class="bt-crew-card-name">${href ? `<a href="${esc(href)}">${who}</a>` : who}</span></div>`;
  return `<div class="bt-tile bt-crew-card${onBreak ? " is-reserve" : ""}">${top}${tags ? `<div class="bt-crew-card-row">${tags}</div>` : ""}${plats || meta ? `<div class="bt-crew-card-row">${plats}${meta ? `<span class="bt-crew-card-meta">${esc(meta)}</span>` : ""}</div>` : ""}</div>`;
}

export function podiumHtml({ places = [], label = "Top three" } = {}) {
  const by = Object.fromEntries(places.map((p) => [p.rank, p]));
  const card = (p) => `<div class="bt-tile bt-podium-card" data-r="${p.rank}">`
    + `<span class="bt-podium-rank" aria-label="Place ${p.rank}">${p.rank}</span>${avatarHtml(p.name, p.avatar)}`
    + `<span class="bt-podium-mid"><b>${esc(p.name)}</b>${p.gradeHtml || ""}</span>`
    + `<span class="bt-podium-val">${esc(p.value)}${p.unit ? `<small>${esc(p.unit)}</small>` : ""}</span>${p.sub ? `<span class="bt-podium-sub">${esc(p.sub)}</span>` : ""}</div>`;
  return `<div class="bt-podium" role="group" aria-label="${esc(label)}">${[2, 1, 3].filter((r) => by[r]).map((r) => card(by[r])).join("")}</div>`;
}

const TC_STATE = {
  normal: ["lime", "Active"], behind: ["gold", "Behind"], done: ["lime", "Active · On the Clock earned"], idle: ["gray", "Starts with stream duty"],
};
// slots: the duties punched so far, [{ stamp: "Oct 3", text: "YT vertical · 2 h" }]; need: duties required (2); total
// slots drawn (4). Slot need+1.. are "Extra"; the last is the dashed bonus slot and shows bonusHtml (a medal) unless punched.
export function timecardHtml({ month = "", need = 2, total = 4, slots = [], state, bonusHtml = "", foot, badge } = {}) {
  const n = slots.length;
  const st = state || (n >= total ? "done" : n >= need ? "normal" : "behind");
  const idle = st === "idle";
  const cells = Array.from({ length: total }, (_, i) => {
    const s = slots[i];
    if (s) return `<div class="bt-timecard-slot is-punched"><span class="bt-timecard-stamp">${esc(s.stamp)}</span><small>${esc(s.text || "")}</small></div>`;
    if (i === total - 1) return `<div class="bt-timecard-slot is-bonus">${bonusHtml}<small>${total} = On the Clock</small></div>`;
    return `<div class="bt-timecard-slot${i >= need ? " is-bonus" : ""}"><span class="bt-timecard-n">${i + 1}</span><small>${i < need ? "Needed" : "Extra"}</small></div>`;
  }).join("");
  const [tone, defText] = TC_STATE[st] || TC_STATE.normal;
  const b = badge ?? defText;
  const f = foot ?? (idle ? "Duties and hours show here once stream duty opens." : `<span><b>${n} of ${need}</b> duties${n > need ? ` · ${n - need} extra` : ""}</span>`);
  return `<div class="bt-timecard" data-state="${st}"><div class="bt-timecard-head"><b>${esc(month)}${month ? " · " : ""}time card</b><span class="bt-badge bt-badge--${tone}"><span class="bt-badge-dot"></span>${esc(b)}</span></div>`
    + `<div class="bt-timecard-slots">${cells}</div><div class="bt-timecard-foot">${idle ? esc(f) : f}</div></div>`;
}

export function ringHtml({ value = 0, centre = "", caption = "", label = "", size = "", done = false } = {}) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return `<span class="bt-ring${size === "sm" ? " bt-ring--sm" : ""}${done ? " bt-ring--done" : ""}" style="--v:${v}" role="img" aria-label="${esc(label || `${Math.round(v)}%`)}"><span class="bt-ring-c" aria-hidden="true"><b>${esc(centre || `${Math.round(v)}%`)}</b>${caption ? `<small>${esc(caption)}</small>` : ""}</span></span>`;
}
