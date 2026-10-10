// Chat Games, Hot Seat: pure rules (docs/specs/chat-games.md §5, §11, §15; part 4). No Firestore here: hotseat.js reads, calls these, writes.
//
//   PHASES                waiting (round 1 only: 30 s for volunteers when fewer than 2 can play) · accept (15 s) · answer (60 s) · vote (30 s) · reveal · void
//   pickSeats(available, n, rng)   n players at random from the pool (volunteers and checked-in members), never the same uid twice
//   boardNames(pool, seats, rng)   up to 10 handles for the picker (the seats always among them)
//   cleanAnswer(text, isProfane)   the Questions filter at 140 characters
//   tally({ answers, votes, hidden })   reveal: votes per answer; winner(s) 25 XP (every tied player wins), other players 5; no votes at all: everyone who
//                                       answered gets 5 and nobody wins. Hidden answers are out (no XP).
//   shuffle(list, rng)    the nameless order of the answers in the vote
const ACCEPT_MS = 15000, ANSWER_MS = 60000, VOTE_MS = 30000, WAIT_MS = 30000;
const SEATS = 3, MIN_PLAYERS = 2, MAX_REPLACE_ROUNDS = 2;
const ROUNDS = [1, 2, 3, 4, 5], DEFAULT_ROUNDS = 3;
const PICKERS = ["seance", "wheel"];
const WIN_XP = 25, PLAY_XP = 5;
const MAX_ANSWER = 140;
const Q = require("./qlogic");

function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** available: [{ uid, handle, volunteer }]. Never the same uid twice. */
function pickSeats(available, n = SEATS, rng = Math.random) {
  const seen = new Set(), uniq = [];
  for (const p of available || []) if (p && p.uid && !seen.has(p.uid)) { seen.add(p.uid); uniq.push(p); }
  return shuffle(uniq, rng).slice(0, n);
}
function boardNames(pool, seats, rng = Math.random) {
  const seatNames = (seats || []).map((s) => s.handle).filter(Boolean);
  const rest = shuffle((pool || []).map((p) => p.handle).filter((h) => h && !seatNames.includes(h)), rng).slice(0, Math.max(0, 10 - seatNames.length));
  return shuffle([...new Set([...seatNames, ...rest])], rng);
}
function cleanAnswer(text, { isProfane = () => false } = {}) {
  const r = Q.cleanText(text, { isProfane });
  if (!r.ok) return r.reason === "empty" ? { ok: false, reason: "empty", message: "Write your answer first." } : r;
  if (r.text.length > MAX_ANSWER) return { ok: false, reason: "tooLong", message: `Keep it under ${MAX_ANSWER} characters.` };
  return r;
}
/** answers: [{ id, uid, text }], votes: { voterUid: answerId }, hidden: Set of uids. */
function tally({ answers = [], votes = {}, hidden = new Set() } = {}) {
  const live = answers.filter((a) => !hidden.has(a.uid));
  const count = Object.fromEntries(live.map((a) => [a.id, 0]));
  for (const id of Object.values(votes || {})) if (id in count) count[id]++;
  const total = Object.values(count).reduce((n, v) => n + v, 0);
  const top = Math.max(0, ...Object.values(count));
  const rows = live.map((a) => {
    const v = count[a.id], winner = total > 0 && v === top;
    return { id: a.id, uid: a.uid, text: a.text, votes: v, pct: total ? Math.round((v / total) * 100) : 0, winner, xp: total === 0 ? PLAY_XP : winner ? WIN_XP : PLAY_XP };
  });
  for (const a of answers) if (hidden.has(a.uid)) rows.push({ id: a.id, uid: a.uid, text: null, votes: 0, pct: 0, winner: false, xp: 0, hidden: true });
  return { rows, total, noVotes: total === 0 };
}
const roundsOf = (n) => (ROUNDS.includes(Number(n)) ? Number(n) : DEFAULT_ROUNDS);
const pickerOf = (p) => (PICKERS.includes(p) ? p : "seance");

module.exports = { ACCEPT_MS, ANSWER_MS, VOTE_MS, WAIT_MS, SEATS, MIN_PLAYERS, MAX_REPLACE_ROUNDS, ROUNDS, DEFAULT_ROUNDS, PICKERS, WIN_XP, PLAY_XP, MAX_ANSWER, shuffle, pickSeats, boardNames, cleanAnswer, tally, roundsOf, pickerOf };
