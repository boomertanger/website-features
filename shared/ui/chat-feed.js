// shared/ui/chat-feed.js — .bt-chat-feed, the frame round an embedded chat on the Mod Deck (Mod Machina phase 3 part 3; docs/design-system.md §5 "Mod Deck pieces"): a head (platform tile, the
// room's name, its lead and viewers), a body, and a foot note. The page puts the real embed in the body ([data-embed], an iframe filling it); the kit never loads one. is-mine marks your room.
// --out is the link-out variant for TikTok (no chat embed exists): a sentence and a button. An empty feed shows the mascot and a line.
//
//   chatFeedHtml({ chat, name, lead, viewers, mine, bodyHtml, embed, foot })   a chat column; bodyHtml is the embed (an iframe), which fills the [data-embed] body; embed: false marks plain lines instead (the kit's demo
//        text, which gets the fading top edge); without bodyHtml the body is an empty [data-embed] frame
//   chatFeedOutHtml({ chat, name, lead, viewers, text, href, label, foot, mine })   the TikTok-style link-out column
//   chatFeedEmptyHtml({ chat, name, lead, viewers, mascotHtml, text, foot, mine })   nothing to show yet (the mascot and a line)
//   chatLinesHtml(lines)   demo lines for the kit page: [{ user, text, tone: "--bt-pink", kind: "mod" | "new" | "sys" }]
//   Text is escaped; arguments ending in Html are trusted markup.
import { escapeHtml as esc } from "./dom.js";
import { platformIconHtml } from "./crew.js";
import { PLATFORMS } from "./crew.js";

const head = ({ chat, name, lead, viewers }) => `<div class="bt-chat-feed-h">${platformIconHtml(chat)}${esc(name ?? PLATFORMS[chat]?.name ?? chat)}<small>${esc(lead || "no lead")}${viewers != null ? ` · ${esc(viewers)}` : ""}</small></div>`;
const wrap = (cls, mine, inner) => `<div class="bt-chat-feed${cls ? ` ${cls}` : ""}${mine ? " is-mine" : ""}">${inner}</div>`;

export function chatFeedHtml({ chat = "twitch", name, lead = null, viewers = null, mine = false, bodyHtml = "", embed = true, foot = "" } = {}) {
  const body = `<div class="bt-chat-feed-body"${embed || !bodyHtml ? " data-embed" : ""}>${bodyHtml}</div>`;
  return wrap("", mine, `${head({ chat, name, lead, viewers })}${body}${foot ? `<div class="bt-chat-feed-f">${esc(foot)}</div>` : ""}`);
}

export function chatFeedOutHtml({ chat = "tiktok", name, lead = null, viewers = null, text = "TikTok has no chat embed. Moderate from the TikTok app; this tile keeps the count.", href = "#", label = "Open TikTok LIVE", foot = "Links out", mine = false } = {}) {
  return wrap("bt-chat-feed--out", mine, `${head({ chat, name, lead, viewers })}<div class="bt-chat-feed-body"><p>${esc(text)}</p><a class="bt-btn bt-btn--secondary bt-btn--sm" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a></div><div class="bt-chat-feed-f">${esc(foot)}</div>`);
}

export function chatFeedEmptyHtml({ chat = "twitch", name, lead = null, viewers = null, mascotHtml = "", text = "The chat shows here when the stream is live.", foot = "", mine = false } = {}) {
  return wrap("", mine, `${head({ chat, name, lead, viewers })}<div class="bt-chat-feed-body bt-chat-feed-empty">${mascotHtml}<p>${esc(text)}</p></div>${foot ? `<div class="bt-chat-feed-f">${esc(foot)}</div>` : ""}`);
}

export function chatLinesHtml(lines = []) {
  return lines.map((l) => (l.kind === "sys" ? `<span class="bt-chat-feed-sys">${esc(l.text)}</span>` : `<p${l.kind === "mod" ? ' class="is-mod"' : l.kind === "new" ? ' class="is-new"' : ""}><b style="--u:var(${/^--bt-[a-z-]+$/.test(l.tone || "") ? l.tone : "--bt-primary-soft"})">${esc(l.user)}</b>${esc(l.text)}</p>`)).join("");
}
