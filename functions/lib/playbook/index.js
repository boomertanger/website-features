// The Playbook (docs/specs/playbook.md §4): the owner's private living plan. Every document under sites/boomertanger/playbook/main is written ONLY here (and by
// scripts/seed-playbook.js); firestore.rules let the owner read and nobody write. Owner = sites/boomertanger.ownerUid (as Hotline Boom checks it).
//
//   playbookAdmin       owner only, { action, ... }:
//     savePage          { pageId, version, title, lede, body } -> { version }. Pinned: a page that moved past `version` is refused ("stale"). The old
//                       title / lede / body go to pages/{id}/versions/{old version} (source "edit"); editedOnSite becomes true.
//     flagAction        { op: confirm | answer | edit | add | remove, id?, pageId?, text?, answer?, status? }. Confirm adds a decision; Answer saves the
//                       answer, confirms the flag and adds a decision (spec §4).
//     markReviewed      { pageId } -> lastReviewedAt; when every reviewable page is reviewed the first time, main.firstReadDone (spec §6). Also clears
//                       the page from state.duePages.
//     applyUpdate       { update, expect: { pageId: version }, force? } -> the `playbook-update` block (spec §5) in one transaction: every changed page
//                       versioned (source "update"), flag changes, new decisions. A page that moved past `expect` is refused ("stale", with the ids)
//                       unless force.
//     restoreVersion    { pageId, n, version } -> page n's content back; the current content becomes a version first (source "restore").
//     adminLog feature "playbook", ids only, never page text.
//   playbookReviewTick  the 1st, 06:00 America/Los_Angeles: once main.firstReadDone, every reviewable page whose lastReviewedAt is before this month is
//                       due; writes state { dueCount, duePages, dueSince }, and notifyOutbox playbook-review (audience "uids", uids [owner], no text).
//
// Doesn't load rewards/grant.js (or anything that does). build(deps) is what scripts/check-playbook.js runs against the in-memory Firestore.
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const L = require("./logic");

