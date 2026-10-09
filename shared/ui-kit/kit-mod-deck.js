// shared/ui-kit/kit-mod-deck.js — the "Mod Deck" section of the UI Kit page (/dev/ui-kit): the seven Mod Deck pieces (Mod Machina phase 3 part 3; docs/specs/mod-machina.md section 17a; docs/design-system.md
// §5 "Mod Deck pieces", §8t) in every state, with its own Look switch (Hull map / CRT) that sets data-look on this section only. ui-kit.js appends modDeckKitHtml() to the page and calls initModDeckKit(mount).
// People, rooms and cues are examples only. The pieces are the kit's own builders in shared/ui: duty-bar.js, room-tile.js, chat-feed.js, prompt.js, flag-card.js, crew-notes.js and cue-card.js.
import { dutyBarHtml, initDutyBar } from "../ui/duty-bar.js";
import { roomTileHtml, roomTilesHtml } from "../ui/room-tile.js";
import { chatFeedHtml, chatFeedOutHtml, chatFeedEmptyHtml, chatLinesHtml } from "../ui/chat-feed.js";
import { promptHtml, initPrompt } from "../ui/prompt.js";
import { flagCardHtml, flagsHtml, initFlags } from "../ui/flag-card.js";
import { crewNotesHtml, initCrewNotes } from "../ui/crew-notes.js";
import { cueCardHtml, cueEmptyHtml, initCueCards } from "../ui/cue-card.js";
import { viewSwitchHtml, initViewSwitch } from "../ui/view-switch.js";
import { toast } from "../ui/toast.js";

export const MD_LOOKS = [{ value: "hull", icon: "🗺", label: "Hull map" }, { value: "crt", icon: "📺", label: "CRT" }];
const ME = { handle: "@gbo", grade: { track: "mod", grade: 3 }, avatarName: "GB" };
const CHAT = {
  twitch: [{ user: "ashgrave", text: "that chainsaw guy is BACK", tone: "--bt-pink" }, { user: "vexx", text: "reminder: no spoilers past chapter 6 please", tone: "--bt-teal", kind: "mod" }, { user: "ghoul_ivy", text: "boomer jumped so hard lmao", tone: "--bt-blue" }, { user: "newbie_23", text: "first time here, this is great", tone: "--bt-lime", kind: "new" }],
  yt: [{ user: "Mara K", text: "hello from portugal", tone: "--bt-blue" }, { user: "hollowgrin", text: "hi Mara! check-in link is pinned", tone: "--bt-teal", kind: "mod" }, { text: "No lead in this room · ×1.5 Gears", kind: "sys" }, { user: "Dree", text: "what difficulty is this", tone: "--bt-gold" }],
};
const NOTES = [
  { id: "n1", handle: "@nightowl", avatarName: "NO", grade: { track: "mod", grade: 4 }, age: "2 min", text: "Raid from a big channel likely at Break 2, be ready with welcomes", deletable: false },
  { id: "n2", handle: "@gbo", avatarName: "GB", grade: { track: "mod", grade: 3 }, age: "18 min", text: "I can cover Vertical for 20 min after the break", deletable: true },
  { id: "n3", handle: "@raven", avatarName: "RA", grade: { track: "admin", grade: 2 }, age: "1 h", text: "Pinned the rules in YouTube chat", deletable: true },
];
const CUE = { id: "c1", kicker: "Dead Air · clue 2", text: "Chat, the lights went out in the mortuary. Who heard the footsteps first? Type your guess with the word MORGUE.", due: "9:15 PM" };

const stage = (inner, note = "", { gap = true } = {}) => `<div class="kit-md-stage"${gap ? "" : ' style="padding-bottom:12px"'}>${inner}${note ? `<p class="bt-meta kit-md-note">${note}</p>` : ""}</div>`;
const popBar = () => dutyBarHtml({ ...ME, state: "on", line: "Room Lead · Twitch", minutes: 22 }).replace(/<\/div>$/, "") + `<div class="bt-duty-away" role="dialog" aria-label="Step away"><b>Step away</b><p>Deckhands in your room get “Take the lead?” and you get the room back when you return.</p><div class="bt-duty-away-opts"><button type="button" data-away="5">5 min</button><button type="button" data-away="15">15 min</button><button type="button" data-away="30">30 min</button></div><button type="button" class="bt-btn bt-btn--secondary" data-away="done">I'm done for tonight</button></div></div>`;

