// Prize Box (docs/specs/prize-box.md §6, §7): every Boomertanger contest from start to finish. Everything under sites/boomertanger/prizeBox/main
// is written ONLY here (Admin SDK); firestore.rules gives clients the reads the spec allows and no writes.
//
//   prizeContestSave    admins (owner for live)   create or edit a contest (a draft until published; not after it's won)
//   prizeContestStatus  admins (owner for live)   publish, unpublish, open, close, judging, cancel, done; delete (the owner: the one delete path)
//   prizeSettings       owner                     cooldownDays, claimDays, hereSeconds; the mailing address (private/settings)
//   prizeEntryParams    verified members          the upload gate first, then signed private params for prize-box/entries/<contestId>/<uid>/<n>
//   prizeEnter          verified members          one entry per member (an upload or text), replaceable until the deadline
//   prizeWithdraw       the entrant               withdraws (and deletes the file) while entries are open
//   prizeGetCode        verified members          a mail-in contest's entry code (PB-XXXX) and the mailing address
//   prizeEntryUrl       the entrant, admins       a 10-minute signed link to an uploaded entry
//   prizeMailLog        admins                    look up a code, mark an envelope received (postmark checked), log an unmatched envelope
//   prizeEntryReview    admins                    accept, or reject with a reason
//   prizeJudge          owner                     places winners (judged) or draws them at random from the accepted entries
//   prizeClaim          the winner                claims a prize (US address for mailed prizes; under 18 needs parentOk)
//   prizeClaimAdmin     owner                     show address (logged), set a code, mark shipped, forfeit, forfeit and redraw
//   prizeMine           members                   /prizes/mine and a contest page's own state (eligibility, entry, code, wins)
//   prizeTick           every 5 minutes           open and close on time, reminders 24 h and 1 h before closing, claim reminders and expiry
// The live draw (prizeDrawStart, prizeDrawSpin, prizeRespin, prizeDrawEnd, prizeHere) is in draw.js and shares awardWinner() with prizeJudge.
//
// Data (spec §6): main { settings }, main/private/settings { mailingAddress } (owner), contests/{id} (+ entries/{uid}, draws/{drawId}),
// codes/{code} { contestId, uid }, winners/{id} (+ private/claim, owner), mailLog/{id}, cooldowns/{uid} { until }, my/{uid} { contestIds },
// and public/prizeBox (the summary). Logs: adminLog feature "prizeBox"; activityLog feature "prize-box" type "contest-winner" (only with
// showIfWin); notifyOutbox prize-open, prize-reminder, prize-entry-received, prize-winner, prize-results, prize-claim-reminder, prize-shipped
// (ids, titles and links only: never an address, a code or a uid list in a payload's text). The badge prize-box-winner through grantBadge,
// and profiles/{uid}.prizeWins (×n on the profile).
//
// build(deps) is what scripts/check-prize-box.js runs against the in-memory Firestore. deps: adminLogEntry, now(), grant { grantBadge, grantXp },
// cloud (lib/cloudinary.js), cloudCreds(), cloudSecrets, performAssetDeletion, cloudinaryDelete, recordAssetCreated, fetch, enqueue (draw.js).
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const L = require("./logic");
const { SITE_ID, fail, requireVerifiedMember, requireAdmin } = require("../vault/common");
const { makeBoards, raise, idStr } = require("../boards");
const { uploadGate } = require("../stash/gate");

