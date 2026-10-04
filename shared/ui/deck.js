// shared/ui/deck.js — .bt-deck (docs/design-system.md §5 "Triage deck"): one item at a time on
// a big card. Approve flies it off to the right with a green glow, Reject to the left, Skip just
// moves on; the next card rises. With the deck focused, A / R / S do the same. Under reduced
// motion the card simply swaps.
//
//   initDeck(deck, { onKey(kind) })   kind: "approve" | "reject" | "skip"; keys only while the
//                                     deck (or something in it that isn't a field) has focus
//   flyOut(card, kind) -> Promise     plays the leave animation (resolves at once if reduced)

export function initDeck(deck, { onKey }) {
  if (!deck || deck.dataset.deckReady !== undefined) return;
  deck.dataset.deckReady = "";
  deck.addEventListener("keydown", (e) => {
    if (e.target instanceof Element && e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
    const kind = { a: "approve", r: "reject", s: "skip" }[e.key.toLowerCase()];
    if (!kind) return;
    e.preventDefault();
    onKey(kind);
  });
}

export function flyOut(card, kind) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!card || kind === "skip" || reduce) return Promise.resolve();
  card.classList.add(kind === "approve" ? "is-out-right" : "is-out-left");
  return new Promise((res) => setTimeout(res, 420));
}
