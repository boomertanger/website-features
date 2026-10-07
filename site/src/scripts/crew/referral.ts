// /join/@handle (docs/specs/mod-machina.md §9): Cloudflare Pages serves this page for every /join/{handle}
// (public/_redirects). It keeps the handle in this browser for 30 days (the first link wins) and opens the
// Join free dialog; the signup sends the handle on as refHandle (scripts/account/dialog.ts). Signed-in
// members just go to the home page: an account can't be referred twice.
import { onAuth } from "../../lib/auth";
import { cleanRef, getRef, saveRef } from "../../lib/referral";
import { openDialog } from "../account/ui";

function handleFromUrl() {
  const parts = location.pathname.split("/").filter(Boolean);   // ["join", "@handle"]
  const fromPath = parts[0] === "join" && parts[1] && parts[1] !== "view" ? decodeURIComponent(parts[1]) : "";
  return cleanRef(fromPath || new URLSearchParams(location.search).get("handle"));
}

const root = document.querySelector<HTMLElement>("[data-ref]")!;
const link = handleFromUrl();
const kept = link ? saveRef(link) : getRef();   // the first link wins, so the kept handle may differ from this one
const who = root.querySelector<HTMLElement>("[data-ref-who]")!;
who.textContent = kept ? `@${kept} invited you to Boomertanger` : "Join Boomertanger";
root.querySelector<HTMLElement>("[data-ref-lead]")!.textContent = kept
  ? "Free to join. Streams, games, badges and a crew that's glad you're here."
  : "That invite link doesn't look right, but joining is still free.";
root.hidden = false;

let opened = false;
onAuth((s) => {
  if (s.status === "loading") return;
  if (s.user && (s.status === "verified" || s.status === "unverified")) { location.replace("/"); return; }
  if (!opened) { opened = true; void openDialog(s.status === "needsSignup" ? "signup" : "join", "Join free"); }
});