function dutyBarKit() {
  return `
    <p class="kit-sub">Duty bar (.bt-duty-bar, dutyBarHtml, initDutyBar in shared/ui/duty-bar.js): your role, room and minutes. The ring turns lime with a tick at 60 minutes ("Duty counted"). States: off (Clock in), on, on and counted, away (gold). Step away opens a popover: Escape, a click outside or another overlay (bt:overlay-open) closes it. Pinned to the bottom by the page on phones</p>
    <div class="kit-md-grid kit-md-grid--wide">
      ${stage(dutyBarHtml({ ...ME, state: "off", line: "Room Lead · Twitch, your seat tonight" }), "Off: not clocked in", { gap: false })}
      ${stage(`<div data-kit-duty>${dutyBarHtml({ ...ME, state: "on", line: "Room Lead · Twitch", minutes: 22 })}</div>`, "On, 22 minutes (try Step away, Flag and the popover)", { gap: false })}
      ${stage(dutyBarHtml({ ...ME, state: "on", line: "Stream Captain · Twitch Lead", minutes: 74 }), "On, counted: the ring is lime with a tick", { gap: false })}
      ${stage(dutyBarHtml({ ...ME, state: "away", awayText: "Stepped away · back in 14:32 · @nightowl has the lantern" }), "Away: gold, with I'm back", { gap: false })}
      ${stage(`<div style="margin-bottom:170px">${popBar()}</div>`, "The Step away chooser, open")}
    </div>`;
}

function roomTileKit() {
  return `
    <p class="kit-sub">Room tile (.bt-room-tile in .bt-room-tiles, roomTileHtml in shared/ui/room-tile.js): data-state covered (lime top edge), needed (GOLD: "Lead needed", with Take the lead), off (dimmed); is-mine is the purple edge; the boost tag is gold; the ✎ types TikTok's count</p>
    ${roomTilesHtml([
      roomTileHtml({ chat: "twitch", name: "Twitch", state: "covered", lead: "@gbo", deckhands: ["@nightowl"], viewers: 212, mine: true }),
      roomTileHtml({ chat: "ytLandscape", name: "YouTube", state: "covered", boost: "×1.5", lead: "@hollowgrin", deckhands: 0, note: "also watching Vertical", viewers: 88 }),
      roomTileHtml({ chat: "ytVertical", name: "YT Vertical", state: "needed", boost: "×1.5", lead: null, deckhands: 0, viewers: 41, take: true }),
      roomTileHtml({ chat: "tiktok", name: "TikTok", state: "covered", lead: "@mothlight", deckhands: 1, viewers: 17, editViewers: true }),
    ].join(""))}
    ${roomTilesHtml([
      roomTileHtml({ chat: "twitch", name: "Twitch", state: "needed", lead: null, deckhands: 2, viewers: 212 }),
      roomTileHtml({ chat: "tiktok", name: "TikTok", state: "off" }),
    ].join(""))}`;
}

