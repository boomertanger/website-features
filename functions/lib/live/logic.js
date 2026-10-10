// The Control Room's pure logic (docs/specs/control-room.md §3, §4, §6, §8, §10, §12, §13, §16).
// No Firebase, no network, no clock: every function takes `nowMs` (or an rng / bytes source)
// so scripts/check-live.js tests every rule without credentials. The later wiring (callables,
// triggers, liveFlush, obsFeed, liveDeck) reads the SETTINGS from `live/main`, passes them in and
// writes the patches these functions return.
//
// Conventions
// - Times are milliseconds (Firestore Timestamps and Dates are accepted and converted).
// - Anything that changes data returns { ok: true, ... } or { ok: false, reason }; nothing mutates
//   its input.
// - Every number is a setting with the spec's default (DEFAULT_SETTINGS); resolveSettings() merges
//   what live/main holds over the defaults and ignores values that make no sense. Every function that
//   needs a setting takes the raw live/main object (or an already resolved one) as its last argument.
// - Stream state transitions (planned/scheduled -> live -> ended, ad hoc, the 12 hour auto-end,
//   switching to a break) are NOT re-derived here: startLive / stopLive / autoEndLive /
//   beginBeat / backToGame call lib/streams/logic.js and only add the beats and the window on top.

const crypto = require("crypto");
const { ms } = require("../arcade/logic");
const S = require("../streams/logic");
const DL = require("./drops-logic");

const SEC = 1000, MIN = 60 * SEC, DAY = 24 * 60 * MIN;

// ---------------------------------------------------------------- settings (live/main)
// Spec values: §4 (window 5 min of 2/3/5/10, grace 30 s, 5 tries, +1 min, 30 day word repeat),
// §6 (15 minutes of Twitch chat in 5 minute buckets), §10 (flush at most every 3 s),
// §12 (XP values, 100 XP cap per member per stream).
const DEFAULT_SETTINGS = Object.freeze({
  windowLengthChoices: [2, 3, 5, 10],     // minutes the owner may pick per beat
  windowDefaultMinutes: 5,
  windowGraceSeconds: 30,                 // the server accepts until closesAt + grace
  windowExtendSeconds: 60,                // "+1 minute"
  maxWrongTries: 5,                       // per beat, then that beat locks for the member
  wordRepeatDays: 30,                     // no word repeats inside this many days
  presenceTwitchMinutes: 15,              // Twitch chat presence that counts a stream
  twitchBucketMinutes: 5,                 // one bucket = one Get Chatters poll
  flushMinGapSeconds: 3,                  // public/live is rewritten at most this often
  xpCheckin: 10,                          // stream-checkin, per beat
  xpAllBeats: 15,                         // stream-all-beats bonus
  xpQuestionAnswered: 15,                 // question-answered, the asker
  xpHotseatPlayed: 5,                     // hotseat-played
  xpHotseatWon: 25,                       // hotseat-won
  xpStreamCap: 100,                       // per member per stream, all Control Room kinds together
});

/** live/main merged over the defaults. A bad value (not a finite number >= 0, or a bad choices list) falls back to the default. */
function resolveSettings(main) {
  if (main && main.__resolved) return main;
  const out = { ...DEFAULT_SETTINGS, windowLengthChoices: [...DEFAULT_SETTINGS.windowLengthChoices] };
  const src = main && typeof main === "object" ? main : {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (k === "windowLengthChoices") {
      const c = src[k];
      if (Array.isArray(c) && c.length && c.every((n) => Number.isFinite(n) && n > 0)) out[k] = [...c];
    } else if (Number.isFinite(src[k]) && src[k] >= 0) out[k] = src[k];
  }
  if (!out.windowLengthChoices.includes(out.windowDefaultMinutes)) out.windowDefaultMinutes = out.windowLengthChoices.includes(5) ? 5 : out.windowLengthChoices[0];
  if (out.flushMinGapSeconds <= 0) out.flushMinGapSeconds = DEFAULT_SETTINGS.flushMinGapSeconds;
  if (out.twitchBucketMinutes <= 0) out.twitchBucketMinutes = DEFAULT_SETTINGS.twitchBucketMinutes;
  Object.defineProperty(out, "__resolved", { value: true, enumerable: false });
  return out;
}

// ---------------------------------------------------------------- 1. beats
const BEATS = ["start", "break1", "break2", "end"];       // the only order a stream can run in
const BREAK_BEATS = ["break1", "break2"];

/** True when the beat has been begun (and not skipped). */
const isBegun = (b) => !!b && b.startedAt != null && !b.skipped;
/** True when the beat has been dealt with: begun or skipped. */
const isHandled = (b) => !!b && (b.startedAt != null || b.skipped === true);

/**
 * The one beat that may be begun or skipped next: the first beat, in order, that has been neither
 * begun nor skipped. Never out of order, never twice. null when all four are handled.
 */
function nextBeat(beats) {
  const b = beats || {};
  return BEATS.find((k) => !isHandled(b[k])) || null;
}

/** The beat in progress: the last begun beat that has not ended. null before Start or after the stream ended. */
function currentBeat(beats) {
  const b = beats || {};
  for (let i = BEATS.length - 1; i >= 0; i--) if (isBegun(b[BEATS[i]]) && b[BEATS[i]].endedAt == null) return BEATS[i];
  return null;
}

/**
 * The beats HELD, in order: begun AND a check-in window was opened for them. Skipped beats and beats that were
 * begun but never had Open check-in pressed are not held (they cost nobody anything). "All beats" = exactly these.
 */
const beatsHeld = (beats) => BEATS.filter((k) => isBegun((beats || {})[k]) && beats[k].windowOpenedAt != null);

