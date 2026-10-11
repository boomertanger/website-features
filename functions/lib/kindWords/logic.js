// Kind Words, the pure half (docs/specs/base-camp.md "Kind Words engine"): boards and their connections, the submission check (text 20 to 600
// characters after links are stripped, place 40 at most, a connection from the board's list), link stripping, and what each review action may
// do to a card. No Firestore here; lib/kindWords/index.js calls these and scripts/check-kind-words.js tests them.
//
// Statuses: pending | approved | rejected | withdrawn | hidden. Nothing is ever deleted.

const BOARDS = {
  newfoundland: { title: "Puffin Post", place: true, connections: ["I'm from here", "I live here now", "I've visited", "Never been, but…"] },
  skipper: { title: "Paw Notes", place: false, connections: ["Watches her on stream", "Met her in person", "Corgi owner", "Just a fan"] },
};
const STATUSES = ["pending", "approved", "rejected", "withdrawn", "hidden"];
const TEXT_MIN = 20, TEXT_MAX = 600, PLACE_MAX = 40, NOTE_MAX = 300;
const DAY_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const bad = (field, message, reason = "badInput") => ({ ok: false, code: "invalid-argument", reason, field, message });

// Links: anything with a scheme, www., or a bare domain with a common ending (example.com/path). Replaced, not just cut, so words don't run together.
const LINK_RE = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|ca|us|uk|io|gg|tv|co|me|ly|app|dev|xyz|info|link|live|stream)\b(?:\/\S*)?/gi;
/** Plain text: control characters out, links out, spaces tidied, at most one blank line in a row. */
function cleanText(s) {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(LINK_RE, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n").map((l) => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const countLinks = (s) => (String(s ?? "").match(LINK_RE) || []).length;
const oneLine = (s) => String(s ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(LINK_RE, " ").replace(/\s+/g, " ").trim();

/** { ok, value: { board, connection, place, text, linksRemoved } } or a refusal. */
function validateSubmit(input) {
  const i = input || {};
  const board = BOARDS[i.board] ? i.board : null;
  if (!board) return bad("board", "Which board is this for?");
  const connection = typeof i.connection === "string" && BOARDS[board].connections.includes(i.connection) ? i.connection : null;
  if (!connection) return bad("connection", "Pick how you know it.");
  let place = null;
  if (i.place != null && i.place !== "") {
    if (!BOARDS[board].place) return bad("place", "This board doesn't take a town.");
    place = oneLine(i.place);
    if (place.length > PLACE_MAX) return bad("place", `Keep the town to ${PLACE_MAX} characters.`);
    if (!place) place = null;
  }
  if (typeof i.text !== "string") return bad("text", "Write a few words first.");
  const text = cleanText(i.text);
  if (text.length < TEXT_MIN) return bad("text", `Write at least ${TEXT_MIN} characters${countLinks(i.text) ? " (links don't count)" : ""}.`);
  if (text.length > TEXT_MAX) return bad("text", `Keep it to ${TEXT_MAX} characters.`);
  return { ok: true, value: { board, connection, place, text, linksRemoved: countLinks(i.text) } };
}

const ACTIONS = ["approve", "reject", "feature", "unfeature", "hide"];
/**
 * What a review action does to a card: { ok, patch, note } or a refusal. note is the private reject note (null when none or not a reject).
 *   approve    pending | rejected | hidden -> approved
 *   reject     pending | approved -> rejected (optional private note, 300 at most); featured off
 *   feature    approved only; unfeature: any (featured off)
 *   hide       approved | pending -> hidden; featured off
 */
function planReview(card, input) {
  const i = input || {};
  if (!card) return { ok: false, code: "not-found", reason: "gone", message: "That card is no longer here." };
  const action = ACTIONS.includes(i.action) ? i.action : null;
  if (!action) return bad("action", "Approve, reject, feature, unfeature or hide.");
  const s = card.status;
  const no = (msg) => ({ ok: false, code: "failed-precondition", reason: "wrongStatus", message: msg });
  if (action === "approve") return ["pending", "rejected", "hidden"].includes(s) ? { ok: true, action, patch: { status: "approved" }, note: null } : no(s === "approved" ? "It's already up." : "The author withdrew it.");
  if (action === "reject") {
    if (!["pending", "approved"].includes(s)) return no("Only pending or posted cards can be rejected.");
    const note = i.note == null ? "" : oneLine(i.note);
    if (note.length > NOTE_MAX) return bad("note", `Keep the note to ${NOTE_MAX} characters.`);
    return { ok: true, action, patch: { status: "rejected", featured: false }, note: note || null };
  }
  if (action === "feature") return s === "approved" ? { ok: true, action, patch: { featured: true }, note: null } : no("Only posted cards can be featured.");
  if (action === "unfeature") return { ok: true, action, patch: { featured: false }, note: null };
  return ["approved", "pending"].includes(s) ? { ok: true, action, patch: { status: "hidden", featured: false }, note: null } : no("Only pending or posted cards can be hidden.");
}

/** The day key for the 3-a-day limit (UTC). */
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

module.exports = { BOARDS, STATUSES, ACTIONS, TEXT_MIN, TEXT_MAX, PLACE_MAX, NOTE_MAX, DAY_LIMIT, DAY_MS, cleanText, countLinks, validateSubmit, planReview, dayKey };