function chatFeedKit(mascotHtml) {
  const f = (inner) => `<div class="kit-md-feeds" style="--bt-feed-h:190px">${inner}</div>`;
  return `
    <p class="kit-sub">Chat feed (.bt-chat-feed, chatFeedHtml, chatFeedOutHtml, chatFeedEmptyHtml in shared/ui/chat-feed.js): the frame round an embedded chat. The page puts the iframe in the body ([data-embed], filling it). is-mine is your room; --out links out (TikTok has no chat embed); an empty feed shows the mascot. The lines here are demo text</p>
    ${f(`${chatFeedHtml({ chat: "twitch", name: "Twitch", lead: "@gbo", viewers: 212, mine: true, bodyHtml: chatLinesHtml(CHAT.twitch), embed: false, foot: "Embedded Twitch chat · you type here as yourself" })}${chatFeedHtml({ chat: "ytLandscape", name: "YouTube", lead: "@hollowgrin", viewers: 88, bodyHtml: chatLinesHtml(CHAT.yt), embed: false, foot: "Embedded YouTube chat" })}${chatFeedOutHtml({ chat: "tiktok", name: "TikTok", lead: "@mothlight", viewers: 17 })}`)}
    ${f(`${chatFeedHtml({ chat: "ytVertical", name: "YT Vertical", lead: null, viewers: 41, foot: "An empty embed frame: the page puts the iframe here" })}${chatFeedEmptyHtml({ chat: "twitch", name: "Twitch", lead: "@gbo", mascotHtml, text: "The chat shows here when the stream is live.", foot: "Off air" })}`)}`;
}

function promptKit() {
  const at = (s) => Date.now() + s * 1000;
  return `
    <p class="kit-sub">Prompt (.bt-prompt, promptHtml and initPrompt in shared/ui/prompt.js): the gold timed prompt. The ring and the time run from a deadline, every second, and call back once at zero (the buttons lock). role="alertdialog"; focus moves to the primary button when it appears (off here, so the page does not jump). A swinging lantern for a handoff, a gear and crown for acting Captain. Still under reduced motion</p>
    <div class="kit-md-grid">
      <div data-kit-prompt="handoff">${promptHtml({ id: "k-p1", kind: "handoff", kicker: "Pass the lantern", title: "Take the lead in YouTube?", text: "@hollowgrin stepped away for 15 min. You hold the room until they are back. +5 Gears for taking over.", deadline: at(86) })}</div>
      <div data-kit-prompt="acting">${promptHtml({ id: "k-p2", kind: "acting", kicker: "Nobody is at the helm", title: "Be acting Captain tonight?", text: "No Captain is seated. You are the highest-grade crew on duty. A seated Captain who clocks in takes over.", deadline: at(110) })}</div>
      <div data-kit-prompt="captain">${promptHtml({ id: "k-p3", kind: "captain", kicker: "The Captain stepped away", title: "Take the Captain's seat?", text: "@nightowl is away for 5 minutes. You are the highest-grade Room Lead on duty.", deadline: at(45), total: 120000, acceptLabel: "Take the seat" })}</div>
      <div data-kit-prompt="out">${promptHtml({ id: "k-p4", kind: "handoff", kicker: "Pass the lantern", title: "Take the lead in Twitch?", text: "Ran out: the buttons are locked and the ring is empty.", deadline: Date.now() - 1000, inline: true })}</div>
    </div>
    <div class="kit-row"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kit-prompt-restart>Restart the countdowns</button><span class="bt-meta">Docked (is-inline) on phones: the last card</span></div>`;
}

function flagKit() {
  const a = flagCardHtml({ id: "f1", type: "Personal info", urgent: true, room: "YT Vertical", by: "@hollowgrin", ago: "1 min ago", note: "Someone posted what looks like a home address. I deleted it and hid the user; screenshot saved.", extra: "also sent to admins on duty" });
  const b = flagCardHtml({ id: "f2", type: "Raid", room: "Twitch", by: "@vexx", ago: "6 min ago", note: "Raid incoming from a channel with about 40 viewers, they seem friendly." });
  return `
    <p class="kit-sub">Flag card (.bt-flag-card in .bt-flags, flagCardHtml, flagsHtml, initFlags in shared/ui/flag-card.js): the gold flag to the owner. is-new rings and waves its flag, is-seen settles; the Urgent tag; the stack with the "Tap to turn on sound" line. Gold, never red. Got it and Done work here</p>
    <div class="kit-md-grid">
      <div data-kit-flags>${flagsHtml(a + b, { soundOff: true })}</div>
      <div class="kit-stack">${flagsHtml(flagCardHtml({ id: "f3", type: "Harassment", room: "Twitch", by: "@vexx", ago: "20 min ago", state: "seen", note: "A viewer keeps targeting a mod. Banned and noted." }))}<p class="bt-meta">Seen: Got it is gone, only Done is left</p></div>
    </div>`;
}