/**
 * Begins a beat at `at`. Returns { ok, patch: { beats, ...segments }, closeWindow: true }.
 * - `beat` must be nextBeat(); otherwise reason "outOfOrder" (this also covers "already begun"). The one exception:
 *   End may begin from any beat once Start is handled; every break not yet begun is then marked skipped in the same
 *   patch (skipped: true, costs nothing). Start, Break 1 and Break 2 stay in strict order.
 * - The stream must be live ("notLive").
 * - Beginning a beat ends the beat before it and closes any open window (closeWindow: true, the caller runs
 *   closeWindow()). It never opens a window by itself (§19 item 3).
 * - A break beat opens a break segment through streams/logic switchSegment (the stream's own rule);
 *   "alreadyOn" is fine (it already is a break), other refusals (too many segments) are returned.
 */
function beginBeat(stream, beat, at) {
  if (!BEATS.includes(beat)) return { ok: false, reason: "badBeat" };
  if (!stream || stream.state !== "live") return { ok: false, reason: "notLive" };
  const beats = stream.beats || {};
  const endJump = beat === "end" && !isHandled(beats.end) && isHandled(beats.start);
  if (nextBeat(beats) !== beat && !endJump) return { ok: false, reason: "outOfOrder" };
  const next = {};
  for (const k of BEATS) if (beats[k]) next[k] = { ...beats[k] };
  if (beat === "end") for (const k of BREAK_BEATS) if (!isHandled(beats[k])) next[k] = { skipped: true, skippedAt: at, checkins: 0 };
  const cur = currentBeat(beats);
  if (cur) next[cur] = { ...next[cur], endedAt: at };
  next[beat] = { startedAt: at, endedAt: null, checkins: 0 };
  const patch = { beats: next };
  if (BREAK_BEATS.includes(beat)) {
    const sw = S.switchSegment(stream, { kind: "break" }, at);
    if (sw.ok) Object.assign(patch, sw.patch);
    else if (sw.reason !== "alreadyOn") return { ok: false, reason: sw.reason };
  }
  return { ok: true, patch, closeWindow: true };
}

/** Skips the next beat (`skipped: true`, no start time). A skipped beat costs nothing and is not "held". Same order rule as beginBeat. */
function skipBeat(stream, beat, at) {
  if (!BEATS.includes(beat)) return { ok: false, reason: "badBeat" };
  if (!stream || stream.state !== "live") return { ok: false, reason: "notLive" };
  const beats = stream.beats || {};
  if (nextBeat(beats) !== beat) return { ok: false, reason: "outOfOrder" };
  return { ok: true, patch: { beats: { ...beats, [beat]: { skipped: true, skippedAt: at, checkins: 0 } } } };
}

/** "Back to the game": closes the break segment and opens the game (streams/logic switchSegment). */
function backToGame(stream, game, at) {
  return S.switchSegment(stream, { kind: "game", gameId: game && game.gameId, title: game && game.title }, at);
}

// Stream transitions, reused from streams/logic.js ------------------------------------------
/** startStream's patch plus the Start beat begun (§3.3, §19.3): the Start beat begins; NO window opens. */
function startLive(stream, at, firstGame = null) {
  const r = S.startStream(stream, at, firstGame);
  if (!r.ok) return r;
  return { ok: true, patch: { ...r.patch, beats: { start: { startedAt: at, endedAt: null, checkins: 0 } } }, closeWindow: false };
}

/** stopStream's patch (segments closed, outcomes) plus the open beat ended; closeWindow: true (close it at `at`, the grace period still applies). */
function stopLive(stream, at, opts = {}) {
  const r = S.stopStream(stream, at, opts);
  if (!r.ok) return r;
  return { ok: true, patch: { ...r.patch, beats: endOpenBeat(stream.beats, at) }, closeWindow: true };
}

/** The 12-hour auto-end, with the same beat and window handling. */
function autoEndLive(stream) {
  const r = S.autoEnd(stream);
  if (!r.ok) return r;
  return { ok: true, patch: { ...r.patch, beats: endOpenBeat(stream.beats, r.patch.actualEnd) }, closeWindow: true };
}

function endOpenBeat(beats, at) {
  const out = {};
  for (const k of BEATS) {
    const b = (beats || {})[k];
    if (b) out[k] = isBegun(b) && b.endedAt == null ? { ...b, endedAt: at } : { ...b };
  }
  return out;
}

// ---------------------------------------------------------------- 2. check-in windows
// A window is { beat, word, openedAt, closesAt, lengthMinutes, closedAt? }. `word` is PRIVATE (private/control).
// "Open" (for display) = before closesAt and not closed; the server accepts until closesAt + grace.
// A stream keeps one window record at a time (the latest); each beat may open one window (§4).

const windowOpenNow = (w, now) => !!w && w.closedAt == null && now < ms(w.closesAt);
/** True while the server still accepts check-ins: until closesAt + grace. A closed window keeps its grace (§16: window open at Stop). */
const windowAccepts = (w, now, settings) => !!w && ms(w.openedAt) <= now && now <= ms(w.closesAt) + resolveSettings(settings).windowGraceSeconds * SEC;

/**
 * Opens the check-in window for `beat` (only called when Open check-in is pressed). `lengthMinutes` is one
 * of the settings' choices (default 5). Refusals: badBeat, notLive, beatNotBegun (the beat must be begun
 * and in progress), alreadyOpened (one window per beat), windowOpen (another is still open),
 * badLength, noWord. Returns { ok, window, beatPatch }; merge beatPatch ({ windowOpenedAt }) into beats[beat].
 */
function openWindow(stream, current, beat, word, lengthMinutes, at, settings) {
  const c = resolveSettings(settings);
  if (!BEATS.includes(beat)) return { ok: false, reason: "badBeat" };
  if (!stream || stream.state !== "live") return { ok: false, reason: "notLive" };
  const b = (stream.beats || {})[beat];
  if (!isBegun(b) || b.endedAt != null || currentBeat(stream.beats) !== beat) return { ok: false, reason: "beatNotBegun" };
  if (windowOpenNow(current, at)) return { ok: false, reason: "windowOpen" };
  if (b.windowOpenedAt != null) return { ok: false, reason: "alreadyOpened" };
  const len = lengthMinutes == null ? c.windowDefaultMinutes : lengthMinutes;
  if (!c.windowLengthChoices.includes(len)) return { ok: false, reason: "badLength" };
  if (typeof word !== "string" || !normalise(word)) return { ok: false, reason: "noWord" };
  return { ok: true, window: { beat, word, openedAt: at, closesAt: at + len * MIN, lengthMinutes: len }, beatPatch: { windowOpenedAt: at } };
}

