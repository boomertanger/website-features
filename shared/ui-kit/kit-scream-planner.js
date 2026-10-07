// shared/ui-kit/kit-scream-planner.js — the "Scream Planner" section of the UI Kit page (/dev/ui-kit): every piece in
// every state (docs/design-system.md §5 "Scream Planner pieces", docs/specs/scream-planner.md §13). ui-kit.js appends
// screamPlannerKitHtml() to the page and calls initScreamPlannerKit(mount). People, games and numbers are examples only.
import { coverHtml } from "../ui/cover.js";
import { platformIconHtml } from "../ui/crew.js";
import { SP_ICON, themeChipHtml, velvetHtml, platformsHtml, avatarsHtml, srcHtml, dualTimeHtml } from "../ui/scream-planner.js";
import { ticketHtml, initTickets } from "../ui/ticket.js";
import { FRAMES, SEASONAL, marqueeHtml, miniMarqueeHtml, flipClockHtml, initFlipClocks, setMarqueeFrame, frameName, rollFrame } from "../ui/marquee.js";
import { dropsHtml, tokensHtml, voteBtnHtml, voteCardHtml, raceRowHtml, voteAddHtml, initVoteButtons, fuseHtml } from "../ui/vote.js";
import { slotHtml, slotOffHtml, roomsMiniHtml, trayHtml, initTray } from "../ui/slot.js";
import { triHtml, initTri } from "../ui/tri.js";
import { posterHtml, posterAddHtml } from "../ui/poster.js";
import { DOOR_STYLES, doorHtml, doorsHtml, doorStateFor, setDoorStyle, initDoors, rollDoorStyle } from "../ui/doors.js";
import { sliderHtml, initSlider } from "../ui/slider.js";
import { viewSwitchHtml, initViewSwitch, WEEK_VIEWS, VOTE_VIEWS } from "../ui/view-switch.js";
import { burst, celebrate, flyTo } from "../ui/burst.js";