function notesKit() {
  return `
    <p class="kit-sub">Crew notes (.bt-crew-notes, crewNotesHtml and initCrewNotes in shared/ui/crew-notes.js, NOT .bt-notes, which is the Warm Fuzzies pinboard): note rows with handle, grade chip and age, and the add row (200 characters). Authors delete their own, admins any. Post one</p>
    <div class="kit-md-grid">
      <div class="bt-cr-panel kit-md-panel" data-kit-notes>${crewNotesHtml({ notes: NOTES })}</div>
      <div class="bt-cr-panel kit-md-panel">${crewNotesHtml({ notes: [] })}<p class="bt-meta" style="margin-top:8px">Empty</p></div>
      <div class="bt-cr-panel kit-md-panel">${crewNotesHtml({ notes: NOTES.slice(0, 1), canPost: false })}<p class="bt-meta" style="margin-top:8px">Read only (no add row)</p></div>
    </div>`;
}

function cueKit(mascotHtml) {
  return `
    <p class="kit-sub">Cue card (.bt-cue-card, cueCardHtml, cueEmptyHtml and initCueCards in shared/ui/cue-card.js): a Chat Games cue for your room. Copy turns into "Copied"; due time in gold; Posted then Done. States: pending, posted (lime tag, only Done left), done (muted), read-only (Deckhands: no buttons), and the empty slot. Chat Games fills this slot; the Deck never changes when a game ships</p>
    <div class="kit-md-grid" data-kit-cues>
      ${cueCardHtml({ ...CUE })}
      ${cueCardHtml({ id: "c2", kicker: "Scream Off · round 1", text: "Post your loudest scream emote in chat. Highest room score wins.", state: "pending" })}
      ${cueCardHtml({ id: "c3", kicker: "Dead Air · clue 1", text: "The first clue: the clock stopped at 3:07.", due: "9:00 PM", state: "posted" })}
      ${cueCardHtml({ id: "c4", kicker: "Would You Rather", text: "Would you rather fight one horse-sized duck or a hundred duck-sized horses?", state: "done" })}
      ${cueCardHtml({ id: "c5", kicker: "Dead Air · clue 2", text: "Chat, who heard the footsteps first?", due: "9:15 PM", readonly: true })}
      ${cueEmptyHtml({ mascotHtml })}
    </div>`;
}

export function modDeckKitHtml({ mascotHtml = "" } = {}) {
  return `
  <section class="kit-section" id="kit-mod-deck" data-kit-md data-look="hull">
    <h2 class="kit-h">Mod Deck</h2>
    <p class="kit-p">The seven pieces of the Mod Deck at /live/deck (<span class="kit-code">docs/specs/mod-machina.md</span> §17a, mockups <span class="kit-code">docs/design/mockups/mod-deck.html</span>, design-system §5 "Mod Deck pieces" and §8t). Each piece is shown in every state, and in both looks. A look restyles surfaces, frames and motion only: gold stays needed, prompts and flags; lime stays done and counted; purple stays clickable; nothing here is red. (The swap board row, .bt-swap, is under Mod Machina.)</p>
    <div class="kit-row"><span class="bt-meta">Look</span>${viewSwitchHtml({ key: "look", label: "Look", value: "hull", options: MD_LOOKS })}</div>
    ${dutyBarKit()}
    ${roomTileKit()}
    ${chatFeedKit(mascotHtml)}
    ${promptKit()}
    ${flagKit()}
    ${notesKit()}
    ${cueKit(mascotHtml)}
  </section>`;
}

