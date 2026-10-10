// Service Hub hooks (docs/specs/service-hub.md §9): what a rating, a test or a version bump sets off elsewhere. lib/services/index.js calls these from its
// triggers (never from a callable, so a member's tap never waits on them); every one is best effort and never throws.
//   Trophy Room: First Verdict, Critic I-IV (services rated), Full Coverage (every core service open to you rated; never taken away), Tester I-III,
//                Vault Critic I-III, through grantBadge (feature "serviceHub", ledger ref badge-<id>: each pays once). my/{uid}.badges remembers what
//                was paid, so a later rating doesn't ask again.
//   Night Shift: type "services" { action rate | test | rateAll, type, serviceId }; a Vault game's rating also sends type "ratings" { action rate,
//                gameId } ("Rate a game"). No XP per rating: XP comes from Night Shift activities and badges.
//   Mod Machina: an existing live service whose version goes UP posts "Test v{version} of {name} on phone and desktop" (never a new item: a first sync,
//                a new Arcade or Vault game; never a version going down); a member test with problems posts "Check the
//                problems members found on {name}" (once per service version). lib/crew/tasks.js createSystemTask.
const admin = require("firebase-admin");
const L = require("./logic");

const SITE_ID = "boomertanger";
const FEATURE = "serviceHub";
const text = (err) => String((err && err.message) || err).slice(0, 160);

function makeHooks(deps = {}) {
  const db = deps.db || admin.firestore();
  let grantMod = deps.grant, factoryMod = deps.factory, tasksMod = deps.tasks;
  const grant = () => (grantMod ||= require("../rewards/grant"));
  const factory = () => (factoryMod ||= require("../factory/record"));
  const tasks = () => (tasksMod ||= require("../crew/tasks"));
  const myRef = (uid) => db.doc(`sites/${SITE_ID}/services/main/my/${uid}`);

  /** Pays every badge in ids that my/{uid}.badges doesn't list yet; records the ones paid (or already held). */
  async function payBadges(uid, ids) {
    if (!ids.length) return [];
    const my = (await myRef(uid).get()).data() || {};
    const had = my.badges || {};
    const paid = [];
    for (const id of ids) {
      if (had[id]) continue;
      try {
        const r = await grant().grantBadge(uid, id, { feature: FEATURE, ref: `badge-${id}`, reason: "Service Hub" });
        if (r && (r.granted || r.reason === "held" || r.reason === "paid")) { paid.push(id); }
      } catch (err) { console.error("services: badge failed", id, text(err)); }
    }
    if (paid.length) await myRef(uid).set({ badges: Object.fromEntries(paid.map((id) => [id, true])) }, { merge: true });
    return paid;
  }
  async function nightShift(uid, type, params, ref) {
    try { await factory().recordFactoryEvent(uid, type, params, ref, { keep: true }); }
    catch (err) { console.error("services: Night Shift event failed", type, text(err)); }
  }

  /** After a rating: { rating, first, rated, coreIds, item }. */
  async function afterRating({ rating, first, rated, coreIds, item }) {
    if (!rating) return;
    const uid = rating.uid, n = Object.keys(rated || {}).length;
    const vault = Object.values(rated || {}).filter((r) => r.type === "vaultGame").length;
    const full = L.ratedEveryCore(coreIds || [], rated || {});
    const paid = await payBadges(uid, [...L.ratingBadges(n), ...L.vaultBadges(vault), ...(full ? [L.FULL_COVERAGE] : [])]);
    if (first) {
      await nightShift(uid, "services", { action: "rate", type: rating.type || (item && item.type) || null, serviceId: rating.serviceId }, `rate:${rating.serviceId}`);
      if ((rating.type || (item && item.type)) === "vaultGame") await nightShift(uid, "ratings", { action: "rate", gameId: String(rating.serviceId).replace(/^vault-/, "") }, String(rating.serviceId).replace(/^vault-/, ""));
    }
    if (full) await nightShift(uid, "services", { action: "rateAll" }, "rateAll");
    return { paid, full };
  }

  /** After a counted test: { test, item, testsCount }. */
  async function afterTest({ test, item, testsCount }) {
    if (!test) return;
    const paid = await payBadges(test.uid, L.testerBadges(testsCount || 0));
    await nightShift(test.uid, "services", { action: "test", type: test.type || (item && item.type) || null, serviceId: test.serviceId }, `test:${test.serviceId}:${test.version}`);
    let task = null;
    if (test.problems > 0 && item) {
      task = await tasks().createSystemTask(db, { key: `problems-${test.serviceId}-${test.version}`, kind: "problems", title: `Check the problems members found on ${item.name || test.serviceId}`, detail: `Members found problems testing v${test.version} of ${item.name || test.serviceId}. Open it in /admin/services, try the checks that failed, and report anything real in Bug Zapper.` });
    }
    return { paid, task };
  }

  /** After existing live services moved to a new version: [{ id, from, to, name }]. Only a version that went up posts a task. */
  async function onBumps(bumps) {
    const out = [];
    for (const b of bumps || []) {
      if (b.from == null || L.compareVersions(b.to, b.from) <= 0) continue;
      out.push(await tasks().createSystemTask(db, { key: `test-${b.id}-${b.to}`, kind: "test", title: `Test v${b.to} of ${b.name || b.id} on phone and desktop`, detail: `${b.name || b.id} moved to v${b.to}. Run its checks on a phone and on a desktop, then mark the result in /admin/services.` }));
    }
    return out;
  }

  return { afterRating, afterTest, onBumps };
}

module.exports = { makeHooks, FEATURE };
