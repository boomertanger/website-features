// Service Hub backend (docs/specs/service-hub.md §3-§11). Every document under sites/boomertanger/services/main is written ONLY here (Admin SDK);
// firestore.rules gives admins read access, a member read access to their own ratings, tests and my/{uid}, and nobody write access.
//
//   serviceRate    verified members    { serviceId, value: love|like|dislike, comment? }: one doc per member per service, history kept (last 20, with the
//                                      version); owner and admin ratings are stored but left out of the totals; 60 an hour (rateLimits)
//   serviceTest    verified members    { serviceId, device, results[] }: one counted test per member per version; 10 an hour
//   serviceSync    admins              { manifests, buildHash }: upserts items from services/*.json; a version change appends versionHistory;
//                                      a manifest that disappeared retires its item (never deleted). scripts/sync-services.js runs the same code.
//   serviceAdmin   admins              { action, serviceId, ... }: markTested, linkVideo, setCoversVersion, hideComment, retire, hide (adminLog "serviceHub")
//   Triggers: an Arcade game (games/{id}) → an arcadeGame item; a Vault game (vaultGames/{slug}) → a vaultGame item (retired while hidden); a stream
//   reaching Ended → a stream item rateable for 14 days; a rating or a test → the item's totals, my/{uid} and the summary row.
//
// Data (sites/boomertanger/services/main/…): the main doc { buildHash, syncedAt, count }; items/{serviceId}; ratings/{serviceId}__{uid};
// tests/{serviceId}__{uid}__{version}; my/{uid}; summary/main { rows: { id: row } } (admin views); and public/services { services: [member-safe rows] }.
// Item ids: the manifest id; an Arcade game's slug (so it meets its manifest, tap-the-splat); vault-<slug>; stream-<streamId>.
// build(deps) is what scripts/check-services-fn.js runs against the in-memory Firestore. deps: db, now(), adminLogEntry, factory, grant, tasks, hooks.
const { onCall } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const L = require("./logic");
const { SITE_ID, fail, requireAdmin, requireVerifiedMember } = require("../vault/common");
const { makeBoards, raise, idStr } = require("../boards");

