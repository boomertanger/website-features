// The Cloud Stash sweep (docs/specs/cloud-stash.md §4): what the daily scheduledAssetCleanup and "Sweep now" both run, and what a rule's dry run counts. For each enabled rule it
// finds the linked docs that match (the allowlisted target's query, or a legacy-shaped rule's query as written) and purges their asset records through performAssetDeletion, the one
// delete path. A new-shape rule can only purge files recorded under its target's feature key. The per-run cap (adminSettings/storage.runCap) stops a runaway rule; the run is
// recorded in storageUsage/sweep and on each rule (lastRun); problems become alerts instead of being swallowed. Nothing is purged outside this and performAssetDeletion's other callers.
const admin = require("firebase-admin");
const T = require("./targets");
const L = require("./logic");

const QUERY_CAP = 1000;
const FAIL_CAP = 20;
const EXAMPLES = 5;
const text = (err) => String((err && err.message) || err).slice(0, 200);

/** deps: { db, now, creds(), performAssetDeletion, adminLogEntry, alert(kind, payload) } */
function makeSweep(deps) {
  const { db } = deps;
  const { Timestamp } = admin.firestore;
  const now = () => (deps.now ? deps.now() : Date.now());
  const alert = deps.alert || (async () => {});

  async function settings() {
    try { return L.settingsOf((await db.doc("adminSettings/storage").get()).data()); } catch { return L.settingsOf(null); }
  }

  /**
   * What a rule would purge right now: [{ assetId, docId, title, link, bytes, days (how long it has been closed), assetFeature }] plus the total. Capped at 1,000 linked docs
   * (`truncated`). Used by the dry run (count, bytes, five examples) and by the run itself.
   */
  async function candidates(rule) {
    const q = T.queryOf(rule);
    if (!q.ok) return q;
    const v = q.value, target = q.legacy ? null : T.targetOf(rule.target);
    const cutoff = Timestamp.fromMillis(now() - v.days * L.DAY_MS);
    const snap = await db.collection(v.collection).where(v.matchField, "==", v.matchValue).where(v.ageField, "<=", cutoff).limit(QUERY_CAP).get();
    const items = [];
    for (const d of snap.docs) {
      if (v.statuses && !v.statuses.includes(d.get(v.statusField))) continue;
      const assets = await db.collection("externalAssets").where("linkedDoc.collection", "==", v.collection).where("linkedDoc.docId", "==", d.id).get();
      for (const a of assets.docs) {
        if (target && a.get("feature") !== target.feature) continue;   // a target only ever purges its own feature's files
        const closed = d.get(v.ageField);
        const ms = closed && typeof closed.toMillis === "function" ? closed.toMillis() : 0;
        items.push({ assetId: a.id, docId: d.id, title: (target && d.get(target.titleField)) || d.get("title") || d.get("name") || d.id, link: target ? target.link(d.id) : null, bytes: a.get("sizeBytes") || 0, days: ms ? Math.floor((now() - ms) / L.DAY_MS) : null, assetFeature: a.get("feature") || "" });
      }
    }
    return { ok: true, legacy: q.legacy, items, count: items.length, bytes: items.reduce((n, i) => n + i.bytes, 0), examples: items.slice(0, EXAMPLES), truncated: snap.size >= QUERY_CAP };
  }

  /**
   * One run. opts: { actor: { uid, name } (default Automatic), trigger: "schedule" | "manual" }. Resolves the summary that was written to storageUsage/sweep.
   * Each purge goes through performAssetDeletion with the actor in its adminLog entry and the rule that asked for it.
   */
  async function run({ actor = { uid: null, name: "Automatic" }, trigger = "schedule" } = {}) {
    const s = await settings();
    const rules = (await db.collection("cleanupRules").where("enabled", "==", true).get()).docs;
    const perRule = {}, failures = [], skipped = [];
    let purged = 0, bytes = 0, attempted = 0, capped = false;
    const fail = (ruleId, assetId, err) => { if (failures.length < FAIL_CAP) failures.push({ ruleId, ...(assetId ? { assetId } : {}), message: text(err) }); };
    for (const ruleDoc of rules) {
      const rule = ruleDoc.data();
      const stats = { purged: 0, bytes: 0, failed: 0 };
      perRule[ruleDoc.id] = stats;
      // a rule that is neither allowlisted nor a legacy rule is never queried and never deletes anything: it is recorded as skipped and raises the sweep alert
      if (T.isUnsafe(rule)) { stats.skipped = true; skipped.push({ ruleId: ruleDoc.id, reason: T.UNSAFE_MESSAGE }); continue; }
      let found;
      try { found = await candidates(rule); } catch (err) { stats.failed++; fail(ruleDoc.id, null, err); continue; }   // one bad or unindexed rule never blocks the others
      if (!found.ok) { stats.failed++; fail(ruleDoc.id, null, found.message); continue; }
      for (const item of found.items) {
        if (purged >= s.runCap) { capped = true; break; }
        attempted++;
        try {
          await deps.performAssetDeletion(item.assetId, deps.creds(), { logActor: actor, cleanupRule: { id: ruleDoc.id, ...rule } });
          purged++; bytes += item.bytes; stats.purged++; stats.bytes += item.bytes;
        } catch (err) {
          // a record purged elsewhere in the meantime is "already gone", which counts as done
          if (err && err.code === "not-found") continue;
          stats.failed++; fail(ruleDoc.id, item.assetId, err);
        }
      }
      if (capped) break;
    }
    const status = L.sweepStatus({ purged, failures: failures.length, capped, attempted });
    const summary = { lastRunAt: Timestamp.fromMillis(now()), status, purged, bytes, failures, skipped, perRule, trigger };
    try {
      await db.doc("storageUsage/sweep").set(summary);
      for (const ruleDoc of rules) {
        const st = perRule[ruleDoc.id];
        if (st.skipped) continue;
        await ruleDoc.ref.set({ lastRun: { at: summary.lastRunAt, purged: st.purged, bytes: st.bytes, failed: st.failed } }, { merge: true });
      }
    } catch (err) { console.error("stash sweep: couldn't record the run", text(err)); }
    try {
      const entry = await deps.adminLogEntry(db, { feature: "cloudStash", action: "sweep-run", itemPath: "storageUsage/sweep", itemTitle: "Sweep", actorUid: actor.uid ?? null, actorName: actor.name, details: { status, purged, bytes, rules: rules.length, skipped: skipped.map((s) => s.ruleId), trigger } });
      await db.collection("adminLog").add(entry);
    } catch (err) { console.error("stash sweep: couldn't write the log entry", text(err)); }
    for (const kind of L.alertKinds({ sweep: { status, skipped: skipped.length } })) await alert(kind, { status, purged, failures: failures.length, skipped: skipped.length });
    return { ...summary, lastRunAt: summary.lastRunAt.toMillis() };
  }

  return { candidates, run, settings };
}

module.exports = { makeSweep, QUERY_CAP, EXAMPLES };
