// shared/vault-reveal.js — what a Game Vault game says about itself in a line (docs/specs/game-vault.md
// §9): the cover card's hover panel (C5 reveal), the card's meta line, the pager preview, the Up next
// card and the game page's review card. The words depend on the game, not just on whether it has a
// verdict, so a finished game never reads "Not played yet". Plain text: callers escape it.
//
//   reveal(g)      -> { title, quoted, line }  the hover panel: the verdict (quoted), or "No review yet" /
//                     "Not played yet", and a line under it
//   statusLine(g)  -> "Finished · 6 streams, 14 h on stream" / "Finished · about 6 h to beat" / "Finished"
//   metaLine(g)    -> the short line under a card's title ("6 streams, last Sep 12", "About 6 h to beat")
//
// g is a public card (functions/lib/vault/store.js card()): status, verdict, streams and minutes (these
// already include history from before the site), last, wanted, ttb, by. Checked in
// functions/scripts/check-vault-reveal.js.

const STATUS_WORD = { playing: "Playing", finished: "Finished", abandoned: "Abandoned", wishlist: "On the Wishlist" };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const hours = (minutes) => Math.round((minutes || 0) / 60);
const shortDate = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Streams with their hours: "6 streams, 14 h on stream". */
const streamsLine = (g) => `${plural(g.streams, "stream")}, ${hours(g.minutes)} h on stream`;

/** A played game's status and what we know: streams, else the time to beat, else just the status. */
export function statusLine(g) {
  const word = STATUS_WORD[g.status] || "In the Vault";
  if (g.streams > 0) return `${word} · ${streamsLine(g)}`;
  if (g.ttb) return `${word} · about ${g.ttb} h to beat`;
  return word;
}

/** The hover panel. */
export function reveal(g) {
  const want = g.wanted > 0 ? `${g.wanted} want it` : "";
  const pick = g.by ? `Community pick by @${g.by}` : "";
  if (g.verdict) return { title: g.verdict, quoted: true, line: g.streams > 0 ? streamsLine(g) : statusLine(g) };
  if (g.status === "wishlist") return { title: "Not played yet", quoted: false, line: [want || "On the Wishlist", pick].filter(Boolean).join(". ") };
  return { title: "No review yet", quoted: false, line: statusLine(g) };
}

/** The line under a card's title. */
export function metaLine(g) {
  if (g.streams > 0) return `${plural(g.streams, "stream")}${g.last ? `, last ${shortDate(g.last)}` : ""}`;
  if (g.status === "wishlist") return g.wanted > 0 ? `Not streamed yet, ${g.wanted} want it` : "Not streamed yet";
  return g.ttb ? `About ${g.ttb} h to beat` : "No streams on record yet";
}