const BADGE_ID = "prize-box-winner";
const LINK = "/prizes";
const contestLink = (c) => `/prizes/${c.slug}`;

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const now = deps.now || Date.now;
  const base = `sites/${SITE_ID}/prizeBox/main`;
  const R = {
    main: () => db.doc(base),
    privateSettings: () => db.doc(`${base}/private/settings`),
    contest: (id) => db.doc(`${base}/contests/${id}`),
    contests: () => db.collection(`${base}/contests`),
    entry: (cid, uid) => db.doc(`${base}/contests/${cid}/entries/${uid}`),
    entries: (cid) => db.collection(`${base}/contests/${cid}/entries`),
    code: (code) => db.doc(`${base}/codes/${code}`),
    codes: () => db.collection(`${base}/codes`),
    winner: (id) => db.doc(`${base}/winners/${id}`),
    winners: () => db.collection(`${base}/winners`),
    claim: (id) => db.doc(`${base}/winners/${id}/private/claim`),
    mailLog: () => db.collection(`${base}/mailLog`),
    cooldown: (uid) => db.doc(`${base}/cooldowns/${uid}`),
    my: (uid) => db.doc(`${base}/my/${uid}`),
    summary: () => db.doc(`sites/${SITE_ID}/public/prizeBox`),
    member: (uid) => db.doc(`sites/${SITE_ID}/members/${uid}`),
    profile: (uid) => db.doc(`sites/${SITE_ID}/profiles/${uid}`),
    user: (uid) => db.doc(`users/${uid}`),
    site: () => db.doc(`sites/${SITE_ID}`),
  };
  const entriesPath = (cid) => `${base}/contests/${cid}/entries`;
  const uploadPrefix = (cid, uid) => `prize-box/entries/${cid}/${uid}/`;

  let grantMod = deps.grant, cloudMod = deps.cloud;
  const grant = () => (grantMod ||= require("../rewards/grant"));
  const cloud = () => (cloudMod ||= require("../cloudinary"));
  const fetchFn = deps.fetch || ((...a) => fetch(...a));
  const creds = () => deps.cloudCreds();

  const B = makeBoards({
    db, now, adminLogEntry: deps.adminLogEntry, label: "prizeBox", logKey: "prizeBox", itemPath: (id) => `${base}/contests/${id}`,
    activityFeature: "prize-box", linkOf: () => LINK, idField: "contestId", factoryType: null,
    rate: { prefix: "prize", limits: L.LIMITS, periodKey: L.periodKey, ttlMs: (k) => L.LIMITS[k].windowMs, overLimit: (k, n) => n >= L.LIMITS[k].max },
  });
  const { caller, bump, adminLog, outbox } = B;

  /** A notifyOutbox event at most once (a fixed id): reminders and announcements that prizeTick may see twice. */
  async function outboxOnce(id, doc) {
    try {
      await db.doc(`sites/${SITE_ID}/notifyOutbox/${id.replace(/\//g, "_")}`).create({ ...doc, streamId: null, week: null, status: "pending", createdAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(now() + 30 * L.DAY_MS) });
      return true;
    } catch (err) { if (err && (err.code === 6 || /ALREADY_EXISTS|already exists/i.test(`${err.code} ${err.message}`))) return false; console.error("prizeBox: notifyOutbox write failed", String((err && err.message) || err).slice(0, 160)); return false; }
  }
  const tell = (uids, type, payload) => {
    const list = [...new Set((uids || []).filter(Boolean))];
    const out = [];
    for (let i = 0; i < list.length; i += 400) out.push(outbox({ type, audience: "uids", uids: list.slice(i, i + 400), payload: { kind: "prize-box", ...payload } }));
    return Promise.all(out);
  };

  async function settings() { return L.settingsOf((await R.main().get()).data()); }
  async function loadContest(id) {
    if (!idStr(id)) throw fail("invalid-argument", "Say which contest.", "args");
    const snap = await R.contest(id).get();
    return snap.exists ? { id, ...snap.data() } : null;
  }
  async function ownerUid() { const s = await R.site().get(); return s.exists ? s.get("ownerUid") || null : null; }

  // ---------------------------------------------------------------- who can win
  /** The live Night Shift season's rank (1-based) for a member, from the all board (top 100), or null. */
  async function nightShiftRank(uid) {
    const seasons = await db.collection(`sites/${SITE_ID}/factory/main/seasons`).where("status", "==", "live").limit(1).get();
    if (seasons.empty) return null;
    const board = await db.doc(`sites/${SITE_ID}/factory/main/seasons/${seasons.docs[0].id}/boards/all`).get();
    const row = ((board.exists && board.get("rows")) || []).filter((r) => r.roleTag !== "admin" && r.tier !== "crew").findIndex((r) => r.uid === uid);
    return row >= 0 ? row + 1 : null;
  }
  /** Everything ineligible() needs for one member and one contest (only the reads its filters use). */
  async function standingOf(uid, contest, extra = {}) {
    const [member, profile, owner, cd] = await Promise.all([R.member(uid).get(), R.profile(uid).get(), extra.ownerUid !== undefined ? extra.ownerUid : ownerUid(), contest.type === "live" ? R.cooldown(uid).get() : null]);
    const p = { uid, member: member.exists ? member.data() : null, profile: profile.exists ? profile.data() : null, ownerUid: owner, cooldownUntil: cd && cd.exists ? L.ms(cd.get("until")) : null, badges: new Set(), badgeNames: {} };
    for (const f of contest.eligibility || []) {
      if (f.kind === "badge") {
        const [held, def] = await Promise.all([db.doc(`sites/${SITE_ID}/profiles/${uid}/badges/${f.badgeId}`).get(), db.doc(`sites/${SITE_ID}/badges/${f.badgeId}`).get()]);
        if (held.exists) p.badges.add(f.badgeId);
        if (def.exists) p.badgeNames[f.badgeId] = def.get("name");
      }
      if (f.kind === "nightShiftTop" && p.nsRank === undefined) p.nsRank = extra.nsRank !== undefined ? extra.nsRank : await nightShiftRank(uid);
      if (f.kind === "everyBeat") p.everyBeat = extra.everyBeat === true;
    }
    return p;
  }
  const whyNot = async (uid, contest, extra) => L.ineligible(await standingOf(uid, contest, extra), contest, now());

  // ---------------------------------------------------------------- the public summary
  async function rebuildSummary() {
    const [cs, ws] = await Promise.all([R.contests().where("status", "in", ["scheduled", "open", "closed", "judging", "drawing", "won", "done"]).get(), R.winners().orderBy("at", "desc").limit(100).get()]);
    const contests = cs.docs.map((d) => ({ id: d.id, ...d.data() }));
    const s = L.buildSummary(contests, ws.docs.map((d) => d.data()));
    await R.summary().set({ ...s, updatedAt: FieldValue.serverTimestamp() });
    return s;
  }
  const rebuildQuietly = () => rebuildSummary().catch((err) => console.error("prizeBox: summary rebuild failed", String((err && err.message) || err).slice(0, 160)));

  // ---------------------------------------------------------------- prizeContestSave
  async function contestSave(request) {
    const c = requireAdmin(await caller(request));
    const id = request.data && request.data.id;
    const prev = id ? await loadContest(id) : null;
    if (id && !prev) throw fail("not-found", "This contest is no longer here.", "noContest");
    const type = prev ? prev.type : request.data && request.data.type;
    if (!L.canManage(c, { type })) throw fail("permission-denied", "Live draws are Boomer's alone.", "notOwner");
    if (prev && ["won", "done", "cancelled"].includes(prev.status)) throw fail("failed-precondition", "A finished contest can't be edited.", "finished");
    const v = L.validateContest(request.data, { prev, now: now() });
    if (!v.ok) throw raise(v);
    const value = { ...v.value };
    // the slug is the address: unique, and it stops changing once the contest is published
    if (prev && prev.status !== "draft") value.slug = prev.slug;
    else {
      let slug = value.slug, n = 1;
      for (;;) {
        const hit = await R.contests().where("slug", "==", slug).limit(2).get();
        if (!hit.docs.some((d) => d.id !== id)) break;
        slug = `${value.slug}-${++n}`;
      }
      value.slug = slug;
    }
    const ts = (x) => (x == null ? null : Timestamp.fromMillis(x));
    const doc = { ...value, opensAt: ts(value.opensAt), closesAt: ts(value.closesAt), updatedAt: FieldValue.serverTimestamp() };
    let ref;
    if (prev) { ref = R.contest(id); await ref.update(doc); }
    else {
      ref = R.contests().doc();
      await ref.set({ ...doc, status: "draft", counts: { entries: 0, accepted: 0, received: 0 }, createdBy: { uid: c.uid, handle: c.handle || null }, createdAt: FieldValue.serverTimestamp() });
    }
    await adminLog(c, { action: prev ? "edit" : "create", id: ref.id, title: value.title, details: { type: value.type, method: value.method } });
    if (prev && prev.status !== "draft") await rebuildQuietly();
    return { ok: true, id: ref.id, slug: value.slug };
  }

  // ---------------------------------------------------------------- prizeContestStatus (and the one delete path)
  async function announceOpen(contest) {
    if (!contest.announce || contest.announce.alerts === false) return;
    await outboxOnce(`prize-open:${contest.id}`, { type: "prize-open", audience: "members", payload: { kind: "prize-box", contestId: contest.id, title: contest.title, link: contestLink(contest) } });
  }
  async function contestStatus(request) {
    const c = requireAdmin(await caller(request));
    const { id, action } = request.data || {};
    const contest = await loadContest(id);
    if (!contest) throw fail("not-found", "This contest is no longer here.", "noContest");
    if (!L.canManage(c, contest)) throw fail("permission-denied", "Live draws are Boomer's alone.", "notOwner");
    if (action === "delete") return deleteContest(c, contest);
    const plan = L.planMove(contest, action, now());
    if (!plan.ok) throw raise(plan);
    if (action === "publish") {
      const v = L.validateContest({ ...contest, opensAt: L.ms(contest.opensAt), closesAt: L.ms(contest.closesAt) }, { prev: contest, now: now() });
      if (!v.ok) throw raise(v);
      if (contest.type !== "live" && (L.ms(contest.closesAt) || 0) <= now()) throw fail("failed-precondition", "The closing date has passed. Change it first.", "closesAt");
    }
    await R.contest(id).update({ status: plan.to, statusChangedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), ...(plan.to === "open" ? { openedAt: FieldValue.serverTimestamp() } : {}) });
    await adminLog(c, { action, id, title: contest.title, changes: { status: { before: plan.from, after: plan.to } } });
    if (plan.to === "open") await announceOpen({ ...contest, id });
    await rebuildQuietly();
    return { ok: true, status: plan.to };
  }
  /** Spec §7 "Deletes through one function": Cloudinary first, then the records, then the contest with its subcollections, then its activity events. */
  async function deleteContest(c, contest) {
    if (!c.isOwner) throw fail("permission-denied", "Only Boomer can delete a contest. Cancel it instead.", "notOwner");
    const id = contest.id;
    // 1. Cloudinary (through the approved path, which also removes each asset record)
    const assets = await db.collection("externalAssets").where("linkedDoc.collection", "==", entriesPath(id)).get();
    for (const a of assets.docs) await deps.performAssetDeletion(a.id, creds(), { clearLinkedField: false });
    // 2. the records: codes, winners (with their private claims), the mail log, the members' lists
    const [codes, winners, mail, mys] = await Promise.all([R.codes().where("contestId", "==", id).get(), R.winners().where("contestId", "==", id).get(), R.mailLog().where("contestId", "==", id).get(), db.collection(`${base}/my`).where("contestIds", "array-contains", id).get()]);
    await B.inBatches(codes.docs, (b, d) => b.delete(d.ref));
    for (const w of winners.docs) await db.recursiveDelete(w.ref);
    await B.inBatches(mail.docs, (b, d) => b.delete(d.ref));
    await B.inBatches(mys.docs, (b, d) => b.update(d.ref, { contestIds: FieldValue.arrayRemove(id) }));
    // 3. the contest with entries and draws
    await db.recursiveDelete(R.contest(id));
    // 4. its activity events
    const activityDeleted = await B.deleteEvents(id);
    await adminLog(c, { action: "delete", id, title: contest.title, snapshot: { title: contest.title, type: contest.type, status: contest.status, slug: contest.slug }, details: { assetsDeleted: assets.size, codes: codes.size, winners: winners.size, activityDeleted } });
    await rebuildQuietly();
    return { ok: true, deleted: true, activityDeleted };
  }

  // ---------------------------------------------------------------- prizeSettings
  async function settingsSave(request) {
    const c = await caller(request);
    if (!c.isOwner) throw fail("permission-denied", "Only Boomer can change the Prize Box settings.", "notOwner");
    const v = L.validateSettings(request.data || {});
    if (!v.ok) throw raise(v);
    const prev = await settings();
    if (Object.keys(v.settings).length) await R.main().set({ settings: { ...prev, ...v.settings }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (v.mailingAddress !== undefined) await R.privateSettings().set({ mailingAddress: v.mailingAddress || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const changes = {};
    for (const k of Object.keys(v.settings)) if (prev[k] !== v.settings[k]) changes[k] = { before: prev[k], after: v.settings[k] };
    await adminLog(c, { action: "settings", id: "main", title: "Prize Box settings", changes: Object.keys(changes).length ? changes : undefined, details: v.mailingAddress !== undefined ? { mailingAddress: "changed" } : undefined });
    return { ok: true, settings: { ...prev, ...v.settings }, hasMailingAddress: v.mailingAddress !== undefined ? !!v.mailingAddress : undefined };
  }

  // ---------------------------------------------------------------- entries
  async function enterGate(request) {
    const c = requireVerifiedMember(await caller(request));
    const contest = await loadContest(request.data && request.data.contestId);
    const refusal = L.enterRefusal(contest, now());
    if (refusal) throw raise(refusal);
    const why = await whyNot(c.uid, contest);
    if (why) throw fail("failed-precondition", why.message, why.reason);
    return { c, contest };
  }
  async function entryParams(request) {
    const pre = requireVerifiedMember(await caller(request));
    await uploadGate(pre, "prizeEntry");   // Cloud Stash: paused uploads are refused first
    const { c, contest } = await enterGate(request);
    if (contest.entryKind !== "upload") throw fail("failed-precondition", "This contest takes written entries.", "notUpload");
    await bump("enter", c.uid);
    const publicId = `${uploadPrefix(contest.id, c.uid)}${now().toString(36)}`;
    return { ok: true, publicId, maxBytes: L.UPLOAD_MAX_BYTES, ...cloud().uploadParams({ creds: creds(), type: "authenticated", publicId, context: `owner=${c.uid}`, now: now() }) };
  }
  async function assetIdOf(publicId) {
    const q = await db.collection("externalAssets").where("publicId", "==", publicId).limit(1).get();
    return q.empty ? null : q.docs[0].id;
  }
  async function dropFile(publicId) {
    if (!publicId) return;
    const aid = await assetIdOf(publicId);
    if (aid) await deps.performAssetDeletion(aid, creds(), { clearLinkedField: false });
    else await deps.cloudinaryDelete({ publicId, resourceType: "image", type: "authenticated", ...creds() }).catch((e) => console.error("prizeBox: couldn't delete an unrecorded entry file", e));
  }
  async function enter(request) {
    const { c, contest } = await enterGate(request);
    const v = L.validateEntry(request.data, contest);
    if (!v.ok) throw raise(v);
    await bump("enter", c.uid);
    const cid = contest.id, eref = R.entry(cid, c.uid);
    const before = await eref.get();
    const prev = before.exists ? before.data() : null;
    if (prev && prev.kind === "mail") throw fail("failed-precondition", "You're entered by mail for this one.", "mailEntry");
    let assetId = null;
    if (v.value.kind === "upload") {
      const publicId = v.value.publicId;
      if (!publicId.startsWith(uploadPrefix(cid, c.uid))) throw fail("invalid-argument", "That isn't your upload for this contest.", "notOwner");
      const info = await cloud().resourceInfo(fetchFn, creds(), publicId, "authenticated");
      const problem = L.uploadProblem(info);
      if (problem) {
        if (info) await deps.cloudinaryDelete({ publicId, resourceType: "image", type: "authenticated", ...creds() }).catch((e) => console.error("prizeBox: couldn't remove a refused upload", e));
        throw fail("invalid-argument", "Use a JPG, PNG or WebP up to 10 MB.", "badFile", { problem });
      }
      if (info.context?.custom?.owner !== c.uid) throw fail("permission-denied", "That upload isn't yours.", "notOwner");
      if (!(prev && prev.assetId === publicId)) {
        await deps.recordAssetCreated({ url: info.secure_url, publicId, feature: "prizeBox", sizeBytes: info.bytes, deliveryType: "authenticated", linkedCollection: entriesPath(cid), linkedDocId: c.uid, linkedField: "assetId" });
      }
      assetId = publicId;
    }
    const fresh = !prev || prev.status === "withdrawn";
    const entry = {
      uid: c.uid, handle: c.handle || null, kind: v.value.kind, assetId, format: null, text: v.value.kind === "text" ? v.value.text : null, title: v.value.title,
      showIfWin: v.value.showIfWin, status: "submitted", rejectReason: null, updatedAt: FieldValue.serverTimestamp(), ...(fresh ? { createdAt: FieldValue.serverTimestamp() } : {}),
    };
    await db.runTransaction(async (tx) => {
      tx.set(eref, entry, { merge: true });
      if (fresh) tx.update(R.contest(cid), { "counts.entries": FieldValue.increment(1) });
      if (prev && prev.status === "accepted") tx.update(R.contest(cid), { "counts.accepted": FieldValue.increment(-1) });
      tx.set(R.my(c.uid), { contestIds: FieldValue.arrayUnion(cid) }, { merge: true });
    });
    if (prev && prev.assetId && prev.assetId !== assetId) await dropFile(prev.assetId);   // the replaced file
    await tell([c.uid], "prize-entry-received", { contestId: cid, title: contest.title, link: contestLink(contest), replaced: !fresh });
    if (fresh) await rebuildQuietly();
    return { ok: true, replaced: !fresh };
  }
  async function withdraw(request) {
    const c = requireVerifiedMember(await caller(request));
    const contest = await loadContest(request.data && request.data.contestId);
    const refusal = L.enterRefusal(contest, now());
    if (refusal) throw raise(refusal);
    const eref = R.entry(contest.id, c.uid);
    const snap = await eref.get();
    if (!snap.exists || snap.get("status") === "withdrawn") throw fail("not-found", "You haven't entered this one.", "noEntry");
    const e = snap.data();
    if (e.kind === "mail" && e.status === "received") throw fail("failed-precondition", "Your envelope is already here, so it can't be withdrawn.", "received");
    await db.runTransaction(async (tx) => {
      tx.update(eref, { status: "withdrawn", assetId: null, text: null, updatedAt: FieldValue.serverTimestamp() });
      tx.update(R.contest(contest.id), { "counts.entries": FieldValue.increment(-1), ...(e.status === "accepted" ? { "counts.accepted": FieldValue.increment(-1) } : {}) });
    });
    if (e.assetId) await dropFile(e.assetId);
    if (e.code) await R.code(e.code).delete().catch(() => {});
    await rebuildQuietly();
    return { ok: true };
  }
  async function getCode(request) {
    const c = requireVerifiedMember(await caller(request));
    const contest = await loadContest(request.data && request.data.contestId);
    const refusal = L.enterRefusal(contest, now());
    if (refusal) throw raise(refusal);
    if (contest.type !== "mail") throw fail("failed-precondition", "This contest isn't mail-in.", "notMail");
    if (request.data.rulesOk !== true) throw raise(L.no("rules", "Tick that you've read the official rules.", undefined, "rulesOk"));
    const why = await whyNot(c.uid, contest);
    if (why) throw fail("failed-precondition", why.message, why.reason);
    const eref = R.entry(contest.id, c.uid);
    const prev = (await eref.get()).data();
    const address = (await R.privateSettings().get()).get("mailingAddress") || null;
    if (prev && prev.code && prev.status !== "withdrawn") return { ok: true, code: prev.code, mailingAddress: address, already: true };
    await bump("code", c.uid);
    let code = null;
    for (let i = 0; i < 12 && !code; i++) {
      const tryCode = L.makeCode();
      try {
        await db.runTransaction(async (tx) => {
          const hit = await tx.get(R.code(tryCode));
          if (hit.exists) throw new Error("taken");
          tx.set(R.code(tryCode), { contestId: contest.id, uid: c.uid, createdAt: FieldValue.serverTimestamp() });
          tx.set(eref, { uid: c.uid, handle: c.handle || null, kind: "mail", code: tryCode, status: "submitted", showIfWin: request.data.showIfWin !== false, receivedAt: null, postmarkedOn: null, rejectReason: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          tx.update(R.contest(contest.id), { "counts.entries": FieldValue.increment(1) });
          tx.set(R.my(c.uid), { contestIds: FieldValue.arrayUnion(contest.id) }, { merge: true });
        });
        code = tryCode;
      } catch (err) { if (String(err && err.message) !== "taken") throw err; }
    }
    if (!code) throw fail("unavailable", "Couldn't make a code just now. Try again.", "code");
    await rebuildQuietly();
    return { ok: true, code, mailingAddress: address };
  }
  async function entryUrl(request) {
    const c = requireVerifiedMember(await caller(request));
    const { contestId, uid } = request.data || {};
    const who = uid && uid !== c.uid ? uid : c.uid;
    if (who !== c.uid && !c.isAdmin) throw fail("permission-denied", "Only the entrant and the team can see an entry.", "notYours");
    if (!idStr(who)) throw fail("invalid-argument", "Say whose entry.", "args");
    const contest = await loadContest(contestId);
    if (!contest) throw fail("not-found", "This contest is no longer here.", "noContest");
    const e = (await R.entry(contest.id, who).get()).data();
    if (!e || !e.assetId) throw fail("not-found", "There's no file on this entry.", "noFile");
    const aid = await assetIdOf(e.assetId);
    const asset = aid ? (await db.doc(`externalAssets/${aid}`).get()).data() : null;
    const format = (asset && /\.(\w+)(\?|$)/.exec(asset.url || "")?.[1]) || "png";
    return { ok: true, url: cloud().previewUrl(creds(), e.assetId, format.toLowerCase(), now()), expiresInS: cloud().PREVIEW_TTL_S };
  }

  // ---------------------------------------------------------------- prizeMailLog and prizeEntryReview (admins)
  async function mailLog(request) {
    const c = requireAdmin(await caller(request));
    const d = request.data || {};
    if (d.action === "lookup") {
      const code = L.normCode(d.code);
      if (!code) throw fail("invalid-argument", "Codes look like PB-7K4M.", "code");
      const hit = await R.code(code).get();
      if (!hit.exists) return { ok: true, found: false, code };
      const { contestId, uid } = hit.data();
      const [contest, entry] = await Promise.all([loadContest(contestId), R.entry(contestId, uid).get()]);
      const e = entry.exists ? entry.data() : {};
      return { ok: true, found: true, code, contestId, contestTitle: contest ? contest.title : null, closesAt: contest ? L.ms(contest.closesAt) : null, handle: e.handle || null, status: e.status || null, receivedAt: L.ms(e.receivedAt), postmarkedOn: e.postmarkedOn || null };
    }
    if (d.action === "receive") {
      const code = L.normCode(d.code), postmarkedOn = L.validDate(d.postmarkedOn);
      if (!code) throw fail("invalid-argument", "Codes look like PB-7K4M.", "code");
      if (!postmarkedOn) throw fail("invalid-argument", "Add the postmark date.", "postmark");
      const hit = await R.code(code).get();
      if (!hit.exists) throw fail("not-found", "No entry has that code. Log it as unmatched.", "noCode");
      const { contestId, uid } = hit.data();
      const contest = await loadContest(contestId);
      if (!contest) throw fail("not-found", "That contest is gone.", "noContest");
      const late = L.postmarkLate(postmarkedOn, contest.closesAt);
      const eref = R.entry(contestId, uid);
      const out = await db.runTransaction(async (tx) => {
        const s = await tx.get(eref);
        if (!s.exists || s.get("status") === "withdrawn") throw fail("not-found", "That entry was withdrawn.", "withdrawn");
        if (s.get("status") === "received") return { already: true };
        tx.update(eref, { status: late ? "rejected" : "received", receivedAt: FieldValue.serverTimestamp(), postmarkedOn, rejectReason: late ? "Postmarked after the deadline." : null, updatedAt: FieldValue.serverTimestamp() });
        if (!late) tx.update(R.contest(contestId), { "counts.received": FieldValue.increment(1) });
        tx.set(R.mailLog().doc(), { kind: late ? "late" : "received", contestId, code, postmarkedOn, by: { uid: c.uid, handle: c.handle || null }, at: FieldValue.serverTimestamp() });
        return { already: false };
      });
      if (!out.already) {
        await adminLog(c, { action: late ? "mail-late" : "mail-received", id: contestId, title: contest.title, details: { code, postmarkedOn } });
        await tell([uid], "prize-entry-received", { contestId, title: contest.title, link: contestLink(contest), mail: true, late });
      }
      return { ok: true, late, already: out.already };
    }
    if (d.action === "unmatched") {
      const postmarkedOn = d.postmarkedOn ? L.validDate(d.postmarkedOn) : null;
      const note = L.str(d.note, L.NOTE_MAX);
      if (!note) throw fail("invalid-argument", "Say what was in the envelope (no names or addresses).", "note");
      const contestId = d.contestId && idStr(d.contestId) ? d.contestId : null;
      const ref = R.mailLog().doc();
      await ref.set({ kind: "unmatched", contestId, code: L.normCode(d.code) || null, note, postmarkedOn, resolved: false, by: { uid: c.uid, handle: c.handle || null }, at: FieldValue.serverTimestamp() });
      await adminLog(c, { action: "mail-unmatched", id: contestId || "none", title: "Unmatched envelope", details: { logId: ref.id } });
      return { ok: true, id: ref.id };
    }
    if (d.action === "resolve") {
      if (!idStr(d.id)) throw fail("invalid-argument", "Say which envelope.", "args");
      await R.mailLog().doc(d.id).update({ resolved: true, resolvedAt: FieldValue.serverTimestamp() });
      return { ok: true };
    }
    throw fail("invalid-argument", "That isn't a mail log action.", "action");
  }
  async function entryReview(request) {
    const c = requireAdmin(await caller(request));
    const { contestId, uid, decision } = request.data || {};
    if (!idStr(uid) || !["accept", "reject"].includes(decision)) throw fail("invalid-argument", "Say whose entry and accept or reject.", "args");
    const reason = L.str(request.data.reason, L.REASON_MAX);
    if (decision === "reject" && reason.length < 3) throw fail("invalid-argument", "Give the entrant a reason.", "reason");
    const contest = await loadContest(contestId);
    if (!contest) throw fail("not-found", "This contest is no longer here.", "noContest");
    if (["won", "done", "cancelled"].includes(contest.status)) throw fail("failed-precondition", "This contest is finished.", "finished");
    const eref = R.entry(contestId, uid);
    const before = await db.runTransaction(async (tx) => {
      const s = await tx.get(eref);
      if (!s.exists || s.get("status") === "withdrawn") throw fail("not-found", "That entry is gone.", "noEntry");
      const e = s.data();
      const to = decision === "accept" ? (e.kind === "mail" ? "received" : "accepted") : "rejected";
      if (e.kind === "mail" && decision === "accept" && e.status !== "rejected" && !e.receivedAt) throw fail("failed-precondition", "Mark the envelope received first.", "notReceived");
      tx.update(eref, { status: to, rejectReason: decision === "reject" ? reason : null, reviewedBy: { uid: c.uid, handle: c.handle || null }, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      const was = e.status;
      const inc = {};
      if (was === "accepted" && to !== "accepted") inc["counts.accepted"] = FieldValue.increment(-1);
      if (to === "accepted" && was !== "accepted") inc["counts.accepted"] = FieldValue.increment(1);
      if (was === "received" && to !== "received") inc["counts.received"] = FieldValue.increment(-1);
      if (to === "received" && was !== "received") inc["counts.received"] = FieldValue.increment(1);
      if (Object.keys(inc).length) tx.update(R.contest(contestId), inc);
      return { from: was, to };
    });
    await adminLog(c, { action: decision === "accept" ? "entry-accept" : "entry-reject", id: contestId, title: contest.title, reason: decision === "reject" ? reason : "", changes: { status: { before: before.from, after: before.to } }, details: { entrant: uid } });
    await tell([uid], "prize-entry-received", { contestId, title: contest.title, link: contestLink(contest), status: before.to });
    return { ok: true, status: before.to };
  }

  // ---------------------------------------------------------------- winners
  /**
   * One winner (prizeJudge, a redraw, and the live draw in draw.js). Creates winners/{winnerId} once, counts profiles/{uid}.prizeWins, sets the live
   * cooldown, then grants the badge (and any prize XP), posts the activity (only with showIfWin) and tells the winner. Never twice for one winnerId.
   */
  async function awardWinner({ contest, uid, handle, place, winnerId, showIfWin = true, drawId = null, by = null }) {
    const st = await settings();
    const prize = (contest.prizes || []).find((p) => p.place === place) || (contest.prizes || [])[0] || { title: "A prize", kind: "badgeXp", xp: 0 };
    const at = now();
    const fresh = await db.runTransaction(async (tx) => {
      const w = await tx.get(R.winner(winnerId));
      if (w.exists) return false;
      tx.set(R.winner(winnerId), {
        contestId: contest.id, contestTitle: contest.title, contestSlug: contest.slug, uid, handle: handle || null, place, prizeTitle: prize.title, kind: prize.kind,
        status: prize.kind === "badgeXp" ? "claimed" : "pending", claimBy: Timestamp.fromMillis(at + st.claimDays * L.DAY_MS), claimedAt: prize.kind === "badgeXp" ? Timestamp.fromMillis(at) : null,
        shippedAt: null, showIfWin: showIfWin !== false, drawId, by, at: Timestamp.fromMillis(at),
      });
      tx.set(R.profile(uid), { prizeWins: FieldValue.increment(1) }, { merge: true });
      if (contest.type === "live") tx.set(R.cooldown(uid), { until: Timestamp.fromMillis(at + st.cooldownDays * L.DAY_MS), contestId: contest.id }, { merge: true });
      return true;
    });
    if (!fresh) return { ok: true, already: true };
    let badge = false;
    try { const r = await grant().grantBadge(uid, BADGE_ID, { feature: "prizeBox", ref: winnerId, grantedBy: by && by.uid ? by.uid : null }); badge = !!(r && r.granted); }
    catch (err) { console.error("prizeBox: badge grant failed", String((err && err.message) || err).slice(0, 160)); }
    if (prize.xp > 0) {
      try { await grant().grantXp(uid, prize.xp, { feature: "prizeBox", ref: winnerId, reason: `Prize: ${prize.title}`.slice(0, 120) }); }
      catch (err) { console.error("prizeBox: XP grant failed", String((err && err.message) || err).slice(0, 160)); }
    }
    if (showIfWin !== false && handle) {
      try {
        await db.collection("activityLog").add({ feature: "prize-box", type: "contest-winner", summary: `@${handle} won ${contest.title}`.slice(0, 200), link: contestLink(contest), actorName: `@${handle}`, contestId: contest.id, createdAt: FieldValue.serverTimestamp() });
      } catch (err) { console.error("prizeBox: activityLog write failed", String((err && err.message) || err).slice(0, 160)); }
    }
    await tell([uid], "prize-winner", { contestId: contest.id, winnerId, title: contest.title, prizeTitle: prize.title, link: "/prizes/mine", claimDays: st.claimDays });
    return { ok: true, already: false, badge };
  }

  /** The members who may win from the entries of an online or mail contest: accepted (online) or received (mail), and still eligible. */
  async function poolOfEntries(contest, exclude = new Set()) {
    const want = contest.type === "mail" ? "received" : "accepted";
    const es = (await R.entries(contest.id).where("status", "==", want).get()).docs.map((d) => ({ uid: d.id, ...d.data() })).filter((e) => !exclude.has(e.uid));
    const owner = await ownerUid();
    const out = [];
    for (const e of es) if (!(await whyNot(e.uid, contest, { ownerUid: owner }))) out.push(e);
    return out;
  }

  // ---------------------------------------------------------------- prizeJudge (owner)
  async function judge(request) {
    const c = await caller(request);
    if (!c.isOwner) throw fail("permission-denied", "Only Boomer picks the winners.", "notOwner");
    const contest = await loadContest(request.data && request.data.contestId);
    if (!contest) throw fail("not-found", "This contest is no longer here.", "noContest");
    if (contest.type === "live") throw fail("failed-precondition", "Live contests are won on the wheel.", "live");
    const random = request.data.random === true;
    if (random ? contest.method !== "random" : contest.method !== "judge") throw fail("failed-precondition", random ? "This contest is judged." : "This contest is a random draw.", "method");
    if (!(random ? ["closed", "drawing"] : ["judging", "closed"]).includes(contest.status)) throw fail("failed-precondition", "Close entries first.", "status");
    const pool = await poolOfEntries(contest);
    let placed;
    if (random) {
      const order = L.shuffle(pool);
      if (!order.length) throw fail("failed-precondition", "There are no eligible entries to draw from.", "noEntries");
      placed = contest.prizes.slice(0, Math.min(contest.winnersCount, order.length)).map((p, i) => ({ place: p.place, entry: order[i] }));
    } else {
      const places = Array.isArray(request.data.places) ? request.data.places : [];
      const byUid = new Map(pool.map((e) => [e.uid, e]));
      placed = [];
      for (const p of places) {
        const e = byUid.get(p && p.uid);
        if (!e) throw fail("invalid-argument", "Every winner must be an accepted, eligible entry.", "places");
        if (!contest.prizes.some((x) => x.place === p.place)) throw fail("invalid-argument", "That place has no prize.", "places");
        placed.push({ place: p.place, entry: e });
      }
      if (!placed.length) throw fail("invalid-argument", "Pick at least one winner.", "places");
      if (new Set(placed.map((p) => p.place)).size !== placed.length || new Set(placed.map((p) => p.entry.uid)).size !== placed.length) throw fail("invalid-argument", "One winner per place, and one place per entry.", "places");
    }
    await R.contest(contest.id).update({ status: "won", wonAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    for (const p of placed) await awardWinner({ contest, uid: p.entry.uid, handle: p.entry.handle, place: p.place, winnerId: `${contest.id}_${p.place}`, showIfWin: p.entry.showIfWin, by: { uid: c.uid, handle: c.handle } });
    await adminLog(c, { action: random ? "draw" : "judge", id: contest.id, title: contest.title, details: { winners: placed.map((p) => ({ place: p.place, uid: p.entry.uid })) } });
    const all = (await R.entries(contest.id).get()).docs.filter((d) => d.get("status") !== "withdrawn").map((d) => d.id);
    await tell(all, "prize-results", { contestId: contest.id, title: contest.title, link: contestLink(contest) });
    await rebuildQuietly();
    return { ok: true, winners: placed.map((p) => ({ place: p.place, handle: p.entry.handle })) };
  }

  // ---------------------------------------------------------------- prizeClaim (the winner)
  async function claim(request) {
    const c = requireVerifiedMember(await caller(request));
    const { winnerId } = request.data || {};
    if (!idStr(winnerId)) throw fail("invalid-argument", "Say which prize.", "args");
    await bump("claim", c.uid);
    const snap = await R.winner(winnerId).get();
    const w = snap.exists ? snap.data() : null;
    const refusal = L.claimRefusal(w, c.uid, now());
    if (refusal) throw raise(refusal);
    // the age check is the server's: under 18 needs a parent's or guardian's OK (spec §2 "Legal")
    const ageBand = (await R.user(c.uid).get()).get("ageBand") || null;
    const minor = ageBand !== "18+";
    if (minor && request.data.parentOk !== true) throw fail("failed-precondition", "A parent or guardian needs to say it's OK first.", "parentOk");
    let address = null;
    if (w.kind === "mailed") { const v = L.validateAddress(request.data.address); if (!v.ok) throw raise(v); address = v.value; }
    await db.runTransaction(async (tx) => {
      const s = await tx.get(R.winner(winnerId));
      const r = L.claimRefusal(s.data(), c.uid, now());
      if (r) throw raise(r);
      tx.update(R.winner(winnerId), { status: "claimed", claimedAt: FieldValue.serverTimestamp() });
      tx.set(R.claim(winnerId), { ...(address ? { address } : {}), parentOk: minor ? true : null, ageBand, claimedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    const code = (await R.claim(winnerId).get()).get("code") || null;
    await outbox({ type: "prize-claim-reminder", audience: "admins", payload: { kind: "prize-box", event: "claimed", winnerId, title: w.contestTitle, prizeKind: w.kind, link: "/admin/prize-box?tab=claims" } });
    return { ok: true, status: "claimed", code };
  }

  // ---------------------------------------------------------------- prizeClaimAdmin (owner)
  async function claimAdmin(request) {
    const c = await caller(request);
    if (!c.isOwner) throw fail("permission-denied", "Claims are Boomer's alone.", "notOwner");
    const { winnerId, action } = request.data || {};
    if (!idStr(winnerId)) throw fail("invalid-argument", "Say which prize.", "args");
    const snap = await R.winner(winnerId).get();
    if (!snap.exists) throw fail("not-found", "That prize is gone.", "noWinner");
    const w = snap.data();
    const logIt = (act, details) => adminLog(c, { action: act, id: w.contestId, title: w.contestTitle, details: { winnerId, ...(details || {}) } });
    if (action === "showAddress") {
      const p = (await R.claim(winnerId).get()).data() || {};
      await logIt("show-address");   // every look is logged (spec §5 Claims)
      return { ok: true, address: p.address || null, parentOk: p.parentOk ?? null };
    }
    if (action === "setCode") {
      const code = L.str(request.data.code, 200);
      if (!code) throw fail("invalid-argument", "Paste the code.", "code");
      if (!["digital", "storeCode"].includes(w.kind)) throw fail("failed-precondition", "This prize has no code.", "kind");
      await R.claim(winnerId).set({ code, codeSetAt: FieldValue.serverTimestamp() }, { merge: true });
      await logIt("set-code");
      return { ok: true };
    }
    if (action === "markShipped") {
      if (w.status !== "claimed") throw fail("failed-precondition", "Only a claimed prize can be marked shipped.", "status");
      const tracking = L.str(request.data.tracking, 120) || null;
      await R.winner(winnerId).update({ status: "shipped", shippedAt: FieldValue.serverTimestamp() });
      if (tracking) await R.claim(winnerId).set({ tracking }, { merge: true });
      await logIt("mark-shipped");
      await tell([w.uid], "prize-shipped", { winnerId, title: w.contestTitle, prizeTitle: w.prizeTitle, prizeKind: w.kind, link: "/prizes/mine" });
      return { ok: true, status: "shipped" };
    }
    if (action === "forfeit" || action === "redraw") {
      if (["shipped"].includes(w.status)) throw fail("failed-precondition", "That prize was already sent.", "status");
      if (w.status !== "forfeited") await R.winner(winnerId).update({ status: "forfeited", forfeitedAt: FieldValue.serverTimestamp() });
      await logIt("forfeit", { reason: L.str(request.data.reason, L.REASON_MAX) || null });
      await rebuildQuietly();
      if (action === "forfeit") return { ok: true, status: "forfeited" };
      return redraw(c, w, winnerId);
    }
    throw fail("invalid-argument", "That isn't a claim action.", "action");
  }
  /** Forfeit and redraw: a random contest draws again among the rest; a judged one goes back to Boomer; a live one is rerun from the draw. */
  async function redraw(c, w, winnerId) {
    const contest = await loadContest(w.contestId);
    if (!contest) throw fail("not-found", "That contest is gone.", "noContest");
    if (contest.type === "live") return { ok: true, status: "forfeited", redraw: "live" };
    if (contest.method === "judge") return { ok: true, status: "forfeited", redraw: "judge" };
    const past = new Set((await R.winners().where("contestId", "==", contest.id).get()).docs.map((d) => d.get("uid")));
    const pool = L.shuffle(await poolOfEntries(contest, past));
    if (!pool.length) return { ok: true, status: "forfeited", redraw: "none" };
    const n = (await R.winners().where("contestId", "==", contest.id).where("place", "==", w.place).get()).size;
    const id = `${contest.id}_${w.place}_r${n}`;
    await awardWinner({ contest, uid: pool[0].uid, handle: pool[0].handle, place: w.place, winnerId: id, showIfWin: pool[0].showIfWin, by: { uid: c.uid, handle: c.handle } });
    await adminLog(c, { action: "redraw", id: contest.id, title: contest.title, details: { from: winnerId, to: id } });
    await rebuildQuietly();
    return { ok: true, status: "forfeited", redraw: "drawn", winnerId: id, handle: pool[0].handle };
  }

  // ---------------------------------------------------------------- prizeMine (members)
  async function mine(request) {
    const c = await caller(request);
    if (!c.member) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    const { contestId } = request.data || {};
    if (contestId) {
      const contest = await loadContest(contestId);
      if (!contest || (contest.status === "draft" && !c.isAdmin)) throw fail("not-found", "This contest isn't here.", "noContest");
      const [e, why, ws] = await Promise.all([R.entry(contest.id, c.uid).get(), whyNot(c.uid, contest), R.winners().where("uid", "==", c.uid).where("contestId", "==", contest.id).get()]);
      const entry = e.exists ? e.data() : null;
      const address = entry && entry.kind === "mail" && entry.status !== "withdrawn" ? (await R.privateSettings().get()).get("mailingAddress") || null : null;
      return { ok: true, eligible: !why, reason: why ? why.reason : null, message: why ? why.message : null, entry: entry && entryOut(entry), mailingAddress: address, wins: ws.docs.map((d) => winOut(d.id, d.data())) };
    }
    const [my, ws] = await Promise.all([R.my(c.uid).get(), R.winners().where("uid", "==", c.uid).get()]);
    const ids = ((my.exists && my.get("contestIds")) || []).slice(-60);
    const entries = [];
    for (const id of ids) {
      const [contest, e] = await Promise.all([loadContest(id), R.entry(id, c.uid).get()]);
      if (!contest || !e.exists) continue;
      entries.push({ contestId: id, slug: contest.slug, contestTitle: contest.title, type: contest.type, contestStatus: contest.status, closesAt: L.ms(contest.closesAt), ...entryOut(e.data()) });
    }
    const wins = [];
    for (const d of ws.docs) {
      const w = winOut(d.id, d.data());
      if (w.status === "claimed" || w.status === "shipped") { const p = (await R.claim(d.id).get()).data() || {}; if (p.code) w.code = p.code; }   // codes only after claiming
      wins.push(w);
    }
    wins.sort((a, b) => (b.at || 0) - (a.at || 0));
    entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { ok: true, toClaim: wins.filter((w) => w.status === "pending" && w.claimBy > now()), entries, wins };
  }
  const entryOut = (e) => ({ kind: e.kind, status: e.status, title: e.title || null, text: e.kind === "text" ? e.text : null, hasFile: !!e.assetId, code: e.code || null, receivedAt: L.ms(e.receivedAt), postmarkedOn: e.postmarkedOn || null, rejectReason: e.status === "rejected" ? e.rejectReason || null : null, showIfWin: e.showIfWin !== false, createdAt: L.ms(e.createdAt), updatedAt: L.ms(e.updatedAt) });
  const winOut = (id, w) => ({ winnerId: id, contestId: w.contestId, contestTitle: w.contestTitle, contestSlug: w.contestSlug, place: w.place, prizeTitle: w.prizeTitle, kind: w.kind, status: w.status, claimBy: L.ms(w.claimBy), at: L.ms(w.at), claimedAt: L.ms(w.claimedAt), shippedAt: L.ms(w.shippedAt) });

  // ---------------------------------------------------------------- prizeTick (every 5 minutes)
  async function tick() {
    const at = now();
    let changed = false;
    const out = { opened: 0, closed: 0, reminders: 0, claimReminders: 0, expired: 0 };
    // open on time
    for (const d of (await R.contests().where("status", "==", "scheduled").get()).docs) {
      const c = { id: d.id, ...d.data() };
      if (c.type === "live" || (L.ms(c.opensAt) || 0) > at) continue;
      await d.ref.update({ status: "open", openedAt: FieldValue.serverTimestamp(), statusChangedAt: FieldValue.serverTimestamp() });
      await announceOpen(c);
      out.opened++; changed = true;
    }
    // reminders and close on time
    for (const d of (await R.contests().where("status", "==", "open").get()).docs) {
      const c = { id: d.id, ...d.data() };
      if (c.type === "live") continue;
      const closes = L.ms(c.closesAt) || 0;
      if (closes <= at) {
        await d.ref.update({ status: c.method === "judge" ? "judging" : "closed", closedAt: FieldValue.serverTimestamp(), statusChangedAt: FieldValue.serverTimestamp() });
        await outboxOnce(`prize-closed:${c.id}`, { type: "prize-results", audience: "admins", payload: { kind: "prize-box", event: "closed", contestId: c.id, title: c.title, link: "/admin/prize-box" } });
        out.closed++; changed = true;
        continue;
      }
      for (const [tag, lead] of [["24h", L.DAY_MS], ["1h", 60 * 60 * 1000]]) {
        if (closes - at > lead) continue;
        if (tag === "24h" && closes - at <= 60 * 60 * 1000) continue;   // the 1 h one covers it
        if (await outboxOnce(`prize-reminder:${c.id}:${tag}`, { type: "prize-reminder", audience: "members", payload: { kind: "prize-box", contestId: c.id, title: c.title, link: contestLink(c), closesIn: tag } })) out.reminders++;
      }
    }
    // claims: a reminder a day before the window closes, then forfeited (Boomer gets the redraw prompt)
    for (const d of (await R.winners().where("status", "==", "pending").get()).docs) {
      const w = d.data(), by = L.ms(w.claimBy) || 0;
      if (by <= at) {
        await d.ref.update({ status: "forfeited", forfeitedAt: FieldValue.serverTimestamp(), forfeitReason: "claim window ended" });
        await outboxOnce(`prize-claim-expired:${d.id}`, { type: "prize-claim-reminder", audience: "admins", payload: { kind: "prize-box", event: "expired", winnerId: d.id, title: w.contestTitle, link: "/admin/prize-box?tab=claims" } });
        out.expired++; changed = true;
      } else if (by - at <= L.DAY_MS) {
        if (await outboxOnce(`prize-claim-reminder:${d.id}`, { type: "prize-claim-reminder", audience: "uids", uids: [w.uid], payload: { kind: "prize-box", event: "reminder", winnerId: d.id, title: w.contestTitle, prizeTitle: w.prizeTitle, link: "/prizes/mine" } })) out.claimReminders++;
      }
    }
    if (deps.drawTick) { try { const r = await deps.drawTick(); if (r && r.changed) changed = true; out.draws = r; } catch (err) { console.error("prizeTick: draw backstop failed", String((err && err.message) || err).slice(0, 160)); } }
    if (changed) await rebuildSummary();
    return out;
  }

  const secrets = deps.cloudSecrets;
  const functions = {
    prizeContestSave: onCall(contestSave), prizeContestStatus: onCall({ secrets }, contestStatus), prizeSettings: onCall(settingsSave),
    prizeEntryParams: onCall({ secrets }, entryParams), prizeEnter: onCall({ secrets }, enter), prizeWithdraw: onCall({ secrets }, withdraw), prizeGetCode: onCall(getCode),
    prizeEntryUrl: onCall({ secrets }, entryUrl), prizeMailLog: onCall(mailLog), prizeEntryReview: onCall(entryReview), prizeJudge: onCall(judge),
    prizeClaim: onCall(claim), prizeClaimAdmin: onCall(claimAdmin), prizeMine: onCall(mine),
    prizeTick: onSchedule({ schedule: "every 5 minutes", timeoutSeconds: 120 }, async () => { const r = await tick(); console.log("prizeTick", JSON.stringify(r)); }),
  };
  return {
    functions,
    ops: { contestSave, contestStatus, settingsSave, entryParams, enter, withdraw, getCode, entryUrl, mailLog, entryReview, judge, claim, claimAdmin, mine, tick, rebuildSummary },
    hooks: { db, R, base, settings, loadContest, whyNot, standingOf, ownerUid, nightShiftRank, awardWinner, rebuildSummary, rebuildQuietly, outbox, outboxOnce, tell, adminLog, caller, bump },
  };
}

module.exports = { build };
