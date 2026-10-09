// Sample data for the Mod Deck (non-production only, signed out): /live/deck?state=off|open|duty|away|prompt|acting|ended|after and ?as=deckhand|lead|captain|owner.
// Also ?look=crt (the house look), ?paid=1 (the ended view after the Captain confirmed), ?confirm=1 (the Confirm tonight's crew panel, no ?state needed), ?cue=0 (no Chat Games cue). Same shapes as the real reads (mod-deck-data.ts); times are relative to
// now. Practice only: Clock in, Step away, I'm back, Take the lead, notes and cues all run on this local copy and say so in the toast. Nothing here reaches Firestore or a callable.
import type { Swap } from "../planner/plan-data";
import { isProduction } from "../../lib/env.js";
import { BEATS, type Beat } from "./model";
import { toast } from "./ui";
import { dutyFrom, myRoomOf, recFrom, roleLine, type ChatFormat, type Flag, type Cue, type DutyRec, type DutyState, type Handlers, type Me, type Note, type OnDutyEntry, type PubDeck, type Room, type SeatRole, type Source, type StreamInfo } from "./mod-deck-data";

export type Kind = "off" | "open" | "duty" | "away" | "prompt" | "acting" | "ended" | "after";
export const KINDS: Kind[] = ["off", "open", "duty", "away", "prompt", "acting", "ended", "after"];
export type As = "deckhand" | "lead" | "captain" | "owner";
export const AS_LIST: As[] = ["deckhand", "lead", "captain", "owner"];
const q = () => new URLSearchParams(location.search);

/** Null on production and whenever the address has neither switch. ?as= alone means the live "open" state; ?state= alone means a Captain. */
export function previewRequest(): { kind: Kind; as: As } | null {
  if (isProduction) return null;
  const p = q(), s = p.get("state"), a = p.get("as");
  // ?confirm=1 is the Captain's "Confirm tonight's crew" panel on its own: the ended view, with this person as the Captain who stopped the night
  const kind = p.get("confirm") === "1" ? "ended" : KINDS.includes(s as Kind) ? (s as Kind) : null, as = AS_LIST.includes(a as As) ? (a as As) : null;
  if (!kind && !as) return null;
  return { kind: kind || "duty", as: as || "captain" };
}

const MIN = 60_000, HOUR = 3_600_000;
const ME_ID = "me";
export function previewMe(as: As): Me {
  const owner = as === "owner";
  return { uid: ME_ID, handle: owner ? "boomertanger" : "gbo", name: owner ? "Boomer" : "GBO", owner, admin: owner, grade: owner ? null : { track: "mod", grade: as === "deckhand" ? 1 : 3 }, level: owner ? 4 : as === "deckhand" ? 1 : 3, preview: true };
}
const seatFor = (as: As): SeatRole[] => (as === "captain" ? [{ role: "captain", room: null }, { role: "lead", room: "twitch" }] : as === "lead" ? [{ role: "lead", room: "twitch" }] : as === "deckhand" ? [{ role: "deckhand", room: "twitch" }] : []);

const PEOPLE: Record<string, { handle: string; grade: number; roles: SeatRole[] }> = {
  nightowl: { handle: "nightowl", grade: 4, roles: [{ role: "deckhand", room: "twitch" }] },
  hollowgrin: { handle: "hollowgrin", grade: 2, roles: [{ role: "lead", room: "ytLandscape" }] },
  mothlight: { handle: "mothlight", grade: 1, roles: [{ role: "lead", room: "tiktok" }] },
  vexx: { handle: "vexx", grade: 2, roles: [{ role: "lead", room: "twitch" }] },
};
const ROOMS: Room[] = ["twitch", "ytLandscape", "ytVertical", "tiktok"];
const lineKeyOf = (r: SeatRole) => (r.role === "captain" ? "captain" : `${r.role}:${r.room}`);
const primaryOf = (as: As): SeatRole => (seatFor(as).find((r) => r.role === "captain") || seatFor(as)[0] || { role: "deckhand", room: "twitch" }) as SeatRole;

function coverage(onDuty: Record<string, OnDutyEntry>, rooms: Room[]) {
  const out: DutyState["rooms"] = {};
  for (const room of rooms) {
    let lead: string | null = null, hands = 0;
    for (const p of Object.values(onDuty)) { if (p.away) continue; for (const r of p.roles) { if (r.room !== room) continue; if (r.role === "lead" && !lead) lead = p.handle; if (r.role === "deckhand") hands++; } }
    out[room] = { lead, deckhands: hands, covered: !!lead };
  }
  return out;
}

