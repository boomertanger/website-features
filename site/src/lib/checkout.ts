// The pre-checkout dialog for Sub Club (docs/specs/club-pass.md §13), shared by /club-pass and My pass. Signed out (or signup not
// finished): the Join free dialog instead. Signed up: a short dialog (confirmAction, so openModal underneath) to pick monthly or one
// month; members 13 to 17 tick a parent-or-guardian box; members already gold through Twitch see "Your Twitch sub already gives you
// Sub Club" first. Continue calls clubCheckout and goes to Stripe's Checkout page; card details never touch the site. The server checks
// the age band and the guardian box again (users/{uid}/private/age), so this is only the friendly half.
import { whenReady } from "./auth";
import { call } from "./call";
import { messageFor } from "./errors";
import { confirmAction } from "../../../shared/ui/confirm.js";
import { escapeHtml as esc } from "../../../shared/ui/dom.js";
import site from "../data/site.json";

export type CheckoutKind = "sub" | "month";
const PRICE = `$${site.clubPass.price}`;

async function twitchGold(uid: string): Promise<boolean> {
  try {
    const { db, doc, getDoc, SITE_ID } = await import("./db");
    const m = await getDoc(doc(db, "sites", SITE_ID, "members", uid));
    return !!m.get("club.sources.twitch");
  } catch { return false; }
}

export async function startCheckout(kind: CheckoutKind = "sub") {
  const s = await whenReady();
  if (!s.user || (s.status !== "verified" && s.status !== "unverified")) {
    const { openSignIn } = await import("../scripts/account/dialog");
    openSignIn({ mode: "join", title: "Join free first, then go gold" });
    return;
  }
  const minor = s.account?.ageBand === "13-17";
  const viaTwitch = await twitchGold(s.user.uid);
  const opt = (k: CheckoutKind, title: string, line: string) =>
    `<label class="bt-check"><input type="radio" name="bt-co-kind" value="${k}"${k === kind ? " checked" : ""} /><span><b>${esc(title)}</b><br>${esc(line)}</span></label>`;
  const bodyHtml = `<div class="bt-stack">`
    + (viaTwitch ? `<div class="bt-notice bt-notice--warn" role="note"><b>Your Twitch sub already gives you Sub Club</b><span>Your pass is gold through Twitch. You don't need to pay here too, unless you want to.</span></div>` : "")
    + opt("sub", `Sub Club, ${PRICE} a month`, "Renews monthly. Cancel any time and keep gold to the end of the month you paid for.")
    + opt("month", `One month, ${PRICE} once`, "30 days of gold. Doesn't renew.")
    + (minor ? `<label class="bt-check"><input type="checkbox" data-co-guardian /> <span>I'm a parent or guardian, and I say yes to this purchase.</span></label>` : "")
    + `<p class="bt-fine bt-fine--left" style="margin:0">You pay on Stripe's secure page. Your card never touches this site.</p></div>`;
  await confirmAction({
    title: viaTwitch ? "You're already gold" : "Go gold",
    bodyHtml,
    cancelLabel: "Not now",
    confirmLabel: "Continue to payment",
    busyLabel: "Opening Stripe…",
    danger: false,
    feature: "checkout",
    onConfirm: async (modal: HTMLElement) => {
      const picked = (modal.querySelector<HTMLInputElement>('input[name="bt-co-kind"]:checked')?.value || kind) as CheckoutKind;
      const guardianOk = !!modal.querySelector<HTMLInputElement>("[data-co-guardian]")?.checked;
      if (minor && !guardianOk) throw new Error("A parent or guardian has to tick the box first.");
      let url: string;
      try { ({ url } = await call<{ url: string }>("clubCheckout", { kind: picked, guardianOk, origin: location.origin })); }
      catch (err) { throw new Error(messageFor(err, "Couldn't open the payment page. Try again in a minute.")); }
      location.assign(url);
      await new Promise(() => { /* stay busy while the browser leaves for Stripe */ });
    },
  });
}

/** Opens the Stripe customer portal (cancel, card, invoices); returns to /account/club. */
export async function openPortal() {
  const { url } = await call<{ url: string }>("clubPortal", { origin: location.origin });
  location.assign(url);
}
