// Preview data for the staff pages (non-production, signed out, ?as=admin or ?as=member). Builds next week (open, unpublished) and
// this week (published) from src/data/preview-planner-plan.json, and answers the callables from a local copy so the layouts and
// the interactions can be checked without an account. Nothing here ever runs for a real session (plan-io.ts decides).
import raw from "../../data/preview-planner-plan.json";
import {
  ROOMS, ROOM_NAME, GROUP_OF, DAY_SHORT, currentWeekId, nextWeekId, weekDates, zonedToUtc, addDays, localDate, dowOf, fmtDayTime,
  type Stream, type Signup, type Swap, type WeekDoc, type Settings, type Pattern, type Exception, type Todo, type Room, type SeatReq, type TrayGroup, type TrayItem, type Crew,
} from "./plan-data";

const tz: string = raw.tz;
const GAMES = raw.games as { slug: string; title: string; status: string; tags: string[]; cover?: { source: string; steamAppId?: string } }[];
const game = (slug: string) => GAMES.find((g) => g.slug === slug);
const PEOPLE = raw.people as { uid: string; handle: string; grade: number; track: string }[];
const person = (handle: string) => PEOPLE.find((p) => p.handle === handle);

interface PState { weeks: WeekDoc[]; streams: Record<string, Stream[]>; signups: Record<string, Signup[]>; settings: Settings; patterns: Pattern[]; exceptions: Exception[]; todos: Todo[]; ballot: Record<string, number>; swaps: Swap[] }
let S: PState | null = null;
let nid = 1;

const seatPerson = (handle?: string) => { if (!handle) return null; const p = person(handle); return { uid: p?.uid || handle, handle }; };
function crewOf(c: any, rooms: Room[], caps: { deckhands: number }): Crew {
  const chats: Crew["chats"] = {};
  for (const r of rooms) chats[r] = { lead: seatPerson(c?.[r]?.lead), deckhands: (c?.[r]?.deckhands || []).map((h: string) => seatPerson(h)!) };
  return { captain: seatPerson(c?.captain), chats, caps };
}
const sourceOf = (slug: string, signups: Signup[], ballot: Record<string, number>) => {
  const req = signups.find((x) => x.gameRequest && x.gameRequest.gameSlug === slug && ["open", "planned"].includes(x.gameRequest.status));
  if (req) return { kind: "modRequest", byHandle: req.handle || "" };
  if ((ballot[slug] || 0) > 0) return { kind: "ballot", votes: ballot[slug] };
  return { kind: "owner" };
};

