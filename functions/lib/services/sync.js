// Service Hub sync (docs/specs/service-hub.md §3a, "Automatic sync"): the one core that serviceSync (an admin's Sync now, or /admin/services
// noticing a new build), scripts/sync-services.js and the scheduled serviceSyncTick all call. lib/services/index.js builds it with its own refs.
//
//   syncManifests(manifests, { buildHash, apply, actor, retire = true, by = "manual" })
//       Upserts items from services/*.json; a version change appends versionHistory. With retire (the manual sync) a manifest that disappeared
//       retires its item (never deleted); without it (the automatic sync) the item is left alone and listed in services/main.missingFromBuild
//       for Needs attention. services/main keeps { buildHash, syncedAt, count, syncedBy: "manual" | "auto", missingFromBuild }.
//   tick({ siteUrl, headers })
//       Every 15 minutes: fetch <siteUrl>/services.json, compare its hash with services/main.buildHash and sync only when they differ (no change:
//       no writes). Skips without touching service data when the response isn't a real services.json (a Cloudflare Access login page, an error
//       page) or when the service count drops by more than 20% from the last sync; those count as failures in services/main.autoSync
//       { failures, since, lastError, lastAt }, cleared by the next success. Returns { result: "same" | "synced" | "skipped", ... }.
const L = require("./logic");
const { fail } = require("../vault/common");

const DROP_LIMIT = 0.2;           // more than 20% fewer services than the last sync: skip
const FETCH_TIMEOUT_MS = 20000;
const text = (err) => String((err && err.message) || err).slice(0, 300);

/** A response body that is really services.json: { hash: hex, services: [{ id }…] }. Anything else (HTML, an error object) is null. */
function parseBuild(body) {
  let j;
  try { j = typeof body === "string" ? JSON.parse(body) : body; } catch { return null; }
  if (!j || typeof j !== "object" || typeof j.hash !== "string" || !/^[a-f0-9]{16,64}$/.test(j.hash)) return null;
  if (!Array.isArray(j.services) || !j.services.length || j.services.some((m) => !m || typeof m.id !== "string")) return null;
  return { hash: j.hash, services: j.services };
}
/** true when the new list is more than 20% shorter than the last synced count. */
const bigDrop = (lastCount, n) => Number(lastCount) > 0 && n < Number(lastCount) * (1 - DROP_LIMIT);

