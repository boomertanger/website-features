// Links for "you earned a badge" moments (docs/specs/rewards.md: /trophies is the badge catalog; the trophy case is the pinned showcase on
// the profile, edited on /account#rewards). Every badge-earned alert ends with the same two buttons:
//   See your badge   /trophies?badge=<id>          the catalog opens on that badge's collection, scrolls to it and spotlights it
//   Pin it           /account?pin=<id>#rewards     the Rewards tab with the badge added to the trophy case editor (saved only on Save);
//                                                  left out when the badge is already in the member's showcase
// No alert says "trophy case" unless it opens the showcase.
import { getAuthState } from "../../lib/auth";
import { ownProfile } from "./data";

export const badgeHref = (id: string) => `/trophies?badge=${encodeURIComponent(id)}`;
export const pinHref = (id: string) => `/account?pin=${encodeURIComponent(id)}#rewards`;

/** True when the signed-in member already has this badge in their trophy case (profiles/{uid}.showcase). */
export function isShowcased(id: string) {
  return !!ownProfile(getAuthState())?.showcase.includes(id);
}

/** The alert's buttons: "Pin it" (secondary, unless it's in the showcase already) and "See your badge" (primary). size "sm" for small cards. */
export function badgeAlertButtons(id: string, { size = "" as "" | "sm", goAttr = "" } = {}) {
  const sm = size === "sm" ? " bt-btn--sm" : "";
  const pin = isShowcased(id) ? "" : `<a class="bt-btn bt-btn--secondary${sm}" href="${pinHref(id)}">Pin it</a>`;
  return `${pin}<a class="bt-btn bt-btn--primary${sm}" href="${badgeHref(id)}"${goAttr ? ` ${goAttr}` : ""}>See your badge</a>`;
}
