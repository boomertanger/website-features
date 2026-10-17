// The claim dialog (docs/specs/prize-box.md §2 "Prizes", "Legal", §5): the kit's openModal (a portal on <body>, feature "prize-box"), opened from /prizes/mine
// ("Prizes to claim") or a contest page. What it asks depends on the prize: a mailed prize needs a US address; a code (digital, store) needs nothing and
// shows the code once it's claimed; badge and XP prizes are claimed already. Members under 18 need a parent's or guardian's OK: the server checks the age,
// so the box is always offered and the server says when it's missing. After claiming: the lime stamp and a toast (the celebratory moment).
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { toast } from "../../../../shared/ui/toast.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { messageFor } from "../../lib/errors";
import { reasonOf } from "../../lib/errors";
import { call, type Win } from "./data";

const KIND_WORD: Record<Win["kind"], string> = { digital: "a code you redeem", storeCode: "a code for the merch store", mailed: "mailed to you (US addresses only)", badgeXp: "badge and XP, already yours" };
const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI".split(" ");
const daysLeft = (w: Win) => Math.max(0, Math.ceil(((w.claimBy || 0) - Date.now()) / 86400000));

export function openClaim(w: Win, { onClaimed }: { onClaimed?: (code: string | null) => void } = {}) {
  const mailed = w.kind === "mailed";
  const form = `<form class="pz-cl" data-pz-claim novalidate>
    <div class="pz-cl-prize"><span aria-hidden="true">🎁</span><div><b>${esc(w.prizeTitle)}</b><div class="pz-small">${esc(w.contestTitle)}${w.place > 1 ? `, place ${w.place}` : ""} · ${esc(KIND_WORD[w.kind])}</div></div></div>
    ${mailed ? `<div class="pz-cl-grid">
      <div class="bt-field is-wide"><label class="bt-label" for="pz-cl-name">Name for the package</label><input class="bt-input" id="pz-cl-name" name="name" autocomplete="name" maxlength="80" required></div>
      <div class="bt-field is-wide"><label class="bt-label" for="pz-cl-l1">Street address</label><input class="bt-input" id="pz-cl-l1" name="line1" autocomplete="address-line1" maxlength="120" required></div>
      <div class="bt-field is-wide"><label class="bt-label" for="pz-cl-l2">Apartment, suite (optional)</label><input class="bt-input" id="pz-cl-l2" name="line2" autocomplete="address-line2" maxlength="120"></div>
      <div class="bt-field"><label class="bt-label" for="pz-cl-city">City</label><input class="bt-input" id="pz-cl-city" name="city" autocomplete="address-level2" maxlength="80" required></div>
      <div class="bt-field"><label class="bt-label" for="pz-cl-st">State</label><select class="bt-select" id="pz-cl-st" name="state" autocomplete="address-level1" required><option value="">Pick one</option>${STATES.map((s) => `<option>${s}</option>`).join("")}</select></div>
      <div class="bt-field"><label class="bt-label" for="pz-cl-zip">ZIP code</label><input class="bt-input" id="pz-cl-zip" name="zip" inputmode="numeric" autocomplete="postal-code" maxlength="10" required></div>
      <div class="bt-field"><span class="bt-label">Country</span><p class="pz-small">United States. Prizes that ship go to US addresses only.</p></div>
    </div><p class="pz-small">Only Boomer sees this address, and only to send your prize. Every time he opens it, it's logged.</p>` : ""}
    <label class="bt-check"><input type="checkbox" name="parentOk"> I'm under 18, and a parent or guardian says it's OK to claim this prize</label>
    <p class="pz-small" data-pz-cl-err role="alert" hidden></p>
    <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--ghost" data-bt-close>Not now</button><button type="submit" class="bt-btn bt-btn--primary" data-pulse="claim-submit">Claim my prize</button></div>
  </form>`;
  const m = openModal({ title: "Claim your prize", feature: "prize-box", content: modalHeader("Claim your prize", `${daysLeft(w)} day${daysLeft(w) === 1 ? "" : "s"} left to claim`) + `<div class="bt-modal-body">${form}</div>` });
  const f = m.modal.querySelector<HTMLFormElement>("[data-pz-claim]")!;
  const err = f.querySelector<HTMLElement>("[data-pz-cl-err]")!;
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const fd = new FormData(f);
    const address = mailed ? { name: fd.get("name"), line1: fd.get("line1"), line2: fd.get("line2"), city: fd.get("city"), state: fd.get("state"), zip: fd.get("zip"), country: "US" } : undefined;
    if (mailed && (!address!.name || !address!.line1 || !address!.city || !address!.state || !address!.zip)) { err.textContent = "Fill in the name, street, city, state and ZIP code."; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = "Claiming…"; err.hidden = true;
    try {
      const r = await call<{ code: string | null }>("prizeClaim", { winnerId: w.winnerId, parentOk: fd.get("parentOk") === "on", ...(address ? { address } : {}) });
      done(r.code || null);
      onClaimed?.(r.code || null);
    } catch (e2) {
      const why = reasonOf(e2);
      err.textContent = why === "parentOk" ? "Members under 18 need a parent's or guardian's OK first: tick the box when they've said yes." : messageFor(e2);
      err.hidden = false; btn.disabled = false; btn.textContent = "Claim my prize";
    }
  });
  function done(code: string | null) {
    const body = m.modal.querySelector<HTMLElement>(".bt-modal-body")!;
    const next = w.kind === "mailed" ? "Boomer will mail it soon. You'll get an alert when it ships." : code ? "Here's your code. It's also on My entries." : w.kind === "badgeXp" ? "It's on your profile now." : "Boomer will add your code soon. You'll find it on My entries.";
    body.innerHTML = `<div class="pz-cl pz-cl-done">${stampHtml({ label: "Claimed", tone: "lime" })}<p><b>${esc(w.prizeTitle)}</b> is yours.</p><p class="pz-small">${esc(next)}</p>`
      + (code ? `<div class="pz-cl-code"><strong>${esc(code)}</strong><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-pz-copy>Copy</button></div>` : "")
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary" data-bt-close>Done</button></div></div>`;
    body.querySelector("[data-pz-copy]")?.addEventListener("click", () => { void navigator.clipboard?.writeText(code || "").then(() => toast("Copied."), () => toast("Couldn't copy. Select it and copy instead.", { kind: "error" })); });
    toast(`Claimed: ${w.prizeTitle}`);
  }
  return m;
}