/**
 * Reopens the beat's window ONCE (owner decision): same word and same openedAt, so earlier check-ins stay valid and
 * nobody is asked twice. Works after Close now and after the window ran out, while the beat is still in progress
 * and no window is open. Time given: what was unused when it was closed early (closesAt minus closedAt), or 2 minutes
 * when that is less than 2 (a window that ran out gets 2). The grace applies to the new closesAt. The record gets
 * reopened: true and closedAt is cleared. Refusals: noWindow, notLive, beatNotBegun (another beat began),
 * windowOpen, reopenUsed. openWindow still refuses a beat that had a window (alreadyOpened): this is the only way.
 */
function reopenWindow(stream, current, beat, at) {
  if (!current || current.beat !== beat) return { ok: false, reason: "noWindow" };
  if (!stream || stream.state !== "live") return { ok: false, reason: "notLive" };
  const b = (stream.beats || {})[beat];
  if (!isBegun(b) || b.endedAt != null || currentBeat(stream.beats) !== beat) return { ok: false, reason: "beatNotBegun" };
  if (windowOpenNow(current, at)) return { ok: false, reason: "windowOpen" };
  if (current.reopened) return { ok: false, reason: "reopenUsed" };
  const unused = Math.max(0, Number(current.unusedMs) || 0);            // recorded by closeWindow; 0 for a window that ran out
  const give = Math.max(unused, 2 * MIN);
  const { closedAt: _c, unusedMs: _u, ...rest } = current;
  return { ok: true, window: { ...rest, closesAt: at + give, reopened: true } };
}

/** +1 minute (setting). Only while the window is open: reason "noWindow" or "windowClosed". */
function extendWindow(current, at, settings) {
  if (!current) return { ok: false, reason: "noWindow" };
  if (!windowOpenNow(current, at)) return { ok: false, reason: "windowClosed" };
  return { ok: true, window: { ...current, closesAt: ms(current.closesAt) + resolveSettings(settings).windowExtendSeconds * SEC } };
}

/** Close now: closesAt becomes `at`, closedAt is set and unusedMs records the time that was left (for reopenWindow); the grace period still applies. Closing a closed window succeeds with already: true. */
function closeWindow(current, at) {
  if (!current) return { ok: false, reason: "noWindow" };
  if (current.closedAt != null || ms(current.closesAt) <= at) return { ok: true, already: true, window: current };
  return { ok: true, already: false, window: { ...current, closesAt: at, closedAt: at, unusedMs: ms(current.closesAt) - at } };
}

// ---------------------------------------------------------------- 3. words
const FALLBACK_NOTE = "every word was used inside the repeat window; used the least recently used";

/**
 * Normalises a word or an answer: Unicode NFD with the combining accent marks removed, lowercase, everything
 * that is not a letter or digit removed (spaces and punctuation ignored). "séance" equals "seance". NO fuzzy matching.
 */
function normalise(s) {
  if (typeof s !== "string") return "";
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Picks a beat's word. `list` = candidate words, `recent` = [{ word, atMs }] (any age), `rng()` in [0,1).
 * Never repeats a word used within wordRepeatDays (default 30). If every word was used in that window,
 * falls back to the least recently used and says so: { ok, word, fallback: true, note }.
 * Ties go to list order. { ok: false, reason: "emptyList" } when there is no usable word.
 */
function pickWord(list, recent, nowMs, rng = Math.random, settings) {
  const c = resolveSettings(settings);
  const words = [], seen = new Set();
  for (const w of Array.isArray(list) ? list : []) {
    const n = normalise(w);
    if (n && !seen.has(n)) { seen.add(n); words.push(w); }
  }
  if (!words.length) return { ok: false, reason: "emptyList" };
  const lastUsed = new Map();           // normalised word -> latest use
  for (const r of recent || []) {
    const n = normalise(r && r.word), t = ms(r && r.atMs);
    if (n && (!lastUsed.has(n) || t > lastUsed.get(n))) lastUsed.set(n, t);
  }
  const cutoff = nowMs - c.wordRepeatDays * DAY;
  const fresh = words.filter((w) => !(lastUsed.get(normalise(w)) > cutoff));      // used after the cutoff = out
  if (fresh.length) {
    const r = Math.max(0, Math.min(0.999999999, Number(rng()) || 0));
    return { ok: true, word: fresh[Math.floor(r * fresh.length)], fallback: false };
  }
  let best = words[0];
  for (const w of words) if (lastUsed.get(normalise(w)) < lastUsed.get(normalise(best))) best = w;
  return { ok: true, word: best, fallback: true, note: FALLBACK_NOTE };
}

// ---------------------------------------------------------------- 4. check-in validation
// ONE canonical room set in all stored and returned data: the stream object's names (stream-object.md §3).
const ROOMS = ["twitch", "ytLandscape", "ytVertical", "tiktok", "site"];
const PLATFORM_ROOMS = ["twitch", "ytLandscape", "ytVertical", "tiktok"];
const ROOM_ALIASES = { twitch: "twitch", tiktok: "tiktok", site: "site", ytlandscape: "ytLandscape", ytvertical: "ytVertical", youtube: "ytLandscape", ytv: "ytVertical" };

/**
 * EDGE ONLY (the ?room= link, the streamCheckIn callable): turns what a person or a link sent into a canonical room.
 * Accepts the canonical names and the aliases "youtube" (-> ytLandscape) and "ytv" (-> ytVertical), any case; anything
 * else is null. validateCheckIn does NOT accept aliases, so an alias can never be stored.
 */
function normaliseRoom(input) {
  if (typeof input !== "string") return null;
  const k = input.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROOM_ALIASES, k) ? ROOM_ALIASES[k] : null;
}

