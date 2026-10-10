// /live/deck: the Mod Deck (docs/specs/mod-machina.md §17a "The /live/deck page" and "The duty loop"; mockup docs/design/mockups/mod-deck.html section 1; docs/design-system.md §8t). The crew's page:
// who may look, the listeners (mod-deck-data.ts), the redraw by slots (a panel is redrawn only when its markup changed, so the chat embeds never reload for a viewer count), the duty loop
// (Clock in, the heartbeat, Step away, I'm back, the lantern prompts) and the small celebrations. Markup is in mod-deck-view.ts; page CSS in styles/mod-deck.css (md-*).
// DISPLAY ONLY: every button is a callable the server checks again (grade, lockout, first write wins). Preview (non-production, signed out): ?state=off|open|duty|away|prompt|acting|ended|after
// and ?as=deckhand|lead|captain|owner draw sample data from mod-deck-preview.ts and never touch Firestore or a callable. Captain tools, flags and Confirm tonight's crew come in part 5:
// [data-slot="helm"] and [data-confirm-slot] are left for them.
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";
import { initStickyBar } from "../../../../shared/ui/sticky-bar.js";
import { initDutyBar } from "../../../../shared/ui/duty-bar.js";
import { initPrompt } from "../../../../shared/ui/prompt.js";
import { initCrewNotes } from "../../../../shared/ui/crew-notes.js";
import { initCueCards } from "../../../../shared/ui/cue-card.js";
import { initCountUp } from "../../../../shared/ui/count-up.js";
import { setLook, crBoot } from "../../../../shared/ui/control-room.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { burst } from "../../../../shared/ui/burst.js";
import { onAuth, type AuthState } from "../../lib/auth";
import { reasonOf } from "../../lib/errors";
import { isOwner, crewMe } from "../planner/plan-data";
import { takeSwap } from "../crew/swaps";
import type { Io } from "../planner/plan-io";
import site from "../../data/site.json";
import { toast, messageFor, copyText, reduced, esc } from "./ui";
import { realSource, freshNotes, myRoomOf, roleLine, type Me, type Room, type Source } from "./mod-deck-data";
import { previewRequest, previewMe, previewSource } from "./mod-deck-preview";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { initFlags } from "../../../../shared/ui/flag-card.js";
import { initLaunch } from "../../../../shared/ui/launch.js";
import { ROOM_NAME, ROOM_ORDER } from "./mod-deck-data";
import { FLAG_TYPES, flagFormHtml, flagSubtitle, flagStackHtml, helmHtml, moveOptions, moveListHtml, confirmNightHtml, makeChime, flagTitle, type Tool } from "./mod-deck-tools";
import {
  derive, takeFor, heroHtml, barHtml, awayText, promptBlockHtml, roomsStripHtml, wallHtml, wallKey, linesHtml, linesTexts, rushPanelHtml, notesHtml, cuesHtml, liveBodyHtml, tabsHtml, offHtml, endedHtml,
  defaultDrop, fmtClock, type Model, type Derived, type Tab,
} from "./mod-deck-view";

initSegNavs();
initPowerWordmarks();
const dockBar = document.querySelector<HTMLElement>("[data-lv-dock]");
const stickyBar = dockBar ? initStickyBar(dockBar, {}) : null;

const shell = document.querySelector<HTMLElement>("[data-deck]")!;
const root = document.querySelector<HTMLElement>("[data-md]")!;
const preview = previewRequest();
// Chat Games' entry point (window.btChatGames): the launch tiles open its dialogs and End through it. The preview stands in its own (?formats=1).
if (!preview) void import("./chatgames-site");

// ---------------------------------------------------------------------------------------------- who may look
type Access = "loading" | "join" | "signup" | "gate" | "page";
function setAccess(a: Access) {
  shell.dataset.access = a;
  shell.querySelector<HTMLElement>("[data-lv-gate-visitor]")!.hidden = a !== "join";
  shell.querySelector<HTMLElement>("[data-lv-gate-signup]")!.hidden = a !== "signup";
  stickyBar?.sync();
}
async function identify(s: AuthState): Promise<Me | null> {
  const uid = s.user?.uid || "";
  const [owner, me] = await Promise.all([isOwner(uid).catch(() => false), crewMe().catch(() => null)]);
  const crew = me?.crew || null;
  const staffRole = s.isAdmin || s.roles.includes("mod") || s.roles.includes("admin");
  const blocked = !!crew && ["paused", "alumni"].includes(crew.status);
  if (!owner && (!staffRole || blocked)) return null;
  const handle = (s.profile as any)?.handle || "";
  const level = crew ? (crew.track === "admin" ? 4 : crew.grade) : 4;
  return { uid, handle, name: (s.profile as any)?.displayName || handle, owner, admin: owner || s.isAdmin || s.roles.includes("admin"), grade: crew ? { track: crew.track, grade: crew.grade } : null, level, preview: false };
}