const SITE_ID = "boomertanger";
const SITE = `sites/${SITE_ID}`;
const BASE = `${SITE}/playbook/main`;
const fail = (code, message, reason, extra = {}) => new HttpsError(code, message, { reason, ...extra });
const rid = () => crypto.randomBytes(4).toString("hex");

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const now = deps.now || Date.now;
  const TS = (ms) => Timestamp.fromMillis(ms);
  const mainRef = () => db.doc(BASE);
  const stateRef = () => db.doc(`${BASE}/state/current`);
  const pageRef = (id) => db.doc(`${BASE}/pages/${id}`);
  const versionRef = (id, n) => db.doc(`${BASE}/pages/${id}/versions/${n}`);
  const flagRef = (id) => db.doc(`${BASE}/flags/${id}`);
  const decisionRef = (id) => db.doc(`${BASE}/decisions/${id}`);
  const ownerUid = async () => ((await db.doc(SITE).get()).get("ownerUid")) || null;

  async function requireOwner(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw fail("unauthenticated", "Sign in first.", "signedOut");
    if (uid !== (await ownerUid())) throw fail("permission-denied", "The Playbook is the owner's.", "notOwner");
    return uid;
  }
  async function log(uid, action, itemPath, details) {
    if (!deps.adminLogEntry) return;
    try { await db.collection("adminLog").add(await deps.adminLogEntry(db, { feature: "playbook", action, itemPath, itemTitle: itemPath.split("/").slice(-2).join("/"), actorUid: uid, actorName: "Owner", details })); }
    catch (err) { console.error("playbook: adminLog write failed", String((err && err.message) || err).slice(0, 160)); }
  }
  const nextOrder = async (col) => { const s = await db.collection(`${BASE}/${col}`).orderBy("order", "desc").limit(1).get(); return s.empty ? 1 : (Number(s.docs[0].get("order")) || 0) + 1; };
  const decisionDoc = (text, extra, order, at) => ({ date: L.dateKey(at), text, order, createdAt: TS(at), ...extra });
  const pageIds = async () => new Set((await db.collection(`${BASE}/pages`).get()).docs.map((d) => d.id));
  const flagIds = async () => new Set((await db.collection(`${BASE}/flags`).get()).docs.map((d) => d.id));

  /** After a review: the page leaves state.duePages; the first read-through finishes when every reviewable page has been reviewed. */
  async function afterReviewed(ids, at) {
    const st = await stateRef().get();
    if (st.exists) {
      const due = (st.get("duePages") || []).filter((p) => !ids.includes(p));
      await stateRef().set({ duePages: due, dueCount: due.length, updatedAt: TS(at) }, { merge: true });
    }
    const main = await mainRef().get();
    if (main.exists && main.get("firstReadDone")) return false;
    const pages = (await db.collection(`${BASE}/pages`).get()).docs.filter((d) => L.reviewable(d.id));
    if (pages.length && pages.every((d) => d.get("lastReviewedAt"))) { await mainRef().set({ firstReadDone: true, firstReadDoneAt: TS(at) }, { merge: true }); return true; }
    return false;
  }

  async function savePage(uid, d) {
    if (typeof d.pageId !== "string" || !L.PAGE_ID.test(d.pageId)) throw fail("invalid-argument", "Which page?", "bad-input", { field: "pageId" });
    const v = L.validatePage(d);
    if (!v.ok) throw fail("invalid-argument", v.message, v.reason, { field: v.field });
    const at = now();
    const out = await db.runTransaction(async (tx) => {
      const p = await tx.get(pageRef(d.pageId));
      if (!p.exists) throw fail("not-found", "That page doesn't exist.", "not-found");
      const cur = Number(p.get("version")) || 1;
      if (Number(d.version) !== cur) throw fail("failed-precondition", "This page changed since you opened it.", "stale", { version: cur });
      tx.set(versionRef(d.pageId, cur), { title: p.get("title") || "", lede: p.get("lede") || "", body: p.get("body") || "", savedAt: TS(at), source: "edit" });
      tx.update(pageRef(d.pageId), { ...v.value, version: cur + 1, updatedAt: TS(at), editedOnSite: true });
      return { version: cur + 1 };
    });
    await log(uid, "savePage", `${BASE}/pages/${d.pageId}`, { version: out.version });
    return out;
  }

  async function flagAction(uid, d) {
    const at = now();
    if (d.op === "add") {
      if (typeof d.pageId !== "string" || !(await pageIds()).has(d.pageId)) throw fail("invalid-argument", "That page doesn't exist.", "unknown-page");
      const status = d.status || "open";
      if (!["open", "assumed"].includes(status)) throw fail("invalid-argument", "A new flag is open or assumed.", "bad-input", { field: "status" });
      const t = L.validateFlagText(d.text); if (!t.ok) throw fail("invalid-argument", t.message, t.reason, { field: t.field });
      const id = `f-${d.pageId}-${rid()}`;
      await flagRef(id).set({ pageId: d.pageId, status, text: t.value, order: await nextOrder("flags"), createdAt: TS(at) });
      await log(uid, "flagAdd", `${BASE}/flags/${id}`, { pageId: d.pageId });
      return { id };
    }
    if (!L.OPS.includes(d.op) || typeof d.id !== "string" || !L.FLAG_ID.test(d.id)) throw fail("invalid-argument", "Which flag, and what to do?", "bad-input");
    const ref = flagRef(d.id), snap = await ref.get();
    if (!snap.exists) throw fail("not-found", "That flag doesn't exist.", "not-found");
    const f = snap.data();
    if (d.op === "remove") { await ref.delete(); await log(uid, "flagRemove", `${BASE}/flags/${d.id}`, { pageId: f.pageId }); return { ok: true }; }
    if (d.op === "edit") {
      const t = L.validateFlagText(d.text); if (!t.ok) throw fail("invalid-argument", t.message, t.reason, { field: t.field });
      if (d.status !== undefined && !L.STATUSES.includes(d.status)) throw fail("invalid-argument", "Unknown status.", "bad-input", { field: "status" });
      await ref.update({ text: t.value, ...(d.status ? { status: d.status } : {}) });
      await log(uid, "flagEdit", `${BASE}/flags/${d.id}`, { pageId: f.pageId });
      return { ok: true };
    }
    // confirm / answer: the flag is settled and a decision is recorded
    let answer = null;
    if (d.op === "answer") { const t = L.validateFlagText(d.answer, "answer", L.LIMITS.answer); if (!t.ok) throw fail("invalid-argument", t.message, t.reason, { field: t.field }); answer = t.value; }
    const did = `d-${L.dateKey(at)}-${rid()}`, order = await nextOrder("decisions");
    const batch = db.batch();
    batch.update(ref, { status: "confirmed", settledAt: TS(at), ...(answer ? { answer } : {}) });
    batch.set(decisionRef(did), decisionDoc(answer || f.text, { pageId: f.pageId, flagId: d.id }, order, at));
    await batch.commit();
    await log(uid, d.op === "answer" ? "flagAnswer" : "flagConfirm", `${BASE}/flags/${d.id}`, { pageId: f.pageId, decisionId: did });
    return { ok: true, decisionId: did };
  }

  async function markReviewed(uid, d) {
    if (typeof d.pageId !== "string" || !L.PAGE_ID.test(d.pageId)) throw fail("invalid-argument", "Which page?", "bad-input");
    const p = await pageRef(d.pageId).get();
    if (!p.exists) throw fail("not-found", "That page doesn't exist.", "not-found");
    const at = now();
    await pageRef(d.pageId).update({ lastReviewedAt: TS(at) });
    const firstReadDone = await afterReviewed([d.pageId], at);
    await log(uid, "markReviewed", `${BASE}/pages/${d.pageId}`, firstReadDone ? { firstReadDone: true } : undefined);
    return { ok: true, firstReadDone };
  }

  async function applyUpdate(uid, d) {
    const v = L.validateUpdate(d.update, { pageIds: await pageIds(), flagIds: await flagIds() });
    if (!v.ok) throw fail("invalid-argument", v.message, v.reason);
    const { pages, flags, decisions } = v.value;
    const expect = d.expect && typeof d.expect === "object" ? d.expect : {};
    const at = now();
    let dOrder = await nextOrder("decisions"), fOrder = await nextOrder("flags");
    const out = await db.runTransaction(async (tx) => {
      const pSnaps = await Promise.all(pages.map((p) => tx.get(pageRef(p.id))));
      const fSnaps = await Promise.all(flags.filter((f) => f.id).map((f) => tx.get(flagRef(f.id))));
      const fById = new Map(fSnaps.map((s) => [s.id, s]));
      const stale = pages.filter((p, i) => expect[p.id] != null && Number(expect[p.id]) !== (Number(pSnaps[i].get("version")) || 1)).map((p) => p.id);
      if (stale.length && d.force !== true) throw fail("failed-precondition", "A page changed since you copied the review prompt.", "stale", { pages: stale });
      const versions = {}, newDecisions = [], newFlags = [];
      pages.forEach((p, i) => {
        const s = pSnaps[i], cur = Number(s.get("version")) || 1;
        const changed = ["title", "lede", "body"].some((k) => p[k] !== undefined && p[k] !== (s.get(k) || ""));
        const patch = {};
        if (changed) {
          tx.set(versionRef(p.id, cur), { title: s.get("title") || "", lede: s.get("lede") || "", body: s.get("body") || "", savedAt: TS(at), source: "update" });
          Object.assign(patch, ...["title", "lede", "body"].filter((k) => p[k] !== undefined).map((k) => ({ [k]: p[k] })), { version: cur + 1, updatedAt: TS(at) });
          versions[p.id] = cur + 1;
        }
        if (p.markReviewed) patch.lastReviewedAt = TS(at);
        if (Object.keys(patch).length) tx.update(pageRef(p.id), patch);
      });
      for (const f of flags) {
        if (f.op === "add") { const id = `f-${f.pageId}-${rid()}`; tx.set(flagRef(id), { pageId: f.pageId, status: f.status, text: f.text, order: fOrder++, createdAt: TS(at) }); newFlags.push(id); continue; }
        const s = fById.get(f.id);
        if (!s || !s.exists) throw fail("invalid-argument", "A flag in the update no longer exists.", "unknown-flag");
        if (f.op === "remove") { tx.delete(flagRef(f.id)); continue; }
        if (f.op === "edit") { tx.update(flagRef(f.id), { text: f.text, ...(f.status ? { status: f.status } : {}) }); continue; }
        tx.update(flagRef(f.id), { status: "confirmed", settledAt: TS(at), ...(f.op === "answer" ? { answer: f.answer } : {}) });
        const did = `d-${L.dateKey(at)}-${rid()}`;
        tx.set(decisionRef(did), decisionDoc(f.op === "answer" ? f.answer : s.get("text") || "", { pageId: s.get("pageId") || null, flagId: f.id }, dOrder++, at));
        newDecisions.push(did);
      }
      for (const dec of decisions) { const did = `d-${L.dateKey(at)}-${rid()}`; tx.set(decisionRef(did), decisionDoc(dec.text, dec.pageId ? { pageId: dec.pageId } : {}, dOrder++, at)); newDecisions.push(did); }
      return { versions, flags: flags.length, newFlags, decisions: newDecisions };
    });
    const reviewed = pages.filter((p) => p.markReviewed).map((p) => p.id);
    const firstReadDone = reviewed.length ? await afterReviewed(reviewed, at) : false;
    await log(uid, "applyUpdate", BASE, { pages: Object.keys(out.versions), reviewed, flags: out.flags, newFlags: out.newFlags, decisions: out.decisions, forced: d.force === true });
    return { ok: true, ...out, reviewed, firstReadDone };
  }

  async function restoreVersion(uid, d) {
    if (typeof d.pageId !== "string" || !L.PAGE_ID.test(d.pageId) || !Number.isInteger(Number(d.n))) throw fail("invalid-argument", "Which version?", "bad-input");
    const at = now();
    const out = await db.runTransaction(async (tx) => {
      const [p, old] = await Promise.all([tx.get(pageRef(d.pageId)), tx.get(versionRef(d.pageId, Number(d.n)))]);
      if (!p.exists || !old.exists) throw fail("not-found", "That version doesn't exist.", "not-found");
      const cur = Number(p.get("version")) || 1;
      if (Number(d.version) !== cur) throw fail("failed-precondition", "This page changed since you opened it.", "stale", { version: cur });
      tx.set(versionRef(d.pageId, cur), { title: p.get("title") || "", lede: p.get("lede") || "", body: p.get("body") || "", savedAt: TS(at), source: "restore" });
      tx.update(pageRef(d.pageId), { title: old.get("title") || "", lede: old.get("lede") || "", body: old.get("body") || "", version: cur + 1, updatedAt: TS(at), editedOnSite: true });
      return { version: cur + 1 };
    });
    await log(uid, "restoreVersion", `${BASE}/pages/${d.pageId}`, { from: Number(d.n), version: out.version });
    return out;
  }

  async function admin_(request) {
    const uid = await requireOwner(request);
    const d = request.data || {};
    switch (d.action) {
      case "savePage": return savePage(uid, d);
      case "flagAction": return flagAction(uid, d);
      case "markReviewed": return markReviewed(uid, d);
      case "applyUpdate": return applyUpdate(uid, d);
      case "restoreVersion": return restoreVersion(uid, d);
      default: throw fail("invalid-argument", "Unknown action.", "bad-input");
    }
  }

  /** The monthly tick (spec §4): due pages once the first read-through is done; the owner's reminder in notifyOutbox (no text). */
  async function reviewTick(at = now()) {
    const main = await mainRef().get();
    if (!main.exists || !main.get("firstReadDone")) { await stateRef().set({ dueCount: 0, duePages: [], dueSince: null, updatedAt: TS(at) }, { merge: true }); return { due: 0, waiting: true }; }
    const start = L.monthStart(at), since = L.dateKey(start);
    const pages = (await db.collection(`${BASE}/pages`).get()).docs.filter((d) => L.reviewable(d.id));
    const due = pages.filter((d) => { const t = d.get("lastReviewedAt"); return !t || t.toMillis() < start; }).sort((a, b) => (Number(a.get("order")) || 0) - (Number(b.get("order")) || 0)).map((d) => d.id);
    await stateRef().set({ dueCount: due.length, duePages: due, dueSince: due.length ? since : null, updatedAt: TS(at) });
    if (due.length) {
      const owner = await ownerUid();
      if (owner) {
        try {
          await db.doc(`${SITE}/notifyOutbox/playbook-review-${since}`).create({ type: "playbook-review", audience: "uids", uids: [owner], payload: { count: due.length }, dedupeKey: `playbook-review:${since}`,
            status: "pending", createdAt: FieldValue.serverTimestamp(), expireAt: TS(at + 30 * 86400000) });
        } catch (err) { if (!(err.code === 6 || /ALREADY_EXISTS|already exists/i.test(String(err.message)))) console.error("playbook: outbox failed", String(err.message).slice(0, 120)); }
      }
    }
    return { due: due.length, since };
  }

  return { admin: admin_, reviewTick, savePage, flagAction, markReviewed, applyUpdate, restoreVersion };
}

let core = null;
const C = () => (core ||= build({ adminLogEntry: module.exports._adminLogEntry }));
module.exports = {
  build,
  _adminLogEntry: null,
  functions(adminLogEntry) {
    module.exports._adminLogEntry = adminLogEntry;
    return {
      playbookAdmin: onCall((request) => C().admin(request)),
      playbookReviewTick: onSchedule({ schedule: "0 6 1 * *", timeZone: L.TZ, timeoutSeconds: 120 }, async () => { const r = await C().reviewTick(); console.log(`playbookReviewTick: ${r.waiting ? "first read-through not done" : `${r.due} page(s) due since ${r.since}`}`); }),
    };
  },
};