function build(): PState {
  const now = Date.now(), cur = currentWeekId(tz, now), next = nextWeekId(cur);
  const signups: Record<string, Signup[]> = {};
  const toSignups = (list: any[]): Signup[] => list.map((x) => ({
    uid: x.uid || person(x.handle)?.uid || x.handle, availability: x.availability, prefilled: x.prefilled === true, handle: x.handle, grade: person(x.handle)?.grade ?? 2, track: "mod",
    seats: (x.seats || []).map((s: any) => ({ ...s })), gameRequest: x.request ? { gameSlug: x.request.slug, note: x.request.note || "", status: x.request.status } : null,
  }));
  const mk = (slot: any, week: string, id: string, date: string): Stream => {
    const caps = { deckhands: 2 }, backstage = slot.type === "backstage";
    const rooms: Room[] = backstage ? [] : ((slot.rooms || ROOMS) as Room[]);
    const start = zonedToUtc(date, slot.start, tz), end = zonedToUtc(slot.end <= slot.start ? addDays(date, 1) : date, slot.end, tz);
    const sg = toSignups(slot.signups || []);
    signups[id] = sg;
    return {
      id, week, state: "planned", published: false, hasUnpublishedChanges: false, slug: id, title: slot.theme.label, tz, start, end, type: backstage ? "backstage" : "platform", audience: backstage ? "fanClub" : "public",
      rooms, plannedGameCount: slot.count, theme: { ...slot.theme }, minCrew: slot.minCrew, caps, crew: crewOf(slot.crew, rooms, caps),
      plannedGames: (slot.games as string[]).map((slug, order) => ({ gameId: slug, title: game(slug)?.title || slug, order, source: sourceOf(slug, sg, raw.ballot) })),
      delay: null, cancel: null, actualStart: null, youtube: null,
    };
  };
  const dates = weekDates(next);
  const nextStreams = (raw.slots as any[]).map((slot) => mk(slot, next, slot.id, dates[slot.dow - 1]));
  // this week, already published: three streams from tonight on, one of them already delayed once
  const cs = [
    { slot: raw.slots[0], at: 3, len: 2, key: "pv-cw1" }, { slot: raw.slots[1], at: 27, len: 2, key: "pv-cw2" }, { slot: raw.slots[2], at: 51, len: 2, key: "pv-cw3" },
  ].map(({ slot, at, len, key }, i) => {
    const t = Math.ceil((now + at * 3600000) / 900000) * 900000;
    const date = localDate(t, tz), hhmm = new Date(t);
    const st = mk({ ...slot, id: key, start: "00:00", end: "01:00" }, cur, key, date);
    st.start = t; st.end = t + len * 3600000; st.state = "scheduled"; st.published = true; st.id = key;
    st.youtube = i === 2 ? { status: "pending" } : i === 1 ? { status: "failed", error: "YouTube said no: quota exceeded" } : { status: "ok" };
    if (i === 0) st.delay = { originalStart: t - 3600000, originalEnd: t - 3600000 + len * 3600000, count: 1, reason: "Boomer is at the dentist" };
    void hhmm;
    return st;
  });
  // the swap board: a late drop (starts in a few hours), an early drop (more than 24 h ahead) and one someone took a while ago. The seats they freed are empty on the stream.
  const emptySeat = (s: Stream, room: Room, role: "lead" | "deckhand") => { const c = s.crew.chats[room]; if (!c) return; if (role === "lead") c.lead = null; else c.deckhands = c.deckhands.slice(1); };
  emptySeat(cs[0], "twitch", "deckhand"); emptySeat(cs[1], "ytVertical", "lead"); emptySeat(cs[2], "ytLandscape", "lead");
  const swaps: Swap[] = [
    { id: `${cs[0].id}_twitch:deckhand`, streamId: cs[0].id, room: "twitch", role: "deckhand", fromUid: "kitwick", fromHandle: "kitwick", droppedAt: now - 2 * 3600000, startsAt: cs[0].start, notice: "late", status: "open", takenBy: null, takenByHandle: null, takenAt: null },
    { id: `${cs[1].id}_ytVertical:lead`, streamId: cs[1].id, room: "ytVertical", role: "lead", fromUid: "mothlight", fromHandle: "mothlight", droppedAt: now - 5 * 3600000, startsAt: cs[1].start, notice: "early", status: "open", takenBy: null, takenByHandle: null, takenAt: null },
    { id: `${cs[2].id}_ytLandscape:lead`, streamId: cs[2].id, room: "ytLandscape", role: "lead", fromUid: "mothlight", fromHandle: "mothlight", droppedAt: now - 9 * 3600000, startsAt: cs[2].start, notice: "early", status: "taken", takenBy: "hollowgrin", takenByHandle: "hollowgrin", takenAt: now - 3 * 3600000 },
  ];
  const settings = raw.usual.settings as unknown as Settings;
  return {
    weeks: [
      { id: next, state: "open", opensAt: now - 26 * 3600000, closesAt: now + 30 * 3600000, publishBy: now + 54 * 3600000, publishedAt: null, publishedRev: 0, hasUnpublishedChanges: false, hero: null, weekOff: null, streamIds: nextStreams.map((s) => s.id), counts: { slots: nextStreams.length, seatsOpen: 3, votes: 160 }, earlySignupUntil: null },
      { id: cur, state: "published", opensAt: now - 6 * 86400000, closesAt: now - 4 * 86400000, publishBy: now - 3 * 86400000, publishedAt: now - 3 * 86400000, publishedRev: 1, hasUnpublishedChanges: false, hero: { frame: "neon", doors: "coffins" }, weekOff: null, streamIds: cs.map((s) => s.id), counts: { slots: 3, seatsOpen: 0, votes: 120 }, earlySignupUntil: null },
    ],
    streams: { [next]: nextStreams, [cur]: cs }, signups, settings,
    patterns: (raw.usual.patterns as unknown as Pattern[]).map((p) => ({ ...p })), exceptions: (raw.usual.exceptions as unknown as Exception[]).map((e) => ({ ...e })),
    todos: (raw.usual.todos as any[]).map((t) => ({ ...t, week: t.week === "next" ? next : t.week })), ballot: { ...raw.ballot }, swaps,
  };
}
export const pv = () => (S ||= build());
export const previewMe = () => ({ ...raw.me });
export const previewVault = () => GAMES.map((g) => ({ slug: g.slug, title: g.title, sortTitle: g.title.toLowerCase(), altNames: [], status: g.status, tags: g.tags, cover: g.cover ?? null, wanted: 0 }));