let mounted = false, seq = 0;
onAuth((real) => {
  const s = real.status === "signedOut" && preview ? null : real;
  const mine = ++seq;
  if (!s) { if (!mounted) { mounted = true; setAccess("page"); mount(previewMe(preview!.as), previewSource(previewMe(preview!.as), preview!.kind, preview!.as)); } return; }
  if (mounted) return;
  if (s.status === "loading") return setAccess("loading");
  if (s.status === "signedOut") return setAccess("join");
  if (s.status === "needsSignup") return setAccess("signup");
  setAccess("loading");
  identify(s).then((me) => {
    if (mine !== seq || mounted) return;
    if (!me) return setAccess("gate");
    mounted = true; setAccess("page"); mount(me, realSource(me));
  }, () => { if (mine === seq) setAccess("gate"); });
});

// ---------------------------------------------------------------------------------------------- the page
function mount(me: Me, src: Source) {
  const origin = "https://boomertanger.com";
  const M: Model = {
    me, pub: null, duty: null, rec: null, stream: null, next: null, notes: [], cues: [], swaps: [], boost: 1.5,
    phone: false, tab: "chats", focus: false, chatRoom: "twitch", dropRoom: null, away: false, now: Date.now(), answered: new Set(),
    flags: [], tool: null, unlocked: [], formats: [], run: null, added: {}, confirmBusy: false,
    site: { twitchChannel: site.twitchChannel, host: location.hostname, tiktokUrl: (site.socials.find((x) => x.id === "tiktok")?.url || "") === "#" ? "" : site.socials.find((x) => x.id === "tiktok")?.url || "", houseRules: (site as any).houseRules || "", socials: site.socials, origin },
  };
  let D: Derived = derive(M);
  let scaffold = "";
  let lastLook = "", lastPhase = "", rendered = false;
  const frame = document.querySelector<HTMLElement>(".bt-site-frame");

  // ---- slots: a panel is redrawn only when its markup (or its key) changed
  function slot(id: string, html: string, key = html): HTMLElement | null {
    const el = root.querySelector<HTMLElement>(`[data-slot="${id}"]`);
    if (!el) return null;
    if (el.dataset.k === key) return el;
    el.dataset.k = key;
    const input = el.querySelector<HTMLInputElement>("[data-note-input]");
    const keep = input ? { v: input.value, f: document.activeElement === input, a: input.selectionStart, b: input.selectionEnd } : null;
    el.innerHTML = html;
    if (keep) { const n = el.querySelector<HTMLInputElement>("[data-note-input]"); if (n) { n.value = keep.v; if (keep.f) { n.focus(); try { n.setSelectionRange(keep.a, keep.b); } catch { /* not a text field */ } } } }
    el.dataset.fresh = "1";
    return el;
  }
  const fresh = (el: HTMLElement | null) => { if (el && el.dataset.fresh === "1") { el.dataset.fresh = ""; return true; } return false; };
  const barKey = (d: Derived) => {
    const mine = M.duty?.onDuty[M.me.uid];
    return [d.phase, d.clock, roleLine(d.roles), mine?.away?.until || "", M.dropRoom || "", defaultDrop(d) || "", d.rooms.map((r) => r.room + r.state).join(), d.seat.map((r) => r.role + r.room).join(), M.phone].join("|");
  };

  // ---- the scaffold: built when the phase changes; the live body's slots are filled one by one
  function build(d: Derived) {
    const key = `${d.phase}:${d.after}`;
    if (scaffold === key) return;
    scaffold = key;
    root.innerHTML = `<div class="md-body"><div data-slot="note"></div><div data-slot="hero"></div><div data-slot="tabs"></div><div data-slot="main"></div></div>`
      + `<div class="md-dock" data-md-dock><div data-slot="dock-prompt"></div><div data-slot="dock-bar"></div></div><div class="md-stampwrap" data-stamp aria-hidden="true"></div>`;
    root.dataset.phase = d.phase;
  }

  function render() {
    M.now = Date.now();
    if (!M.pub) {   // nothing has answered yet: a skeleton, never a flash of "nobody is on air"
      if (scaffold !== "skel") { scaffold = "skel"; root.innerHTML = `<div class="md-body md-skel" aria-hidden="true"><span class="bt-skeleton md-skel-hero"></span><span class="bt-skeleton md-skel-row"></span><span class="bt-skeleton md-skel-wall"></span></div>`; }
      return;
    }
    D = derive(M);
    const d = D;
    build(d);
    const look = M.pub?.look === "crt" ? "crt" : "hull";
    if (look !== lastLook) { lastLook = look; setLook(root, look); }
    if (d.phase !== lastPhase) { if (lastPhase) crBoot(root); lastPhase = d.phase; }
    root.dataset.clock = d.clock; root.dataset.after = d.after ? "1" : "0"; root.dataset.tab = M.tab; root.dataset.w = M.phone ? "phone" : "wide";
    myRoom();
    slot("note", M.me.preview ? `<div class="bt-notice md-preview"><b>Sample data.</b> Practice only: nothing here is saved, and no real chat or callable is touched.</div>` : "");
    slot("hero", heroHtml(M, d));
    slot("tabs", tabsHtml(M, d));
    if (d.phase === "live") {
      slot("main", liveBodyHtml());
      slot("rooms", roomsStripHtml(M, d));
      const w = slot("wall", wallHtml(M, d), wallKey(M, d));
      void w;
      slot("layer", "", "");
      renderFlags();
      renderHelm(d);
      slot("cues", cuesHtml(M, d));
      slot("lines", linesHtml(M, d));
      slot("rush", rushPanelHtml(M));
    } else if (d.phase === "off") {
      slot("main", offHtml(M, d), `off|${M.next?.id}|${M.next?.seat.map((r) => r.role + r.room).join()}|${JSON.stringify(M.swaps.map((s) => [s.id, s.status]))}`);
      slot("lines", linesHtml(M, d));
    } else {
      const night = M.duty?.night;
      const cp = d.canConfirm && night ? confirmNightHtml({ rows: night.rows, streamMinutes: night.minutes, added: M.added, confirmed: !!M.duty?.confirmedAt, busy: M.confirmBusy, autoAt: M.duty?.endedAt ? M.duty.endedAt + 24 * 3600000 : null }) : "";
      slot("main", endedHtml(M, d, cp), `ended|${JSON.stringify(M.rec)}|${M.duty?.confirmedAt}|${d.canConfirm}|${JSON.stringify(M.added)}|${M.confirmBusy}`);
    }
    const notes = slot("notes", notesHtml(M));
    if (notes && !(notes as any)._wired) { (notes as any)._wired = true; initCrewNotes(notes, { onPost: postNote, onDelete: deleteNote }); }
    wireBars(d);
    wirePrompt(d);
    wireCues();
    if (d.phase === "ended") initCountUp(root);
    patchLive();
    syncHeartbeat(d);
  }
  let queued = 0;
  const schedule = () => { if (queued) return; queued = requestAnimationFrame(() => { queued = 0; render(); }); };

  // ---- the duty bar (desktop: in the hero; phone: pinned in the dock) and the prompt
  function wireBars(d: Derived) {
    const k = barKey(d);
    const html = d.phase === "live" ? barHtml(M, d) : "";
    const target = M.phone ? "dock-bar" : "bar";
    const other = M.phone ? "bar" : "dock-bar";
    const hero = root.querySelector<HTMLElement>(".md-hero-right");
    if (hero && !hero.querySelector('[data-slot="bar"]')) hero.innerHTML = `<div data-slot="bar"></div>`;
    const open = !!root.querySelector(".bt-duty-away");
    const el = open ? root.querySelector<HTMLElement>(`[data-slot="${target}"]`) : slot(target, html, k);
    slot(other, "", "");
    if (!el) return;
    if (fresh(el)) {
      initDutyBar(el, { lead: d.isLead || d.isCaptain, onAway: (kind) => void stepAway(kind), onBack: () => void back(), onFlag: () => openFlagDialog() });
    }
    // minutes tick inside the bar without redrawing it (so an open Step away chooser stays open)
    const mins = el.querySelector(".bt-duty-min");
    if (mins && d.clock === "in") { const tmp = document.createElement("div"); tmp.innerHTML = barHtml(M, d); const n = tmp.querySelector(".bt-duty-min"); if (n && n.outerHTML !== mins.outerHTML) mins.replaceWith(n); }
  }
  let promptId = "";
  function wirePrompt(d: Derived) {
    const p = d.prompt;
    const host = M.phone ? "dock-prompt" : "layer";
    const stale = M.phone ? "layer" : "dock-prompt";
    slot(stale, "", "");
    const el = slot(host, p && d.phase === "live" ? promptBlockHtml(M, d, M.phone) : "", p ? `${p.id}|${M.phone}` : "");
    if (!el || !p || d.phase !== "live") { promptId = ""; return; }
    if (promptId === p.id && !fresh(el)) return;
    promptId = p.id; fresh(el);
    const node = el.querySelector<HTMLElement>(".bt-prompt");
    if (node) initPrompt(node, { onAccept: () => void accept(p.id), onDecline: () => void decline(p.id), onExpire: () => schedule() });
  }
  function wireCues() {
    const el = root.querySelector<HTMLElement>('[data-slot="cues"]');
    if (!el || (el as any)._cues) return;
    (el as any)._cues = true;
    initCueCards(el, { onPosted: (id) => void cueAct(id, "posted"), onDone: (id) => void cueAct(id, "done") });
  }

  // ---- what ticks without a redraw: the clock, the viewers, the away countdown
  function patchLive() {
    const pub = M.pub;
    const clock = root.querySelector<HTMLElement>("[data-clock]");
    if (clock && pub?.actualStart) clock.textContent = fmtClock(Date.now() - pub.actualStart);
    const v = root.querySelector<HTMLElement>("[data-viewers]");
    if (v) v.textContent = (pub?.viewers.total || 0).toLocaleString("en-US");
    const away = M.duty?.onDuty[M.me.uid]?.away;
    if (away) root.querySelectorAll<HTMLElement>(".bt-duty-bar.is-away .bt-duty-who small").forEach((s) => { s.textContent = awayText(away.until, Date.now()); });
    // the little numbers on the chat headers follow the rooms without redrawing the embeds
    for (const r of D.rooms) {
      const small = root.querySelector<HTMLElement>(`.md-feed[data-room="${r.room}"] .bt-chat-feed-h small`);
      if (small) small.textContent = `${r.lead || "no lead"}${r.viewers != null ? ` · ${r.viewers.toLocaleString("en-US")}` : ""}`;
    }
  }
  let ticker = 0;
  const startTicker = () => { if (!ticker) ticker = window.setInterval(() => { if (!document.hidden) patchLive(); }, 1000); };

  // ---- the heartbeat (the page's one timer that talks to the server): a minute counts when a ping arrived in it
  let hb = 0, lastBeat = 0;
  function syncHeartbeat(d: Derived) {
    const want = d.phase === "live" && (d.clock === "in" || d.clock === "away");
    if (want && !hb) { lastBeat = Date.now(); hb = window.setInterval(() => void beat(), 60_000); }
    else if (!want && hb) { clearInterval(hb); hb = 0; }
  }
  async function beat() {
    const sid = M.pub?.streamId;
    if (!sid) return;
    const gap = Date.now() - lastBeat;
    lastBeat = Date.now();
    if (gap > 150_000) toast("Welcome back. You're still clocked in.", { kind: "info" });   // the laptop slept: the minutes pause, then carry on
    try { await src.call("dutyPing", { streamId: sid }); }
    catch (err) { const r = reasonOf(err); if (r !== "ended" && r !== "notOnDuty") console.warn("mod deck: heartbeat", err); }   // ended / not on duty: the listeners show the wrap-up
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && hb && Date.now() - lastBeat > 150_000) void beat(); });

  // ---- doing things (each is a callable; the server decides)
  const fail = (err: unknown, fallback: string) => toast(messageFor(err, fallback), { kind: "error" });
  function celebrate(kind: "clockin" | "counted") {
    const wrap = root.querySelector<HTMLElement>("[data-stamp]");
    if (!wrap) return;
    wrap.innerHTML = kind === "clockin" ? stampHtml({ kicker: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(Date.now()), label: "ON", sub: "the clock", tone: "primary" }) : stampHtml({ label: "Counted", tone: "lime" });
    wrap.dataset.on = "1";
    const target = root.querySelector<HTMLElement>(".bt-duty-bar, .md-hero") || wrap;
    burst(target, { n: 18 });
    setTimeout(() => { wrap.dataset.on = ""; wrap.innerHTML = ""; }, reduced() ? 1400 : 2000);
  }
  async function clockIn(extra?: { room?: string; role?: string }) {
    const sid = M.pub?.streamId; if (!sid) return;
    const btns = [...root.querySelectorAll<HTMLButtonElement>('[data-act="clockin"], [data-room-take]')];
    btns.forEach((b) => { b.disabled = true; b.setAttribute("aria-busy", "true"); });
    try {
      const body: Record<string, unknown> = { streamId: sid };
      if (!D.seat.length || extra) { body.role = extra?.role || "deckhand"; const room = extra?.room || M.dropRoom || defaultDrop(D); if (room) body.room = room; }
      const r = await src.call("dutyClockIn", body);
      celebrate("clockin");
      toast(r?.already ? "You're already clocked in." : r?.showed ? "You're on the clock. +5 Gears for showing up on time." : "You're on the clock. Thanks for covering.");
    } catch (err) { fail(err, "Couldn't clock you in. Try again."); }
    finally { btns.forEach((b) => { if (b.isConnected) { b.disabled = false; b.removeAttribute("aria-busy"); } }); }
  }
  async function stepAway(kind: string) {
    const sid = M.pub?.streamId; if (!sid) return;
    try { await src.call("dutyStepAway", { streamId: sid, kind }); toast(kind === "done" ? "You're clocked out. Thanks for tonight." : "Stepped away. Your minutes pause until you're back.", { kind: "info" }); }
    catch (err) { fail(err, "Couldn't step you away. Try again."); }
  }
  async function back() {
    const sid = M.pub?.streamId; if (!sid) return;
    try { await src.call("dutyBack", { streamId: sid }); toast("Welcome back. Your minutes are counting again."); }
    catch (err) { fail(err, "Couldn't bring you back. Try again."); }
  }
  async function accept(id: string) {
    const sid = M.pub?.streamId; if (!sid) return;
    M.answered.add(id); schedule();
    try { const r = await src.call("dutyTakeLead", { streamId: sid, promptId: id }); toast(r?.kind === "handoff" ? `You have the lead.${r.takeover ? " +5 Gears for taking over." : ""}` : "You're acting Captain tonight. Thank you."); }
    catch (err) { fail(err, "Couldn't take that. Try again."); }
  }
  async function decline(id: string) {
    const sid = M.pub?.streamId; if (!sid) return;
    M.answered.add(id); schedule();
    try { await src.call("dutyDecline", { streamId: sid, promptId: id }); }
    catch (err) { fail(err, "Couldn't send that. Try again."); }
  }
  async function postNote(text: string) {
    try { await src.call("crewNote", { text }); }
    catch (err) { fail(err, "Couldn't post that note. Try again."); }
  }
  async function deleteNote(id: string) {
    try { await src.call("crewNoteDelete", { noteId: id }); }
    catch (err) { fail(err, "Couldn't delete that note. Try again."); }
  }
  async function cueAct(id: string, action: "posted" | "done") {
    const [runId, cueId] = id.split("/");
    try { await src.call("chatGameCue", { runId, cueId, action }); }
    catch (err) { if ((err as any)?.code === "functions/not-found") toast("Chat Games isn't switched on yet.", { kind: "info" }); else fail(err, "Couldn't mark that cue. Try again."); }
  }

  // ---- Part 5: flags, the helm strip (Captain tools), Reassign, Confirm tonight's crew
  const chime = makeChime();
  let stopTitle: (() => void) | null = null, knownFlags = new Set<string>(), flagsInit = false;
  const sid = () => M.pub?.streamId || "";
  function renderFlags() {
    const html = flagStackHtml(M.flags, { now: M.now, soundOff: M.flags.length > 0 && !chime.isReady(), extra: "also sent to admins on duty" });
    const el = slot("flags", html, `${M.flags.map((f) => f.id + (f.seenAt ? "s" : "n")).join()}|${chime.isReady()}`);
    if (el && !(el as any)._flags) {
      (el as any)._flags = true;
      initFlags(el, { onSeen: (id: string) => void ackFlag(id, "seen"), onDone: (id: string) => void ackFlag(id, "done"), onSound: () => { chime.arm(); schedule(); } });
    }
  }
  async function ackFlag(flagId: string, action: "seen" | "done") {
    try { await src.call("liveFlagAck", { streamId: sid(), flagId, action }); if (action === "done") M.flags = M.flags.filter((f) => f.id !== flagId); else M.flags = M.flags.map((f) => (f.id === flagId ? { ...f, seenAt: Date.now() } : f)); schedule(); }
    catch (err) { fail(err, "Couldn't answer that flag. Try again."); }
  }
  function onFlags(list: typeof M.flags) {
    const fresh = list.filter((f) => !knownFlags.has(f.id) && !f.seenAt);
    knownFlags = new Set(list.map((f) => f.id));
    M.flags = list;
    if (flagsInit && fresh.length) { chime.play(); stopTitle?.(); stopTitle = flagTitle("Mod Deck"); }
    flagsInit = true;
    if (!list.some((f) => !f.seenAt)) { stopTitle?.(); stopTitle = null; }
    schedule();
  }
  function renderHelm(d: Derived) {
    const kind = d.isCaptain ? "captain" : d.isLead ? "lead" : null;
    const tiktokRoom = d.roles.some((r) => r.room === "tiktok");
    if (!kind || d.after || (M.me.owner && !d.isCaptain)) { slot("helm", "", ""); return; }
    const duty = M.duty;
    const people = Object.entries(duty?.onDuty || {}).map(([uid, entry]) => ({ uid, entry, me: uid === M.me.uid }));
    const gaps = d.rooms.filter((r) => r.state === "needed").map((r) => ({ room: r.room, name: r.name }));
    const locked = (duty?.lockedOut || []).filter((x) => kind === "captain" || x.room === d.myRoom);
    const input = { kind, open: M.tool, lockedOut: locked, done: M.unlocked, tiktok: M.pub?.viewers.byPlatform?.tiktok ?? null, people, gaps, owner: M.me.owner, afterShow: d.after, formats: M.formats, runningFormat: curRun()?.formatId ?? null, haveChatGames: !!window.btChatGames, streamId: sid(), tiktokRoom } as Parameters<typeof helmHtml>[0];
    const key = JSON.stringify([kind, M.tool, locked.map((x) => x.uid + x.beat), M.unlocked, input.tiktok, people.map((p) => [p.uid, p.entry.roles, !!p.entry.away]), gaps, M.formats.map((f) => f.id), curRun(), !!window.btChatGames]);
    const el = slot("helm", helmHtml(input), key);
    if (el && fresh(el)) initLaunch(el as any, { onLaunch: (id: string, state: string) => launch(id, state) });
  }
  /** The launch tiles. Chat Games (agreed contract): Start and Swap open its launch flow, End ends the run; it owns every message after that. */
  function launch(id: string, state: string) {
    if (id === "afterShow") { toast("Start the after-show from the Control Room.", { kind: "info" }); return; }
    const cg = window.btChatGames;
    if (!id.startsWith("cg:") || !cg) return;
    const run = curRun();
    if (state === "running" && run) void cg.end({ runId: run.runId });
    else void cg.openLaunch({ formatId: id.slice(3), streamId: sid() });
  }
  /** The Chat Game on stream: public/live.chatGame (any format, so Captains who aren't A2+ can end it here), else a crew-hosted run from private/duty. */
  const curRun = () => { const p = M.pub?.chatGame; return p && p.runId && p.formatId ? { runId: p.runId, formatId: p.formatId } : M.run; };
  /** Which active run is on this stream (re-read when private/duty's activeRunIds or the stream change). */
  let runKey = "";
  function syncRun() {
    const s = sid(), ids = (M.duty?.chatGames?.activeRunIds || []).filter((x) => typeof x === "string");
    const key = `${s}|${ids.join(",")}`;
    if (key === runKey) return;
    runKey = key;
    if (!s || !ids.length) { M.run = null; return; }
    void src.activeRun(s, ids).then((r) => { if (runKey === key) { M.run = r; schedule(); } }, () => {});
  }
  function openFlagDialog() {
    const rooms = D.streamRooms.length ? D.streamRooms : ROOM_ORDER;
    let type = "", room: Room | null = D.myRoom || (rooms[0] as Room) || null, busy = false;
    const m = openModal({ title: "Flag to Boomer", feature: "mod-deck", content: modalHeader("Flag to Boomer", flagSubtitle(false)) + `<div class="bt-modal-body" data-flagform></div>` });
    const box = m.modal.querySelector<HTMLElement>("[data-flagform]")!;
    const paint = () => {
      const note = box.querySelector<HTMLTextAreaElement>("[data-fnote]")?.value || "";
      box.innerHTML = flagFormHtml({ rooms: rooms as Room[], room, type });
      const ta = box.querySelector<HTMLTextAreaElement>("[data-fnote]")!; ta.value = note;
      const sendBtn = box.querySelector<HTMLButtonElement>('[data-act="send-flag"]')!;
      const sync = () => { box.querySelector<HTMLElement>("[data-fcount]")!.textContent = `${ta.value.length} / 280`; sendBtn.disabled = busy || !type || !room || ta.value.trim().length < 10; };
      ta.addEventListener("input", sync); sync();
      const sub = m.modal.querySelector<HTMLElement>(".bt-modal-subtitle"); if (sub) sub.textContent = flagSubtitle(!!FLAG_TYPES.find((t) => t.key === type)?.urgent);
    };
    paint();
    box.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      const ft = t.closest<HTMLElement>("[data-ftype]"); if (ft) { type = ft.dataset.ftype!; return paint(); }
      const fr = t.closest<HTMLElement>("[data-froom]"); if (fr) { room = fr.dataset.froom as Room; return paint(); }
      if (!t.closest('[data-act="send-flag"]')) return;
      busy = true; paint();
      try {
        await src.call("liveFlag", { streamId: sid(), type, room, note: box.querySelector<HTMLTextAreaElement>("[data-fnote]")!.value.trim() });
        m.close(); toast("Flag sent to Boomer.");
      } catch (err) {
        busy = false; paint();
        const e2 = box.querySelector<HTMLElement>(".bt-error"); if (e2) { e2.textContent = messageFor(err, "Couldn't send that flag. Try again."); e2.hidden = false; }
      }
    });
  }
  async function unlock(uid: string, beat: string) {
    const who = M.duty?.lockedOut.find((x) => x.uid === uid && x.beat === beat);
    try { await src.call("liveUnlock", { streamId: sid(), uid, beat }); M.unlocked = [...M.unlocked, { uid, handle: who?.handle ?? null, beat }]; if (M.duty) M.duty = { ...M.duty, lockedOut: M.duty.lockedOut.filter((x) => !(x.uid === uid && x.beat === beat)) }; toast("Unlocked. They get one more try."); schedule(); }
    catch (err) { fail(err, "Couldn't unlock them. Try again."); }
  }
  async function saveTiktok() {
    const input = root.querySelector<HTMLInputElement>("[data-tiktok-in]"); if (!input) return;
    const n = Number(input.value);
    if (!Number.isInteger(n) || n < 0) return void toast("Type the viewer count as a whole number.", { kind: "error" });
    try { await src.call("liveViewerEntry", { streamId: sid(), viewers: n }); toast("TikTok viewers saved."); }
    catch (err) { fail(err, "Couldn't save that. Try again."); }
  }
  function openMove(uid: string, fillRoom?: Room) {
    const entry = M.duty?.onDuty[uid]; if (!entry && !fillRoom) return;
    const rooms = D.rooms.filter((r) => r.state !== "off").map((r) => ({ room: r.room, name: r.name, lead: r.lead, boost: r.boost ? String(Math.round(M.boost * 10) / 10) : "" }));
    const m = openModal({ title: "Reassign", feature: "mod-deck", content: modalHeader(`Move @${entry?.handle || "crew"}`, "A Deckhand move is immediate. Lead and Captain need their accept.") + `<div class="bt-modal-body" data-move></div>` });
    const box = m.modal.querySelector<HTMLElement>("[data-move]")!;
    const opts = moveOptions(entry!, rooms, D.isCaptain);
    if (entry && D.isCaptain) opts.push({ key: "captain:", chat: "twitch", title: "Stream Captain", sub: "They get an accept prompt" });
    opts.push({ key: "free:", chat: "twitch", title: "Free the seat", sub: "A Lead steps down to Deckhand, a Deckhand clocks out" });
    let chosen = fillRoom ? `lead:${fillRoom}` : "";
    const paint = () => { box.innerHTML = moveListHtml(opts, chosen) + `<p class="bt-error" role="alert" hidden></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-act="do-move"${chosen ? "" : " disabled"}>Move</button></div>`; };
    paint();
    box.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      const pick = t.closest<HTMLElement>("[data-pick]"); if (pick) { chosen = pick.dataset.pick!; return paint(); }
      if (!t.closest('[data-act="do-move"]')) return;
      const [role, room] = chosen.split(":");
      const free = role === "free" ? (entry?.roles.find((r) => r.role !== "captain")?.room ?? undefined) : room;
      try {
        const r = await src.call("dutyReassign", { streamId: sid(), uid, role, ...(role === "captain" ? {} : { room: free }) });
        m.close(); toast(r?.prompt ? "Sent. They have a few minutes to accept." : "Done.");
      } catch (err) { const e2 = box.querySelector<HTMLElement>(".bt-error"); if (e2) { e2.textContent = messageFor(err, "Couldn't move them. Try again."); e2.hidden = false; } }
    });
  }
  /** Fill a lead gap: pick who among the people on duty. Opens the Reassign list scoped to that room. */
  function openFill(room: Room) {
    const cands = Object.entries(M.duty?.onDuty || {}).filter(([, e]) => e.grade >= 2 && !e.away && !e.roles.some((r) => r.role === "lead"));
    if (!cands.length) return void toast("Nobody on duty is a Lead grade yet.", { kind: "info" });
    const m = openModal({ title: "Fill the lead", feature: "mod-deck", content: modalHeader(`Fill ${ROOM_NAME[room]}`, "Pick who to ask.") + `<div class="bt-modal-body"><div class="bt-pick-list">${cands.map(([uid, e]) => `<button type="button" class="bt-pick" data-who="${uid}"><span class="bt-pick-main"><b>@${esc(e.handle || "crew")}</b><small>${esc(e.roles.map((r) => r.role + " " + (r.room || "")).join(", "))}</small></span><span class="bt-pick-act">Ask</span></button>`).join("")}</div></div>` });
    m.modal.addEventListener("click", async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-who]"); if (!b) return;
      try { await src.call("dutyReassign", { streamId: sid(), uid: b.dataset.who, role: "lead", room }); m.close(); toast("Sent. They have a few minutes to accept."); }
      catch (err) { fail(err, "Couldn't ask them. Try again."); }
    });
  }
  async function confirmNight() {
    if (M.confirmBusy) return;
    M.confirmBusy = true; schedule();
    try { await src.call("dutyConfirmNight", { streamId: sid(), added: Object.fromEntries(Object.entries(M.added).filter(([, v]) => v > 0)) }); toast("Crew confirmed. Gears are paid."); if (M.duty) M.duty = { ...M.duty, confirmedAt: Date.now(), needsConfirm: false }; }
    catch (err) { fail(err, "Couldn't confirm the crew. Try again."); }
    finally { M.confirmBusy = false; schedule(); }
  }

  // ---- clicks on the page (the kit's duty bar, prompt, notes and cue cards wire themselves)
  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const q = (sel: string) => t.closest<HTMLElement>(sel);
    if (q('[data-act="clockin"]')) return void clockIn();
    const drop = q("[data-drop-room]"); if (drop) { M.dropRoom = drop.dataset.dropRoom as Room; return schedule(); }
    const take = q("[data-room-take]");
    if (take) {
      const room = take.closest<HTMLElement>("[data-md-room]")?.dataset.mdRoom as Room;
      const how = takeFor(M, D, room);
      if (how === "prompt") { const p = Object.values(M.duty?.prompts || {}).find((x) => x.kind === "handoff" && x.room === room && x.status === "open"); if (p) void accept(p.id); }
      else if (how === "clockin") void clockIn({ room, role: "lead" });
      return;
    }
    const tool = q("[data-tool]"); if (tool) { const k = tool.dataset.tool as Tool; M.tool = M.tool === k ? null : k; return schedule(); }
    const ul = q("[data-unlock]"); if (ul) { const [u, b] = (ul.dataset.unlock || "").split("|"); return void unlock(u, b); }
    if (q('[data-act="tiktok-save"]')) return void saveTiktok();
    const mv = q("[data-move]"); if (mv && mv.closest(".md-reassign")) return openMove(mv.dataset.move || "");
    const fl = q("[data-fill]"); if (fl) return openFill(fl.dataset.fill as Room);
    const stp = q("[data-step]"); if (stp) { const [u, dv] = (stp.dataset.step || "").split("|"); M.added = { ...M.added, [u]: Math.max(0, (M.added[u] || 0) + Number(dv)) }; return schedule(); }
    if (q('[data-act="confirm-night"]')) return void confirmNight();
    if (q('[data-act="focus"]')) { M.focus = !M.focus; return schedule(); }
    const cr = q("[data-chat-room]"); if (cr) { M.chatRoom = cr.dataset.chatRoom as Room; return schedule(); }
    const tab = q("[data-tab]"); if (tab) { M.tab = tab.dataset.tab as Tab; root.dataset.tab = M.tab; root.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => { const on = b === tab; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", String(on)); }); return; }
    const copy = q("[data-copy]");
    if (copy) {
      const line = linesTexts(M, D)[copy.dataset.copy || ""];
      if (!line || !line.text) return void toast("Nothing to copy yet.", { kind: "info" });
      void copyText(line.text).then((ok) => {
        if (!ok) return toast("Couldn't copy. Select the text and copy it by hand.", { kind: "error" });
        copy.textContent = "Copied"; copy.classList.add("is-done"); setTimeout(() => { if (copy.isConnected) { copy.textContent = "Copy"; copy.classList.remove("is-done"); } }, 2000);
      });
      return;
    }
    const sw = q("[data-swap-take]");
    if (sw) {
      const row = sw.closest<HTMLElement>("[data-swap]"); const s = M.swaps.find((x) => x.id === row?.dataset.swap);
      if (!s) return;
      const io = { call: (n: string, d?: unknown) => src.call(n, d) } as unknown as Io;
      void takeSwap(io, s, row).then(async (ok) => { setTimeout(async () => { M.swaps = await src.swaps().catch(() => M.swaps); await loadSeats(); schedule(); }, ok ? 650 : 0); });
    }
  });

  // ---- data in
  const celebrated = { counted: false, duty60: false };
  function myRoom() { src.setRoom(D.myRoom ?? myRoomOf(D.seat)); }
  let streamFor = "";
  async function loadSeats() {
    const sid = M.pub?.streamId || null;
    if (sid && sid !== streamFor) { streamFor = sid; M.stream = null; M.stream = await src.loadStream(sid).catch(() => null); }
    if (!sid) { streamFor = ""; M.stream = null; }
    if (!M.pub || M.pub.state === "off" || M.pub.state === "ended") M.next = await src.loadNext().catch(() => null);
  }
  src.start({
    pub: (p) => { const was = M.pub?.streamId, st = M.pub?.state; M.pub = p; if (p.streamId !== was || p.state !== st) { void loadSeats().then(schedule); if (p.state === "off") void src.swaps().then((s) => { M.swaps = s; schedule(); }).catch(() => {}); } schedule(); },
    duty: (d) => { M.duty = d; syncRun(); schedule(); },
    rec: (r) => {
      const prev = M.rec; M.rec = r;
      if (r && prev && prev.minutes < 60 && r.minutes >= 60 && !celebrated.duty60) { celebrated.duty60 = true; toast("Duty counted. That's one more for this month."); const ring = root.querySelector<HTMLElement>(".bt-duty-ring"); if (ring) burst(ring, { n: 12 }); }
      if (r && prev && !prev.counted && r.counted && !celebrated.counted) { celebrated.counted = true; setTimeout(() => celebrate("counted"), 400); }
      schedule();
    },
    notes: (n) => { M.notes = freshNotes(n); schedule(); },
    cues: (c) => { M.cues = c; schedule(); },
    flags: onFlags,
  });
  void src.formats().then((f) => { M.formats = f; schedule(); });
  void src.youtubeBoost().then((b) => { M.boost = b; schedule(); });
  void src.swaps().then((s) => { M.swaps = s; schedule(); }).catch(() => {});
  void loadSeats().then(schedule);

  // ---- phones: one chat at a time and the three tabs (container queries do the layout; this only decides what is worth loading)
  const measure = () => { const w = (frame || root).clientWidth; const phone = w <= 640; if (phone !== M.phone) { M.phone = phone; schedule(); } };
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(measure).observe(frame || root);
  measure();
  // notes older than a day vanish even before the TTL removes them: re-check on a slow beat that is not a data read
  setInterval(() => { if (!document.hidden) { M.notes = freshNotes(M.notes); schedule(); } }, 60_000);
  startTicker();
  render();
}
