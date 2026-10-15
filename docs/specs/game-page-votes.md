# Spec: Game page voting and rating — CONFIRMED (2026-10-15)

Game Vault + Service Hub addendum. Mockup approved: `docs/design/mockups/game-page-votes.html` (picks **V3 + C1**).

## 1. Vote ("Play this, Boomer!")
- **V3 Ballot**: a dashed gold callout under the title on **every To play (wishlist) game**, whoever added it: "Want Boomer to stream this?", "<n> votes · #<rank> on Most wanted", and the button ("Play this, Boomer!" → "Voted").
- The Community pick banner keeps its "added by @handle" credit but no longer has its own button (never two buttons).
- Owner sees the callout as "Members want you to play this" with the count and rank, no button. Visitors: "Join free to vote" (E1). Unverified members: the verify prompt.
- Same `vaultWant` callable and data. No server or rule change.

## 2. Rating
- **Every non-hidden game** is rateable, To play included. The rating is about **the game itself**: prompt "How do you rate this game?" (also used by the Vault games rating dialog on /services).
- The compact page strip (V5 + S1: "Rate it", three icon buttons, Talk pill) on every game page, wired to `vault-<slug>` at page load (game pages share one route, so there is no build-time manifest per game). Not for me asks why (10+ characters) before saving; the privacy toast after saving.
- Same `serviceRate`, rules, Critic and Vault Critic badges.

## 3. Community verdict (C1 Twin dials)
- The members' dial sits beside Boomer's score dial in the hero: % who liked it ((love + like) ÷ n), the ring split Love (pink) / Like (blue) / Not for me (gold), "<n> ratings · Rate it" (scrolls to the strip).
- Shown at **3+ member ratings**; below that a dashed "Not enough ratings yet" dial with Rate it. Owner and admin ratings are left out.
- Unplayed games: Boomer's dial shows "Not played yet".
- **Phone**: poster on the left, the two dials stacked on the right; the poster is exactly as tall as the dial stack (3:4, width follows), with no gap under it.
- The community dial becomes a kit piece next to the score dial (and on the UI kit page).

## 4. States
- To play: vote + rating. Played: rating only. Hidden: neither. Signed out: Join free on both.