const seatLabel = (s: SeatReq) => `${s.role === "captain" ? "Captain" : `${ROOM_NAME[s.room as Room]} ${s.role}`}, ${s.status}`;
const findStream = (id: string) => { for (const list of Object.values(pv().streams)) { const s = list.find((x) => x.id === id); if (s) return s; } throw new Error("No such stream in the preview."); };
const fitsTheme = (g: { slug: string; tags: string[] }, theme: Stream["theme"]) => !!theme && ((theme.gameHints || []).includes(g.slug) || (theme.tagHints || []).some((t) => g.tags.includes(t)));

function tray(s: Stream): TrayGroup[] {
  const st = pv(), sg = st.signups[s.id] || [], used = new Set(s.plannedGames.map((p) => p.gameId));
  const elsewhere = (slug: string) => (st.streams[s.week] || []).filter((x) => x.id !== s.id && x.plannedGames.some((p) => p.gameId === slug)).map((x) => DAY_SHORT[dowOf(localDate(x.start, tz)) - 1]);
  const item = (g: (typeof GAMES)[number], extra: Partial<TrayItem> = {}): TrayItem => ({ slug: g.slug, title: g.title, status: g.status, tags: g.tags, fitsTheme: fitsTheme(g, s.theme), alsoOn: elsewhere(g.slug), ...extra });
  const take = (slug: string) => { const g = game(slug); if (!g || used.has(slug)) return null; used.add(slug); return g; };
  const mods: TrayItem[] = [];
  for (const x of sg) { const r = x.gameRequest; if (r && r.status === "open") { const g = take(r.gameSlug); if (g) mods.push(item(g, { requestUid: x.uid, byHandle: x.handle || "", grade: x.grade, seat: (x.seats.find((q) => ["requested", "confirmed"].includes(q.status)) && seatLabel(x.seats.find((q) => ["requested", "confirmed"].includes(q.status))!)) || null, note: r.note })); } }
  const votes: TrayItem[] = [];
  for (const [slug, v] of Object.entries(st.ballot).sort((a, b) => b[1] - a[1])) { const g = take(slug); if (g) votes.push(item(g, { votes: v })); }
  const theme: TrayItem[] = [];
  for (const g of [...GAMES].sort((a, b) => a.title.localeCompare(b.title))) if (!used.has(g.slug) && fitsTheme(g, s.theme)) { used.add(g.slug); theme.push(item(g)); }
  const rest = GAMES.filter((g) => !used.has(g.slug));
  const picks = [...rest.filter((g) => g.status === "playing"), ...rest.filter((g) => g.status !== "playing")].map((g) => item(g));
  return [{ id: "modRequests", title: "Mod requests", items: mods }, { id: "votes", title: "Community votes", items: votes }, { id: "theme", title: "Fits the theme", items: theme }, { id: "picks", title: "Your picks", items: picks, more: 0 }];
}