// stand-in cover art, drawn from a hue (the real pages pass the Vault cover)
const art = (title, h) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><defs><radialGradient id="g" cx=".5" cy=".3" r=".7"><stop offset="0" stop-color="hsl(${h} 70% 38%)"/><stop offset="1" stop-color="hsl(${h} 35% 6%)"/></radialGradient></defs><rect width="300" height="400" fill="url(#g)"/><circle cx="150" cy="130" r="48" fill="hsl(${h} 90% 70%)" opacity=".5"/><text x="18" y="368" font-family="Arial Black,Arial,sans-serif" font-size="30" font-weight="900" fill="white">${title.toUpperCase().slice(0, 14)}</text></svg>`;
  return { source: "upload", url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
};
const G = { granny2: ["Granny 2", 20], granny3: ["Granny 3", 340], shf: ["Soul Hunt", 280], ln3: ["Lethal Night", 200], iron: ["Iron Lung", 0], lethal: ["Dead Drop", 120], vr: ["Dark Room VR", 250] };
const cov = (k, cls = "") => coverHtml(art(G[k][0], G[k][1]), { alt: G[k][0], cls, eager: true });
const T = (k) => G[k][0];

const NOW = Date.now(), H = 3600000;
const at = (hrs) => new Date(NOW + hrs * H).toISOString();
const BASE = Date.parse("2026-10-07T19:00:00-05:00");   // fixed, so the examples read the same every day
const dt = (startH, lenH, was) => dualTimeHtml({ start: new Date(BASE + Math.round(startH) * H), end: new Date(BASE + Math.round(startH + lenH) * H), was, localTz: "America/Los_Angeles" });

function ticketsKit() {
  const t = (o) => ticketHtml({ day: "Wed", num: 7, month: "Oct", icon: "👵", title: "Granny day", timeHtml: dt(30, 2), coversHtml: cov("granny2") + cov("granny3"), crew: "Captain NightOwl Kat", ...o });
  return `<div class="bt-tickets">
    ${t({ interactive: true, id: "a" })}
    ${t({ day: "Thu", num: 8, state: "scheduled", was: "7 PM", reason: "Boomer's at the dentist", timeHtml: dt(52, 2, "7 PM"), icon: "🥽", title: "VR night", coversHtml: cov("vr") + cov("shf"), more: 1, interactive: true, id: "b" })}
    ${t({ day: "Fri", num: 9, state: "tonight", timeHtml: dt(2, 2), coversHtml: cov("shf") + cov("ln3") + cov("iron"), icon: "🩸", title: "Fright Friday", interactive: true, id: "c" })}
    ${t({ day: "Fri", num: 9, state: "soon", timeHtml: dt(5, 2), interactive: true, id: "d" })}
    ${t({ day: "Sat", num: 10, state: "live", timeHtml: dt(-1, 3), coversHtml: cov("ln3"), icon: "🔴", title: "Live right now", interactive: true, id: "e" })}
    ${t({ day: "Mon", num: 5, state: "ended", timeHtml: dt(-70, 2), coversHtml: cov("iron") + cov("lethal"), icon: "🎯", title: "Co-op day" })}
    ${t({ day: "Tue", num: 6, state: "cancelled", reason: "Power cut", timeHtml: dt(-45, 2), coversHtml: cov("lethal"), icon: "⚡", title: "Speed run night" })}
    ${t({ day: "Sun", num: 11, backstage: true, icon: "🎬", title: "Backstage VOD recording", coversHtml: cov("vr"), crew: "Watch on boomertanger.com", timeHtml: dt(100, 3), interactive: true, id: "g" })}
    ${t({ day: "Sat", num: 10, state: "off", reason: "No stream on Saturdays.", title: "" })}
  </div>`;
}

function marqueeKit(mascotHtml) {
  const starts = at(2.2);
  const card = ([id, name, blurb, season]) => `<div class="kit-sp-fcard">${miniMarqueeHtml({ frame: id, kicker: "Tonight · 8 PM", icon: "👵", title: "Granny day", metaHtml: "Granny: Chapter Two · Granny 3" })}<b>${name}</b>${season ? `<span class="bt-badge bt-badge--${season === "Halloween" ? "gold" : "blue"}">${season}</span>` : ""}<span class="bt-meta">${blurb}</span></div>`;
  const chips = [...FRAMES, ...SEASONAL].map(([id, n]) => `<button type="button" class="bt-chip bt-chip--small${id === "bulbs" ? " is-active" : ""}" data-kit-sp-frame="${id}" aria-pressed="${id === "bulbs"}">${n}</button>`).join("");
  const hero = marqueeHtml({ frame: "bulbs", kicker: "Tonight · Wed Oct 7", icon: "👵", title: "Granny day", peekHtml: mascotHtml,
    whenHtml: `<span class="bt-badge bt-badge--gold">Delayed 1 h</span>${dt(2.2, 2, "7 PM")}`, clockHtml: flipClockHtml({ startsAt: starts }),
    metaHtml: `${platformsHtml()}<span><b>2 games</b> · Granny 2, Granny 3</span><span>Captain <b>NightOwl Kat</b></span>`,
    ctaHtml: `<a class="bt-btn bt-btn--primary" href="#kit-scream-planner">Watch on Twitch</a><a class="bt-btn bt-btn--secondary" href="#kit-scream-planner">See the whole week</a>`,
    coversHtml: cov("granny2") + cov("granny3") });
  return `
    <p class="kit-sub">Marquee: .bt-marquee[data-frame] (marqueeHtml in shared/ui/marquee.js). Pick a frame to swap it live (setMarqueeFrame); the countdown is a live .bt-flipclock</p>
    <div class="kit-row" data-kit-sp-frames role="group" aria-label="Marquee frame">${chips}<button type="button" class="bt-chip bt-chip--small" data-kit-sp-roll>🎲 Surprise me</button></div>
    <div data-kit-sp-hero>${hero}</div>
    <p class="kit-sub">Flip clock states: under a day (Hours : Min : Sec), over a day (Days : Hours : Min), and at zero</p>
    <div class="kit-row" style="gap:32px">${flipClockHtml({ startsAt: at(5.4) })}${flipClockHtml({ startsAt: at(53) })}${flipClockHtml({ startsAt: at(-1) })}</div>
    <p class="kit-sub">All 11 pool frames (Surprise me rolls only from these) in the mini marquee</p>
    <div class="kit-sp-gallery">${FRAMES.map(card).join("")}</div>
    <p class="kit-sub">Seasonal frames (picked by hand, never rolled; the snowman stands where the mascot peeks, so the peek hides)</p>
    <div class="kit-sp-gallery">${SEASONAL.map(card).join("")}</div>`;
}

const BALLOT = [["shf", 58, "gold", "Most wanted"], ["ln3", 33, "pink", "Playing now"], ["lethal", 41, "blue", "Added by @hollowhannah"], ["iron", 12, "teal", "Mod pick"], ["vr", 9, "gray", "New"]];
function ballotKit() {
  const rows = [...BALLOT].sort((a, b) => b[1] - a[1]);
  const top = rows[0][1];
  const card = (r, i, vm, opt = {}) => (vm === "race" ? raceRowHtml : voteCardHtml)({ slug: r[0], title: T(r[0]), coverHtml: cov(r[0]), rank: i + 1, votes: r[1], pct: Math.round(r[1] / top * 100), tagHtml: `<span class="bt-badge bt-badge--${r[2]}">${r[3]}</span>`, ...opt });
  return `
    <p class="kit-sub">Vote counter (.bt-tokens, .bt-drops): none used, one used, all used, and a visitor</p>
    <div class="kit-row">${tokensHtml({ used: 0 })}${tokensHtml({ used: 1 })}${tokensHtml({ used: 3 })}${tokensHtml({ visitor: true })}<span class="bt-meta">Drops alone: ${dropsHtml({ used: 2 })}</span></div>
    <p class="kit-sub">Vote button (.bt-vote-btn): Vote, Voted (is-on), No votes left, Join to vote</p>
    <div class="kit-row" style="max-width:640px">${[voteBtnHtml({ slug: "x" }), voteBtnHtml({ slug: "x", voted: true }), voteBtnHtml({ slug: "x", full: true }), voteBtnHtml({ visitor: true })].map((b) => `<span style="width:150px">${b}</span>`).join("")}</div>
    <p class="kit-sub">V1 covers (.bt-vote-card in .bt-vote-grid): ranks 1 to 3 outlined, the blood meter is the share of the top game, is-mine glows. Vote, take back, and run out (live)</p>
    <div data-kit-sp-ballot><div class="kit-row" data-kit-sp-tokens></div><div class="bt-vote-grid" data-kit-sp-grid></div></div>
    <p class="kit-sub">Visitor state (Join to vote) and the add card</p>
    <div class="bt-vote-grid">${card(rows[0], 0, "covers", { visitor: true })}${voteAddHtml()}</div>
    <p class="kit-sub">V2 race (.bt-race-row in .bt-race): the bar is the share of the top game and drips; same buttons (live, shares the votes above)</p>
    <div class="bt-race" data-kit-sp-race></div>
    <p class="kit-sub">Deadline fuse (.bt-fuse): burning, nothing burnt yet, all done; short form for a header</p>
    <div class="kit-stack" style="padding-top:18px">
      ${fuseHtml({ steps: [{ label: "Opened", when: "Mon 10:00", state: "done" }, { label: "Votes and requests close", when: "Thu 10 PM", state: "next", n: 2 }, { label: "Publish by", when: "Fri 6 PM", n: 3 }], progress: [62, 0], left: "1d 4h left" })}
      ${fuseHtml({ steps: [{ label: "Opens", when: "Mon 10:00", state: "next", n: 1 }, { label: "Closes", when: "Thu 10 PM", n: 2 }, { label: "Publish by", when: "Fri 6 PM", n: 3 }], progress: [0, 0] })}
      ${fuseHtml({ steps: [{ label: "Opened", when: "Mon 10:00", state: "done" }, { label: "Closed", when: "Thu 10 PM", state: "done" }, { label: "Published", when: "Fri 5:52 PM", state: "done" }], progress: [100, 100] })}
      ${fuseHtml({ short: true, steps: [{ label: "Opened", when: "Mon 10:00", state: "done" }, { label: "Closes", when: "Thu 10 PM", state: "next", n: 2 }], progress: [40], left: "2d left" })}
    </div>`;
}

const SLOTS = [
  { id: "mon", day: "Mon", num: 12, icon: "👵", label: "Granny day", timeText: "7–9 PM", count: 2, games: [{ slug: "granny2", coverHtml: cov("granny2"), src: "mod", srcExtra: " · @mothmanmike", title: "Granny 2" }], rooms: { twitch: "covered", ytLandscape: "needed", ytVertical: "off", tiktok: "covered" }, avail: [["NightOwl Kat", "Vex", "Salem"], "3 can make it · 1 maybe"], requests: 1 },
  { id: "wed", day: "Wed", num: 14, icon: "🥽", label: "VR night", timeText: "8–10 PM", count: 2, games: [], rooms: { twitch: "covered", ytLandscape: "covered", ytVertical: "needed", tiktok: "off" }, avail: [["Vex", "Cryptjay"], "2 can make it"], requests: 0 },
  { id: "fri", day: "Fri", num: 16, icon: "🩸", label: "Fright Friday", timeText: "9–11 PM", count: 3, games: [{ slug: "shf", coverHtml: cov("shf"), src: "vote", srcExtra: " · 58", title: "Soul Hunt" }, { slug: "ln3", coverHtml: cov("ln3"), src: "theme", title: "Lethal Night" }, { slug: "iron", coverHtml: cov("iron"), src: "you", title: "Iron Lung" }], rooms: { twitch: "covered", ytLandscape: "covered", ytVertical: "covered", tiktok: "covered" }, avail: [["Salem", "Kat", "Vex", "Jay"], "4 can make it"], requests: 0 },
];
const slotOf = (s, o = {}) => slotHtml({ ...s, roomsHtml: roomsMiniHtml(s.rooms), availHtml: avatarsHtml(s.avail[0]) + s.avail[1], ...o });

const TRAY = {
  mod: [{ slug: "granny3", title: "Granny 3", kind: "mod", lineHtml: `<b style="color:var(--bt-pink)">@mothmanmike</b> · Captain · seat: Twitch lead<q>It's the best one.</q>` }],
  vote: [{ slug: "shf", title: "Soul Hunt", kind: "vote", lineHtml: `<b style="color:var(--bt-gold)">58 votes</b> · <span class="fit">fits VR night</span>` }, { slug: "ln3", title: "Lethal Night", kind: "vote", lineHtml: `<b style="color:var(--bt-gold)">33 votes</b>`, also: "Fri" }],
  theme: [{ slug: "vr", title: "Dark Room VR", kind: "theme", lineHtml: `<span class="fit">Tagged VR</span>` }],
  pick: [{ slug: "iron", title: "Iron Lung", kind: "you", lineHtml: "Playing now" }, { slug: "lethal", title: "Dead Drop", kind: "you", lineHtml: "Playing now" }],
};