/** The rooms a member may pick: backstage -> ["site"] only; platform -> liveRooms, else rooms (canonical names), else all four (never "site"). */
function allowedRooms(stream) {
  if (stream && stream.type === "backstage") return ["site"];
  for (const key of ["liveRooms", "rooms"]) {
    const given = stream && Array.isArray(stream[key]) ? stream[key] : null;
    if (given && given.length) {
      const ok = PLATFORM_ROOMS.filter((r) => given.includes(r));
      if (ok.length) return ok;
    }
  }
  return [...PLATFORM_ROOMS];
}

/**
 * The rooms a stream goes live in at Start: the owner's own choice (liveRooms, set by the TikTok switch before Start) when valid, else the planned
 * rooms WITHOUT TikTok (TikTok is live only when the owner says so with the switch), else all of them when TikTok is the only chat.
 */
function startRooms(stream) {
  if (stream && stream.type === "backstage") return ["site"];
  const pre = stream && Array.isArray(stream.liveRooms) ? PLATFORM_ROOMS.filter((r) => stream.liveRooms.includes(r)) : [];
  if (pre.length) return pre;
  const all = allowedRooms(stream);
  const noTikTok = all.filter((r) => r !== "tiktok");
  return noTikTok.length ? noTikTok : all;
}

/**
 * Validates one check-in. Input:
 *   member   { uid, signedIn }              (signedIn false or no uid -> signedOut)
 *   stream   the stream (type, liveRooms / rooms)
 *   window   the current window record (with the word) or null
 *   answer, room   what the member typed and picked
 *   presence { beats: { <beat>: { room, at } }, wrongTries: { <beat>: n } }   the member's own doc (may be null)
 *   crew     { clockedIn: true, room }  when the member is crew clocked in on this stream
 *   nowMs
 * Order of checks: signedOut, noWindow, windowClosed, crew (present, no word, no XP), badRoom, already,
 * lockedOut, empty, wrongWord. A wrong ROOM or an empty answer never costs a try.
 *   ok:true  -> { ok, beat, room, awardXp, crew?: true, patch: { beat, room, at } }
 *   ok:false -> { ok, reason, triesLeft?, wrongTries?, locked? }   (wrongWord carries the new count to store)
 */
function validateCheckIn(input, settings) {
  const c = resolveSettings(settings);
  const { member, stream, window: win, answer, room, presence, crew, nowMs } = input;
  if (!member || !member.uid || member.signedIn === false) return { ok: false, reason: "signedOut" };
  if (!win) return { ok: false, reason: "noWindow" };
  if (!windowAccepts(win, nowMs, c)) return { ok: false, reason: "windowClosed" };
  const beat = win.beat;
  if (crew && crew.clockedIn) {
    const r = crew.room || null;
    return { ok: true, crew: true, beat, room: r, awardXp: false, patch: { beat, room: r, at: nowMs } };
  }
  if (!ROOMS.includes(room) || !allowedRooms(stream).includes(room)) return { ok: false, reason: "badRoom" };
  if (presence && presence.beats && presence.beats[beat]) return { ok: false, reason: "already" };
  const used = (presence && presence.wrongTries && presence.wrongTries[beat]) || 0;
  if (used >= c.maxWrongTries) return { ok: false, reason: "lockedOut", triesLeft: 0, locked: true };
  const given = normalise(answer);
  if (!given) return { ok: false, reason: "empty", triesLeft: c.maxWrongTries - used };
  if (given !== normalise(win.word)) {
    const wrongTries = used + 1;
    return { ok: false, reason: "wrongWord", wrongTries, triesLeft: c.maxWrongTries - wrongTries, locked: wrongTries >= c.maxWrongTries };
  }
  return { ok: true, beat, room, awardXp: true, triesLeft: c.maxWrongTries - used, patch: { beat, room, at: nowMs } };
}

/** A crew unlock (liveUnlock): that member's wrong-try count for the beat goes back to 0; other beats are untouched. */
function unlockTries(wrongTries, beat) {
  return { ...(wrongTries || {}), [beat]: 0 };
}

// ---------------------------------------------------------------- 5. rewards
// Night Shift keys (§12) and the setting that pays each. Every grant is keyed so an action can
// never pay twice.
const GRANT_KINDS = Object.freeze({
  checkin: { nightShiftKey: "stream-checkin", xpSetting: "xpCheckin" },
  allBeats: { nightShiftKey: "stream-all-beats", xpSetting: "xpAllBeats" },
  present: { nightShiftKey: "stream-present", xpSetting: null },          // streak and Loyalty only, no XP
  questionAnswered: { nightShiftKey: "question-answered", xpSetting: "xpQuestionAnswered" },
  hotseatPlayed: { nightShiftKey: "hotseat-played", xpSetting: "xpHotseatPlayed" },
  hotseatWon: { nightShiftKey: "hotseat-won", xpSetting: "xpHotseatWon" },
  firstIn: { nightShiftKey: "first-in", xpSetting: null },                // toward a future badge, no XP
});

/**
 * The idempotency key for a grant. ctx = { streamId, uid, beat?, round?, questionId? }.
 *   checkin          {streamId}:{beat}:{uid}:checkin
 *   firstIn          {streamId}:{beat}:{uid}:first-in
 *   allBeats         {streamId}:{uid}:all-beats
 *   present          {streamId}:{uid}:present
 *   questionAnswered {streamId}:{questionId}:{uid}:question-answered
 *   hotseatPlayed    {streamId}:round{round}:{uid}:hotseat-played   (hotseatWon: ...:hotseat-won)
 * Throws on an unknown kind or a missing part (a programming error, never user input).
 */
