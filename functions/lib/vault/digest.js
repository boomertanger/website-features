// Game Vault "Latest updates" events (docs/specs/game-vault.md §8). Pure rules for the
// rolling digest: the first add opens an activityLog event, adds in the next 60 minutes
// update the same event, and the next add after that opens a new one. The pointer to the
// open digest lives in sites/{siteId}/private/vaultDigest; the wiring runs these functions
// inside a transaction on it and writes whatever they return.
//
//   pointer = { eventId, openedAt (ms), count, entries: [{ id, title, cover }] } | null
//
// Events use the existing top-level activityLog shape (feature, type, summary, link,
// actorName, createdAt, …), written only by functions. createdAt is added by the writer.

const FEATURE = "game-vault";
const WINDOW_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 50;      // remembered so a hidden or deleted game can leave its digest
const LINK = "/games?sort=new";
const TITLE_CAP = 100;

const cap = (t) => String(t ?? "").slice(0, TITLE_CAP);

/** "X was added to the Vault" · "2 games added to the Vault: X and Y" · "10 games added to the Vault: X, Y and 8 more". */
function digestSummary(count, titles) {
  const t = (titles || []).map(cap).filter(Boolean);
  if (count <= 1) return t.length ? `${t[0]} was added to the Vault` : "A game was added to the Vault";
  const head = `${count} games added to the Vault`;
  if (!t.length) return head;
  if (count === 2 && t.length >= 2) return `${head}: ${t[0]} and ${t[1]}`;
  if (count === 3 && t.length >= 3) return `${head}: ${t[0]}, ${t[1]} and ${t[2]}`;
  if (t.length >= 2) return `${head}: ${t[0]}, ${t[1]} and ${count - 2} more`;
  return `${head}: ${t[0]} and ${count - 1} more`;
}

function eventOf(pointer) {
  const shown = pointer.entries.slice(0, 3);
  return {
    feature: FEATURE,
    type: "games-added",
    summary: digestSummary(pointer.count, shown.map((e) => e.title)),
    link: LINK,
    actorName: null,
    count: pointer.count,
    titles: shown.map((e) => cap(e.title)),
    covers: shown.map((e) => e.cover || null),
  };
}

/**
 * A game was added (a community pick, one of Boomer's, or a queued game once approved).
 * Returns { action: "open" | "update" | "none", pointer, event }. "none": this game is
 * already in the open digest, so nothing changes.
 */
function applyAdd(pointer, game, now) {
  const entry = { id: String(game.id), title: cap(game.title), cover: game.cover || null };
  const open = pointer && pointer.count > 0 && now - pointer.openedAt < WINDOW_MS;
  if (!open) {
    // The writer creates the event and stores its id in pointer.eventId.
    const next = { eventId: null, openedAt: now, count: 1, entries: [entry] };
    return { action: "open", pointer: next, event: eventOf(next) };
  }
  if (pointer.entries.some((e) => e.id === entry.id)) return { action: "none", pointer, event: null };
  const next = { ...pointer, count: pointer.count + 1, entries: [...pointer.entries, entry].slice(0, MAX_ENTRIES) };
  return { action: "update", pointer: next, event: eventOf(next) };
}

/**
 * A game left the Vault's feed (hidden or deleted). Returns { action: "update" | "delete" | "none", pointer, event }.
 * A digest that drops to 0 is removed ("delete": the writer deletes the event and clears the pointer).
 */
function applyRemove(pointer, gameId) {
  if (!pointer || !pointer.entries.some((e) => e.id === String(gameId))) return { action: "none", pointer, event: null };
  const next = { ...pointer, count: pointer.count - 1, entries: pointer.entries.filter((e) => e.id !== String(gameId)) };
  if (next.count <= 0) return { action: "delete", pointer: null, event: null };
  return { action: "update", pointer: next, event: eventOf(next) };
}

function nowPlayingEvent(game) {
  return { feature: FEATURE, type: "now-playing", summary: `Now playing: ${cap(game.title)}`, link: `/games/${game.slug}`, actorName: null, gameId: game.slug };
}

function finishedEvent(game, score) {
  const tail = Number.isInteger(score) ? ` Boomer's score: ${score}` : "";
  return { feature: FEATURE, type: "finished", summary: `Finished ${cap(game.title)}.${tail}`, link: `/games/${game.slug}`, actorName: null, gameId: game.slug };
}

module.exports = { FEATURE, WINDOW_MS, MAX_ENTRIES, LINK, digestSummary, applyAdd, applyRemove, nowPlayingEvent, finishedEvent };
