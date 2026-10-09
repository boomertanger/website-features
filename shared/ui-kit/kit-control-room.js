// shared/ui-kit/kit-control-room.js — the "Control Room" section of the UI Kit page (/dev/ui-kit): every Control Room piece in
// every state, with the Look switch (Hull map / CRT) that sets data-look on the section root (docs/design-system.md §5 "Control Room
// pieces", §8p, docs/specs/control-room.md §7c, §15). ui-kit.js appends controlRoomKitHtml() to the page and calls
// initControlRoomKit(mount). People, games and numbers are examples only.
import { readoutHtml, readoutsHtml, readoutBarsHtml, setReadout, initReadouts } from "../ui/readout.js";
import { beatsHtml } from "../ui/beats.js";
import { checkinHtml, liveBannerHtml, initCheckin, initLiveBanner } from "../ui/checkin.js";
import { launchHtml, initLaunch } from "../ui/launch.js";
import { checklistHtml, initChecklist, tickChecklistItem } from "../ui/checklist.js";
import { deckplanHtml } from "../ui/deckplan.js";
import { streamViewHtml, initStreamView } from "../ui/streamview.js";
import { platformIconHtml } from "../ui/crew.js";
import { gradeChipHtml } from "../ui/grade-chip.js";
import { viewSwitchHtml, initViewSwitch } from "../ui/view-switch.js";
import { toast } from "../ui/toast.js";
import { crWordmarkHtml, crBoot } from "../ui/control-room.js";
import { crPanelHtml, crViewportHtml } from "../ui/cr-panel.js";
import { initPowerWordmarks } from "../ui/wordmark.js";

export const CR_LOOKS = [{ value: "hull", icon: "🗺", label: "Hull map" }, { value: "crt", icon: "📺", label: "CRT" }];
const WORD = "mortuary";   // the demo word

/* ---------- wordmark ---------- */
function wordmarkKit() {
  const bar = (live, note) => `<div class="kit-cr-stage" data-live="${live}"><div class="bt-topbar">${crWordmarkHtml()}</div><p class="bt-meta" style="padding:0 16px 12px">${note}</p></div>`;
  return `
    <p class="kit-sub">Wordmark (.bt-wordmark--power, crWordmarkHtml and CR_ICON in shared/ui/control-room.js): CONTROL + accent ROOM with the radar-scope icon. It sweeps while the stream is live (body[data-live]) with the blip in the live colour, faster on hover, focus or touch; still under reduced motion</p>
    <div class="kit-grid-2">${bar("public", "Live: the sweep turns, red blip. Hover for the fast sweep")}${bar("backstage", "Backstage: green blip")}${bar("off", "Not live: still. Hover or focus it to sweep")}</div>`;
}

/* ---------- viewport ---------- */
function viewportKit() {
  const stand = `<div style="position:absolute;inset:0;display:grid;place-items:center;color:var(--bt-text-muted);font-size:var(--bt-text-md)">Player (Twitch, YouTube or the backstage embed)</div>`;
  const beacon = `<a class="bt-beacon bt-beacon--public" href="#kit-control-room" style="position:absolute;top:12px;left:12px;z-index:2"><span class="bt-beacon-dot"></span>Live</a>`;
  const body = `<p class="bt-meta">Panels and the viewport switch on together.</p><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kit-cr-boot-btn>Switch-on</button>`;
  return `
    <p class="kit-sub">Viewport (.bt-cr-viewport > .bt-cr-screen, crViewportHtml in shared/ui/cr-panel.js): the frame round the video. Hull map: breathing targeting frame; CRT: a TV with its control strip. Press Switch-on to replay the CRT screens coming on (crBoot)</p>
    <div class="kit-grid-2">${crViewportHtml({ innerHtml: stand, overlayHtml: beacon })}${crPanelHtml({ title: "Now", icon: "now", bodyHtml: body })}</div>`;
}

