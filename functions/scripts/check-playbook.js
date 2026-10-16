#!/usr/bin/env node
// functions/scripts/check-playbook.js: The Playbook's functions (docs/specs/playbook.md §4-§6) against the in-memory Firestore. Every text here is made up for
// the test; the real Playbook text never enters the repo.
//   npm run check      (or node scripts/check-playbook.js)
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { makeDb } = require("./fixtures/fake-firestore");

const admin = require("firebase-admin");
process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = makeDb();
const realFs = admin.firestore;
const fakeFs = () => db; fakeFs.Timestamp = realFs.Timestamp; fakeFs.FieldValue = realFs.FieldValue;
Object.defineProperty(admin, "firestore", { value: fakeFs, configurable: true, writable: true });
const L = require("../lib/playbook/logic");
const S = "sites/boomertanger", B = `${S}/playbook/main`;
let clock = Date.UTC(2026, 9, 20, 18, 0);
const logs = [];
const adminLogEntry = async (_d, f) => { logs.push(f); return f; };
const P = require("../lib/playbook").build({ db, now: () => clock, adminLogEntry });
const req = (uid, data) => ({ auth: uid ? { uid, token: {} } : undefined, data });
const why = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const get = async (p) => (await db.doc(p).get()).data();
const list = async (p) => (await db.collection(p).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

async function main() {
  // ---------- pure ----------
  assert.equal(L.validatePage({ title: "", body: "x" }).field, "title");
  assert.equal(L.validatePage({ title: "T", body: "  " }).field, "body");
  assert.equal(L.validateFlagText("one\n\ntwo").ok, false, "one paragraph");
  assert.equal(L.reviewable("flags"), false); assert.equal(L.reviewable("alpha"), true);
  assert.equal(L.dateKey(L.monthStart(Date.UTC(2026, 10, 15))), "2026-11-01", "the 1st in Los Angeles");
  assert.equal(L.dateKey(L.monthStart(Date.UTC(2026, 10, 15)) - 1), "2026-10-31");
  const ctx = { pageIds: new Set(["alpha", "beta"]), flagIds: new Set(["f-alpha-1"]) };
  assert.equal(L.validateUpdate({ playbookUpdate: 2 }, ctx).reason, "bad-update");
  assert.equal(L.validateUpdate({ playbookUpdate: 1 }, ctx).reason, "bad-update", "nothing in it");
  assert.equal(L.validateUpdate({ playbookUpdate: 1, pages: [{ id: "nope", body: "x" }] }, ctx).reason, "unknown-page");
  assert.equal(L.validateUpdate({ playbookUpdate: 1, flags: [{ op: "confirm", id: "f-zzz" }] }, ctx).reason, "unknown-flag");
  assert.equal(L.validateUpdate({ playbookUpdate: 1, flags: [{ op: "add", pageId: "alpha", status: "confirmed", text: "x" }] }, ctx).reason, "bad-update");
  assert.equal(L.validateUpdate({ playbookUpdate: 1, pages: [{ id: "alpha", body: "x" }, { id: "alpha", body: "y" }] }, ctx).reason, "bad-update", "a page twice");
  assert.equal(L.validateUpdate({ playbookUpdate: 1, pages: [{ id: "alpha", body: "New body" }], flags: [{ op: "answer", id: "f-alpha-1", answer: "Yes" }], decisions: [{ text: "Do it" }] }, ctx).ok, true);

  // ---------- the cast: a seeded Playbook with two pages, the flags page and three flags ----------
  await db.doc(S).set({ ownerUid: "boss" });
  await db.doc(B).set({ firstReadDone: false, reviewDay: 1, seedVersion: "test" });
  const page = (id, order) => db.doc(`${B}/pages/${id}`).set({ title: `Page ${id}`, nav: id, icon: "x", order, service: null, status: "planned", lede: "Lede", body: "## One\n\nText.", version: 1, updatedAt: realFs.Timestamp.fromMillis(clock), lastReviewedAt: null, editedOnSite: false });
  await page("alpha", 1); await page("beta", 2); await page("flags", 3);
  for (const [id, pageId, status, order] of [["f-alpha-1", "alpha", "open", 1], ["f-alpha-2", "alpha", "assumed", 2], ["f-beta-1", "beta", "open", 3]]) await db.doc(`${B}/flags/${id}`).set({ pageId, status, text: "A made-up flag.", order, createdAt: realFs.Timestamp.fromMillis(clock) });

  // owner only
  assert.equal(await why(P.admin(req(null, { action: "markReviewed", pageId: "alpha" }))), "signedOut");
  assert.equal(await why(P.admin(req("admin1", { action: "markReviewed", pageId: "alpha" }))), "notOwner", "admins are refused too");
  assert.equal(await why(P.admin(req("boss", { action: "nope" }))), "bad-input");

  // savePage: pinned to the version, the old text becomes version 1, editedOnSite
  let r = await P.admin(req("boss", { action: "savePage", pageId: "alpha", version: 1, title: "Page alpha", lede: "New lede", body: "## One\n\nEdited." }));
  assert.equal(r.version, 2);
  assert.equal((await get(`${B}/pages/alpha`)).editedOnSite, true);
  assert.equal((await get(`${B}/pages/alpha/versions/1`)).source, "edit");
  assert.equal((await get(`${B}/pages/alpha/versions/1`)).body, "## One\n\nText.");
  assert.equal(await why(P.admin(req("boss", { action: "savePage", pageId: "alpha", version: 1, title: "T", body: "Stale" }))), "stale", "a second tab's stale edit is refused");
  assert.equal(await why(P.admin(req("boss", { action: "savePage", pageId: "zzz", version: 1, title: "T", body: "B" }))), "not-found");

  // flags: an open question can't be confirmed, only answered; confirm (an assumption) adds a decision; answer saves the answer, confirms and adds a decision; add, edit, remove
  assert.equal(await why(P.admin(req("boss", { action: "flagAction", op: "confirm", id: "f-alpha-1" }))), "needs-answer", "an open question needs an answer");
  assert.equal((await get(`${B}/flags/f-alpha-1`)).status, "open");
  r = await P.admin(req("boss", { action: "flagAction", op: "confirm", id: "f-alpha-2" }));
  assert.equal((await get(`${B}/flags/f-alpha-2`)).status, "confirmed");
  let decs = await list(`${B}/decisions`);
  assert.equal(decs.length, 1); assert.equal(decs[0].flagId, "f-alpha-2"); assert.equal(decs[0].date, "2026-10-20");
  r = await P.admin(req("boss", { action: "flagAction", op: "answer", id: "f-alpha-1", answer: "A made-up answer." }));
  const fa = await get(`${B}/flags/f-alpha-1`);
  assert.equal(fa.status, "confirmed"); assert.equal(fa.answer, "A made-up answer."); assert.ok(fa.settledAt);
  assert.equal((await list(`${B}/decisions`)).length, 2);
  r = await P.admin(req("boss", { action: "flagAction", op: "add", pageId: "beta", text: "A new made-up question." }));
  assert.match(r.id, L.FLAG_ID);
  assert.equal((await get(`${B}/flags/${r.id}`)).status, "open");
  assert.equal(await why(P.admin(req("boss", { action: "flagAction", op: "add", pageId: "nope", text: "x" }))), "unknown-page");
  assert.equal(await why(P.admin(req("boss", { action: "flagAction", op: "edit", id: "f-beta-1", text: "one\n\ntwo" }))), "bad-input");
  assert.equal(await why(P.admin(req("boss", { action: "flagAction", op: "edit", id: "f-beta-1", text: "Still open.", status: "confirmed" }))), "needs-answer", "an edit can't confirm an open question without an answer");
  await P.admin(req("boss", { action: "flagAction", op: "edit", id: "f-beta-1", text: "Edited made-up flag.", status: "assumed" }));
  let fb = await get(`${B}/flags/f-beta-1`);
  assert.equal(fb.status, "assumed"); assert.equal(fb.history.length, 1); assert.equal(fb.history[0].text, "A made-up flag.", "the old text stays on the flag");
  // Change: an assumption confirmed in a corrected version; the decision carries the correction
  await db.doc(`${B}/flags/f-beta-9`).set({ pageId: "beta", status: "assumed", text: "A made-up first guess.", order: 9 });
  const rc = await P.admin(req("boss", { action: "flagAction", op: "confirm", id: "f-beta-9", text: "A made-up corrected guess." }));
  const fc = await get(`${B}/flags/f-beta-9`);
  assert.equal(fc.status, "confirmed"); assert.equal(fc.text, "A made-up corrected guess."); assert.equal(fc.history[0].text, "A made-up first guess.");
  assert.equal((await get(`${B}/decisions/${rc.decisionId}`)).text, "A made-up corrected guess.");
  assert.equal(await why(P.admin(req("boss", { action: "flagAction", op: "confirm", id: "f-beta-9" }))), "settled");
  // fixing a mistake: a confirmed flag goes back to open (its answer cleared), then gets answered
  await P.admin(req("boss", { action: "flagAction", op: "edit", id: "f-beta-9", text: "A made-up corrected guess.", status: "open", answer: null }));
  assert.equal((await get(`${B}/flags/f-beta-9`)).status, "open"); assert.equal((await get(`${B}/flags/f-beta-9`)).settledAt, undefined);
  await P.admin(req("boss", { action: "flagAction", op: "edit", id: "f-beta-9", text: "A made-up corrected guess.", status: "confirmed", answer: "A made-up answer." }));
  assert.equal((await get(`${B}/flags/f-beta-9`)).answer, "A made-up answer.");
  await db.doc(`${B}/flags/f-beta-9`).delete();
  fb = null;
  await P.admin(req("boss", { action: "flagAction", op: "remove", id: r.id }));
  assert.equal((await db.doc(`${B}/flags/${r.id}`).get()).exists, false);

  // applyUpdate: one transaction, every changed page versioned, flag changes, decisions; stale refused unless forced; unknown ids refused
  assert.equal(await why(P.admin(req("boss", { action: "applyUpdate", update: { playbookUpdate: 1, pages: [{ id: "nope", body: "x" }] } }))), "unknown-page");
  assert.equal(await why(P.admin(req("boss", { action: "applyUpdate", update: { playbookUpdate: 1, flags: [{ op: "confirm", id: "f-beta-1" }] } }))), "ok", "f-beta-1 is an assumption now");
  await db.doc(`${B}/flags/f-beta-1`).set({ status: "assumed" }, { merge: true });
  await db.doc(`${B}/flags/f-beta-8`).set({ pageId: "beta", status: "open", text: "A made-up open one.", order: 8 });
  assert.equal(await why(P.admin(req("boss", { action: "applyUpdate", update: { playbookUpdate: 1, flags: [{ op: "confirm", id: "f-beta-8" }] } }))), "needs-answer", "an update can't confirm an open question either");
  await db.doc(`${B}/flags/f-beta-8`).delete();
  const upd = { playbookUpdate: 1, pages: [{ id: "alpha", body: "## One\n\nUpdated.", markReviewed: true }, { id: "beta", markReviewed: true }], flags: [{ op: "confirm", id: "f-beta-1" }, { op: "add", pageId: "alpha", status: "assumed", text: "Made-up assumption." }], decisions: [{ text: "A made-up decision.", pageId: "beta" }] };
  assert.equal(await why(P.admin(req("boss", { action: "applyUpdate", update: upd, expect: { alpha: 1 } }))), "stale", "alpha moved to v2 since the prompt was copied");
  assert.equal((await get(`${B}/pages/alpha`)).body, "## One\n\nEdited.", "nothing saved");
  clock += 60000;
  r = await P.admin(req("boss", { action: "applyUpdate", update: upd, expect: { alpha: 1 }, force: true }));
  assert.deepEqual(r.versions, { alpha: 3 }, "only the changed page gets a version");
  assert.deepEqual(r.reviewed.sort(), ["alpha", "beta"]);
  assert.equal(r.firstReadDone, true, "every reviewable page is reviewed (the flags page doesn't count)");
  assert.equal((await get(`${B}/pages/alpha/versions/2`)).source, "update");
  assert.equal((await get(`${B}/flags/f-beta-1`)).status, "confirmed");
  assert.equal((await list(`${B}/decisions`)).length, 6, "the earlier confirms, then this confirm and the decision");
  assert.equal((await list(`${B}/flags`)).filter((f) => f.pageId === "alpha" && f.status === "assumed").length, 1);
  assert.equal((await get(B)).firstReadDone, true);

  // restoreVersion: version 1 back, the current text becomes a version (source restore)
  assert.equal(await why(P.admin(req("boss", { action: "restoreVersion", pageId: "alpha", n: 1, version: 2 }))), "stale");
  r = await P.admin(req("boss", { action: "restoreVersion", pageId: "alpha", n: 1, version: 3 }));
  assert.equal(r.version, 4);
  assert.equal((await get(`${B}/pages/alpha`)).body, "## One\n\nText.");
  assert.equal((await get(`${B}/pages/alpha/versions/3`)).source, "restore");

  // the review tick: before the first read-through nothing is due; after it, pages not reviewed this month are; the owner's reminder has no text
  clock = Date.UTC(2026, 10, 1, 14, 0);   // Nov 1, 06:00 Pacific
  let t = await P.reviewTick(clock);
  assert.equal(t.due, 2); assert.equal(t.since, "2026-11-01");
  const st = await get(`${B}/state/current`);
  assert.deepEqual(st.duePages, ["alpha", "beta"]); assert.equal(st.dueCount, 2);
  const ob = await get(`${S}/notifyOutbox/playbook-review-2026-11-01`);
  assert.equal(ob.type, "playbook-review"); assert.equal(ob.audience, "uids"); assert.deepEqual(ob.uids, ["boss"]); assert.deepEqual(ob.payload, { count: 2 });
  assert.equal(await why(P.reviewTick(clock)), "ok", "a second run doesn't fail on the existing reminder");
  await P.admin(req("boss", { action: "markReviewed", pageId: "alpha" }));
  assert.deepEqual((await get(`${B}/state/current`)).duePages, ["beta"], "reviewing a page clears it from the due list");
  await db.doc(B).set({ firstReadDone: false }, { merge: true });
  t = await P.reviewTick(clock);
  assert.equal(t.waiting, true); assert.equal((await get(`${B}/state/current`)).dueCount, 0);

  // adminLog: feature playbook, ids only, never page text
  assert.ok(logs.length >= 8 && logs.every((l) => l.feature === "playbook"));
  const logged = JSON.stringify(logs);
  for (const text of ["made-up", "Edited", "Updated", "Lede"]) assert.ok(!logged.includes(text), `no page or flag text in adminLog (${text})`);

  // rules and wiring
  const rules = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
  assert.match(rules, /match \/playbook\/\{document=\*\*\} \{\s*allow read: if isSiteOwner\(siteId\);\s*allow write: if false;/);
  const fns = require("../lib/playbook").functions(adminLogEntry);
  assert.deepEqual(Object.keys(fns).sort(), ["playbookAdmin", "playbookReviewTick"]);
  const src = fs.readFileSync(path.join(__dirname, "../lib/playbook/index.js"), "utf8") + fs.readFileSync(path.join(__dirname, "../lib/playbook/logic.js"), "utf8");
  const reqs = [...src.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(reqs.filter((x) => x.startsWith(".")), ["./logic"], "loads nothing outside lib/playbook (so never rewards/grant.js)");

  console.log("check-playbook: ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
