// Who has Brain Dump (docs/specs/brain-dump.md §1): the same rule as firestore.rules hasBrainDump(). Sub Club is the "sub" role, which
// Club Pass grants for every pass source (Twitch, Stripe, a grant, active crew, the owner); admins; crew by the server-written claims
// (a crew grade, and not Paused or Alumni: the same as roleFlags); the owner. Display only: the rules are what protect the board.
import type { AuthState } from "./auth";

export function hasBrainDump(s: AuthState): boolean {
  if (!s.user || (s.status !== "verified" && s.status !== "unverified")) return false;
  const crew = s.crewGrade != null && !["paused", "alumni"].includes(String(s.crewStatus || ""));
  return s.roles.includes("sub") || s.isAdmin || crew || !!s.isOwner;
}