function makeSync({ db, now, R, B, hooks, allItems, rebuildViews, blankItem, ts, FieldValue, fetchFn }) {
  async function syncManifests(manifests, { buildHash = null, apply = true, actor = null, retire = true, by = "manual" } = {}) {
    if (!Array.isArray(manifests) || !manifests.length || manifests.length > 400) throw fail("invalid-argument", "Send the list of manifests (1 to 400).", "manifests");
    const list = [], bad = [];
    for (const m of manifests) { const n = L.normalizeManifest(m); if (n.ok) list.push(n.value); else bad.push(n.message); }
    if (bad.length) throw fail("invalid-argument", `Some manifests are wrong: ${bad.slice(0, 5).join(" ")}`, "manifest");
    if (new Set(list.map((m) => m.id)).size !== list.length) throw fail("invalid-argument", "Two manifests share an id.", "manifest");
    const items = await allItems();
    const existing = Object.fromEntries(items.map((it) => [it.id, it]));
    const plan = L.planSync(existing, list);
    const missing = retire ? [] : plan.retire.map((r) => ({ id: r.id, name: r.name || r.id }));
    const summary = { create: plan.create.map((m) => m.id), update: plan.update.map((m) => m.id), bump: plan.bump.map((b) => `${b.id} ${b.from} → ${b.to}`), retire: retire ? plan.retire.map((r) => r.id) : [], ...(retire ? {} : { missing: missing.map((m) => m.id) }), same: plan.same.length };
    if (!apply) return { ok: true, applied: false, ...summary };
    const at = now();
    const ops = [];
    for (const m of plan.create) ops.push((b) => b.set(R.item(m.id), { ...blankItem(at), ...m, id: m.id, source: { manifest: true }, needsSetup: L.needsSetup(m), versionHistory: [{ version: m.version, at: ts(at) }] }));
    for (const u of plan.update) {
      const bumped = u.changed.includes("version");
      const { changed, ...m } = u;
      const patch = { ...Object.fromEntries(L.MANIFEST_FIELDS.map((k) => [k, m[k] ?? null])), "source.manifest": true, needsSetup: L.needsSetup(m), updatedAt: ts(at) };
      if (bumped) { patch.version = m.version; patch.versionHistory = FieldValue.arrayUnion({ version: m.version, at: ts(at) }); }
      ops.push((b) => b.update(R.item(m.id), patch));
    }
    if (retire) for (const r of plan.retire) ops.push((b) => b.update(R.item(r.id), { status: "retired", updatedAt: ts(at) }));
    for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((op) => op(b)); await b.commit(); }
    await R.main.set({ buildHash, syncedAt: ts(at), count: list.length, syncedBy: by, missingFromBuild: missing }, { merge: true });
    await rebuildViews();
    if (actor) await B.adminLog(actor, { action: "sync", id: "main", title: "Service Hub sync", details: { ...summary, buildHash, by } });
    if (hooks && hooks.onBumps) await hooks.onBumps(plan.bump.filter((b) => b.status === "live"));
    return { ok: true, applied: true, ...summary };
  }

  /** A failed or skipped automatic run: count it (first failure time kept); never touches service data. */
  async function failed(main, reason, message) {
    const a = (main && main.autoSync) || {};
    const at = now();
    const next = { failures: (Number(a.failures) || 0) + 1, since: a.since || ts(at), lastError: String(message).slice(0, 300), lastReason: reason, lastAt: ts(at) };
    await R.main.set({ autoSync: next }, { merge: true });
    return { result: "skipped", reason, message, failures: next.failures };
  }
  const clearFailures = (main) => (main && main.autoSync && Number(main.autoSync.failures) > 0 ? R.main.set({ autoSync: { failures: 0, since: null, lastError: null, lastReason: null, lastAt: null } }, { merge: true }) : null);

  async function tick({ siteUrl, headers = {} }) {
    const snap = await R.main.get();
    const main = snap.exists ? snap.data() : {};
    const url = `${String(siteUrl).replace(/\/+$/, "")}/services.json`;
    let build = null;
    try {
      const res = await fetchFn(url, { headers: { Accept: "application/json", ...headers }, redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.status >= 300 && res.status < 400) return failed(main, "redirect", `${url} redirected (${res.status}): Cloudflare Access may be asking for a login. Check the CF Access secrets.`);
      if (!res.ok) return failed(main, "http", `${url} answered ${res.status}.`);
      build = parseBuild(await res.text());
      if (!build) return failed(main, "notServicesJson", `${url} didn't return services.json (a login or error page?).`);
    } catch (err) {
      return failed(main, "fetch", `Couldn't fetch ${url}: ${text(err)}`);
    }
    if (build.hash === main.buildHash) { await clearFailures(main); return { result: "same", hash: build.hash }; }
    if (bigDrop(main.count, build.services.length)) return failed(main, "bigDrop", `The build lists ${build.services.length} services, down from ${main.count} at the last sync (more than 20% fewer). Sync from /admin/services if that's right.`);
    try {
      const out = await syncManifests(build.services, { buildHash: build.hash, apply: true, retire: false, by: "auto", actor: { uid: null, name: "auto sync" } });
      await clearFailures(main);
      return { result: "synced", hash: build.hash, ...out };
    } catch (err) {
      return failed(main, "sync", `The sync failed: ${text(err)}`);
    }
  }

  return { syncManifests, tick };
}

module.exports = { makeSync, parseBuild, bigDrop, DROP_LIMIT };
