// Hot Seat's shapes and the preview round (docs/specs/chat-games.md §5; part 4). No Firebase here: the stream view demo (obs-demo.ts) and the site
// previews (?game=hot-seat) both use it. The preview plays one round on a loop: the draw, I'm in, answers, the vote, the reveal.
export type HsPhase = "starting" | "waiting" | "accept" | "answer" | "vote" | "reveal" | "void" | "over";
export type HsSeat = { handle: string; status: string };
export type HsAnswer = { id: string; text: string; handle?: string; votes?: number; pct?: number; winner?: boolean };
export type HsDisplay = {
  kind: "hot-seat"; phase: HsPhase | string; round: number; rounds: number; card: string | null; picker: "seance" | "wheel" | string; board: string[];
  paused: boolean; seats: HsSeat[]; answers: HsAnswer[]; noVotes?: boolean; closesAt?: number | null;
};

export const HS_BOARD = ["gbo", "cryptkeeper", "lanternjaw", "mothgirl", "ravenhex", "sallow", "nyx", "deadbolt", "fogbank", "wickless"];
export const HS_CARD = "What's the worst possible place to hide from a monster?";
const SEATS = ["lanternjaw", "gbo", "ravenhex"];
const ANSWERS = [
  { id: "a1", text: "Under the bed. That is literally their office.", handle: "lanternjaw", votes: 66, pct: 31, winner: false },
  { id: "a2", text: "In plain sight, wearing a sign that says \"not here\".", handle: "gbo", votes: 111, pct: 52, winner: true },
  { id: "a3", text: "The monster's group chat. Nobody reads it.", handle: "ravenhex", votes: 37, pct: 17, winner: false },
];
/** The preview round's steps and how long each lasts on the loop. */
export const HS_STEPS: [HsPhase, number][] = [["accept", 11000], ["answer", 9000], ["vote", 9000], ["reveal", 10000]];
export const HS_LOOP = HS_STEPS.reduce((n, [, d]) => n + d, 0);
const LOOP = HS_LOOP;

/** The phase on the loop at time t (or the one pinned with ?hs=), with its deadline. */
export function hsDemoAt(t: number, t0: number, pinned?: string | null): { phase: HsPhase; closesAt: number | null; into: number } {
  const fixed = HS_STEPS.find(([p]) => p === pinned);
  if (fixed) { const into = fixed[0] === "accept" ? 8000 : fixed[0] === "answer" ? 2000 : 99999; const span = fixed[0] === "accept" ? 15000 : fixed[0] === "answer" ? 60000 : 30000; return { phase: fixed[0], closesAt: fixed[0] === "reveal" ? null : t0 + Math.ceil((t - t0 + 1) / span) * span, into }; }
  let at = (t - t0) % LOOP, start = t - at;
  for (const [p, d] of HS_STEPS) { if (at < d) return { phase: p, closesAt: p === "reveal" ? null : start + d, into: at }; at -= d; start += d; }
  return { phase: "accept", closesAt: null, into: 0 };
}

/** The display (as the server writes it) for a phase of the preview round. `into` (ms into the phase) lets the accept step tick players in. */
export function hsSampleDisplay(phase: HsPhase, { picker = "seance", closesAt = null, into = 99999, paused = false }: { picker?: string; closesAt?: number | null; into?: number; paused?: boolean } = {}): HsDisplay {
  const status = (h: string, i: number) => {
    if (phase === "accept") return into > 9000 + i * 600 || (h !== "gbo" && into > 7000 + i * 500) ? "in" : "picked";
    if (phase === "answer") return h === "ravenhex" && into < 5000 ? "in" : "answered";
    return "answered";
  };
  return {
    kind: "hot-seat", phase, round: 1, rounds: 3, card: HS_CARD, picker, board: HS_BOARD, paused, closesAt,
    seats: SEATS.map((h, i) => ({ handle: h, status: status(h, i) })),
    answers: phase === "vote" ? ANSWERS.map(({ id, text }) => ({ id, text })) : phase === "reveal" ? ANSWERS : [],
    noVotes: false,
  };
}
export const HS_POINTER = { runId: "preview-hs", formatId: "hot-seat", state: "open" as const, round: 1, title: "Hot Seat" };
