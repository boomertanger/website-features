// Who may use Cloud Stash (docs/specs/cloud-stash.md §1, §8). The page is for admins: members are sent to How it works, visitors get the sign-in dialog first. Inside it there are three tiers:
// the OWNER, an OVERSEER (A2 Overseer or A3 Right Hand) and a STEWARD (A1, and admins with no admin-ladder grade). A Steward sees everything and can scan, refresh, dry-run, preview and switch a
// rule OFF; purging, rules, the sweep and the settings need an Overseer; log retention and untracked files are the owner's alone. Client checks only decide what's shown; the callables refuse
// the same things on the server ("Needs the owner or an Overseer."). The non-production ?as=admin preview (signed out) reads site/src/data/preview-stash.json; ?tier= picks the tier.
import { getAuthState, type AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";
import { call } from "../../lib/call";
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import type { Tier } from "./status";
import previewData from "../../data/preview-stash.json";

export const previewAs = (): "admin" | null => (!isProduction && new URLSearchParams(location.search).get("as") === "admin" ? "admin" : null);
export const isPreview = (s: AuthState = getAuthState()) => !s.user && !!previewAs();
export const preview = () => previewData as any;
export const isAdmin = (s: AuthState = getAuthState()) => (isPreview(s) ? true : s.isAdmin);

let cached: Tier | null = null;
/** The caller's tier, or null for someone who isn't an admin. Read once per page. */
export async function tierOf(s: AuthState = getAuthState()): Promise<Tier | null> {
  if (isPreview(s)) {
    const t = new URLSearchParams(location.search).get("tier");
    return t === "owner" || t === "steward" ? t : "overseer";
  }
  if (!s.isAdmin) return null;
  if (cached) return cached;
  let owner = false, grade = 0, track = "";
  try { owner = (await getDoc(doc(db, "sites", SITE_ID))).get("ownerUid") === s.user?.uid; } catch { /* not the owner as far as we can tell */ }
  if (!owner) { try { const me: any = await call("crewMe"); grade = me?.crew?.grade || 0; track = me?.crew?.track || ""; } catch { /* no crew row */ } }
  cached = owner ? "owner" : track === "admin" && grade >= 2 ? "overseer" : "steward";
  return cached;
}
export const canChange = (t: Tier) => t !== "steward";
export const isOwner = (t: Tier) => t === "owner";