function grantKey(kind, ctx) {
  const { streamId, uid } = ctx || {};
  if (!GRANT_KINDS[kind]) throw new Error(`live/logic: unknown grant kind "${kind}"`);
  if (!streamId || !uid) throw new Error("live/logic: grantKey needs streamId and uid");
  const need = (v, n) => { if (v == null || v === "") throw new Error(`live/logic: grantKey(${kind}) needs ${n}`); return v; };
  switch (kind) {
    case "checkin": return `${streamId}:${need(ctx.beat, "beat")}:${uid}:checkin`;
    case "firstIn": return `${streamId}:${need(ctx.beat, "beat")}:${uid}:first-in`;
    case "allBeats": return `${streamId}:${uid}:all-beats`;
    case "present": return `${streamId}:${uid}:present`;
    case "questionAnswered": return `${streamId}:${need(ctx.questionId, "questionId")}:${uid}:question-answered`;
    case "hotseatPlayed": return `${streamId}:round${need(ctx.round, "round")}:${uid}:hotseat-played`;
    default: return `${streamId}:round${need(ctx.round, "round")}:${uid}:hotseat-won`;       // hotseatWon
  }
}

/** The XP a grant kind asks for before the cap (from settings; 0 for the no-XP kinds). */
function grantXp(kind, settings) {
  const g = GRANT_KINDS[kind];
  return g && g.xpSetting ? resolveSettings(settings)[g.xpSetting] : 0;
}

/** What is actually paid under the per-stream cap: never negative, never above cap - alreadyEarned. */
function capPayout(alreadyEarned, amount, cap = DEFAULT_SETTINGS.xpStreamCap) {
  const left = Math.max(0, cap - Math.max(0, Number(alreadyEarned) || 0));
  return Math.max(0, Math.min(Math.max(0, Number(amount) || 0), left));
}

/**
 * Plans one grant: { key, kind, nightShiftKey, requested, paid, capped }. `earned` = XP this member already
 * got on this stream across every kind. ctx.crew = true (clocked-in crew) pays no check-in XP.
 */
function planGrant(kind, ctx, earned, settings) {
  const c = resolveSettings(settings);
  const requested = ctx && ctx.crew && kind === "checkin" ? 0 : grantXp(kind, c);
  const paid = capPayout(earned, requested, c.xpStreamCap);
  return { key: grantKey(kind, ctx), kind, nightShiftKey: GRANT_KINDS[kind].nightShiftKey, requested, paid, capped: paid < requested };
}

/**
 * The "all beats" bonus: every beat that was begun was checked in to by this member, and at least one
 * beat began. `beats` is the stream's beats map, `memberBeats` is the member's presence.beats. Beats never
 * begun (no breaks, skipped) do not count against the member.
 */
function qualifiesAllBeats(beats, memberBeats) {
  const held = beatsHeld(beats);
  return held.length > 0 && held.every((k) => !!(memberBeats && memberBeats[k]));
}

// ---------------------------------------------------------------- 6. stream streak presence
const countOf = (x) => (Array.isArray(x) ? x.length : x && typeof x === "object" ? Object.values(x).filter(Boolean).length : Number.isFinite(x) ? x : 0);

/**
 * Does the stream count for this member's stream streak? Yes when: crew clocked in, checked in to at least
 * one beat, seen in Twitch chat for presenceTwitchMinutes (15 = 3 buckets of 5), or claimed a live drop.
 * Input { beats, twitchBuckets (array, object of buckets or a count), drops[], crew }. -> { present, why[] }.
 */
function streakPresence(input, settings) {
  const c = resolveSettings(settings);
  const { beats, twitchBuckets, drops, crew } = input || {};
  const needBuckets = Math.max(1, Math.ceil(c.presenceTwitchMinutes / c.twitchBucketMinutes));
  const why = [];
  if (crew) why.push("crew");
  if (countOf(beats) >= 1) why.push("checkin");
  if (countOf(twitchBuckets) >= needBuckets) why.push("twitch");
  if (countOf(drops) >= 1) why.push("drop");
  return { present: why.length > 0, why };
}

// ---------------------------------------------------------------- 7. scene
const SCENES = ["starting", "stats", "break", "break-side", "brb", "ending"];     // Starting soon, Live stats, Break (B1 Takeover), Break side rail (B2), Be right back, Ending

/**
 * The scene the stream view shows. A pinned scene (one of SCENES) wins until released (pinned = null).
 * Auto: planned/scheduled -> starting; ended -> ending; live: open check-in window -> break; the End beat -> ending;
 * a break beat while its break segment is open -> break (after "Back to the game" closes it: stats; with no
 * segment data the beat alone decides); anything else -> stats.
 * Input { stream, window, pinned, nowMs }.
 */
function autoScene({ stream, window: win, pinned, nowMs }) {
  if (pinned != null && SCENES.includes(pinned)) return pinned;
  if (!stream || stream.state !== "live") return !stream || stream.state !== "ended" ? "starting" : "ending";
  if (windowOpenNow(win, nowMs)) return "break";
  const cur = currentBeat(stream.beats);
  if (cur === "end") return "ending";
  if (BREAK_BEATS.includes(cur)) {
    const segs = stream.segments;
    if (!Array.isArray(segs) || !segs.length) return "break";
    const open = segs.find((g) => g.endedAt == null);
    return open && open.kind === "break" ? "break" : "stats";
  }
  return "stats";
}

/**
 * The public image URL of a Game Vault cover ({ source: "igdb" | "steam" | "upload", ... }), or null: the same URLs the site builds for .bt-cover
 * (shared/ui/cover.js). Only what is already public; nothing else of the game is ever copied.
 */