function planKit() {
  const tray = (extra = {}) => trayHtml({ forHtml: `🥽 Wed 14 · VR night`, filled: 0, count: 2, groups: ["mod", "vote", "theme", "pick"].map((k) => ({ kind: k, items: TRAY[k].map((it) => ({ ...it, coverHtml: cov(it.slug === "granny3" ? "granny3" : it.slug) })), empty: "Nothing here yet." })), ...extra });
  const emptyTray = trayHtml({ forHtml: "", groups: [], disabled: true });
  const groupsEmpty = trayHtml({ forHtml: `🎯 Thu 15 · Co-op day`, filled: 1, count: 2, groups: [{ kind: "mod", items: [], empty: "No mod has asked for a game on this slot yet." }, { kind: "vote", items: [], empty: "Nothing here yet." }, { kind: "theme", items: [], empty: "This slot has no theme hints." }, { kind: "pick", items: [{ ...TRAY.pick[0], inSlot: true, coverHtml: cov("iron") }, { ...TRAY.pick[1], full: true, coverHtml: cov("lethal") }], empty: "" }] });
  return `
    <p class="kit-sub">Slot card (.bt-slot, slotHtml in shared/ui/slot.js): half filled with a mod request flag, selected with an empty socket, full, published (gold), backstage, and a day off. Click a slot to select it</p>
    <div class="bt-slots">
      ${slotOf(SLOTS[0])}${slotOf(SLOTS[1], { selected: true })}${slotOf(SLOTS[2])}
      ${slotOf({ ...SLOTS[2], id: "pub", day: "Sat", num: 17 }, { published: true })}
      ${slotOf({ id: "bs", day: "Sun", num: 18, icon: "🎬", label: "Backstage hangout", timeText: "8–10 PM", count: 1, games: [], rooms: {}, avail: [[], ""] }, { backstage: true })}
      ${slotOffHtml({ day: "Tue", num: 13, actionHtml: `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm">+ Open a slot</button>` })}
    </div>
    <p class="kit-sub">Slot with the ON AIR SOON stamp and the planner's tray: add by the + button, or drag a game onto a socket (mouse and pen; touch uses +). Slots and tray are live</p>
    <div class="kit-sp-plan" data-kit-sp-plan><div class="bt-slots" data-kit-sp-slots></div><div data-kit-sp-tray></div></div>
    <div class="kit-row"><button type="button" class="bt-btn bt-btn--primary bt-btn--shine" data-kit-sp-publish>Publish week</button><span class="bt-unpub">● 6 unpublished changes</span><span class="bt-published">✓ Published Wed 5:52 PM</span><span class="bt-meta">Publish stamps the cards ON AIR SOON with a splat burst (none under reduced motion)</span></div>
    <p class="kit-sub">Tray states: nothing picked yet (Pick a slot), and groups with empty lines, "In this slot ✓" and a full slot (Add disabled)</p>
    <div class="kit-grid-2">${emptyTray}${groupsEmpty}</div>`;
}

function doorsKit() {
  const week = (n0) => [
    { id: "mon", day: "Mon", num: 5, state: "ended", icon: "🎯", title: "Co-op day", timeText: "7–9 PM", coverHtml: cov("iron") },
    { id: "tue", day: "Tue", num: 6, state: "cancelled", icon: "⚡", title: "Speed run", timeText: "7–9 PM", coverHtml: cov("lethal") },
    { id: "wed", day: "Wed", num: 7, state: "tonight", icon: "👵", title: "Granny day", timeText: "8–10 PM", coverHtml: cov("granny2") },
    { id: "thu", day: "Thu", num: 8, state: "later", icon: "🥽", title: "VR night", timeText: "8–10 PM", coverHtml: cov("vr") },
    { id: "fri", day: "Fri", num: 9, state: "later", icon: "🩸", title: "Fright Friday", timeText: "9–11 PM", coverHtml: cov("shf") },
    { id: "sat", day: "Sat", num: 10, state: "off" },
    { id: "sun", day: "Sun", num: 11, state: "later", icon: "🎬", title: "Backstage hangout", timeText: "8–10 PM", backstage: true, coverHtml: cov("ln3") },
  ];
  const styles = DOOR_STYLES.map(([id, name]) => `<p class="kit-sub">${name} · data-style="${id}"</p><div class="kit-sp-doorstage">${doorsHtml({ style: id, days: week(), openId: id === "jaws" ? "thu" : "" })}</div>`).join("");
  const cells = week().map((d, i) => ({ id: d.id, html: doorHtml({ ...d, style: "hinged", index: i }), label: `${d.day} ${d.num}`, tonight: d.state === "tonight" }));
  return `
    <p class="kit-sub">Doors: .bt-door[data-style] in .bt-doors (doorsHtml / doorHtml in shared/ui/doors.js). Named doors, not .bt-portal, which is the modal portal. Five styles, each with every state across the week: Mon ended (greyed, Ended stamp), Tue cancelled (chained with a padlock; hover to rattle), Wed tonight (open a crack, light leaking), Thu later (closed; hover or focus opens it, click keeps it open), Sat day off (sealed), Sun backstage (velvet). Each door floats a little out of step</p>
    <div class="kit-row" role="group" aria-label="Door style"><button type="button" class="bt-chip bt-chip--small" data-kit-sp-dstep="-1" aria-label="Previous door style">‹</button><b data-kit-sp-dname>${DOOR_STYLES[0][1]}</b><button type="button" class="bt-chip bt-chip--small" data-kit-sp-dstep="1" aria-label="Next door style">›</button><button type="button" class="bt-chip bt-chip--small" data-kit-sp-droll>🎲 Surprise me</button><span class="bt-meta">Flips the live row below (nothing is saved)</span></div>
    <div class="kit-sp-doorstage" data-kit-sp-live>${doorsHtml({ style: "jaws", days: week(), openId: "thu" })}</div>
    ${styles}
    <p class="kit-sub">L4 slider: .bt-slider around .bt-slider-track > .bt-slider-cell (sliderHtml in shared/ui/slider.js). Wide containers show the row of seven; here it is forced to a 390px phone container: tonight centred and open, neighbours scaled and dimmed; swipe or drag, ‹ ›, dots, arrow keys; no wrap at Mon or Sun</p>
    <div class="kit-sp-phone" data-kit-sp-slider>${sliderHtml({ cells, index: 2, label: "This week" })}<p class="bt-meta" data-kit-sp-sout aria-live="polite">Centred: Wed 7</p></div>
    <p class="kit-sub">The same markup in a wide container (a row of seven; the nav and dots hide)</p>
    <div class="kit-sp-wide" data-kit-sp-slider2>${sliderHtml({ cells, index: 2, label: "This week" })}</div>`;
}

function smallKit(mascotHtml) {
  const wm = (lit) => `<a class="bt-wordmark bt-wordmark--power${lit ? " is-lit" : ""}" href="#kit-scream-planner" aria-label="Scream Planner"><span class="bt-wordmark-icon">${SP_ICON}</span><span class="bt-wordmark-text" aria-hidden="true">SCREAM <span class="bt-wordmark-accent">PLANNER</span></span></a>`;
  const poster = (o) => posterHtml({ icon: "👵", label: "Granny day", day: "Mon", timeText: "7–9 PM", ...o });
  return `
    <p class="kit-sub">Wordmark: SP_ICON in .bt-wordmark.bt-wordmark--power (shared/ui/scream-planner.js). The calendar screams; on hover, focus or touch the top page rips away and the mouth stretches. At rest, and lit (is-lit)</p>
    <div class="kit-row" style="gap:36px">${wm(false)}${wm(true)}</div>
    <p class="kit-sub">Small parts: theme chip (.bt-theme), velvet badge (.bt-velvet), platform icons (.bt-plats), overlapped avatars (.bt-avs), game source tags (.bt-src), and dual time (.bt-dualtime: Central first, your time after; a delay strikes the old time)</p>
    <div class="kit-row">${themeChipHtml({ icon: "🥽", label: "VR night" })}${themeChipHtml({ icon: "👵", label: "Granny day" })}${velvetHtml()}${velvetHtml("Fan Club")}${platformsHtml()}${avatarsHtml(["NightOwl Kat", "Vex", "Salem", "Jay"])}</div>
    <div class="kit-row">${srcHtml("mod", " · @vex")} ${srcHtml("vote", " · 58")} ${srcHtml("theme")} ${srcHtml("you")}</div>
    <div class="kit-stack">${dualTimeHtml({ central: "8–10 PM", local: "6–8 PM" , localLabel: "your time (Pacific)" })}${dualTimeHtml({ central: "8–10 PM", was: "7 PM", local: "6–8 PM" })}${dualTimeHtml({ central: "11 PM–1 AM" })}</div>
    <p class="kit-sub">Availability tri-toggle (.bt-tri, triHtml in shared/ui/tri.js): a radiogroup, arrows move and choose. Available, Maybe, Can't, nothing chosen, disabled (live)</p>
    <div class="kit-sp-tris" data-kit-sp-tris>${[["yes", ""], ["maybe", ""], ["no", ""], ["", ""], ["yes", "dis"]].map(([v, d]) => `<div class="kit-row">${triHtml({ value: v, disabled: !!d, name: "demo" })}${v === "yes" && !d ? `<span class="bt-tri-hint">Pre-filled from your usual times</span>` : ""}</div>`).join("")}<p class="kit-note" data-kit-sp-tri-out aria-live="polite">Nothing changed yet. Tab to a toggle and use the arrow keys.</p></div>
    <p class="kit-sub">Usual-week poster (.bt-poster, posterHtml in shared/ui/poster.js): a row of seven; at 640px and below it scrolls sideways. Normal, backstage, day off, selected (in the editor, with ✎ and the + on a day off)</p>
    <div class="bt-posters">${poster({ day: "Mon" })}${poster({ day: "Tue", icon: "🥽", label: "VR night" })}${poster({ day: "Wed", backstage: true, icon: "🎬", label: "Backstage" })}${poster({ day: "Thu", icon: "🎯", label: "Co-op day", editable: true, id: "thu" })}${poster({ day: "Fri", icon: "🩸", label: "Fright Friday", editable: true, selected: true, id: "fri" })}${poster({ day: "Sat", off: true, editable: true })}${poster({ day: "Sun", off: true })}</div>
    <p class="kit-sub">View switch (.bt-view-switch, viewSwitchHtml in shared/ui/view-switch.js): renders and emits "bt-view-change"; the page keeps the choice in localStorage. Tickets / Timeline and Covers / Race (live)</p>
    <div class="kit-row" data-kit-sp-vs>${viewSwitchHtml({ key: "weekView", label: "Week view", options: WEEK_VIEWS, value: "tickets" })}${viewSwitchHtml({ key: "voteView", label: "Ballot view", options: VOTE_VIEWS, value: "covers" })}<span class="bt-meta" data-kit-sp-vs-out aria-live="polite">No change yet</span></div>
    <p class="kit-sub">Burst (.bt-burst) and flying cover (.bt-fly), shared/ui/burst.js: burst(el), flyTo(from, to, done), celebrate(root). Nothing shows under reduced motion</p>
    <div class="kit-row"><button type="button" class="bt-btn bt-btn--secondary" data-kit-sp-burst>Splat burst</button><button type="button" class="bt-btn bt-btn--secondary" data-kit-sp-fly>Fly a cover to the empty spot →</button><span class="kit-sp-fly-from">${cov("granny2")}</span><span class="kit-sp-fly-to bt-sock-empty" style="width:58px">+</span></div>`;
}

export function screamPlannerKitHtml({ mascotHtml = "" } = {}) {
  return `
  <section class="kit-section" id="kit-scream-planner" data-kit-sp>
    <h2 class="kit-h">Scream Planner</h2>
    <p class="kit-p">The pieces of /schedule and the planner (<span class="kit-code">docs/specs/scream-planner.md</span> §13, mockup <span class="kit-code">docs/design/mockups/scream-planner-mockups.html</span>, design-system.md §5 "Scream Planner pieces"). Everything goes still under reduced motion. Unique colours are custom properties declared once (velvet, bulb, fuse, wire, wax, snow, ice, pumpkin). Tickets, markup builders and behaviour live in <span class="kit-code">shared/ui/</span>.</p>
    ${smallKit(mascotHtml)}
    <p class="kit-sub">Ticket (.bt-ticket, ticketHtml in shared/ui/ticket.js): scheduled, delayed (strikes the old time), tonight (a spinning edge), on air soon (stamp), live, ended, cancelled (tape and reason), backstage (velvet badge and rope), day off. Click one (live)</p>
    ${ticketsKit()}
    ${marqueeKit(mascotHtml)}
    ${ballotKit()}
    ${planKit()}
    ${doorsKit()}
  </section>`;
}

export function initScreamPlannerKit(mount) {
  const sec = mount.querySelector("#kit-scream-planner");
  if (!sec) return;
  initTickets(sec);
  const clocks = initFlipClocks(sec);
  initTri(sec, { onChange: (v) => { const o = sec.querySelector("[data-kit-sp-tri-out]"); if (o) o.textContent = `Availability: ${v}`; } });
  initViewSwitch(sec, { onChange: (v, k) => { const o = sec.querySelector("[data-kit-sp-vs-out]"); if (o) o.textContent = `${k}: ${v} (the page would save this)`; } });

  // marquee frame picker
  const hero = sec.querySelector("[data-kit-sp-hero] .bt-marquee");
  const setFrame = (f) => {
    setMarqueeFrame(hero, f);
    sec.querySelectorAll("[data-kit-sp-frame]").forEach((b) => { const on = b.dataset.kitSpFrame === f; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); });
  };
  sec.querySelector("[data-kit-sp-frames]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-kit-sp-frame], [data-kit-sp-roll]"); if (!b) return;
    setFrame(b.dataset.kitSpFrame ?? rollFrame({ current: hero.dataset.frame }));
  });

  // live ballot (V1 and V2 share the votes)
  const votes = { shf: 58, ln3: 33, lethal: 41, iron: 12, vr: 9 }, mine = new Set(["ln3"]);
  const meta = Object.fromEntries(BALLOT.map((r) => [r[0], r]));
  const renderBallot = () => {
    const rows = Object.keys(votes).sort((a, b) => votes[b] - votes[a]), top = votes[rows[0]], full = mine.size >= 3;
    const props = (k, i) => ({ slug: k, title: T(k), coverHtml: cov(k), rank: i + 1, votes: votes[k], pct: Math.round(votes[k] / top * 100), mine: mine.has(k), voted: mine.has(k), full, tagHtml: `<span class="bt-badge bt-badge--${meta[k][2]}">${meta[k][3]}</span>` });
    sec.querySelector("[data-kit-sp-tokens]").innerHTML = tokensHtml({ used: mine.size }) + `<span class="bt-meta">Change your votes any time before it closes.</span>`;
    sec.querySelector("[data-kit-sp-grid]").innerHTML = rows.map((k, i) => voteCardHtml(props(k, i))).join("") + voteAddHtml();
    sec.querySelector("[data-kit-sp-race]").innerHTML = rows.map((k, i) => raceRowHtml(props(k, i))).join("");
  };
  renderBallot();
  initVoteButtons(sec.querySelector("[data-kit-sp-ballot]").parentElement, {
    onVote: (slug, on) => { if (!(slug in votes)) return false; if (on && mine.size >= 3) return false; if (on) { mine.add(slug); votes[slug]++; } else { mine.delete(slug); votes[slug]--; } setTimeout(renderBallot, 60); },
  });

  // live plan board + tray
  const plan = sec.querySelector("[data-kit-sp-plan]");
  const S = { sel: "wed", slots: [{ ...SLOTS[1], games: [] }, { ...SLOTS[0], games: [...SLOTS[0].games] }], stamped: false, published: false };
  const renderPlan = () => {
    const cur = S.slots.find((s) => s.id === S.sel);
    plan.querySelector("[data-kit-sp-slots]").innerHTML = S.slots.map((s) => slotOf(s, { selected: s.id === S.sel, published: S.published })).join("");
    const taken = new Set(cur.games.map((g) => g.slug));
    plan.querySelector("[data-kit-sp-tray]").innerHTML = trayHtml({
      forHtml: `${cur.icon} ${cur.day} ${cur.num} · ${cur.label}`, filled: cur.games.length, count: cur.count,
      groups: ["mod", "vote", "theme", "pick"].map((k) => ({ kind: k, empty: "Nothing here yet.", items: TRAY[k].map((it) => ({ ...it, coverHtml: cov(it.slug), inSlot: taken.has(it.slug), full: cur.games.length >= cur.count })) })),
    });
  };
  renderPlan();
  plan.addEventListener("click", (e) => {
    const s = e.target.closest("[data-slot]");
    if (s && !e.target.closest("button") && s.dataset.slot !== S.sel) { S.sel = s.dataset.slot; renderPlan(); }
  });
  plan.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-slot]")) { e.preventDefault(); const id = e.target.dataset.slot; if (id !== S.sel) { S.sel = id; renderPlan(); plan.querySelector(`[data-slot="${id}"]`)?.focus(); } }
  });
  initTray(plan, {
    onAdd: (slug, kind, item, sock) => {
      const id = sock?.closest("[data-slot]")?.dataset.slot ?? S.sel, sl = S.slots.find((x) => x.id === id);
      if (!sl || sl.games.length >= sl.count || sl.games.some((g) => g.slug === slug)) return;
      const from = item?.querySelector(".bt-cover"), to = sock;
      flyTo(from, to, () => {
        sl.games.forEach((g) => delete g.fresh);
        sl.games.push({ slug, title: T(slug), coverHtml: cov(slug), src: kind, srcExtra: "", fresh: true });
        S.sel = id; renderPlan();
        const socks = plan.querySelectorAll(`[data-slot="${id}"] .bt-sock`);
        burst(socks[sl.games.length - 1], { n: 10 });
      });
    },
    onRemove: (id, k) => { const sl = S.slots.find((x) => x.id === id); sl?.games.splice(k, 1); renderPlan(); },
  });
  sec.querySelector("[data-kit-sp-publish]").addEventListener("click", (e) => {
    burst(e.currentTarget, { n: 24 });
    S.published = true; renderPlan();
    celebrate(plan.querySelector("[data-kit-sp-slots]"), { selector: ".bt-slot" });
  });

  // doors
  initDoors(sec);
  const live = sec.querySelector("[data-kit-sp-live]");
  let di = 0;
  const showStyle = (st) => { setDoorStyle(live, st); di = DOOR_STYLES.findIndex((d) => d[0] === st); sec.querySelector("[data-kit-sp-dname]").textContent = DOOR_STYLES[di][1]; };
  sec.addEventListener("click", (e) => {
    const step = e.target.closest("[data-kit-sp-dstep]");
    if (step) showStyle(DOOR_STYLES[(di + Number(step.dataset.kitSpDstep) + DOOR_STYLES.length) % DOOR_STYLES.length][0]);
    if (e.target.closest("[data-kit-sp-droll]")) showStyle(rollDoorStyle(DOOR_STYLES[di][0]));
  });
  initSlider(sec.querySelector("[data-kit-sp-slider]"), { onChange: (i, cell, id) => { const o = sec.querySelector("[data-kit-sp-sout]"); if (o) o.textContent = `Centred: ${cell.querySelector(".bt-door-day")?.textContent.replace(/(\D+)(\d+)/, "$1 $2")} (${id})`; } });
  initSlider(sec.querySelector("[data-kit-sp-slider2]"));

  // burst and fly
  sec.querySelector("[data-kit-sp-burst]").addEventListener("click", (e) => burst(e.currentTarget));
  sec.querySelector("[data-kit-sp-fly]").addEventListener("click", () => flyTo(sec.querySelector(".kit-sp-fly-from .bt-cover"), sec.querySelector(".kit-sp-fly-to")));
  mount.addEventListener("kit-sp-stop", () => clocks.stop());
}