const ACTIONS = ["markTested", "linkVideo", "setCoversVersion", "hideComment", "retire", "hide"];
const text = (err) => String((err && err.message) || err).slice(0, 160);
const msOf = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
const kebab = (s) => String(s || "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const now = deps.now || Date.now;
  const base = `sites/${SITE_ID}/services/main`;
  const R = {
    main: db.doc(base),
    items: db.collection(`${base}/items`),
    item: (id) => db.doc(`${base}/items/${id}`),
    ratings: db.collection(`${base}/ratings`),
    rating: (sid, uid) => db.doc(`${base}/ratings/${sid}__${uid}`),
    tests: db.collection(`${base}/tests`),
    test: (sid, uid, v) => db.doc(`${base}/tests/${sid}__${uid}__${v}`),
    my: (uid) => db.doc(`${base}/my/${uid}`),
    summary: db.doc(`${base}/summary/main`),
    public: db.doc(`sites/${SITE_ID}/public/services`),
    site: db.doc(`sites/${SITE_ID}`),
    member: (uid) => db.doc(`sites/${SITE_ID}/members/${uid}`),
  };
  const B = makeBoards({
    db, now, adminLogEntry: deps.adminLogEntry, label: "services", logKey: "serviceHub", itemPath: (id) => `${base}/items/${id}`, factory: deps.factory,
    activityFeature: "service-hub", linkOf: (id) => `/admin/services?service=${id}`, idField: "serviceId", factoryType: "services",
    rate: { prefix: "services", limits: L.LIMITS, periodKey: L.periodKey, ttlMs: L.limitTtlMs, overLimit: L.overLimit },
  });
  // badges, Night Shift and crew tasks (hooks.js); deps.hooks = null turns them off, and the check passes fakes for grant and factory
  const hooks = deps.hooks !== undefined ? deps.hooks : require("./hooks").makeHooks({ db, grant: deps.grant, factory: deps.factory, tasks: deps.tasks });
  const who = (c) => ({ member: !!c.member, staff: !!c.isStaff, admin: !!c.isAdmin, owner: !!c.isOwner });
  const ts = (ms) => Timestamp.fromMillis(ms);

  // ---------------------------------------------------------------------------------------------- views
  async function allItems() { return (await R.items.get()).docs.map((d) => ({ id: d.id, ...d.data() })); }
  /** summary/main and public/services from every item (sync, admin actions, the item triggers). Warns above 700 KB. */
  async function rebuildViews(items) {
    const list = items || await allItems();
    const rows = Object.fromEntries(list.map((it) => [it.id, L.summaryRow(it)]));
    const size = Buffer.byteLength(JSON.stringify(rows));
    if (size > L.SUMMARY_WARN_BYTES) console.warn(`services: summary is ${Math.round(size / 1024)} KB (warn above 700 KB)`);
    await R.summary.set({ rows, count: list.length, updatedAt: FieldValue.serverTimestamp() });
    await R.public.set({ services: list.map(L.publicRow).filter(Boolean).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))), updatedAt: FieldValue.serverTimestamp() });
  }
  /** One item's summary row (after its totals moved; the public list doesn't change with counts). */
  async function refreshRow(id) {
    const snap = await R.item(id).get();
    if (!snap.exists) return;
    await R.summary.set({ rows: { [id]: L.summaryRow({ id, ...snap.data() }) }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  const blankItem = (at) => ({
    hidden: false, needsSetup: false, video: null, tests: {}, communityTests: null, bugs: { open: 0 }, ideas: { open: 0 }, talk: null,
    ratings: { love: 0, like: 0, dislike: 0, n: 0, comments: 0, score: null, lovePct: 0, dislikePct: 0, byVersion: {} }, lastRatedAt: null,
    createdAt: ts(at), updatedAt: ts(at),
  });

  // ---------------------------------------------------------------------------------------------- serviceRate
  async function rate(request) {
    // a finished signup and a verified email, Feature Lab's check (Google and Twitch sign-ins count as verified; staff skip the email check)
    const c = requireVerifiedMember(await B.caller(request));
    const d = request.data || {};
    const sid = idStr(d.serviceId);
    if (!sid) throw fail("invalid-argument", "Say which service.", "args");
    const v = L.validateRating(d);
    if (!v.ok) throw raise(v);
    if (!L.skipsLimits(c)) await B.bump("rate", c.uid);
    const at = now();
    let out;
    await db.runTransaction(async (tx) => {
      const [is, rs] = await Promise.all([tx.get(R.item(sid)), tx.get(R.rating(sid, c.uid))]);
      if (!is.exists) throw fail("not-found", "That service isn't there.", "noService");
      const item = is.data();
      const ok = L.canRate(item, who(c), at);
      if (!ok.ok) throw raise(ok);
      const prev = rs.exists ? rs.data() : null;
      const keepHidden = !!prev && prev.hidden === true && prev.comment === v.value.comment;   // an admin hid this comment and it didn't change
      tx.set(R.rating(sid, c.uid), {
        serviceId: sid, uid: c.uid, handle: c.handle || null, type: item.type, value: v.value.value, comment: v.value.comment, version: item.version,
        countable: !(c.isOwner || c.isAdmin), hidden: keepHidden, ...(keepHidden ? {} : { hiddenBy: FieldValue.delete() }),
        history: L.pushHistory(prev && prev.history, { value: v.value.value, version: item.version, at: ts(at) }),
        createdAt: prev ? prev.createdAt : ts(at), updatedAt: ts(at),
      });
      out = { ok: true, serviceId: sid, value: v.value.value, version: item.version, changed: !prev || prev.value !== v.value.value || prev.version !== item.version };
    });
    return out;
  }

  // ---------------------------------------------------------------------------------------------- serviceTest
  async function test(request) {
    const c = requireVerifiedMember(await B.caller(request));
    const d = request.data || {};
    const sid = idStr(d.serviceId);
    if (!sid) throw fail("invalid-argument", "Say which service.", "args");
    const is = await R.item(sid).get();
    if (!is.exists) throw fail("not-found", "That service isn't there.", "noService");
    const item = is.data();
    const ok = L.canRate(item, who(c), now());
    if (!ok.ok) throw raise(ok);
    const v = L.validateTest(d, item.checks);
    if (!v.ok) throw raise(v);
    const ref = R.test(sid, c.uid, String(item.version).replace(/\//g, "_"));
    const seen = await ref.get();
    if (seen.exists) return { ok: true, serviceId: sid, version: item.version, counted: false, already: true, problems: seen.get("problems") || 0 };
    if (!L.skipsLimits(c)) await B.bump("test", c.uid);
    let counted = false;
    await db.runTransaction(async (tx) => {
      const again = await tx.get(ref);
      if (again.exists) return;
      tx.set(ref, { serviceId: sid, uid: c.uid, handle: c.handle || null, type: item.type, version: item.version, device: v.value.device, results: v.value.results, problems: v.value.problems, bugReportId: null, createdAt: ts(now()) });
      counted = true;
    });
    return { ok: true, serviceId: sid, version: item.version, counted, already: !counted, problems: v.value.problems };
  }

  // ---------------------------------------------------------------------------------------------- serviceSync (and scripts/sync-services.js)
  /**
   * manifests: raw services/*.json objects. Returns the plan ({ create, update, bump, retire, same } as ids) and, with apply, writes it.
   * actor: { uid, name } for adminLog (the script passes a name of its own).
   */
  async function syncManifests(manifests, { buildHash = null, apply = true, actor = null } = {}) {
    if (!Array.isArray(manifests) || !manifests.length || manifests.length > 400) throw fail("invalid-argument", "Send the list of manifests (1 to 400).", "manifests");
    const list = [], bad = [];
    for (const m of manifests) { const n = L.normalizeManifest(m); if (n.ok) list.push(n.value); else bad.push(n.message); }
    if (bad.length) throw fail("invalid-argument", `Some manifests are wrong: ${bad.slice(0, 5).join(" ")}`, "manifest");
    if (new Set(list.map((m) => m.id)).size !== list.length) throw fail("invalid-argument", "Two manifests share an id.", "manifest");
    const items = await allItems();
    const existing = Object.fromEntries(items.map((it) => [it.id, it]));
    const plan = L.planSync(existing, list);
    const summary = { create: plan.create.map((m) => m.id), update: plan.update.map((m) => m.id), bump: plan.bump.map((b) => `${b.id} ${b.from} → ${b.to}`), retire: plan.retire.map((r) => r.id), same: plan.same.length };
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
    for (const r of plan.retire) ops.push((b) => b.update(R.item(r.id), { status: "retired", updatedAt: ts(at) }));
    for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((op) => op(b)); await b.commit(); }
    await R.main.set({ buildHash, syncedAt: ts(at), count: list.length }, { merge: true });
    await rebuildViews();
    if (actor) await B.adminLog(actor, { action: "sync", id: "main", title: "Service Hub sync", details: { ...summary, buildHash } });
    if (hooks && hooks.onBumps) await hooks.onBumps(plan.bump.filter((b) => b.status === "live"));
    return { ok: true, applied: true, ...summary };
  }
  async function sync(request) {
    const c = requireAdmin(await B.caller(request));
    const d = request.data || {};
    const buildHash = typeof d.buildHash === "string" && /^[a-f0-9]{16,64}$/.test(d.buildHash) ? d.buildHash : null;
    if (!buildHash) throw fail("invalid-argument", "Send the build hash with the manifests.", "buildHash");
    return syncManifests(d.manifests, { buildHash, apply: true, actor: c });
  }

  // ---------------------------------------------------------------------------------------------- serviceAdmin
  async function adminAction(request) {
    const c = requireAdmin(await B.caller(request));
    const d = request.data || {};
    if (!ACTIONS.includes(d.action)) throw fail("invalid-argument", `Say ${ACTIONS.join(", ")}.`, "action");
    const sid = idStr(d.serviceId);
    if (!sid) throw fail("invalid-argument", "Say which service.", "args");
    const snap = await R.item(sid).get();
    if (!snap.exists) throw fail("not-found", "That service isn't there.", "noService");
    const item = snap.data(), at = now(), by = { uid: c.uid, handle: c.handle || null };
    let patch = null, details = {};
    if (d.action === "markTested") {
      if (!L.ENVS.includes(d.env)) throw fail("invalid-argument", "Say staging or production.", "env");
      if (!["pass", "issues"].includes(d.result)) throw fail("invalid-argument", "Say pass or issues.", "result");
      const note = typeof d.note === "string" ? d.note.trim().slice(0, 300) : "";
      if (d.result === "issues" && !note) throw fail("invalid-argument", "Say what the issues are.", "note");
      patch = { [`tests.${d.env}`]: { version: item.version, at: ts(at), by, result: d.result, note } };
      details = { env: d.env, result: d.result, version: item.version };
    } else if (d.action === "linkVideo") {
      const id = typeof d.videoId === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(d.videoId) ? d.videoId : null;
      if (!id) throw fail("invalid-argument", "That isn't a YouTube video id.", "videoId");
      const title = typeof d.title === "string" ? d.title.trim().slice(0, 120) : "";
      const coversVersion = typeof d.coversVersion === "string" && d.coversVersion.trim() ? d.coversVersion.trim().slice(0, 20) : item.version;
      patch = { video: { id, title, publishedAt: Number.isFinite(d.publishedAt) ? ts(d.publishedAt) : null, coversVersion, linkedBy: by, linkedAt: ts(at) } };
      details = { videoId: id, coversVersion };
    } else if (d.action === "setCoversVersion") {
      if (!item.video || !item.video.id) throw fail("failed-precondition", "Link a video first.", "noVideo");
      const v = typeof d.version === "string" ? d.version.trim().slice(0, 20) : "";
      if (!v) throw fail("invalid-argument", "Say which version the video covers.", "version");
      patch = { "video.coversVersion": v };
      details = { from: item.video.coversVersion || null, to: v };
    } else if (d.action === "hideComment") {
      const uid = idStr(d.uid);
      if (!uid || typeof d.hidden !== "boolean") throw fail("invalid-argument", "Say whose comment, and hidden true or false.", "args");
      const rs = await R.rating(sid, uid).get();
      if (!rs.exists) throw fail("not-found", "That rating isn't there.", "noRating");
      await R.rating(sid, uid).update(d.hidden ? { hidden: true, hiddenBy: { ...by, at: ts(at) } } : { hidden: false, hiddenBy: FieldValue.delete() });
      details = { uid, hidden: d.hidden };
    } else if (d.action === "retire") {
      patch = { status: "retired" };
      details = { from: item.status };
    } else if (d.action === "hide") {
      if (typeof d.hidden !== "boolean") throw fail("invalid-argument", "Say hidden true or false.", "args");
      patch = { hidden: d.hidden };
      details = { hidden: d.hidden };
    }
    if (patch) await R.item(sid).update({ ...patch, updatedAt: ts(at) });
    await B.adminLog(c, { action: d.action, id: sid, title: item.name || sid, details });
    if (patch) await rebuildViews();
    return { ok: true, serviceId: sid, action: d.action };
  }

  // ---------------------------------------------------------------------------------------------- after a rating or a test
  /** who a member is, for "open to them" (core services, full coverage). */
  async function whoIs(uid) {
    const [site, m] = await Promise.all([R.site.get(), R.member(uid).get()]);
    const roles = m.exists ? m.get("roles") || [] : [];
    const owner = site.exists && site.get("ownerUid") === uid;
    return { member: true, staff: owner || roles.includes("admin") || roles.includes("mod"), admin: owner || roles.includes("admin"), owner };
  }
  async function afterRating(sid, uid) {
    const at = now();
    const [forService, forMember, items] = await Promise.all([R.ratings.where("serviceId", "==", sid).get(), R.ratings.where("uid", "==", uid).get(), allItems()]);
    const totals = L.totalsOf(forService.docs.map((d) => d.data()));
    const itemsById = Object.fromEntries(items.map((it) => [it.id, it]));
    if (itemsById[sid]) await R.item(sid).update({ ratings: totals, lastRatedAt: ts(at) });
    const rated = Object.fromEntries(forMember.docs.map((d) => d.data()).map((r) => [r.serviceId, { value: r.value, version: r.version, type: r.type || null }]));
    const w = await whoIs(uid);
    const coreIds = items.filter((it) => L.isCore(it, w)).map((it) => it.id);
    const coreRated = coreIds.filter((id) => rated[id]).length;
    await R.my(uid).set({ rated, coreRated, coreTotal: coreIds.length, updatedAt: ts(at) }, { merge: true });
    await refreshRow(sid);
    return { rated, coreIds, item: itemsById[sid] || null, who: w };
  }
  async function afterTest(sid, uid) {
    const at = now();
    const [is, forService, forMember] = await Promise.all([R.item(sid).get(), R.tests.where("serviceId", "==", sid).get(), R.tests.where("uid", "==", uid).get()]);
    if (!is.exists) return null;
    const item = is.data();
    const current = forService.docs.map((d) => d.data()).filter((t) => L.compareVersions(t.version, item.version) === 0);
    const communityTests = { version: item.version, pass: current.filter((t) => !t.problems).length, problems: current.filter((t) => t.problems > 0).length, devices: { phone: current.filter((t) => t.device === "phone").length, desktop: current.filter((t) => t.device === "desktop").length } };
    await R.item(sid).update({ communityTests, updatedAt: ts(at) });
    const tested = {};
    for (const t of forMember.docs.map((d) => d.data())) tested[t.serviceId] = t.version;
    await R.my(uid).set({ tested, updatedAt: ts(at) }, { merge: true });
    await refreshRow(sid);
    return { item: { id: sid, ...item }, testsCount: forMember.size };
  }

  // ---------------------------------------------------------------------------------------------- item triggers
  const ARCADE_KEYS = ["title", "slug", "tagline", "status", "currentVersion"];
  async function onArcadeGame(gameId, before, after) {
    if (before && after && ARCADE_KEYS.every((k) => JSON.stringify(before[k] ?? null) === JSON.stringify(after[k] ?? null))) return { skipped: true };   // a stats roll-up
    const id = kebab((after && after.slug) || (before && before.slug) || gameId);
    const at = now();
    const ref = R.item(id), snap = await ref.get();
    if (!after) { if (snap.exists && snap.get("status") !== "retired") { await ref.update({ status: "retired", updatedAt: ts(at) }); await rebuildViews(); } return { id, retired: true }; }
    const version = L.normalizeVersion(after.currentVersion);
    const status = after.status === "live" ? "live" : after.status === "retired" ? "retired" : "building";
    const fields = { type: "arcadeGame", status, link: `/arcade/${id}`, "source.arcade": gameId, updatedAt: ts(at) };
    let bump = null;
    if (!snap.exists) {
      await ref.set({ ...blankItem(at), id, name: after.title || id, type: "arcadeGame", area: "Play", blurb: after.tagline || "", version, status, audience: "everyone", routes: [], link: `/arcade/${id}`, sections: {}, checks: [], talkBack: "note", help: null, videoTag: `#bt-${id}`, source: { arcade: gameId }, versionHistory: [{ version, at: ts(at) }] });
    } else {
      const cur = snap.data();
      const patch = { ...fields };
      if (!cur.source || cur.source.manifest !== true) { patch.name = after.title || cur.name; patch.blurb = after.tagline || cur.blurb || ""; }   // a manifest names its own service
      if (String(cur.version) !== version) { patch.version = version; patch.versionHistory = FieldValue.arrayUnion({ version, at: ts(at) }); bump = { id, from: cur.version, to: version, name: cur.name, status }; }
      await ref.update(patch);
    }
    await rebuildViews();
    if (bump && bump.status === "live" && hooks && hooks.onBumps) await hooks.onBumps([bump]);
    return { id, version, status };
  }
  async function onVaultGame(slug, before, after) {
    const vis = (g) => !!g && g.hidden !== true;
    if (before && after && vis(before) === vis(after) && before.title === after.title) return { skipped: true };
    const id = `vault-${slug}`, at = now();
    const ref = R.item(id), snap = await ref.get();
    if (!vis(after)) { if (snap.exists && snap.get("status") !== "retired") { await ref.update({ status: "retired", updatedAt: ts(at) }); await rebuildViews(); } return { id, retired: true }; }
    if (!snap.exists) await ref.set({ ...blankItem(at), id, name: after.title || slug, type: "vaultGame", area: "Watch", blurb: "", version: "1.0", status: "live", audience: "everyone", routes: [], link: `/games/${slug}`, sections: {}, checks: [], talkBack: "skip", help: null, videoTag: `#bt-${id}`, source: { vault: slug }, versionHistory: [{ version: "1.0", at: ts(at) }] });
    else await ref.update({ name: after.title || slug, status: "live", updatedAt: ts(at) });
    await rebuildViews();
    return { id };
  }
  async function onStreamEnded(streamId, before, after) {
    if (!after || after.state !== "ended" || (before && before.state === "ended")) return { skipped: true };
    const id = `stream-${kebab(streamId)}`, at = now();
    const ref = R.item(id);
    if ((await ref.get()).exists) return { id, already: true };
    const ended = msOf(after.actualEnd) || at;
    await ref.set({ ...blankItem(at), id, name: after.title || "Stream", type: "stream", area: "Watch", blurb: "", version: "1.0", status: "live", audience: after.type === "backstage" ? "members" : "everyone", routes: [], link: null, sections: {}, checks: [], talkBack: "skip", help: null, videoTag: `#bt-${id}`, source: { stream: streamId }, endedAt: ts(ended), rateableUntil: ended + L.STREAM_RATE_DAYS * L.DAY, versionHistory: [{ version: "1.0", at: ts(at) }] });
    await rebuildViews();
    return { id };
  }

  // ---------------------------------------------------------------------------------------------- the trigger bodies (exported for the check)
  async function ratingWritten(before, after) {
    const r = after || before;
    if (!r || !r.serviceId || !r.uid) return null;
    const res = await afterRating(r.serviceId, r.uid);
    if (hooks && hooks.afterRating) {
      const first = !before, changedValue = !!before && !!after && before.value !== after.value;
      try { await hooks.afterRating({ rating: after, first, changedValue, ...res }); } catch (err) { console.error("services: rating hooks failed", text(err)); }
    }
    return res;
  }
  async function testCreated(t) {
    if (!t || !t.serviceId || !t.uid) return null;
    const res = await afterTest(t.serviceId, t.uid);
    if (res && hooks && hooks.afterTest) { try { await hooks.afterTest({ test: t, ...res }); } catch (err) { console.error("services: test hooks failed", text(err)); } }
    return res;
  }

  const data = (snap) => (snap && snap.exists ? snap.data() : null);
  const functions = {
    serviceRate: onCall(rate),
    serviceTest: onCall(test),
    serviceSync: onCall({ timeoutSeconds: 120 }, sync),
    serviceAdmin: onCall(adminAction),
    onServiceRatingWritten: onDocumentWritten(`sites/{siteId}/services/main/ratings/{ratingId}`, async (event) => {
      if (event.params.siteId !== SITE_ID) return;
      await ratingWritten(data(event.data && event.data.before), data(event.data && event.data.after));
    }),
    onServiceTestCreated: onDocumentCreated(`sites/{siteId}/services/main/tests/{testId}`, async (event) => {
      if (event.params.siteId !== SITE_ID) return;
      await testCreated(data(event.data));
    }),
    onArcadeGameService: onDocumentWritten(`sites/{siteId}/games/{gameId}`, async (event) => {
      if (event.params.siteId !== SITE_ID) return;
      await onArcadeGame(event.params.gameId, data(event.data && event.data.before), data(event.data && event.data.after));
    }),
    onVaultGameService: onDocumentWritten(`sites/{siteId}/vaultGames/{slug}`, async (event) => {
      if (event.params.siteId !== SITE_ID) return;
      await onVaultGame(event.params.slug, data(event.data && event.data.before), data(event.data && event.data.after));
    }),
    onStreamEndedService: onDocumentWritten(`sites/{siteId}/streams/{streamId}`, async (event) => {
      if (event.params.siteId !== SITE_ID) return;
      await onStreamEnded(event.params.streamId, data(event.data && event.data.before), data(event.data && event.data.after));
    }),
  };
  return { functions, syncManifests, rebuildViews, ratingWritten, testCreated, onArcadeGame, onVaultGame, onStreamEnded, refs: R };
}

module.exports = { build };