function coverUrl(cover) {
  if (!cover || typeof cover !== "object") return null;
  if (cover.source === "igdb" && typeof cover.igdbImageId === "string" && /^[\w-]+$/.test(cover.igdbImageId)) return `https://images.igdb.com/igdb/image/upload/t_cover_big/${cover.igdbImageId}.jpg`;
  if (cover.source === "steam" && cover.steamAppId != null && /^\d+$/.test(String(cover.steamAppId))) return `https://cdn.cloudflare.steamstatic.com/steam/apps/${cover.steamAppId}/library_600x900.jpg`;
  if (cover.source === "upload" && typeof cover.url === "string" && /^https:\/\//.test(cover.url)) return cover.url;
  return null;
}

// ---------------------------------------------------------------- 8. public/live
// Only an allow-list of fields is copied (a stream or a private doc is never spread into the output), and
// findSecrets() is the deep scan the checks use to prove the word, private data and backstage video ids never leak.

const FORBIDDEN_KEY = /^(word|words|currentword|checkinword|private|control|watch|videoid|.*videoid|eventid|broadcastid|.*keyhash|obskey|deckkey|key|token|secret|uid|uids)$/i;

const num = (n) => (Number.isFinite(n) ? n : 0);
const handleOf = (p) => (typeof p === "string" ? p : p && typeof p.handle === "string" ? p.handle : null);

/** Adds up counter shards (`streams/{id}/counters/{0-9}`), each { beats: { <beat>: { <room>: n } } } -> { total, byBeat, byRoom }. */
function sumShards(shards) {
  const byBeat = {}, byRoom = {};
  let total = 0;
  for (const sh of shards || []) {
    for (const [beat, rooms] of Object.entries((sh && sh.beats) || {})) {
      for (const [room, n] of Object.entries(rooms || {})) {
        const v = num(n);
        byBeat[beat] = (byBeat[beat] || 0) + v;
        byRoom[room] = (byRoom[room] || 0) + v;
        total += v;
      }
    }
  }
  return { total, byBeat, byRoom };
}

/**
 * Recruit Rush (docs/specs/mod-machina.md §17a, choice 8): one per main stream; it counts accounts that finish signing up between
 * Start and 30 minutes after Stop. The count rides in the counter shards as a sibling of beats ({ rush: n }), so sumShards is untouched.
 */
const RUSH = { minGoal: 5, maxGoal: 200, maxReward: 80, afterStopMs: 30 * 60 * 1000 };
function sumRush(shards) {
  let n = 0;
  for (const sh of shards || []) if (sh && Number.isFinite(sh.rush)) n += sh.rush;
  return n;
}
/** True while a sign-up at atMs counts for this (main) stream: from Start, while live, and up to 30 minutes after Stop. */
function rushCounts(stream, atMs) {
  if (!stream || stream.actualStart == null || !Number.isFinite(atMs) || atMs < ms(stream.actualStart)) return false;
  if (stream.actualEnd == null) return stream.state === "live";
  return atMs <= ms(stream.actualEnd) + RUSH.afterStopMs;
}
/** Checks an owner's settings against the current Rush. Returns { ok, value } or { ok: false, reason, message }. */
function rushSettings(data, current, stream) {
  const cur = current || {};
  if (!stream || !["scheduled", "live"].includes(stream.state)) return { ok: false, reason: "ended", message: "A Rush can't be set after Stop." };
  if (typeof data.on !== "boolean") return { ok: false, reason: "on", message: "Say whether the Rush is on." };
  const goal = data.goal == null ? cur.goal : data.goal;
  const reward = typeof data.reward === "string" ? data.reward.trim() : cur.reward;
  if (!Number.isInteger(goal) || goal < RUSH.minGoal || goal > RUSH.maxGoal) return { ok: false, reason: "goal", message: `The goal is ${RUSH.minGoal} to ${RUSH.maxGoal}.` };
  if (typeof reward !== "string" || reward.length < 1 || reward.length > RUSH.maxReward) return { ok: false, reason: "reward", message: `The reward is 1 to ${RUSH.maxReward} characters.` };
  if (cur.hitAt != null && cur.goal != null && goal !== cur.goal) return { ok: false, reason: "goalLocked", message: "The goal can't change after it's hit." };
  return { ok: true, value: { on: data.on, goal, reward } };
}
/** public/live's recruitRush: { goal, count, reward, hitAt } while on, else null (and nothing is written). With a reward badge, dropReady is that badge
 *  from the moment the goal is hit until the Rush drop opens (docs/specs/live-drops.md §3). */
function publicRush(rush, count) {
  if (!rush || rush.on !== true || !Number.isInteger(rush.goal)) return null;
  const ready = rush.hitAt != null && typeof rush.rewardBadgeId === "string" && rush.rewardBadgeId && !rush.rushDropId;
  return { goal: rush.goal, count: num(count), reward: typeof rush.reward === "string" ? rush.reward : "", hitAt: rush.hitAt == null ? null : ms(rush.hitAt), ...(ready ? { dropReady: rush.rewardBadgeId } : {}) };
}

/**
 * Builds the public/live summary (§13). Input:
 *   stream, window (only open + closesAt + beat are copied, never the word), counters (sumShards result or shards[]),
 *   viewers { twitch, ytLandscape, ytVertical, tiktok }, peak, onDuty [handles clocked in], chatGame (private/control.chatGame: { runId, formatId, state, round, title } | null), chatGameWaiting (private/control.chatGameWaiting: [{ runId, title }]), chatGameSettled (private/control.chatGameSettled, kept 15 s),
 *   look ("hull" | "crt"), nowMs, firstIn [handles of the current beat's first check-ins, first three kept],
 *   grades { <handle>: { track, grade } } (the public crew mirror, public/crew; only crew shown on the page are copied)
 * Output: state (off | live | backstage | ended), streamId, title, type, audience, actualStart, actualEnd,
 * beat (current), beats { <beat>: { status: done | now | next | skipped, checkins } }, window { open, closesAt, beat },
 * counts { total, byBeat, byRoom }, viewers { total, byPlatform }, peak, game, nextGame, crew { captain, chats, onDuty }
 * (handles only, plus grades [{ handle, track, grade }] for those people), firstIn (up to three public handles) and firstInBeat, chatGame (the active Chat Games run, live only), chatGameWaiting (locked Predictions waiting for a result, live only, [] otherwise), drop (input.drop = private/control.drop, input.dropClaims = the live count; see drops-logic.publicDropOf), look, updatedAt. "off" is the waiting room (no stream fields).
 */
/**
 * The Deck's room coverage for public/live (Mod Machina phase 3 part 2): { rooms: { room: { lead: handle|null, deckhands: n, covered } } }. Handles only and counts; only the known rooms; anything else
 * (a uid, a stray key) is dropped here, and findSecrets scans the whole output again before anything is written.
 */
function deckOf(deck) {
  const rooms = {};
  const src = deck && deck.rooms && typeof deck.rooms === "object" ? deck.rooms : {};
  for (const r of ROOMS) {
    const x = src[r];
    if (!x || typeof x !== "object") continue;
    rooms[r] = { lead: typeof x.lead === "string" && x.lead ? x.lead : null, deckhands: Number.isFinite(x.deckhands) ? x.deckhands : 0, covered: x.covered === true };
  }
  return { rooms };
}

/** The Chat Games pointer for public/live (docs/specs/chat-games.md §3): { runId, formatId, state, round, title } of the active run, copied from
 *  private/control.chatGame. Only these five fields leave; anything else is dropped. */
const CG_STATES = ["ready", "open", "locked", "revealed"];
function chatGameOf(p) {
  if (!p || typeof p !== "object" || typeof p.runId !== "string" || !p.runId || typeof p.formatId !== "string" || !CG_STATES.includes(p.state)) return null;
  return { runId: p.runId, formatId: p.formatId, state: p.state, round: Number.isInteger(p.round) ? p.round : 0, title: typeof p.title === "string" ? p.title : null };
}

/** The locked Predictions waiting for a result (docs/specs/chat-games.md §7): private/control.chatGameWaiting = [{ runId, title }], at most 3. */
function chatGameWaitingOf(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && typeof x.runId === "string" && x.runId).slice(0, 3)
    .map((x) => ({ runId: x.runId, title: typeof x.title === "string" ? x.title.slice(0, 120) : null }));
}