export function initModDeckKit(mount) {
  const sec = mount.querySelector("#kit-mod-deck");
  if (!sec) return;
  initViewSwitch(sec, { onChange: (v, key) => { if (key === "look") sec.dataset.look = v; } });
  // duty bar: the live demo
  const duty = sec.querySelector("[data-kit-duty]");
  if (duty) initDutyBar(duty, { lead: true, onAway: (k) => toast(k === "done" ? "Clocked out. Thanks for tonight." : `Stepped away for ${k} minutes. Your minutes pause.`), onFlag: () => toast("Flag to Boomer opens a dialog here.", { kind: "info" }) });
  // prompts: counting down, replayable
  const prompts = () => [...sec.querySelectorAll("[data-kit-prompt]")];
  const startPrompts = () => prompts().forEach((w) => { const p = w.querySelector(".bt-prompt"); if (!p) return; p._prompt?.stop(); p._prompt = null; const fresh = Number(p.dataset.deadline) > Date.now(); initPrompt(p, { focus: false, onAccept: () => toast(w.dataset.kitPrompt === "handoff" ? "You have the lead. +5 Gears." : "Yours.", { kind: "ok" }), onDecline: () => toast("Not now. It goes to the next person.", { kind: "info" }), onExpire: () => { if (fresh) toast("The prompt ran out.", { kind: "info" }); } }); });
  startPrompts();
  sec.querySelector("[data-kit-prompt-restart]")?.addEventListener("click", () => {
    const secs = { handoff: 86, acting: 110, captain: 45 };
    prompts().forEach((w) => {
      const el = w.querySelector(".bt-prompt"), k = w.dataset.kitPrompt; if (!el || !(k in secs)) return;
      el.querySelectorAll("button").forEach((b) => { b.disabled = false; });
      el.dataset.deadline = String(Date.now() + secs[k] * 1000);
    });
    startPrompts();
  });
  // flags
  const flags = sec.querySelector("[data-kit-flags]");
  if (flags) initFlags(flags, {
    onSeen: (id) => { const c = flags.querySelector(`[data-flag="${id}"]`); if (c) { c.classList.replace("is-new", "is-seen"); c.querySelector("[data-flag-seen]")?.remove(); const s = c.querySelector(".bt-flag-main small"); if (s) s.textContent += " · seen by you"; } toast("Seen by you. The flagger will see \"Seen by Boomer\".", { kind: "info" }); },
    onDone: (id) => { flags.querySelector(`[data-flag="${id}"]`)?.remove(); toast("Flag closed.", { kind: "info" }); },
    onSound: () => { flags.querySelector(".bt-flags-sound")?.remove(); toast("Sound is on.", { kind: "ok" }); },
  });
  // crew notes
  const notes = sec.querySelector("[data-kit-notes]");
  if (notes) initCrewNotes(notes, {
    onPost: (text) => { const list = notes.querySelector(".bt-crew-notes"); const add = list.querySelector(".bt-crew-notes-add"); const tmp = document.createElement("div"); tmp.innerHTML = crewNotesHtml({ notes: [{ id: `n${Date.now()}`, handle: ME.handle, avatarName: ME.avatarName, grade: ME.grade, age: "now", text, deletable: true }], canPost: false }); const row = tmp.querySelector(".bt-crew-note"); list.querySelector(".bt-crew-notes-empty")?.remove(); list.insertBefore(row, list.querySelector(".bt-crew-note")); void add; },
    onDelete: (id) => { notes.querySelector(`[data-note="${id}"]`)?.remove(); },
  });
  // cues: Posted and Done change the state
  const cues = sec.querySelector("[data-kit-cues]");
  if (cues) initCueCards(cues, {
    onPosted: (id) => { const c = cues.querySelector(`[data-cue="${id}"]`); if (!c) return; const text = c.querySelector("[data-cue-text]").textContent, kicker = c.querySelector(".bt-cue-kicker").textContent, due = (c.querySelector(".bt-cue-due")?.textContent || "").replace(/^Due /, ""); c.outerHTML = cueCardHtml({ id, kicker, text, due, state: "posted" }); },
    onDone: (id) => { const c = cues.querySelector(`[data-cue="${id}"]`); if (!c) return; const text = c.querySelector("[data-cue-text]").textContent, kicker = c.querySelector(".bt-cue-kicker").textContent; c.outerHTML = cueCardHtml({ id, kicker, text, state: "done" }); },
  });
}
