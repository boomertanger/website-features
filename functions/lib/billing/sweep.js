// functions/lib/billing/sweep.js: clubBillingSweep's work (docs/specs/club-pass.md §13), every day 05:45 America/Chicago.
// For every member with a Stripe source: a one-month pass past its end, or a past_due subscription past its grace window, is ended
// (the source removed; billing/** keeps the history), a month bought alongside a subscription is dropped once it's over, and the pass is
// recomputed (lib/club/entitlement.js). Stripe itself cancels a subscription whose retries all failed; that arrives through the webhook.
const admin = require("firebase-admin");
const { stripeLive } = require("../club/entitlement");

const SITE_ID = "boomertanger";
const msOf = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);

function makeSweep({ db, entitlement, now = Date.now }) {
  const FieldValue = admin.firestore.FieldValue;
  async function run() {
    const at = now();
    const snap = await db.collection(`sites/${SITE_ID}/members`).where("club.sources.stripe.kind", "in", ["sub", "month"]).get();
    const out = { checked: 0, ended: 0, tidied: 0, recomputed: 0 };
    for (const d of snap.docs) {
      out.checked++;
      const s = d.get("club.sources.stripe");
      if (!stripeLive(s, at)) {
        await d.ref.update({ "club.sources.stripe": FieldValue.delete() });
        out.ended++;
      } else if (s.monthEndsAt && (msOf(s.monthEndsAt) ?? 0) <= at) {
        await d.ref.update({ "club.sources.stripe.monthEndsAt": FieldValue.delete() });
        out.tidied++;
      }
      const r = await entitlement.recompute(d.id, { by: { uid: null, name: "Stripe" } });
      if (r?.changed || r?.rolesChanged) out.recomputed++;
    }
    return out;
  }
  return { run };
}

module.exports = { makeSweep };
