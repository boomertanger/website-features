// shared/ui/chatgames.js — Chat Games' one entry point for the pages that host it (docs/specs/chat-games.md §3, §9). The Control Room (/live/control),
// the Mod Deck (/live/deck), the Bridge (/live) and the stream view (/live/obs) call only this; none of them hard-codes a game.
//
//   initChatGames({ call, toast, mascotHtml })   installs window.btChatGames and returns it (idempotent). `call(name, data)` runs a callable
//                                                 (the site passes lib/call.ts); `toast(text, { kind })` and `mascotHtml()` are the page's.
//   window.btChatGames = {
//     openLaunch({ formatId, streamId, title })   the format's launch dialog (openModal). A format without a launch form yet shows "Coming soon".
//     end({ runId, title })                       confirmAction, then chatGameEnd: a revealed run ends, anything earlier is voided (no XP).
//     mountPlay(el, { chatGame, ... })            the Play panel body on /live: the running game, or "Chat Games start when the Captain calls them";
//                                                 adds a "How Chat Games work" link (/live/chat-games) after el, once.
//     mountScene(el, { chatGame, display })       the stream view's Chat Games scene (display: obsFeed's chatGameDisplay); nothing when no game runs.
//   }
//   registerFormat(formatId, { launch, play, scene })   each format's part plugs its UI in here (Questions part 2, Hot Seat part 4, ...).
// Text is escaped. Reduced motion is handled by the kit pieces each format uses.
import { openModal, modalHeader } from "./modal.js";
import { confirmAction } from "./confirm.js";
import { escapeHtml as esc } from "./dom.js";

const formats = new Map();
let deps = { call: null, toast: null, mascotHtml: () => "" };

export function registerFormat(formatId, ui = {}) {
  if (typeof formatId === "string" && formatId) formats.set(formatId, { ...(formats.get(formatId) || {}), ...ui });   // parts merge (the scene module and the site module)
}

function openLaunch({ formatId = "", streamId = "", title = "" } = {}) {
  const ui = formats.get(formatId);
  if (ui && typeof ui.launch === "function") return ui.launch({ formatId, streamId, title, call: deps.call, toast: deps.toast });
  const name = title || formatId || "This game";
  const m = openModal({
    title: name, feature: "chat-games",
    content: modalHeader(esc(name), "Chat Games")
      + `<div class="bt-empty bt-empty--compact">${deps.mascotHtml ? deps.mascotHtml() : ""}<span class="bt-empty-title">Coming soon</span><span>${esc(name)} isn't ready to start yet. It switches on here when it ships.</span></div>`
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button></div>`,
  });
  return m;
}

async function end({ runId = "", title = "" } = {}) {
  if (!runId) return false;
  const done = await confirmAction({
    title: `End ${title || "this game"}?`, message: "It stops now for everyone. If nothing was revealed yet, nobody gets XP for it.",
    confirmLabel: "End game", busyLabel: "Ending…", danger: true, feature: "chat-games",
    onConfirm: async () => { if (!deps.call) throw new Error("Chat Games isn't connected on this page."); await deps.call("chatGameEnd", { runId }); },
  });
  if (done && deps.toast) deps.toast("Game ended");
  return done;
}

function mountPlay(el, opts = {}) {
  const { chatGame = null } = opts;
  if (!el) return;
  // the "How Chat Games work" link (docs/specs/chat-games.md §2, §14a), once, right after the Play panel's body (formats redraw el, not its sibling)
  if (!(el.nextElementSibling && el.nextElementSibling.hasAttribute("data-cg-how"))) el.insertAdjacentHTML("afterend", `<p class="bt-hint" data-cg-how><a href="/live/chat-games">How Chat Games work</a></p>`);
  const ui = chatGame && formats.get(chatGame.formatId);
  if (ui && typeof ui.play === "function") { ui.play(el, { ...opts, chatGame, call: deps.call, toast: deps.toast }); return; }
  el.innerHTML = chatGame
    ? `<div class="bt-empty bt-empty--compact"><span class="bt-live-tag"><i></i>On now</span><span class="bt-empty-title">${esc(chatGame.title || "A Chat Game")} is running</span><span>Play it here once this page has it.</span></div>`
    : `<div class="bt-empty bt-empty--compact">${deps.mascotHtml ? deps.mascotHtml() : ""}<span class="bt-empty-title">Chat Games start when the Captain calls them</span><span>Until then, say it in chat. The crew is listening.</span></div>`;
}

function mountScene(el, opts = {}) {
  const { chatGame = null } = opts;
  if (!el) return;
  const ui = chatGame && formats.get(chatGame.formatId);
  if (ui && typeof ui.scene === "function") { ui.scene(el, { ...opts, chatGame }); return; }
  for (const f of formats.values()) if (f && typeof f.scene === "function") f.scene(el, { chatGame: null, display: null });   // a format clears its own timers
  el.innerHTML = "";
}

export function initChatGames({ call = null, toast = null, mascotHtml = null } = {}) {
  deps = { call: call || deps.call, toast: toast || deps.toast, mascotHtml: mascotHtml || deps.mascotHtml };
  if (typeof window !== "undefined") window.btChatGames = window.btChatGames && window.btChatGames._cg ? window.btChatGames : { openLaunch, end, mountPlay, mountScene, _cg: true };
  return typeof window !== "undefined" ? window.btChatGames : { openLaunch, end, mountPlay, mountScene };
}