/* ---------- readouts ---------- */
function readoutsKit() {
  const still = readoutsHtml([
    { key: "up", value: "2:14:37", label: "Uptime" },
    { key: "ci", value: 641, label: "Check-ins tonight" },
    { key: "peak", value: 1412, label: "Peak tonight" },
    { key: "game", value: "47m", label: "On this game" },
  ], { cols: 2 });
  const live = readoutsHtml([
    { key: "t-up", value: "0:00:00", label: "Uptime (ticks each second)" },
    { key: "t-ci", value: 641, label: "Check-ins tonight (flashes on change)" },
    readoutHtml({
      key: "t-total", wide: true, value: 1284, label: "Watching on 4 platforms",
      extraHtml: readoutBarsHtml([{ chat: "twitch", value: 812, max: 900 }, { chat: "ytLandscape", value: 301, max: 900 }, { chat: "ytVertical", value: 96, max: 900 }, { chat: "tiktok", value: 75, max: 900 }]),
    }),
  ], { cols: 2 });
  return `
    <p class="kit-sub">Readouts (.bt-readout in .bt-readouts; readoutHtml, readoutsHtml, setReadout in shared/ui/readout.js): idle, and live (numbers tick and the changed readout flashes). Ghost digits and amber belong to the hull look; fuel cells too (.bt-readout-bars)</p>
    <div class="kit-grid-2"><div>${still}</div><div data-kit-cr-ro>${live}</div></div>`;
}

/* ---------- panel and beats ---------- */
function beatsKit() {
  const row = (label, html, live = "") => `<div class="bt-cr-panel"${live ? ` data-live="${live}"` : ""}><p class="bt-meta" style="margin-bottom:10px">${label}</p>${html}</div>`;
  return `
    <p class="kit-sub">Panel (.bt-cr-panel, crPanelHtml in shared/ui/cr-panel.js): a card with a head row. Switch the look above to light the head: icon tile, status light, scan line</p>
    <div class="kit-grid-2">${crPanelHtml({ title: "Crew on duty", icon: "crew", bodyHtml: `<p class="bt-meta">Any panel body goes here.</p>` })}${crPanelHtml({ title: "Watch on", icon: "watch", tagHtml: `<span class="bt-badge bt-badge--blue">Tonight lane</span>`, bodyHtml: `<p class="bt-meta">A tag or actions sit at the right of the head.</p>` })}</div>
    <p class="kit-sub">Beats (.bt-beats, beatsHtml in shared/ui/beats.js): Start done and Break 1 up next; Break 1 now (double ripple); a skipped break and End now; backstage (green)</p>
    <div class="kit-grid-2">
      ${row("Live: Start done, Break 1 up next", beatsHtml({ beats: { start: { state: "done", time: "7:02 PM" }, break1: { state: "next", time: "7:58 PM" }, break2: { time: "8:55 PM" }, end: { time: "~9:45 PM" } }, progress: 0.55 }), "public")}
      ${row("Break 1 now, check-in open", beatsHtml({ beats: { start: { state: "done", time: "7:02 PM" }, break2: { time: "8:55 PM" }, end: { time: "~9:45 PM" } }, now: "break1", chips: { break1: "Check-in open" } }), "public")}
      ${row("End now, Break 2 skipped", beatsHtml({ beats: { start: "done", break1: "done", break2: "skipped" }, now: "end" }), "public")}
      ${row("Backstage after-show: Start now", beatsHtml({ beats: { break1: {}, break2: {}, end: {} }, now: "start" }), "backstage")}
    </div>
    <div class="kit-grid-2">${row("All done", beatsHtml({ beats: { start: "done", break1: "done", break2: "done", end: "done" } }))}</div>`;
}

/* ---------- check-in ---------- */
const FIRST = ["@gbo", "@cryptkeeper", "@lanternjaw"];
function checkinKit() {
  const closes = Date.now() + 5 * 60 * 1000;
  const card = (note, html) => `<div class="kit-cr-ci"><p class="bt-meta">${note}</p>${html}</div>`;
  return `
    <p class="kit-sub">Check-in (.bt-checkin, checkinHtml and initCheckin in shared/ui/checkin.js). Live: type "${WORD}" to check in (five wrong words lock the beat); the countdown ring ticks and stops at zero. The room picker is a radiogroup (arrows move and choose)</p>
    <div class="kit-grid-2" data-kit-cr-ci>
      ${card("Empty, window open (live)", checkinHtml({ state: "entry", beat: "break1", closesAt: closes, count: 128, first: FIRST, stamps: { start: true }, room: "twitch", id: "kit-cr-live" }))}
      ${card("Typing", checkinHtml({ state: "entry", beat: "break2", time: "3:12", count: 304, value: "mortu", room: "ytLandscape", stamps: { start: true, break1: true } }))}
      ${card("Wrong word (shakes; 3 tries left)", checkinHtml({ state: "wrong", beat: "break1", time: "4:31", count: 128, value: "morgue", tries: 3, room: "ytVertical", stamps: { start: true } }))}
      ${card("Locked for this beat", checkinHtml({ state: "locked", beat: "break1", stamps: { start: true } }))}
      ${card("You're in (Break 1, +10 XP)", checkinHtml({ state: "success", beat: "break1", time: "2:04", count: 129, first: FIRST, stamps: { start: true, break1: true } }))}
      ${card("Visitor (Join free)", checkinHtml({ state: "visitor", beat: "break1", time: "4:31", count: 128 }))}
      ${card("Closed (no window open)", checkinHtml({ state: "closed", beat: "break1", stamps: { start: true } }))}
      ${card("Backstage: the only room is On the site", checkinHtml({ state: "entry", beat: "start", time: "5:00", count: 0, rooms: ["site"], stamps: {} }))}
    </div>
    <p class="kit-sub">Stamps (one per beat, .bt-checkin-stamps): none, Start, Start and Break 1, and all four (the success state slams the new one on)</p>
    <div class="kit-grid-2">${[{}, { start: true }, { start: true, break1: true }, { start: true, break1: true, break2: true, end: true }].map((s) => `<div class="bt-cr-panel kit-cr-stamps">${stampsRowOnly(s)}</div>`).join("")}</div>`;
}
function stampsRowOnly(s) {
  const html = checkinHtml({ state: "closed", stamps: s });
  return html.slice(html.indexOf('<div class="bt-checkin-stamps">'), html.lastIndexOf("</section>"));
}