export function previewSource(me: Me, kind: Kind, as: As): Source {
  const now = Date.now();
  const after = kind === "after", live = !["off", "ended"].includes(kind);
  const rooms: Room[] = after ? ["site"] : ROOMS;
  const seat = seatFor(as);
  const beat: Beat = "break1";
  const beats: PubDeck["beats"] = {};
  BEATS.forEach((k, i) => { beats[k] = { status: i < BEATS.indexOf(beat) ? "done" : i === BEATS.indexOf(beat) ? "now" : "next", checkins: [214, 302, 0, 0][i] }; });

  // who is on duty
  const onDuty: Record<string, OnDutyEntry> = {};
  const add = (uid: string, handle: string, grade: number, roles: SeatRole[], since = now - 70 * MIN) => { onDuty[uid] = { handle, grade, since, roles, away: null }; };
  const myRoles = (): SeatRole[] => (after ? [{ role: "deckhand", room: "site" }] : seat.length ? seat : [{ role: "deckhand", room: "twitch" }]);
  if (!after) {
    add("u-hg", "hollowgrin", 2, PEOPLE.hollowgrin.roles); add("u-ml", "mothlight", 1, PEOPLE.mothlight.roles);
    if (as !== "lead" && as !== "captain") add("u-vx", "vexx", 2, PEOPLE.vexx.roles);
    if (as !== "captain") add("u-no", "nightowl", 4, [{ role: "captain", room: null }, ...(as === "deckhand" ? [] : [{ role: "deckhand", room: "twitch" } as SeatRole])]);
    else add("u-no", "nightowl", 4, [{ role: "deckhand", room: "twitch" }]);
  } else add("u-no", "nightowl", 4, [{ role: "deckhand", room: "site" }]);
  if (["duty", "away", "prompt", "acting"].includes(kind) && !me.owner) {
    let roles = myRoles();
    if (kind === "prompt") roles = [{ role: "deckhand", room: "ytLandscape" }];
    if (kind === "acting") roles = [{ role: "deckhand", room: "twitch" }];
    add(ME_ID, me.handle, me.level, roles, now - 74 * MIN);
    if (kind === "away") onDuty[ME_ID].away = { until: now + 14 * MIN + 32_000, kind: "15", at: now - 28_000 };
  }
  if (kind === "prompt") { onDuty["u-hg"].away = { until: now + 15 * MIN, kind: "15", at: now - 34_000 }; }
  const captain = after ? null : kind === "acting" ? null : as === "captain" && onDuty[ME_ID] && kind !== "prompt" ? { uid: ME_ID, handle: me.handle, acting: false, since: now - 74 * MIN } : { uid: "u-no", handle: "nightowl", acting: false, since: now - 70 * MIN };
  if (kind === "prompt" && as === "captain") onDuty[ME_ID].roles = [{ role: "deckhand", room: "ytLandscape" }];
  const prompts: DutyState["prompts"] = {};
  if (kind === "prompt") prompts.h1 = { id: "h1", kind: "handoff", room: "ytLandscape", from: "u-hg", fromHandle: "hollowgrin", to: [ME_ID], createdAt: now - 34_000, expiresAt: now + 86_000, status: "open" };
  if (kind === "acting") prompts.c1 = { id: "c1", kind: "actingCaptain", to: ME_ID, createdAt: now - 34_000, expiresAt: now + 86_000, status: "open" };

  const duty: DutyState | null = live || kind === "ended" ? dutyFrom({
    streamId: "pv-deck", state: kind === "ended" ? "ended" : "live", startedAt: now - 72 * MIN, endedAt: kind === "ended" ? now - 9 * MIN : null, afterShow: after,
    captainNow: captain, onDuty: kind === "ended" ? {} : onDuty, prompts, rooms: kind === "ended" ? {} : coverage(onDuty, rooms), needsConfirm: kind === "ended", confirmedAt: kind === "ended" && q().get("paid") === "1" ? now - 2 * MIN : null,
    chatGames: q().get("cue") === "0" ? undefined : { activeRunIds: ["pv-run"] },
    lockedOut: live ? { "u1_start": { uid: "u1", handle: "dreadfern", room: "twitch", beat: "start" }, "u2_start": { uid: "u2", handle: "kitwick", room: "ytLandscape", beat: "start" } } : {},
    flagsSeen: {},
    captainAtStop: kind === "ended" && (as === "captain" || q().get("confirm") === "1") ? ME_ID : "u-no",
    night: kind === "ended" ? { minutes: 192, rows: [
      { uid: ME_ID, handle: me.handle, grade: me.level, lines: { [lineKeyOf(primaryOf(as))]: 192 }, minutes: 192 },
      { uid: "u-no", handle: "nightowl", grade: 4, lines: { "deckhand:twitch": 141 }, minutes: 141 },
      { uid: "u-hg", handle: "hollowgrin", grade: 2, lines: { "lead:ytLandscape": 176 }, minutes: 176 },
      { uid: "u-ml", handle: "mothlight", grade: 1, lines: { "lead:tiktok": 54 }, minutes: 54 },
    ] } : null,
  }) : null;

  const lineKey = (r: SeatRole) => (r.role === "captain" ? "captain" : `${r.role}:${r.room}`);
  const primary = (seat.find((r) => r.role === "captain") || seat[0] || { role: "deckhand", room: "twitch" }) as SeatRole;
  const paid = q().get("paid") === "1";
  let rec: DutyRec | null = null;
  if (["duty", "away", "prompt", "acting"].includes(kind) && !me.owner) rec = recFrom({ streamId: "pv-deck", minutes: 74, lines: { [lineKey(myRoles()[0])]: 74 }, scheduled: seat[0] || null, showed: true, clockedInAt: now - 74 * MIN });
  if (kind === "ended" && !me.owner) rec = recFrom({ streamId: "pv-deck", minutes: 192, lines: { [lineKey(primary)]: 192 }, scheduled: seat[0] || null, showed: true, counted: paid, led: as !== "deckhand", gears: paid ? 38 : null, confirmedAt: paid ? now - 2 * MIN : null, clockedInAt: now - 200 * MIN, endedAt: now - 9 * MIN });

  const pub: PubDeck = {
    state: kind === "off" ? "off" : kind === "ended" ? "ended" : after ? "backstage" : "live", look: q().get("look") === "crt" ? "crt" : "hull", streamId: kind === "off" ? null : "pv-deck",
    title: kind === "off" ? null : after ? "Late-night backstage" : "Monster Monday", type: after ? "backstage" : "platform", beat: live ? beat : null, beats: live || kind === "ended" ? beats : {}, window: { open: false, closesAt: null, beat: null },
    liveRooms: live ? rooms : [], counts: { total: 0, byBeat: {}, byRoom: {} }, viewers: live ? { total: after ? 96 : 469, byPlatform: after ? {} : { twitch: 212, ytLandscape: 88, ytVertical: 41, tiktok: 128 } } : { total: 0, byPlatform: {} },
    actualStart: kind === "ended" ? now - 201 * MIN : live ? now - 72 * MIN - 40_000 : null, actualEnd: kind === "ended" ? now - 9 * MIN : null, peak: kind === "ended" ? 486 : 0, game: live && !after ? { gameId: "soul-hunt", title: "Soul Hunt", startedAt: now - 47 * MIN } : null, nextGame: null,
    crew: { captain: null, chats: {}, onDuty: [], grades: [] }, firstIn: [], firstInBeat: null, activity: null,
    deck: { rooms: duty ? duty.rooms : {} },
  };

  let notes: Note[] = [
    { id: "n1", uid: "u-no", handle: "nightowl", grade: 3, track: "mod", text: "Raid from a big channel likely at Break 2, be ready with welcomes", createdAt: now - 2 * MIN },
    { id: "n2", uid: "u-hg", handle: "hollowgrin", grade: 2, track: "mod", text: "I can cover Vertical for 20 min after the break", createdAt: now - 18 * MIN },
  ];
  let cues: Cue[] = kind === "off" || kind === "ended" || after || q().get("cue") === "0" ? [] : [{ id: "c1", runId: "pv-run", order: 1, kicker: "Dead Air · clue 3 for YT vertical", text: "The keeper's logbook is missing its last page. Someone tore it out with ink-stained fingers.", due: now + 6 * MIN, state: "pending" }];

  const nextStart = now + 26 * HOUR + 12 * MIN;
  const nextInfo: StreamInfo = { id: "pv-next", title: "Friday Frights", start: nextStart, end: nextStart + 3 * HOUR, type: "platform", rooms: ROOMS, adhoc: false, captain: "nightowl", seat };
  const liveInfo: StreamInfo = { id: "pv-deck", title: pub.title || "Monster Monday", start: now - 72 * MIN, end: now + 108 * MIN, type: after ? "backstage" : "platform", rooms, adhoc: after, captain: "nightowl", seat: after ? [] : seat };
  const day = 86_400_000;
  const swaps: Swap[] = [
    { id: "pv-s1", streamId: "pv-x", room: "ytVertical", role: "lead", fromUid: "u-ml", fromHandle: "mothlight", droppedAt: now - 3 * HOUR, startsAt: now + 3 * day, notice: "early", status: "open", takenBy: null, takenByHandle: null, takenAt: null },
    { id: "pv-s2", streamId: "pv-y", room: "twitch", role: "deckhand", fromUid: "u-no", fromHandle: "nightowl", droppedAt: now - HOUR, startsAt: now + 9 * HOUR, notice: "late", status: "open", takenBy: null, takenByHandle: null, takenAt: null },
  ];

  let flags: Flag[] = q().get("flag") && live ? [
    { id: "f1", type: "pii", room: "ytVertical", note: "Someone posted what looks like a home address. I deleted it and hid the user; screenshot saved.", byHandle: "hollowgrin", urgent: true, createdAt: now - MIN, seenAt: null, doneAt: null },
    ...(q().get("flag") === "plain" ? [{ id: "f2", type: "raid" as const, room: "twitch", note: "Raid incoming from a channel with about 40 viewers, they seem friendly.", byHandle: "vexx", urgent: false, createdAt: now - 6 * MIN, seenAt: null, doneAt: null }] : []),
  ] : [];
  if (q().get("flag") === "urgent") flags = flags.filter((f) => f.urgent);
  const formats: ChatFormat[] = q().get("formats") === "1" ? [{ id: "dead-air", title: "Dead Air", icon: "🕯", sub: "Clues to post, one chat at a time", order: 1 }, { id: "scream-off", title: "Scream Off", icon: "😱", sub: "Rooms compete on one scream", order: 2 }] : [];
  // Chat Games isn't built yet: ?formats=1 also stands in a btChatGames that says what it was asked (?cgapi=0 leaves it out, to see the tiles vanish).
  if (formats.length && q().get("cgapi") !== "0" && !window.btChatGames) {
    const say = (t: string) => toast(t, { kind: "info" });
    window.btChatGames = { openLaunch: (a) => { say(`Preview: Chat Games would open the launch for ${a.formatId}.`); }, end: (a) => { say(`Preview: Chat Games would end ${a.runId}.`); } };
  }
  let h: Handlers | null = null;
  const sync = () => { if (!duty) return; duty.rooms = coverage(duty.onDuty, rooms); pub.deck = { rooms: duty.rooms }; };
  const emit = () => { sync(); h?.pub({ ...pub }); h?.duty(duty ? { ...duty } : null); h?.rec(rec ? { ...rec } : null); h?.notes([...notes]); h?.cues([...cues]); h?.flags(me.admin ? [...flags] : []); };
  const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 260));
  const myRoom = () => (duty?.onDuty[ME_ID] ? myRoomOf(duty.onDuty[ME_ID].roles) : null);
  void roleLine;

  const calls: Record<string, (d: any) => any> = {
    dutyClockIn(d) {
      if (!duty) throw Object.assign(new Error("The stream hasn't started yet."), { code: "bt/msg" });
      const roles: SeatRole[] = seat.length && !after ? seat : [{ role: d?.role === "lead" ? "lead" : "deckhand", room: (d?.room as Room) || rooms[0] }];
      duty.onDuty[ME_ID] = { handle: me.handle, grade: me.level, since: Date.now(), roles, away: null };
      if (roles.some((r) => r.role === "captain")) duty.captainNow = { uid: ME_ID, handle: me.handle, acting: false, since: Date.now() };
      rec = recFrom({ streamId: "pv-deck", minutes: 0, lines: {}, scheduled: seat[0] || null, showed: true, clockedInAt: Date.now() });
      return { ok: true, roles };
    },
    dutyPing() { if (rec) { rec = { ...rec, minutes: rec.minutes + 1 }; } return { ok: true }; },
    dutyStepAway(d) {
      const e = duty?.onDuty[ME_ID]; if (!e || !duty) throw Object.assign(new Error("You're not clocked in."), { code: "bt/msg" });
      if (String(d?.kind) === "done") delete duty.onDuty[ME_ID]; else e.away = { until: Date.now() + Number(d.kind) * MIN, kind: String(d.kind), at: Date.now() };
      return { ok: true };
    },
    dutyBack() { const e = duty?.onDuty[ME_ID]; if (e) e.away = null; return { ok: true }; },
    dutyTakeLead(d) {
      if (d?.promptId == null && d?.room) { const e0 = duty?.onDuty[ME_ID]; if (!e0) throw Object.assign(new Error("You're not clocked in."), { code: "bt/msg" }); e0.roles = [...e0.roles.filter((r) => r.role !== "deckhand"), { role: "lead", room: d.room as Room }]; return { ok: true, kind: "vacant", role: "lead", room: d.room }; }
      const p = duty?.prompts[d?.promptId]; const e = duty?.onDuty[ME_ID]; if (!p || !e || !duty) throw Object.assign(new Error("That prompt is gone."), { code: "bt/msg" });
      if (p.kind === "handoff") { e.roles = [{ role: "lead", room: (p.room as Room) || "twitch" }]; if (duty.onDuty["u-hg"]) duty.onDuty["u-hg"].away = null; }
      else duty.captainNow = { uid: ME_ID, handle: me.handle, acting: true, since: Date.now() };
      delete duty.prompts[p.id]; return { ok: true };
    },
    dutyDecline(d) { if (duty) delete duty.prompts[d?.promptId]; return { ok: true }; },
    crewNote(d) { notes = [{ id: `n${Date.now()}`, uid: ME_ID, handle: me.handle, grade: me.grade?.grade ?? null, track: me.grade?.track || "admin", text: String(d?.text || ""), createdAt: Date.now() }, ...notes]; return { ok: true }; },
    crewNoteDelete(d) { notes = notes.filter((n) => n.id !== d?.noteId); return { ok: true }; },
    chatGameCue(d) { cues = cues.map((c) => (c.id === d?.cueId ? { ...c, state: d.action === "done" ? "done" : "posted" } : c)); return { ok: true }; },
    dutySwapTake() { return { ok: true }; },
    liveUnlock(d) { if (duty) duty.lockedOut = duty.lockedOut.filter((x) => !(x.uid === d?.uid && x.beat === d?.beat)); return { ok: true }; },
    liveViewerEntry(d) { pub.viewers = { ...pub.viewers, byPlatform: { ...pub.viewers.byPlatform, tiktok: Number(d?.viewers) || 0 } }; return { ok: true }; },
    liveFlag(d) { const id = `f${Date.now()}`; return { ok: true, flagId: id, urgent: d?.type === "threat" || d?.type === "pii", id }; },
    liveFlagAck(d) { flags = d?.action === "done" ? flags.filter((f) => f.id !== d.flagId) : flags.map((f) => (f.id === d?.flagId ? { ...f, seenAt: Date.now() } : f)); if (duty) duty.flagsSeen = { ...duty.flagsSeen, [d?.flagId]: true }; return { ok: true }; },
    dutyReassign(d) {
      const target = duty?.onDuty[d?.uid]; if (!target || !duty) throw Object.assign(new Error("They aren't on duty."), { code: "bt/msg" });
      if (d.role === "free") delete duty.onDuty[d.uid]; else target.roles = [{ role: d.role, room: d.role === "captain" ? null : d.room }];
      return { ok: true };
    },
    dutyConfirmNight() { if (duty) { duty.confirmedAt = Date.now(); duty.needsConfirm = false; } if (rec) rec = { ...rec, counted: true, gears: 38, confirmedAt: Date.now() }; return { ok: true }; },
  };
  return {
    preview: true, me,
    start(handlers) { h = handlers; emit(); },
    setRoom() { void myRoom; },
    async call(name, data) { const fn = calls[name]; if (!fn) throw Object.assign(new Error("That isn't part of the preview."), { code: "bt/msg" }); const out = fn(data); emit(); return wait(out); },
    loadStream: async (id) => (id === "pv-next" ? nextInfo : liveInfo),
    loadNext: async () => nextInfo,
    swaps: async () => swaps,
    youtubeBoost: async () => 1.5,
    formats: async () => formats,
    activeRun: async () => (q().get("run") === "1" && formats.length ? { runId: "pv-run", formatId: formats[0].id } : null),
  };
}