/** A Prediction settled while another game held the slot (§7): { runId, title, answer, count, at } for 15 s after it settled, else null. */
const SETTLED_MS = 15000;
function chatGameSettledOf(s, nowMs) {
  if (!s || typeof s !== "object" || typeof s.runId !== "string" || typeof s.answer !== "string") return null;
  const at = typeof s.at === "number" ? s.at : s.at && typeof s.at.toMillis === "function" ? s.at.toMillis() : 0;
  if (!at || nowMs - at > SETTLED_MS || nowMs < at - 60000) return null;
  return { runId: s.runId, title: typeof s.title === "string" ? s.title.slice(0, 120) : null, answer: s.answer.slice(0, 40), count: Number.isInteger(s.count) ? s.count : 0, at };
}

function buildPublicLive(input) {
  const { stream, window: win, viewers, peak, onDuty, chatGame, chatGameWaiting, chatGameSettled, look, nowMs } = input;
  const counters = Array.isArray(input.counters) ? sumShards(input.counters) : input.counters || { total: 0, byBeat: {}, byRoom: {} };
  const live = !!stream && stream.state === "live";
  const state = !stream ? "off" : live ? (stream.type === "backstage" ? "backstage" : "live") : stream.state === "ended" ? "ended" : "off";
  const base = { state, updatedAt: nowMs, look: look === "crt" ? "crt" : "hull" };
  if (state === "off") {
    return { ...base, streamId: null, title: null, beat: null, beats: {}, window: { open: false, closesAt: null, beat: null },
      counts: { total: 0, byBeat: {}, byRoom: {} }, viewers: { total: 0, byPlatform: {} }, peak: 0, game: null, nextGame: null,
      crew: { captain: null, chats: {}, onDuty: [], grades: [] }, deck: { rooms: {} }, firstIn: [], firstInBeat: null, chatGame: null, chatGameWaiting: [], chatGameSettled: null, drop: null };
  }
  const sb = stream.beats || {};
  const beats = {};
  for (const k of BEATS) {
    const b = sb[k];
    const status = b && b.skipped ? "skipped" : isBegun(b) ? (b.endedAt == null && live ? "now" : "done") : "next";
    beats[k] = { status, checkins: num(b && b.checkins) };
  }
  const byPlatform = {};
  let totalViewers = 0;
  for (const p of PLATFORM_ROOMS) if (viewers && Number.isFinite(viewers[p])) { byPlatform[p] = viewers[p]; totalViewers += viewers[p]; }
  const segs = stream.segments || [];
  const openGame = segs.find((g) => g.endedAt == null && g.kind === "game");
  const played = S.gameIdsOf(segs);
  const nextPlanned = (stream.plannedGames || []).find((g) => g && g.gameId && !played.includes(g.gameId));
  const crew = stream.crew || {};
  const chats = {};
  for (const [room, seat] of Object.entries(crew.chats || {})) {
    chats[room] = { lead: handleOf(seat && seat.lead), deckhands: ((seat && seat.deckhands) || []).map(handleOf).filter(Boolean) };
  }
  const people = new Set([handleOf(crew.captain), ...Object.values(chats).flatMap((c) => [c.lead, ...c.deckhands]), ...(onDuty || []).map(handleOf)].filter(Boolean));
  const gradeMap = input.grades && typeof input.grades === "object" ? input.grades : {};
  const grades = [...people].sort().map((h) => {
    const g = Object.prototype.hasOwnProperty.call(gradeMap, h) ? gradeMap[h] : null;
    return g && Number.isInteger(g.grade) ? { handle: h, track: g.track === "admin" ? "admin" : "mod", grade: g.grade } : null;
  }).filter(Boolean);
  const firstIn = live ? (Array.isArray(input.firstIn) ? input.firstIn : []).filter((h) => typeof h === "string" && h).slice(0, 3) : [];
  const open = live && windowOpenNow(win, nowMs);
  return {
    ...base,
    streamId: stream.id || null,
    title: typeof stream.title === "string" ? stream.title : null,
    type: stream.type || "platform",
    audience: stream.audience || "public",
    liveRooms: allowedRooms(stream),
    actualStart: stream.actualStart == null ? null : ms(stream.actualStart),
    actualEnd: stream.actualEnd == null ? null : ms(stream.actualEnd),
    beat: live ? currentBeat(sb) : null,
    beats,
    window: { open, closesAt: open ? ms(win.closesAt) : null, beat: open ? win.beat : null },
    counts: { total: num(counters.total), byBeat: { ...(counters.byBeat || {}) }, byRoom: { ...(counters.byRoom || {}) } },
    viewers: { total: totalViewers, byPlatform },
    peak: num(peak),
    game: openGame ? { gameId: openGame.gameId, title: openGame.title, startedAt: ms(openGame.startedAt) } : null,
    nextGame: nextPlanned ? { gameId: nextPlanned.gameId, title: nextPlanned.title || null } : null,
    crew: { captain: handleOf(crew.captain), chats, onDuty: (onDuty || []).map(handleOf).filter(Boolean), grades },
    deck: live ? deckOf(input.deck) : { rooms: {} },
    firstIn,
    firstInBeat: live && firstIn.length ? (open ? win.beat : currentBeat(sb)) : null,
    chatGame: live ? chatGameOf(chatGame) : null,
    chatGameWaiting: live ? chatGameWaitingOf(chatGameWaiting) : [],
    chatGameSettled: live ? chatGameSettledOf(chatGameSettled, nowMs) : null,
    // a drop stays through Stop's grace and 60 s after close, so it isn't gated on live (drops-logic.publicDropOf; no uids)
    drop: DL.publicDropOf(input.drop, nowMs, input.dropClaims),
    ...(publicRush(input.rush, input.rush && input.rush.count) ? { recruitRush: publicRush(input.rush, input.rush.count) } : {}),
  };
}