/* ---------- banner ---------- */
function bannerKit() {
  const closes = Date.now() + 4.5 * 60 * 1000 + 31000;
  return `
    <p class="kit-sub">Live banner (.bt-live-banner, liveBannerHtml and initLiveBanner; site-wide, identical in every look): open (countdown ticks, Check in fires bt-checkin-open) and You're in (green). Phones stack it</p>
    <div class="kit-cr-stage">${liveBannerHtml({ state: "open", beat: "break1", closesAt: closes })}</div>
    <div class="kit-cr-stage">${liveBannerHtml({ state: "in", beat: "break1" })}</div>
    <div class="kit-cr-stage kit-cr-phone">${liveBannerHtml({ state: "open", beat: "break2", time: "4:31" })}</div>`;
}

/* ---------- launch, checklist, deck plan ---------- */
function launchKit() {
  const tiles = [
    { id: "questions", icon: "❓", title: "Questions", sub: "Tonight 12 · Standing 38", action: "Start 10 min" },
    { id: "hotseat", icon: "🪑", title: "Hot Seat", sub: "Needs a beat check-in first", action: "Start" },
    { id: "chatgame", icon: "🎲", title: "Chat Game: Scare Bingo", sub: "Planned for tonight" },
    { id: "badge", icon: "🏅", title: "Drop a badge", sub: "Pick one to give away", state: "off" },
    { id: "rush", icon: "📣", title: "Recruit Rush", sub: "Not while a game is running", state: "off" },
  ];
  return `
    <p class="kit-sub">Launch panel (.bt-launch, launchHtml and initLaunch in shared/ui/launch.js): idle, running (the live tag and edge; only one at a time), unavailable (disabled, says why). Live: click an idle tile to run it, click the running one to stop it</p>
    <div class="kit-grid-2"><div class="bt-cr-panel" data-kit-cr-launch>${launchHtml({ tiles: tiles.map((t, i) => (i === 0 ? { ...t, state: "running" } : t)) })}</div>
    <div class="bt-cr-panel">${launchHtml({ tiles: tiles.slice(0, 1).concat(tiles.slice(3, 4)), label: "Launch panel (static)" })}</div></div>`;
}
function checklistKit() {
  const groups = [
    { id: "start", title: "Start", open: true, items: [
      { id: "s1", text: "Welcome chat, by room", done: true }, { id: "s2", text: "Say the word and open check-in", shortcut: "Runs Open check-in", done: true },
      { id: "s3", text: "Tonight's games", note: "Granny 2, then the ballot pick" }, { id: "s4", text: "Socials", shortcut: "Runs Copy socials" }, { id: "s5", text: "Point to the question queue" },
    ] },
    { id: "b1", title: "Break 1", open: false, items: [{ id: "b1a", text: "Check-in", done: true }, { id: "b1b", text: "Questions, 8 minutes", done: true }, { id: "b1c", text: "Hydrate", done: true }, { id: "b1d", text: "Shout out the first-ins" }, { id: "b1e", text: "Plug the schedule" }] },
    { id: "end", title: "End", open: false, items: [{ id: "e1", text: "Thank the crew by name", done: true }, { id: "e2", text: "Next stream", done: true }] },
  ];
  return `
    <p class="kit-sub">Checklist (.bt-checklist, checklistHtml and initChecklist in shared/ui/checklist.js; .bt-task-row is an XP activity row and does not fit): the current beat open, the others folded to a progress chip; unticked, ticked, and the tick pop (live: tick a row; a shortcut row ticks itself when its control is used: press the button)</p>
    <div class="kit-grid-2"><div class="bt-cr-panel" data-kit-cr-checklist>${checklistHtml({ groups })}<p class="bt-meta" style="margin-top:8px">🔒 Only you can see this.</p><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kit-cr-shortcut>Use the Copy socials control</button></div></div>`;
}
function deckKit() {
  const g = (n, label, tone) => gradeChipHtml({ track: "mod", grade: n });
  return `
    <p class="kit-sub">Deck plan (.bt-deckplan, deckplanHtml in shared/ui/deckplan.js): compartments lit (the dot pings), the Bridge, and an open seat (dashed, gold, "needed")</p>
    <div class="kit-grid-2"><div class="bt-cr-panel">${deckplanHtml({
      bridge: { people: [{ name: "@nightowl", role: "Stream Captain", gradeHtml: g(3) }] },
      bays: [
        { name: "Twitch", iconHtml: platformIconHtml("twitch"), people: [{ name: "@vexx", role: "Lead", gradeHtml: g(2) }, { name: "@mothlight", role: "Deckhand", gradeHtml: g(1) }] },
        { name: "YouTube", iconHtml: platformIconHtml("ytLandscape") + platformIconHtml("ytVertical"), people: [{ name: "@hollowgrin", role: "Lead · both rooms", gradeHtml: g(2) }] },
        { name: "TikTok", iconHtml: platformIconHtml("tiktok"), open: true, need: "Lead needed" },
      ],
    })}</div></div>`;
}

