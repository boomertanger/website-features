#!/usr/bin/env node
// functions/scripts/check-goal-tracker.js: checks for the Goal Tracker (docs/specs/goal-tracker.md): the pure
// rules in lib/goalTracker/logic.js, the starting plan, and the callables (edit, set metric, publish, daily)
// run against an in-memory Firestore (scripts/fixtures/fake-firestore.js). No credentials needed.
//   npm run check      (or node scripts/check-goal-tracker.js)
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { makeDb } = require("./fixtures/fake-firestore");

const db = makeDb();
const real = admin.firestore;
const fake = () => db;
fake.Timestamp = real.Timestamp; fake.FieldValue = real.FieldValue;
Object.defineProperty(admin, "firestore", { value: fake, configurable: true, writable: true });

const L = require("../lib/goalTracker/logic");
const logs = [];
const G = require("../lib/goalTracker")({ adminLogEntry: async (_db, e) => { logs.push(e); return e; } });
const as = (uid) => (fn, data = {}) => G[fn].run({ auth: { uid, token: {} }, data });
const boss = as("boss"), fan = as("fan"), mod = as("mod");
const reason = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
const S = "sites/boomertanger";
const itemsNow = async () => (await db.collection(`${S}/goalItems`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const edit = (data) => boss("goalTrackerEdit", data);

// ---------- the starting plan ----------
const seedFile = path.join(__dirname, "../data/goal-tracker-seed.json");
const specFile = path.join(__dirname, "../../docs/specs/goal-tracker-seed.json");
assert.equal(fs.readFileSync(seedFile, "utf8").replace(/\r/g, ""), fs.readFileSync(specFile, "utf8").replace(/\r/g, ""), "functions/data/goal-tracker-seed.json must match docs/specs/goal-tracker-seed.json");

// ---------- validation ----------
const lv = new Set([0, 1, 2]);
const rejects = (fn, field) => { try { fn(); } catch (e) { assert.ok(e instanceof L.Invalid, String(e)); if (field) assert.equal(e.field, field); return; } assert.fail("should have been refused"); };
assert.equal(L.itemFields("goal", { title: "  A   goal " }, { full: true }).title, "A goal");
rejects(() => L.itemFields("goal", { title: "" }, { full: true }), "title");
rejects(() => L.itemFields("goal", { title: "x".repeat(121) }, { full: true }), "title");
assert.equal(L.itemFields("goal", { title: "x".repeat(120) }, { full: true }).title.length, 120);
rejects(() => L.itemFields("goal", { title: "a", description: "x".repeat(601) }, { full: true }), "description");
rejects(() => L.itemFields("goal", { title: "a", help: "x".repeat(201) }, { full: true }), "help");
rejects(() => L.itemFields("goal", { title: "a", status: "blocked" }, { full: true }), "status");
rejects(() => L.itemFields("goal", { title: "a", visibility: "everyone" }, { full: true }), "visibility");
rejects(() => L.itemFields("goal", { title: "a", dueDate: "2027-02-30" }, { full: true }), "dueDate");
rejects(() => L.itemFields("goal", { title: "a", startDate: "2027-03-01", dueDate: "2027-02-01" }, { full: true }), "dueDate");
rejects(() => L.itemFields("goal", { title: "a", relaunch: { needed: true, weeks: 60, side: "site" } }, { full: true }), "relaunch");
rejects(() => L.itemFields("goal", { title: "a", relaunch: { needed: true, weeks: 1, side: "moon" } }, { full: true }), "relaunch");
rejects(() => L.itemFields("goal", { title: "a", target: 5 }, { full: true }), "target");   // a target needs a metric (a metric alone is fine: the seed has some)
rejects(() => L.itemFields("goal", { title: "a", level: 1 }, { full: true }), "level");   // a goal has no level
rejects(() => L.itemFields("track", { title: "a", status: "done" }, { full: true }), "status");   // a track has no status
rejects(() => L.itemFields("milestone", { title: "a", level: 9 }, { levels: lv, full: true }), "level");
assert.equal(L.itemFields("milestone", { title: "a", level: 2 }, { levels: lv, full: true }).level, 2);
rejects(() => L.configFields({ northStar: "x".repeat(121) }), "northStar");
rejects(() => L.configFields({ story: "x".repeat(601) }), "story");
rejects(() => L.configFields({ result: "x".repeat(201) }), "result");
rejects(() => L.configFields({ relaunchAt: "soon" }), "relaunchAt");
rejects(() => L.configFields({ levels: [] }), "levels");
rejects(() => L.configFields({ levels: [{ n: 0, name: "A" }, { n: 0, name: "B" }] }), "levels");
rejects(() => L.configFields({ levels: [{ n: 0, name: "A", boss: true }, { n: 1, name: "B" }] }), "levels");
rejects(() => L.configFields({ levels: [{ n: 0, name: "x".repeat(41) }] }), "levels");
rejects(() => L.configFields({ levels: [{ n: 0, name: "A", status: "later" }] }), "levels");
rejects(() => L.metricFields({ label: "" }, { full: true }), "label");
rejects(() => L.metricValue(-1), "value");

// ---------- visibility, income, readiness, snapshot (pure) ----------
{
  const items = [
    { id: "t1", type: "track", parentId: null, title: "Open", visibility: "members", order: 10, icon: "🎭" },
    { id: "g1", type: "goal", parentId: "t1", title: "Public goal", visibility: "public", status: "progress", order: 10 },
    { id: "m1", type: "milestone", parentId: "g1", title: "Site live", level: 0, visibility: "public", status: "done", order: 10, relaunch: { needed: true, weeks: 0, side: "site" } },
    { id: "m2", type: "milestone", parentId: "g1", title: "Schedule", level: 0, visibility: "members", status: "planned", order: 20, relaunch: { needed: true, weeks: 2, side: "site" } },
    { id: "m3", type: "milestone", parentId: "g1", title: "Secret plan", level: 0, visibility: "private", status: "planned", order: 30, relaunch: { needed: true, weeks: 9, side: "stream" } },
    { id: "t2", type: "track", parentId: null, title: "Money", visibility: "private", order: 20 },
    { id: "g2", type: "goal", parentId: "t2", title: "$1K a month", visibility: "public", status: "planned", order: 10, metricId: "gross", target: 1000 },
    { id: "g3", type: "goal", parentId: "t1", title: "Followers", visibility: "members", status: "progress", order: 20, metricId: "tw", target: 500 },
    { id: "g4", type: "goal", parentId: "t1", title: "Deleted metric", visibility: "members", status: "planned", order: 30, metricId: "gone", target: 5 },
    { id: "o1", type: "goal", parentId: "nowhere", title: "Orphan", visibility: "public", status: "planned", order: 1 },
  ];
  const metrics = { gross: { label: "Gross", unit: "USD", source: "manual", value: 400, visibility: "private" }, tw: { label: "Twitch", unit: "followers", source: "auto:twitchFollowers", value: 321, updatedAt: 5, visibility: "members" } };
  const map = new Map(items.map((i) => [i.id, i]));
  assert.equal(L.effectiveVisibility(map, map.get("g2")), "private");   // never wider than its parent
  assert.equal(L.effectiveVisibility(map, map.get("m1")), "members");   // public under a members track
  assert.equal(L.effectiveVisibility(map, map.get("o1")), "private");   // orphan
  const inc = L.incomeIds(items, metrics);
  assert.ok(inc.has("g2") && inc.has("t2") && !inc.has("g3"));
  const built = L.buildPublic({ config: { northStar: "CCOY", story: "s", levels: [{ n: 0, name: "Rebuild" }], relaunchAt: null, nomineesAt: 2000000000000, showAt: 2100000000000 }, items, metrics, now: 7 });
  const ids = built.snapshot.items.map((i) => i.id);
  assert.deepEqual(ids, ["t1", "g1", "m1", "m2", "g3", "g4"]);   // DFS in order; no private, no money, no orphan
  assert.ok(!JSON.stringify(built.snapshot).includes("Secret plan") && !JSON.stringify(built.snapshot).includes("Money") && !JSON.stringify(built.snapshot).includes("\"target\":1000"));
  assert.ok(!built.snapshot.metrics.gross && built.snapshot.metrics.tw.value === 321 && built.snapshot.metrics.tw.auto === true);
  assert.equal(built.snapshot.items.find((i) => i.id === "g4").metricId, null);   // metric missing -> no meter
  assert.equal(built.snapshot.items.find((i) => i.id === "g3").target, 500);
  assert.deepEqual(built.snapshot.readiness, { done: 1, total: 2, weeksLeft: 2, groups: [{ id: "g1", name: "Public goal", icon: "🎭", done: 1, total: 2, items: ["m1", "m2"] }] });   // the private item isn't counted
  assert.equal(built.teaser.northStar, "CCOY");
  assert.deepEqual(built.teaser.readiness, { done: 1, total: 2 });
  assert.deepEqual(Object.keys(built.teaser).sort(), ["nextKeyDate", "northStar", "readiness", "relaunchAt", "updatedAt"]);
  assert.equal(built.teaser.nextKeyDate.key, "nominees");
  // The next key date moves on once one has passed.
  assert.equal(L.nextKeyDate({ relaunchAt: 100, nomineesAt: 200, showAt: 300 }, 150).key, "nominees");
  assert.equal(L.nextKeyDate({ relaunchAt: 100, nomineesAt: 200, showAt: 300 }, 250).key, "show");
  assert.equal(L.nextKeyDate({ relaunchAt: 100, nomineesAt: 200, showAt: 300 }, 350), null);
  // First publish: no events; later: only milestones that changed to done.
  assert.deepEqual(L.newlyDoneMilestones(null, built.visibleItems), []);
  const next = built.visibleItems.map((i) => (i.id === "m2" ? { ...i, status: "done" } : i));
  assert.deepEqual(L.newlyDoneMilestones(built.snapshot, next).map((i) => i.id), ["m2"]);
  // Automatic counts: a missing source is skipped, never zeroed.
  const av = L.autoValues({ twitch: { followers: 10, updatedAt: 7 }, youtube: {} }, 42, 99);
  assert.deepEqual(av, { twitchFollowers: { value: 10, updatedAt: 7 }, fanClubMembers: { value: 42, updatedAt: 99 } });
}

async function main() {
  await db.doc(S).set({ ownerUid: "boss" });
  for (const [uid, roles] of [["boss", ["admin"]], ["mod", ["mod"]], ["fan", []]]) {
    await db.doc(`${S}/members/${uid}`).set({ roles });
    await db.doc(`${S}/profiles/${uid}`).set({ handle: uid });
  }
  await db.doc(`${S}/public/socials`).set({ twitch: { followers: 123, updatedAt: admin.firestore.Timestamp.fromMillis(Date.now() - 3600000) }, youtube: { subscribers: 45, updatedAt: admin.firestore.Timestamp.now() }, tiktok: { followers: null } });

  // Admins only.
  for (const u of [fan, mod]) {
    assert.equal(await reason(u("goalTrackerEdit", { action: "seed" })), "notAdmin");
    assert.equal(await reason(u("goalTrackerPublish")), "notAdmin");
    assert.equal(await reason(u("goalTrackerSetMetric", { metricId: "x", value: 1 })), "notAdmin");
  }
  assert.equal(await reason(G.goalTrackerEdit.run({ data: { action: "seed" } })), "signedOut");
  assert.equal(await reason(boss("goalTrackerPublish")), "empty");   // nothing to publish yet
  assert.equal(await reason(edit({ action: "nope" })), "action");

  // Seed: only into an empty plan.
  const seeded = await edit({ action: "seed" });
  assert.ok(seeded.items >= 70 && seeded.metrics === 6, JSON.stringify(seeded));
  assert.equal(await reason(edit({ action: "seed" })), "notEmpty");
  let items = await itemsNow();
  assert.equal(items.length, seeded.items);
  assert.ok(items.every((i) => i.changedSincePublish === true));
  let cfg = (await db.doc(`${S}/goalTracker/config`).get()).data();
  assert.equal(cfg.pendingChanges, seeded.items);
  assert.equal(cfg.levels.length, 6);
  assert.equal(cfg.levels[5].boss, true);
  assert.equal((await db.doc(`${S}/goalMetrics/monthlyGross`).get()).get("visibility"), "private");
  assert.equal(logs.at(-1).feature, "goalTracker");
  assert.equal(logs.at(-1).action, "seed");
  const top = items.filter((i) => i.type === "track");
  assert.equal(top.length, 7);
  const money = top.find((t) => t.title === "Money");
  assert.equal(money.visibility, "private");

  // The first publish: members get everything but Money; the teaser carries only the headline.
  const pub1 = await boss("goalTrackerPublish");
  assert.equal(pub1.milestonesDone, 0);
  const snap = (await db.doc(`${S}/public/goalTracker`).get()).data();
  const teaser = (await db.doc(`${S}/public/goalTrackerTeaser`).get()).data();
  assert.ok(!snap.items.some((i) => i.title.includes("a month gross") || i.title === "Money"));
  assert.ok(!snap.metrics.monthlyGross);
  assert.ok(snap.items.length < items.length);
  assert.equal(snap.readiness.total, items.filter((i) => i.relaunch?.needed && i.status !== "dropped").length);
  assert.ok(snap.readiness.groups.length >= 3);
  assert.equal(teaser.northStar, "Content Creator of the Year, 2027");
  assert.equal(teaser.readiness.total, snap.readiness.total);
  assert.equal((await db.doc(`${S}/goalTracker/config`).get()).get("pendingChanges"), 0);
  assert.ok((await itemsNow()).every((i) => i.changedSincePublish === false));
  assert.equal((await db.collection("activityLog").get()).size, 0);   // nothing "became" done on the first publish
  assert.equal(logs.at(-1).action, "publish");

  // Create: parents, limits, income.
  const track = items.find((i) => i.title === "Platforms");
  const goal = items.find((i) => i.parentId === track.id && i.type === "goal");
  assert.equal(await reason(edit({ action: "create", type: "milestone", parentId: track.id, changes: { title: "x", level: 0 } })), "parent");
  assert.equal(await reason(edit({ action: "create", type: "track", parentId: goal.id, changes: { title: "x" } })), "parent");
  assert.equal(await reason(edit({ action: "create", type: "banana", changes: { title: "x" } })), "type");
  assert.equal(await reason(edit({ action: "create", type: "goal", parentId: track.id, changes: { title: "x".repeat(121) } })), "invalid");
  assert.equal(await reason(edit({ action: "create", type: "goal", parentId: track.id, changes: { title: "x", status: "blocked" } })), "invalid");
  assert.equal(await reason(edit({ action: "create", type: "milestone", parentId: goal.id, changes: { title: "x", level: 99 } })), "invalid");
  assert.equal(await reason(edit({ action: "create", type: "goal", parentId: track.id, changes: { title: "x", metricId: "nope", target: 5 } })), "invalid");
  assert.equal(await reason(edit({ action: "create", type: "goal", parentId: track.id, changes: { title: "x", bogus: 1 } })), "badField");
  const ms1 = await edit({ action: "create", type: "milestone", parentId: goal.id, changes: { title: "  First   task  ", level: 1, description: "d", dueDate: "2027-03-31", relaunch: { needed: true, weeks: 1.5, side: "stream" } } });
  assert.equal(ms1.item.title, "First task");
  assert.equal(ms1.item.status, "planned");
  assert.equal(ms1.item.visibility, "members");
  const sibs = (await itemsNow()).filter((i) => i.parentId === goal.id);
  assert.equal(Math.max(...sibs.map((s) => s.order)), ms1.item.order);   // added last
  assert.equal((await db.doc(`${S}/goalTracker/config`).get()).get("pendingChanges"), 1);
  const task = await edit({ action: "create", type: "task", parentId: ms1.id, changes: { title: "A task" } });
  // Income: a USD goal is private by default, and visible only with the confirmation.
  const income = await edit({ action: "create", type: "goal", parentId: money.id, changes: { title: "$12K a month", metricId: "monthlyGross", target: 12000 } });
  assert.equal(income.item.visibility, "private");
  assert.equal(await reason(edit({ action: "update", id: income.id, changes: { visibility: "members" } })), "confirmIncome");
  assert.equal((await edit({ action: "update", id: income.id, changes: { visibility: "members" }, confirmVisible: true })).item.visibility, "members");
  assert.equal(await reason(edit({ action: "create", type: "goal", parentId: money.id, changes: { title: "Loud", visibility: "public" } })), "confirmIncome");
  // A normal goal tied to a USD metric turns into income when it's saved visible without the confirmation.
  assert.equal(await reason(edit({ action: "update", id: goal.id, changes: { metricId: "monthlyGross", target: 5 } })), "confirmIncome");

  // Update: only real changes count; last write wins.
  const pend = async () => (await db.doc(`${S}/goalTracker/config`).get()).get("pendingChanges");
  const before = await pend();
  const same = await edit({ action: "update", id: ms1.id, changes: { title: "First task", relaunch: { side: "stream", weeks: 1.5, needed: true } } });
  assert.equal(same.changed, false);
  assert.equal(await pend(), before);
  const up = await edit({ action: "update", id: ms1.id, changes: { description: "new text", dueDate: null }, reason: "typo" });
  assert.equal(up.changed, true);
  assert.deepEqual(logs.at(-1).changes.description, { from: "d", to: "new text" });
  assert.equal(logs.at(-1).reason, "typo");
  assert.equal(await pend(), before + 1);
  assert.equal(await reason(edit({ action: "update", id: "nope", changes: { title: "x" } })), "gone");
  assert.equal(await reason(edit({ action: "update", id: ms1.id, changes: { level: 77 } })), "invalid");
  assert.equal(await reason(edit({ action: "update", id: ms1.id, changes: { title: "" } })), "invalid");
  assert.equal(await reason(edit({ action: "update", id: track.id, changes: { status: "done" } })), "badField");

  // A metric and target travel together on update.
  const gm = await edit({ action: "update", id: goal.id, changes: { metricId: "twitchFollowers", target: 800 } });
  assert.equal(gm.item.target, 800);
  assert.equal((await edit({ action: "update", id: goal.id, changes: { target: 900 } })).item.metricId, "twitchFollowers");
  assert.equal((await edit({ action: "update", id: goal.id, changes: { metricId: "youtubeSubscribers" } })).item.target, 900);
  assert.equal((await edit({ action: "update", id: goal.id, changes: { metricId: null, target: null } })).item.metricId, null);

  // Status.
  assert.equal((await edit({ action: "setStatus", id: ms1.id, status: "done" })).item.status, "done");
  assert.equal(logs.at(-1).action, "status");
  assert.equal(await reason(edit({ action: "setStatus", id: ms1.id, status: "finished" })), "invalid");
  assert.equal(await reason(edit({ action: "setStatus", id: track.id, status: "done" })), "badType");

  // Reorder swaps neighbours; the ends stay put.
  const order = async () => L.childrenOf(await itemsNow(), goal.id).map((i) => i.id);
  const o1 = await order();
  assert.equal(o1.at(-1), ms1.id);
  assert.equal((await edit({ action: "reorder", id: ms1.id, direction: "down" })).moved, false);
  assert.equal((await edit({ action: "reorder", id: ms1.id, direction: "up" })).moved, true);
  const o2 = await order();
  assert.deepEqual(o2, [...o1.slice(0, -2), ms1.id, o1.at(-2)]);
  assert.equal(await reason(edit({ action: "reorder", id: ms1.id, direction: "sideways" })), "direction");

  // Config: levels can't drop a level that has milestones.
  const lv0 = (await db.doc(`${S}/goalTracker/config`).get()).get("levels");
  assert.equal(await reason(edit({ action: "updateConfig", changes: { levels: lv0.slice(2) } })), "levelInUse");
  const cfgSave = await edit({ action: "updateConfig", changes: { northStar: "CCOY 2027", relaunchAt: Date.parse("2027-01-15T18:00:00Z"), result: "" } });
  assert.equal(cfgSave.changed, true);
  assert.equal((await edit({ action: "updateConfig", changes: { northStar: "CCOY 2027" } })).changed, false);
  assert.equal(await reason(edit({ action: "updateConfig", changes: { story: "x".repeat(601) } })), "invalid");
  assert.equal(await reason(edit({ action: "updateConfig", changes: {} })), "empty");
  assert.equal(logs.at(-1).action, "config");

  // Metrics: manual values with history; automatic ones refuse; save/delete.
  const setm = await boss("goalTrackerSetMetric", { metricId: "twitchAvgViewers", value: 31 });
  assert.equal((await db.doc(`${S}/goalMetrics/twitchAvgViewers`).get()).get("value"), 31);
  assert.equal((await db.doc(`${S}/goalMetrics/twitchAvgViewers/history/${setm.day}`).get()).get("value"), 31);
  assert.equal(logs.at(-1).action, "metric");
  assert.equal(await reason(boss("goalTrackerSetMetric", { metricId: "twitchFollowers", value: 5 })), "autoMetric");
  assert.equal(await reason(boss("goalTrackerSetMetric", { metricId: "twitchAvgViewers", value: -3 })), "invalid");
  assert.equal(await reason(boss("goalTrackerSetMetric", { metricId: "twitchAvgViewers", value: "lots" })), "invalid");
  assert.equal(await reason(boss("goalTrackerSetMetric", { metricId: "missing", value: 1 })), "gone");
  const newM = await edit({ action: "metricSave", changes: { label: "Discord members", unit: "members" } });
  assert.equal(newM.metricId, "discord-members");
  assert.equal((await edit({ action: "metricSave", changes: { label: "Discord members" } })).metricId, "discord-members-2");
  const usd = await edit({ action: "metricSave", changes: { label: "Merch income", unit: "USD" } });
  assert.equal(usd.metric.visibility, "private");   // income metrics default to private
  assert.equal(await reason(edit({ action: "metricSave", metricId: usd.metricId, changes: { visibility: "members" } })), "confirmIncome");
  const tied = await edit({ action: "create", type: "goal", parentId: track.id, changes: { title: "Discord", metricId: "discord-members", target: 100 } });
  assert.equal((await edit({ action: "metricDelete", metricId: "discord-members" })).untied, 1);
  assert.equal((await db.doc(`${S}/goalItems/${tied.id}`).get()).get("metricId"), null);   // metric deleted -> no meter
  assert.equal(await reason(edit({ action: "metricDelete", metricId: "discord-members" })), "gone");

  // Delete takes the children with it.
  const before2 = (await itemsNow()).length;
  const del = await edit({ action: "delete", id: ms1.id, reason: "not needed" });
  assert.equal(del.removed, 2);   // the milestone and its task
  assert.equal((await itemsNow()).length, before2 - 2);
  assert.equal((await db.doc(`${S}/goalItems/${task.id}`).get()).exists, false);
  assert.equal(logs.at(-1).action, "delete");
  assert.equal(logs.at(-1).snapshot.children, 1);
  assert.equal(await reason(edit({ action: "delete", id: ms1.id })), "gone");

  // Second publish: a milestone that became Done raises one activityLog event; a private one doesn't.
  const m0 = (await itemsNow()).find((i) => i.type === "milestone" && i.status !== "done" && i.visibility === "members");
  await edit({ action: "setStatus", id: m0.id, status: "done" });
  const privMs = await edit({ action: "create", type: "milestone", parentId: goal.id, changes: { title: "Hidden win", level: 0, visibility: "private" } });
  await edit({ action: "setStatus", id: privMs.id, status: "done" });
  const pub2 = await boss("goalTrackerPublish");
  assert.equal(pub2.milestonesDone, 1);
  const events = (await db.collection("activityLog").get()).docs.map((d) => d.data());
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "goal-milestone-done");
  assert.equal(events[0].feature, "goal-tracker");
  assert.ok(events[0].summary.includes(m0.title) && !events[0].summary.includes("Hidden win"));
  assert.equal(await pend(), 0);
  assert.ok((await itemsNow()).every((i) => i.changedSincePublish === false));
  const pub3 = await boss("goalTrackerPublish");   // nothing changed: no events again
  assert.equal(pub3.milestonesDone, 0);
  assert.equal((await db.collection("activityLog").get()).size, 1);
  const snap2 = (await db.doc(`${S}/public/goalTracker`).get()).data();
  assert.ok(!JSON.stringify(snap2).includes("Hidden win"));
  assert.ok(snap2.config.northStar === "CCOY 2027" && snap2.config.relaunchAt === Date.parse("2027-01-15T18:00:00Z"));

  // The daily job: automatic counts into the draft, the snapshot and history, without a publish or a pending change.
  const pendBeforeDaily = await pend();
  const dailyRes = await G.goalTrackerDaily.run({});
  void dailyRes;
  assert.equal((await db.doc(`${S}/goalMetrics/twitchFollowers`).get()).get("value"), 123);
  assert.equal((await db.doc(`${S}/goalMetrics/youtubeSubscribers`).get()).get("value"), 45);
  assert.equal((await db.doc(`${S}/goalMetrics/fanClubMembers`).get()).get("value"), 3);
  assert.equal((await db.doc(`${S}/goalMetrics/tiktokFollowers`).get()).get("value"), null);   // couldn't be read: left alone
  assert.equal((await db.doc(`${S}/goalMetrics/twitchAvgViewers`).get()).get("value"), 31);   // manual ones untouched
  const snap3 = (await db.doc(`${S}/public/goalTracker`).get()).data();
  assert.equal(snap3.metrics.twitchFollowers.value, 123);
  assert.equal(snap3.metrics.fanClubMembers.value, 3);
  assert.equal(snap3.items.length, snap2.items.length);
  assert.equal(await pend(), pendBeforeDaily);
  const day = (await db.collection(`${S}/goalMetrics/twitchFollowers/history`).get()).docs[0];
  assert.equal(day.get("value"), 123);

  console.log("Goal Tracker checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
