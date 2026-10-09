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
import { toast, messageFor, copyText, reduced } from "./ui";
import { realSource, freshNotes, myRoomOf, roleLine, type Me, type Room, type Source } from "./mod-deck-data";
import { previewRequest, previewMe, previewSource } from "./mod-deck-preview";
import {
  derive, takeFor, heroHtml, barHtml, awayText, promptBlockHtml, roomsStripHtml, wallHtml, wallKey, linesHtml, linesTexts, notesHtml, cuesHtml, liveBodyHtml, tabsHtml, offHtml, endedHtml,
  defaultDrop, fmtClock, type Model, type Derived, type Tab,
} from "./mod-deck-view";

initSegNavs();
initPowerWordmarks();
const dockBar = document.querySelector<HTMLElement>("[data-lv-dock]");
const stickyBar = dockBar ? initStickyBar(dockBar, {}) : null;

const shell = document.querySelector<HTMLElement>("[data-deck]")!;
const root = document.querySelector<HTMLElement>("[data-md]")!;
const preview = previewRequest();

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
      slot("cues", cuesHtml(M, d));
      slot("lines", linesHtml(M, d));
    } else if (d.phase === "off") {
      slot("main", offHtml(M, d), `off|${M.next?.id}|${M.next?.seat.map((r) => r.role + r.room).join()}|${JSON.stringify(M.swaps.map((s) => [s.id, s.status]))}`);
      slot("lines", linesHtml(M, d));
    } else {
      slot("main", endedHtml(M, d), `ended|${JSON.stringify(M.rec)}|${M.duty?.confirmedAt}`);
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
      initDutyBar(el, { lead: d.isLead || d.isCaptain, onAway: (kind) => void stepAway(kind), onBack: () => void back(), onFlag: () => toast("Flags arrive in the next update", { kind: "info" }) });
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
    duty: (d) => { M.duty = d; schedule(); },
    rec: (r) => {
      const prev = M.rec; M.rec = r;
      if (r && prev && prev.minutes < 60 && r.minutes >= 60 && !celebrated.duty60) { celebrated.duty60 = true; toast("Duty counted. That's one more for this month."); const ring = root.querySelector<HTMLElement>(".bt-duty-ring"); if (ring) burst(ring, { n: 12 }); }
      if (r && prev && !prev.counted && r.counted && !celebrated.counted) { celebrated.counted = true; setTimeout(() => celebrate("counted"), 400); }
      schedule();
    },
    notes: (n) => { M.notes = freshNotes(n); schedule(); },
    cues: (c) => { M.cues = c; schedule(); },
  });
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