/* ---------- stream view ---------- */
const PLATS = [["twitch", "Twitch", 0.9, "var(--bt-brand-twitch)", "612"], ["ytLandscape", "YouTube", 0.5, "var(--bt-brand-youtube)", "301"], ["ytVertical", "YouTube vertical", 0.3, "var(--bt-brand-youtube)", "96"], ["tiktok", "TikTok", 0.2, "var(--bt-brand-tiktok-edge)", "75"]];
const rooms = () => `<div class="bt-sv-rooms">${PLATS.map(([c, n, f, col, v]) => `<div class="bt-sv-room">${platformIconHtml(c)}<span>${n}</span><span class="bar"><i style="--f:${f};--c:${col}"></i></span><b>${v}</b></div>`).join("")}</div>`;
function breakScene(shape) {
  const wide = shape === "wide";
  const cam = wide ? "left:90px;top:170px;width:900px;height:620px" : "left:90px;top:120px;width:900px;height:520px";
  const panel = wide ? "left:1080px;top:90px;width:760px;height:830px;padding:44px 48px" : "left:60px;top:720px;width:960px;height:1000px;padding:50px 56px";
  return `<div class="bt-sv-cam" style="${cam}">Camera window</div>
    <div class="bt-sv-panel" style="${panel}"><div style="display:grid;gap:30px">
      <div class="bt-sv-h"><span class="bt-sv-led"></span>Break 1 · check-in is open</div>
      <div><div class="bt-sv-muted" style="font-size:30px;margin-bottom:10px">Say the word in chat or type it on the site</div><div class="bt-sv-word bt-sv-amber" style="font-size:96px">${WORD}</div></div>
      <div style="display:flex;align-items:center;gap:36px"><div class="bt-sv-ring" style="--ring:.62"><span>3:06</span></div><div class="bt-sv-count">128<small>checked in</small></div></div>
      ${rooms()}
      <div class="bt-sv-first">First in: <span>@gbo</span><span>@cryptkeeper</span><span>@lanternjaw</span></div>
    </div></div>
    <div class="bt-sv-ticker"><div><b>BOOMERTANGER.COM</b> · check in for XP · Questions open after the break · <b>Next stream Tuesday 7 PM</b></div></div>`;
}
function streamKit() {
  return `
    <p class="kit-sub">Stream view (.bt-streamview, streamViewHtml, fitStreamView and initStreamView in shared/ui/streamview.js): the fixed 1920x1080 and 1080x1920 frames scaled to fit their box by a CSS transform (ResizeObserver); no container-query reflow inside and the motion keeps running under reduced motion (it is a video overlay). Break scene "Takeover" drawn from the .bt-sv-* parts; the look applies to it too</p>
    <div class="kit-cr-sv"><div>${streamViewHtml({ shape: "wide", sceneHtml: breakScene("wide"), label: "Stream view, wide 1920 by 1080" })}</div><div>${streamViewHtml({ shape: "tall", sceneHtml: breakScene("tall"), label: "Stream view, tall 1080 by 1920" })}</div></div>`;
}

