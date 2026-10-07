// shared/ui/chat-tile.js — .bt-chat-tile, a chat card for the crew's per-chat choice (docs/design-system.md §5 "Story
// page pieces"; "Which chats would you help in?" on Join). The same four-way choice and values as .bt-pref
// (shared/ui/pref.js, which /crew/profile still uses), as a tile with a platform icon, an optional "Most needed" ribbon
// and a mini chat preview. The choice is a real radio group (role="radiogroup", roving tabindex, arrows / Home / End
// move and choose) by way of initRadioGroup. The tile's data-value follows the choice and styles it.
//
//   chatTileHtml({ chat, name, iconHtml, value, needed, boost, previewHtml, note })
//     chat        the data key (twitch, ytLandscape, ytVertical, tiktok)
//     value       favourite | happy | ifNeeded | no ("" = nothing chosen yet)
//     needed      gold edge and "Most needed" ribbon; boost (1.5) adds "· ×1.5" to the ribbon
//     previewHtml the mini chat (chatPreviewHtml(messages)); note is the small line under the name
//   chatPreviewHtml(messages)   messages: [{ user, text, tone }] (tone: blue, gold, lime or teal; pink by default)
//                               or [{ text, quiet: true }] for an italic system line. Text is escaped.
//   initChatTiles(root, { onChange(chat, value) })  wires every .bt-chat-tile; also fires a bubbling
//                                                   "bt-chat-tile-change" CustomEvent { detail: { chat, value } }
import { escapeHtml as esc } from "./dom.js";
import { PREF_OPTIONS, initRadioGroup } from "./pref.js";

const SHORT = { favourite: "Favourite", happy: "Happy to help", ifNeeded: "Only if needed", no: "No" };

export function chatPreviewHtml(messages = []) {
  return messages.map((m) => m.quiet
    ? `<span class="is-quiet">${esc(m.text)}</span>`
    : `<span${m.tone ? ` class="is-${esc(m.tone)}"` : ""}><b>${esc(m.user)}</b>${esc(m.text)}</span>`).join("");
}

export function chatTileHtml({ chat = "", name = "", iconHtml = "", value = "", needed = false, boost = 0, previewHtml = "", note = "" } = {}) {
  const buttons = PREF_OPTIONS.map((o, i) => {
    const on = o.value === value;
    return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on || (!value && i === 0) ? 0 : -1}" data-value="${o.value}">${SHORT[o.value] ?? esc(o.label)}</button>`;
  }).join("");
  const ribbon = needed ? `<span class="bt-badge bt-badge--gold bt-chat-tile-flag">Most needed${boost ? ` · ×${esc(boost)}` : ""}</span>` : "";
  return `<div class="bt-chat-tile${needed ? " is-needed" : ""}" data-chat="${esc(chat)}"${value ? ` data-value="${esc(value)}"` : ""}>${ribbon}`
    + `<div class="bt-chat-tile-h">${iconHtml}<span><b>${esc(name)}</b>${note ? `<small>${esc(note)}</small>` : ""}</span></div>`
    + (previewHtml ? `<div class="bt-chat-tile-mini" aria-hidden="true">${previewHtml}</div>` : "")
    + `<div class="bt-chat-tile-pick" role="radiogroup" aria-label="${esc(name)} preference">${buttons}</div></div>`;
}

export function initChatTiles(root = document, { onChange } = {}) {
  root.querySelectorAll(".bt-chat-tile:not([data-tile-ready])").forEach((tile) => {
    tile.dataset.tileReady = "";
    initRadioGroup(tile.querySelector(".bt-chat-tile-pick"), {
      onChange: (value) => {
        tile.dataset.value = value;
        const chat = tile.dataset.chat ?? "";
        onChange?.(chat, value);
        tile.dispatchEvent(new CustomEvent("bt-chat-tile-change", { bubbles: true, detail: { chat, value } }));
      },
    });
  });
}