function warnings(week: string) {
  const out: { streamId: string; kind: string; text: string }[] = [];
  for (const s of pv().streams[week] || []) {
    if (s.state === "cancelled") continue;
    const name = fmtDayTime(s.start, tz);
    if (!s.plannedGames.length) out.push({ streamId: s.id, kind: "noGames", text: `${name} has no games yet` });
    const need: string[] = [];
    if (s.minCrew.captain && !s.crew.captain) need.push("a Captain");
    for (const g of s.minCrew.rooms) if (s.rooms.filter((r) => GROUP_OF[r] === g).some((r) => !s.crew.chats[r]?.lead)) need.push(`a ${g === "youtube" ? "YouTube" : g[0].toUpperCase() + g.slice(1)} Lead`);
    if (need.length) out.push({ streamId: s.id, kind: "minCrew", text: `${name} needs ${need.join(" and ")}` });
  }
  return out;
}
const POOL = ["bulbs", "neon", "barbed", "drip", "tape", "film", "web", "electric", "vhs", "candles", "ecg"], SEASONAL = ["jack", "pumpkin", "blizzard", "snowman"], DOORS = ["jaws", "elevator", "coffins", "morgue", "hinged"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const refreshCounts = (week: string) => { const w = pv().weeks.find((x) => x.id === week)!, list = (pv().streams[week] || []).filter((s) => s.state !== "cancelled"); w.counts = { ...w.counts, slots: list.length, seatsOpen: list.reduce((n, s) => n + (s.minCrew.captain && !s.crew.captain ? 1 : 0), 0) }; w.streamIds = list.map((s) => s.id); };
const place = (s: Stream, seat: SeatReq, p: { uid: string; handle: string }) => {
  if (seat.role === "captain") s.crew.captain = p;
  else { const c = s.crew.chats[seat.room as Room]; if (!c) return; if (seat.role === "lead") c.lead = p; else c.deckhands = [...c.deckhands, p]; }
};
const unplace = (s: Stream, uid: string, seat?: { room: string; role: string }) => {
  const hit = (role: string, room?: string) => !seat || (seat.role === role && (role === "captain" || seat.room === room));
  if (s.crew.captain?.uid === uid && hit("captain")) s.crew.captain = null;
  for (const r of ROOMS) { const c = s.crew.chats[r]; if (!c) continue; if (c.lead?.uid === uid && hit("lead", r)) c.lead = null; if (hit("deckhand", r)) c.deckhands = c.deckhands.filter((d) => d.uid !== uid); }
};
const err = (reason: string, message: string) => Object.assign(new Error(message), { code: "bt/msg", details: { reason } });

/** Answers a callable from the local copy. Returns what the real one returns, close enough for the pages. */
export async function previewCall(name: string, d: any = {}): Promise<any> {
  const st = pv();
  switch (name) {
    case "planTray": { const s = findStream(d.streamId); return { ok: true, streamId: s.id, plannedGameCount: s.plannedGameCount, groups: tray(s) }; }
    case "planGames": {
      const s = findStream(d.streamId), sg = st.signups[s.id] || [];
      if ((d.slugs as string[]).length > s.plannedGameCount) throw err("tooManyGames", `This slot holds ${s.plannedGameCount} games.`);
      s.plannedGames = (d.slugs as string[]).map((slug, order) => ({ gameId: slug, title: game(slug)?.title || slug, order, source: sourceOf(slug, sg, st.ballot) }));
      for (const x of sg) if (x.gameRequest) x.gameRequest.status = (d.slugs as string[]).includes(x.gameRequest.gameSlug) ? "planned" : x.gameRequest.status === "planned" ? "open" : x.gameRequest.status;
      if (s.published) { s.hasUnpublishedChanges = true; st.weeks.find((w) => w.id === s.week)!.hasUnpublishedChanges = true; }
      return { ok: true, plannedGames: s.plannedGames };
    }
    case "planSlot": {
      const week: string = d.week;
      if (d.remove) { st.streams[week] = st.streams[week].filter((s) => s.id !== d.streamId); refreshCounts(week); return { ok: true, removed: d.streamId }; }
      const start = zonedToUtc(d.date, d.start, tz), end = zonedToUtc(d.end <= d.start ? addDays(d.date, 1) : d.date, d.end, tz);
      const backstage = (d.type || "platform") === "backstage", rooms = backstage ? [] : ((d.rooms || ROOMS) as Room[]);
      const others = (st.streams[week] || []).filter((s) => s.id !== d.streamId && s.state !== "cancelled");
      if (others.some((o) => start < o.end && o.start < end)) throw err("overlap", "That overlaps another stream.");
      const cur = d.streamId ? findStream(d.streamId) : null;
      const s: Stream = cur || { id: `pv-new${nid++}`, week, state: "planned", published: false, hasUnpublishedChanges: false, slug: "", title: "", tz, start, end, type: "platform", audience: "public", rooms, plannedGameCount: 2, theme: null, minCrew: { captain: true, rooms: ["youtube"] }, caps: { deckhands: 2 }, crew: crewOf({}, rooms, { deckhands: 2 }), plannedGames: [], delay: null, cancel: null, actualStart: null, youtube: null };
      Object.assign(s, { start, end, type: backstage ? "backstage" : "platform", audience: backstage ? "fanClub" : "public", rooms, plannedGameCount: d.plannedGameCount ?? s.plannedGameCount, theme: d.theme ?? s.theme, minCrew: d.minCrew ?? s.minCrew });
      s.title = s.theme?.label || s.title || "Stream";
      s.crew.chats = Object.fromEntries(rooms.map((r) => [r, s.crew.chats[r] || { lead: null, deckhands: [] }]));
      if (s.published) { s.hasUnpublishedChanges = true; st.weeks.find((w) => w.id === s.week)!.hasUnpublishedChanges = true; }
      if (!cur) { (st.streams[week] ||= []).push(s); st.signups[s.id] = []; }
      st.streams[week].sort((a, b) => a.start - b.start); refreshCounts(week);
      return { ok: true, streamId: s.id, slug: s.id };
    }
    case "publishWeek": {
      const w = st.weeks.find((x) => x.id === d.week)!;
      if (d.check) return { ok: true, check: true, warnings: warnings(w.id), hero: w.hero || { frame: "bulbs", doors: "jaws" }, recentFrames: ["neon", "drip", "ecg"], poolFrames: POOL, seasonalFrames: SEASONAL, doorStyles: DOORS, state: w.state, publishedRev: w.publishedRev };
      const hero = { frame: d.hero?.frame === "surprise" ? pick(POOL.filter((f) => !["neon", "drip", "ecg"].includes(f))) : d.hero?.frame || "bulbs", doors: d.hero?.doors === "surprise" ? pick(DOORS) : d.hero?.doors || "jaws" };
      let changed = 0;
      for (const s of st.streams[w.id]) { if (!s.published || s.hasUnpublishedChanges) changed++; if (s.state !== "cancelled") { s.published = true; s.state = s.state === "planned" ? "scheduled" : s.state; } s.hasUnpublishedChanges = false; }
      Object.assign(w, { state: "published", publishedAt: Date.now(), publishedRev: w.publishedRev + 1, hasUnpublishedChanges: false, hero, closesAt: Math.min(w.closesAt || Date.now(), Date.now()) });
      return { ok: true, week: w.id, publishedRev: w.publishedRev, published: st.streams[w.id].filter((s) => s.state !== "cancelled").length, changed, hero, warnings: warnings(w.id) };
    }
    case "youtubeStatus": return { connected: new URLSearchParams(location.search).get("yt") !== "off", channelTitle: "Boomertanger" };
    case "youtubeRetry": { const s = findStream(d.streamId); s.youtube = { status: "ok" }; return { ok: true }; }
    case "delayStream": {
      const s = findStream(d.streamId), len = s.end - s.start;
      const a = Number.isFinite(d.startMs) ? d.startMs : zonedToUtc(d.date, d.start, tz), b = Number.isFinite(d.endMs) ? d.endMs : a + len;
      if (a === s.start && b === s.end) throw err("noChange", "That's the same time.");
      s.delay = { originalStart: s.delay?.originalStart ?? s.start, originalEnd: s.delay?.originalEnd ?? s.end, count: (s.delay?.count || 0) + 1, reason: d.reason || undefined };
      s.start = a; s.end = b;
      return { ok: true, streamId: s.id, plannedStart: a, plannedEnd: b, delayCount: s.delay.count };
    }
    case "cancelStream": {
      const s = findStream(d.streamId);
      s.state = "cancelled"; s.cancel = { reason: d.reason || undefined }; s.crew = crewOf({}, s.rooms, s.caps); s.plannedGames = [];
      refreshCounts(s.week);
      return { ok: true, state: "cancelled" };
    }
    case "weekOpen": return { ok: true, week: d.week || nextWeekId(currentWeekId(tz)), created: true, streams: 0, weekOff: null };
    case "weekReopen": { const w = st.weeks.find((x) => x.id === d.week)!; w.state = "open"; w.closesAt = Date.now() + 86400000; return { ok: true, week: w.id, closesAt: w.closesAt }; }
    case "crewAvailability": {
      const list = st.signups[d.streamId] ||= [], me = list.find((x) => x.uid === "me") || (list[list.push({ uid: "me", availability: "", prefilled: false, seats: [], gameRequest: null, handle: raw.me.handle, grade: raw.me.grade, track: "mod" }) - 1]);
      me.availability = d.availability; me.prefilled = false;
      if (d.availability === "no") { me.seats = me.seats.map((q) => (q.status === "requested" ? { ...q, status: "dropped" } : q)); me.gameRequest = null; }
      return { ok: true, availability: me.availability, seats: me.seats, gameRequest: me.gameRequest };
    }
    case "dutySignUp": {
      const s = findStream(d.streamId), list = st.signups[s.id] ||= [];
      const me = list.find((x) => x.uid === "me") || (list[list.push({ uid: "me", availability: "yes", prefilled: false, seats: [], gameRequest: null, handle: raw.me.handle, grade: raw.me.grade, track: "mod" }) - 1]);
      const keep = me.seats.filter((q) => q.status === "confirmed"), seats: SeatReq[] = [...keep];
      for (const a of d.seats as { room?: string; role: string }[]) { const room = a.role === "captain" ? "captain" : a.room!; if (!seats.some((q) => q.room === room && q.role === a.role)) seats.push({ room, role: a.role as any, status: "requested", ...(a.role === "captain" && raw.me.grade < 3 ? { needsOwnerOk: true } : {}) }); }
      me.seats = seats; me.prefilled = false; if (!me.availability) me.availability = "yes";
      return { ok: true, seats, earlyGears: s.published };
    }
    case "dutyDrop": {
      const s = findStream(d.streamId), uid = d.uid || "me", me = (st.signups[s.id] || []).find((x) => x.uid === uid);
      if (me) { me.seats = me.seats.map((q) => (["requested", "confirmed"].includes(q.status) && (!d.seat || (q.room === (d.seat.role === "captain" ? "captain" : d.seat.room) && q.role === d.seat.role)) ? { ...q, status: "dropped" } : q)); if (!me.seats.some((q) => ["requested", "confirmed"].includes(q.status))) me.gameRequest = null; }
      // after publish a confirmed seat goes on the swap board (early = 24 h or more before the start)
      const held = [...(s.crew.captain?.uid === uid ? [{ room: "captain", role: "captain" as const }] : []), ...ROOMS.flatMap((r) => { const c = s.crew.chats[r]; return c ? [...(c.lead?.uid === uid ? [{ room: r as string, role: "lead" as const }] : []), ...(c.deckhands.some((x) => x.uid === uid) ? [{ room: r as string, role: "deckhand" as const }] : [])] : []; })]
        .filter((h) => !d.seat || (h.role === d.seat.role && (h.role === "captain" || h.room === d.seat.room)));
      unplace(s, uid, d.seat);
      if (s.published && s.state === "scheduled") for (const h of held) { const id = `${s.id}_${h.role === "captain" ? "captain" : `${h.room}:${h.role}`}`; st.swaps = st.swaps.filter((x) => x.id !== id); st.swaps.push({ id, streamId: s.id, room: h.room, role: h.role, fromUid: uid, fromHandle: uid === "me" ? raw.me.handle : uid, droppedAt: Date.now(), startsAt: s.start, notice: s.start - Date.now() >= 24 * 3600000 ? "early" : "late", status: "open", takenBy: null, takenByHandle: null, takenAt: null }); }
      return { ok: true, dropped: 1, released: 1, swaps: s.published && s.state === "scheduled" ? held.length : 0 };
    }
    case "dutySwapTake": {
      const sw = st.swaps.find((x) => x.id === d.swapId);
      if (!sw) throw err("noSwap", "That seat isn't on the board any more.");
      if (sw.status === "taken") throw err("beaten", "Someone beat you to it.");
      if (sw.status !== "open") throw err("closed", "That seat is no longer up for grabs.");
      if (sw.fromUid === "me") throw err("ownSeat", "That's the seat you dropped.");
      const s = findStream(sw.streamId), me = raw.me;
      if (sw.role !== "deckhand" && me.grade < 2) throw err("gradeTooLow", "Your grade doesn't cover that seat yet.");
      const held = [s.crew.captain, ...ROOMS.flatMap((r) => { const c = s.crew.chats[r]; return c ? [c.lead, ...c.deckhands] : []; })].some((p) => p?.uid === "me");
      if (held) throw err("alreadySeated", "You already have a seat on that stream.");
      place(s, { room: sw.room, role: sw.role, status: "confirmed" }, { uid: "me", handle: me.handle });
      const list = st.signups[s.id] ||= [], mine = list.find((x) => x.uid === "me") || (list[list.push({ uid: "me", availability: "yes", prefilled: false, seats: [], gameRequest: null, handle: me.handle, grade: me.grade, track: "mod" }) - 1]);
      mine.seats = [...mine.seats.filter((q) => !(q.room === sw.room && q.role === sw.role)), { room: sw.room, role: sw.role, status: "confirmed" }];
      sw.status = "taken"; sw.takenBy = "me"; sw.takenByHandle = me.handle; sw.takenAt = Date.now();
      return { ok: true, status: "taken", seat: { room: sw.room, role: sw.role }, startsAt: sw.startsAt };
    }
    case "dutyConfirm": {
      const s = findStream(d.streamId), x = (st.signups[s.id] || []).find((y) => y.uid === d.uid);
      const room = d.seat.role === "captain" ? "captain" : d.seat.room, q = x?.seats.find((z) => z.room === room && z.role === d.seat.role && z.status === "requested");
      if (!x || !q) throw err("notRequested", "That seat isn't requested.");
      if (d.decline) { q.status = "declined"; return { ok: true, status: "declined" }; }
      q.status = "confirmed"; place(s, q, { uid: x.uid, handle: x.handle || "" });
      return { ok: true, status: "confirmed" };
    }
    case "dutyKeep": { const me = (st.signups[d.streamId] || []).find((x) => x.uid === "me"); if (me) me.reconfirm = null; return { ok: true }; }
    case "modGameRequest": {
      const me = (st.signups[d.streamId] || []).find((x) => x.uid === "me");
      if (!me) throw err("needsAvailability", "Mark your availability and ask for a seat first.");
      if (d.remove) { me.gameRequest = null; return { ok: true, removed: true }; }
      if (me.availability !== "yes") throw err("needsAvailability", "Mark yourself available first.");
      if (!me.seats.some((q) => ["requested", "confirmed"].includes(q.status))) throw err("needsSeat", "Ask for a seat on this stream first.");
      me.gameRequest = { gameSlug: d.gameSlug, note: (d.note || "").trim(), status: "open" };
      return { ok: true, gameRequest: me.gameRequest };
    }
    case "patternSave": {
      const id = d.id || `p-new${nid++}`, p: Pattern = { tagHints: [], gameHints: [], active: true, order: 0, audience: d.type === "backstage" ? "fanClub" : "public", ...d, id };
      const i = st.patterns.findIndex((x) => x.id === id); if (i >= 0) st.patterns[i] = { ...st.patterns[i], ...p }; else st.patterns.push(p);
      return { ok: true, id };
    }
    case "patternDelete": st.patterns = st.patterns.filter((p) => p.id !== d.id); return { ok: true };
    case "exceptionSave": {
      const id = d.id || `x-new${nid++}`, e: Exception = { ...d, id, to: d.to || d.from, public: d.public !== false };
      const i = st.exceptions.findIndex((x) => x.id === id); if (i >= 0) st.exceptions[i] = e; else st.exceptions.push(e);
      return { ok: true, id };
    }
    case "exceptionDelete": st.exceptions = st.exceptions.filter((e) => e.id !== d.id); return { ok: true };
    case "plannerSaveSettings": st.settings = { deadlines: { ...st.settings.deadlines, ...(d.deadlines || {}) }, defaults: { ...st.settings.defaults, ...(d.defaults || {}) } }; return { ok: true, settings: st.settings };
  }
  throw new Error(`Preview: ${name} isn't simulated.`);
}