export function controlRoomKitHtml() {
  return `
  <section class="kit-section" id="kit-control-room" data-kit-cr data-look="hull">
    <h2 class="kit-h">Control Room</h2>
    <p class="kit-p">The pieces of /live and /live/control (<span class="kit-code">docs/specs/control-room.md</span> §15, mockups <span class="kit-code">docs/design/mockups/control-room-*.html</span>, design-system §5 "Control Room pieces", §8p). The Look switch sets <span class="kit-code">data-look</span> on this section: a look restyles surfaces, frames, motion and decoration only, never colour meaning, the heading ladder or what is clickable. The live banner and the check-in card look the same in every look.</p>
    <div class="kit-row"><span class="bt-meta">Look</span>${viewSwitchHtml({ key: "look", label: "Look", value: "hull", options: CR_LOOKS })}</div>
    ${wordmarkKit()}
    ${readoutsKit()}
    ${beatsKit()}
    ${viewportKit()}
    ${checkinKit()}
    ${bannerKit()}
    ${launchKit()}
    ${checklistKit()}
    ${deckKit()}
    ${streamKit()}
  </section>`;
}

export function initControlRoomKit(mount) {
  const sec = mount.querySelector("#kit-control-room");
  if (!sec) return;
  initViewSwitch(sec, { onChange: (v, key) => { if (key === "look") sec.dataset.look = v; } });
  initReadouts(sec);
  initPowerWordmarks(sec);
  sec.querySelector("[data-kit-cr-boot-btn]")?.addEventListener("click", () => crBoot(sec));
  initStreamView(sec);

  // readouts that tick
  const ro = sec.querySelector("[data-kit-cr-ro]");
  const t0 = Date.now() - 1000;
  let ci = 641, total = 1284;
  const timer = setInterval(() => {
    if (!sec.isConnected) { clearInterval(timer); return; }
    const up = Math.floor((Date.now() - t0) / 1000);
    setReadout(ro.querySelector('[data-ro="t-up"]'), `${Math.floor(up / 3600)}:${String(Math.floor(up / 60) % 60).padStart(2, "0")}:${String(up % 60).padStart(2, "0")}`, { tick: false });
    if (up % 3 === 0) { ci += 1 + Math.floor(Math.random() * 3); setReadout(ro.querySelector('[data-ro="t-ci"]'), ci); }
    if (up % 4 === 0) { total += Math.round((Math.random() - 0.4) * 12); setReadout(ro.querySelector('[data-ro="t-total"]'), total); }
  }, 1000);

  // check-in: one word, five tries
  let tries = 5, count = 128;
  initCheckin(sec, {
    onSubmit: (word, room, el) => {
      if (el.querySelector("#kit-cr-live-word")) {
        if (word.trim().toLowerCase() === WORD) return { ok: true, count: ++count };
        tries -= 1;
        return tries > 0 ? { ok: false, left: tries } : { locked: true };
      }
      return word.trim().toLowerCase() === WORD ? { ok: true } : { ok: false, left: 3 };
    },
  });
  initLiveBanner(sec, { onCheckIn: () => toast("This opens the check-in dialog (a bottom sheet on phones).", { kind: "info" }) });

  // launch: one at a time
  initLaunch(sec, {
    onLaunch: (id, state, tile) => {
      const box = tile.closest(".bt-launch");
      if (!box.closest("[data-kit-cr-launch]")) return;
      const was = state === "running";
      box.querySelectorAll(".bt-launch-tile.is-running").forEach((t) => {
        t.classList.remove("is-running"); t.dataset.state = "idle"; t.removeAttribute("aria-pressed");
        t.querySelector(".bt-live-tag")?.replaceWith(Object.assign(document.createElement("span"), { className: "bt-launch-go", textContent: "Start" }));
      });
      if (!was) {
        tile.classList.add("is-running"); tile.dataset.state = "running"; tile.setAttribute("aria-pressed", "true");
        const tag = document.createElement("span");
        tag.className = "bt-live-tag"; tag.innerHTML = "<i></i>On stream";
        tile.querySelector(".bt-launch-go")?.replaceWith(tag);
      }
    },
  });

  // checklist: a shortcut ticks its own row
  initChecklist(sec);
  sec.querySelector("[data-kit-cr-shortcut]")?.addEventListener("click", () => tickChecklistItem(sec.querySelector("[data-kit-cr-checklist]"), "s4", true));
}