/**
 * Deep scan: every path in `output` (keys and string values, any depth) that must never be public.
 * Finds forbidden keys (word, private, watch, videoId..., key hashes, tokens, uids), the check-in word(s)
 * (a whole word anywhere in a string, ignoring case and punctuation, or an exact normalised match) and any given
 * video id (substring). `secrets` = { words: [], videoIds: [] }. Returns [] when clean.
 */
function findSecrets(output, secrets = {}) {
  const words = (secrets.words || []).map(normalise).filter(Boolean);
  const vids = (secrets.videoIds || []).filter((v) => typeof v === "string" && v.length >= 6);
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hits = [];
  const textHit = (t) => {
    const lower = t.toLowerCase();
    for (const w of words) {
      if (normalise(t) === w) return "word";
      if (new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}($|[^\\p{L}\\p{N}])`, "u").test(lower)) return "word";
    }
    for (const v of vids) if (t.includes(v)) return "videoId";
    return null;
  };
  const walk = (v, path) => {
    if (typeof v === "string") { const h = textHit(v); if (h) hits.push(`${path} (${h})`); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_KEY.test(k)) hits.push(`${path}.${k} (key)`);
        const h = textHit(k);
        if (h) hits.push(`${path}.${k} (${h} in key)`);
        walk(x, `${path}.${k}`);
      }
    }
  };
  walk(output, "$");
  return hits;
}

// ---------------------------------------------------------------- 9. flush debounce
/**
 * When to fold counts into public/live (liveFlush): at most every flushMinGapSeconds (3).
 * Input { lastFlushMs (null if never), nowMs, scheduledAtMs (a flush already queued, or null) }.
 *   { action: "flush" }            the gap has passed (exactly the gap counts): flush now
 *   { action: "schedule", atMs }   too soon: queue one for lastFlush + gap
 *   { action: "wait", atMs }       one is already queued for later: do nothing
 */
function flushDecision({ lastFlushMs, nowMs, scheduledAtMs = null }, settings) {
  const gap = resolveSettings(settings).flushMinGapSeconds * SEC;
  if (lastFlushMs == null || nowMs - lastFlushMs >= gap) return { action: "flush" };
  if (scheduledAtMs != null && scheduledAtMs >= nowMs) return { action: "wait", atMs: scheduledAtMs };
  return { action: "schedule", atMs: lastFlushMs + gap };
}

// ---------------------------------------------------------------- 10. keys (stream view key, deck key)
/** A new random key: `bytes` random bytes (default 32) as hex. `randomBytes(n)` is injectable for tests. Show it once, store only hashKey(key), never log it. */
function generateKey(randomBytes = crypto.randomBytes, bytes = 32) {
  const b = randomBytes(bytes);
  if (!b || b.length !== bytes) throw new Error("live/logic: randomBytes returned the wrong length");
  return Buffer.from(b).toString("hex");
}

/** SHA-256 of the key as hex (what live/main stores as obsKeyHash / deckKeyHash). */
const hashKey = (key) => crypto.createHash("sha256").update(String(key), "utf8").digest("hex");

/**
 * True when `key` hashes to `storedHash`. Constant time (crypto.timingSafeEqual on the two 32-byte digests);
 * a non-string key, a missing or malformed stored hash, or any length mismatch is simply false, never a throw.
 */
function verifyKey(key, storedHash) {
  if (typeof key !== "string" || !key || typeof storedHash !== "string" || !/^[0-9a-f]{64}$/i.test(storedHash)) return false;
  const a = Buffer.from(hashKey(key), "hex"), b = Buffer.from(storedHash.toLowerCase(), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  DEFAULT_SETTINGS, resolveSettings,
  RUSH, sumRush, rushCounts, rushSettings, publicRush,
  BEATS, BREAK_BEATS, nextBeat, currentBeat, beatsHeld, beginBeat, skipBeat, backToGame, startLive, stopLive, autoEndLive,
  windowOpenNow, windowAccepts, openWindow, reopenWindow, extendWindow, closeWindow,
  normalise, pickWord,
  ROOMS, PLATFORM_ROOMS, normaliseRoom, allowedRooms, startRooms, validateCheckIn, unlockTries,
  GRANT_KINDS, grantKey, grantXp, capPayout, planGrant, qualifiesAllBeats,
  streakPresence, SCENES, autoScene, coverUrl,
  sumShards, buildPublicLive, findSecrets,
  flushDecision, generateKey, hashKey, verifyKey,
};
