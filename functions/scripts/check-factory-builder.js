#!/usr/bin/env node
// functions/scripts/check-factory-builder.js: runs the Fun Factory builder callables (lib/factory/builder.js)
// against an in-memory Firestore (scripts/fixtures/fake-firestore.js), as a mod and as an admin: build a
// season node by node, the stage checks, submit, send back, publish (windows, badge, ideas), the
// live-season locks, duplicate, ideas and type toggles. No credentials needed.
//   npm run check      (or node scripts/check-factory-builder.js)
const assert = require("assert/strict");
const admin = require("firebase-admin");
const { makeDb } = require("./fixtures/fake-firestore");

const db = makeDb();
// The builder (and the Vault's callerInfo it reuses) call admin.firestore(); point it at the fake.
const real = admin.firestore;
const fake = () => db;
fake.Timestamp = real.Timestamp; fake.FieldValue = real.FieldValue;
Object.defineProperty(admin, "firestore", { value: fake, configurable: true, writable: true });

const T = admin.firestore.Timestamp;
const W = 7 * 86400000;
const logs = [];
const B = require("../lib/factory/builder")({
  adminLogEntry: async (_db, e) => { logs.push(e); return e; },
  recordAssetCreated: async () => "asset1", performAssetDeletion: async () => {}, cloudSecrets: [], cloudCreds: () => ({}),
});
const as = (uid) => (fn, data = {}) => B[fn].run({ auth: { uid, token: {} }, data });
const mod = as("mod"), boss = as("boss"), fan = as("fan");
const reason = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };

async function main() {
  const S = "sites/boomertanger";
  await db.doc(S).set({ ownerUid: "boss" });
  for (const [uid, roles] of [["mod", ["mod"]], ["boss", ["admin"]], ["fan", []]]) {
    await db.doc(`${S}/members/${uid}`).set({ roles });
    await db.doc(`${S}/profiles/${uid}`).set({ handle: uid });
  }
  for (const id of ["checkin", "visit", "medals", "arcade", "vault", "badges", "profile"]) await db.doc(`${S}/factory/main/activityTypes/${id}`).set({ name: id, enabled: true, params: id === "arcade" ? ["action", "gameId"] : id === "medals" ? ["huntId"] : id === "vault" ? ["action"] : [], actions: id === "arcade" ? ["play", "finish", "best", "board"] : id === "vault" ? ["want", "add", "cover"] : [] });
  await db.doc(`${S}/factory/main/activityTypes/ratings`).set({ name: "ratings", enabled: false });
  await db.doc(`${S}/factory/main/ideas/theme-vaultbreakers`).set({ kind: "theme", name: "Vaultbreakers", usedIn: [] });

  // Members can't use the builder.
  assert.equal(await reason(fan("factoryListSeasons")), "notStaff");

  // A mod builds a season.
  const { seasonId } = await mod("factorySave", { node: "season", op: "create", data: { name: "Vaultbreakers", ideaId: "theme-vaultbreakers" } });
  assert.match(seasonId, /^s01-/);
  const start = Date.parse("2027-01-11T06:00:00Z"), end = start + 13 * W;
  await mod("factorySave", { seasonId, node: "season", op: "update", data: { pitch: "Crack it open.", startsAt: start, endsAt: end, tags: ["heist"] } });
  await db.doc(`${S}/factory/main/seasons/${seasonId}`).update({ art: { url: "https://res.cloudinary.com/x/fun-factory/seasons/a.png", assetId: "asset0" } });   // (art goes through Cloudinary)
  const chapters = [];
  for (const [i, wk] of [[1, 0], [2, 3], [3, 6], [4, 10]]) chapters.push((await mod("factorySave", { seasonId, node: "chapter", op: "create", data: { name: `Chapter ${i}`, unlockAt: start + wk * W } })).id);
  let g = await mod("factoryGetSeason", { seasonId });
  assert.equal(g.stages.find((s) => s.key === "chapters").ok, true);
  assert.equal(g.stages.find((s) => s.key === "campaigns").ok, false);
  for (const ch of chapters) {
    const d = (await mod("factorySave", { seasonId, node: "campaign", op: "create", data: { chapterId: ch, name: "Daily", cadence: "daily", audience: "all" } })).id;
    const w = (await mod("factorySave", { seasonId, node: "campaign", op: "create", data: { chapterId: ch, name: "Weekly", cadence: "weekly", audience: "all" } })).id;
    const st = (await mod("factorySave", { seasonId, node: "campaign", op: "create", data: { chapterId: ch, name: "Story", cadence: "story", audience: "all" } })).id;
    await mod("factorySave", { seasonId, node: "activity", op: "create", data: { campaignId: d, title: "Clock in", typeId: "checkin", target: 1, xp: 15, repeat: "daily" } });
    await mod("factorySave", { seasonId, node: "activity", op: "create", data: { campaignId: w, title: "Splat run", typeId: "arcade", params: { action: "finish", gameId: "tapTheSplat" }, target: 3, xp: 100, repeat: "weekly" } });
    await mod("factorySave", { seasonId, node: "activity", op: "create", data: { campaignId: st, title: `Find ${ch}`, typeId: "visit", target: 3, xp: 150 } });
  }
  // A medal hunt: its hunt doc and up to 10 medals on allowlisted pages.
  const huntCamp = (await mod("factorySave", { seasonId, node: "campaign", op: "create", data: { chapterId: chapters[0], name: "Hunt", cadence: "story", audience: "all" } })).id;
  const hunt = (await mod("factorySave", { seasonId, node: "activity", op: "create", data: { campaignId: huntCamp, title: "Hidden medals", typeId: "medals", target: 2, xp: 150 } })).id;
  assert.equal((await db.doc(`${S}/factory/main/seasons/${seasonId}/activities/${hunt}`).get()).get("params").huntId, hunt);
  await mod("factorySave", { seasonId, node: "medal", op: "create", data: { activityId: hunt, path: "/arcade", position: "top-right", hint: "Look up" } });
  assert.equal(await reason(mod("factorySave", { seasonId, node: "medal", op: "create", data: { activityId: hunt, path: "/admin" } })), "field");
  // Bad input is refused.
  assert.equal(await reason(mod("factorySave", { seasonId, node: "activity", op: "create", data: { campaignId: huntCamp, title: "X", typeId: "arcade", params: { action: "dance" } } })), "params");
  assert.equal(await reason(mod("factorySave", { seasonId, node: "activity", op: "create", data: { campaignId: huntCamp, title: "X", typeId: "nope" } })), "type");
  assert.equal(await reason(mod("factorySave", { seasonId, node: "chapter", op: "update", data: { id: chapters[0], name: "x".repeat(61) } })), "field");

  // Rewards: the season badge goes into the catalog as a draft.
  g = await mod("factoryGetSeason", { seasonId });
  assert.equal(g.readyToSubmit, false);
  assert.equal(await reason(mod("factorySubmit", { seasonId })), "notReady");
  const { badgeId } = await mod("factorySave", { seasonId, node: "badge", op: "update", data: { name: "Vault Cracker", rarity: 3, emoji: "🗝" } });
  const badge = (await db.doc(`${S}/badges/${badgeId}`).get()).data();
  assert.deepEqual([badge.status, badge.source, badge.collection, badge.xp], ["draft", "factory", "limited", 50]);
  g = await mod("factoryGetSeason", { seasonId });
  assert.equal(g.readyToSubmit, true, JSON.stringify(g.stages.filter((s) => !s.ok)));
  assert.ok(g.budget.total > 0);

  // Submit (mod), send back (admin only), submit again, publish (admin).
  await mod("factorySubmit", { seasonId });
  assert.equal(await reason(mod("factoryPublish", { seasonId })), "notAdmin");
  assert.equal(await reason(boss("factorySendBack", { seasonId, note: "" })), "note");
  await boss("factorySendBack", { seasonId, note: "Rename chapter 4." });
  let sd = (await db.doc(`${S}/factory/main/seasons/${seasonId}`).get()).data();
  assert.deepEqual([sd.status, sd.reviewNote.text], ["draft", "Rename chapter 4."]);
  await mod("factorySubmit", { seasonId });
  await boss("factoryPublish", { seasonId });
  sd = (await db.doc(`${S}/factory/main/seasons/${seasonId}`).get()).data();
  assert.equal(sd.status, "scheduled");
  assert.equal((await db.doc(`${S}/badges/${badgeId}`).get()).get("status"), "active");
  assert.deepEqual((await db.doc(`${S}/factory/main/ideas/theme-vaultbreakers`).get()).get("usedIn"), ["S01"]);
  // Campaign windows: a daily ends with its chapter; a story runs to the season's end (null).
  const camps = (await db.collection(`${S}/factory/main/seasons/${seasonId}/campaigns`).get()).docs.map((d) => d.data());
  const daily1 = camps.find((c) => c.chapterId === chapters[0] && c.cadence === "daily");
  assert.deepEqual([daily1.opensAt.toMillis(), daily1.closesAt.toMillis()], [start, start + 3 * W]);
  assert.equal(camps.find((c) => c.chapterId === chapters[0] && c.cadence === "story").closesAt, null);
  // Preview as a plan on a date: chapter 1 only on day one; chapter 2 three weeks in; a Sub Club campaign
  // shows as a locked count for Fan Club and as a campaign for Sub Club.
  await db.doc(`${S}/factory/main/seasons/${seasonId}/campaigns/subx`).set({ chapterId: chapters[0], name: "Prestige Path", cadence: "weekly", audience: "sub", order: 9 });
  await db.doc(`${S}/factory/main/seasons/${seasonId}/campaigns/crewx`).set({ chapterId: chapters[0], name: "Mod Patrol", cadence: "weekly", audience: "crew", order: 10 });
  assert.equal(await reason(fan("factoryPreview", { seasonId, as: "fan", date: "2027-01-12" })), "notStaff");
  let pv = await mod("factoryPreview", { seasonId, as: "fan", date: "2027-01-12" });
  assert.deepEqual(pv.chapters.map((c) => [c.number, c.revealed, c.name === null]), [[1, true, false], [2, false, true], [3, false, true], [4, false, true]]);
  assert.ok(pv.campaigns.every((c) => c.chapterId === chapters[0]));
  assert.deepEqual(pv.lockedSub.map((c) => c.name), ["Prestige Path"]);
  assert.ok(!pv.campaigns.some((c) => c.name === "Mod Patrol" || c.name === "Prestige Path"));
  assert.ok(pv.activities.length > 0 && pv.activities.every((a) => pv.campaigns.some((c) => c.id === a.campaignId)));
  pv = await mod("factoryPreview", { seasonId, as: "sub", date: "2027-02-02" });
  assert.equal(pv.chapters.filter((c) => c.revealed).length, 2);
  assert.ok(pv.campaigns.some((c) => c.name === "Prestige Path") && !pv.campaigns.some((c) => c.name === "Mod Patrol"));
  assert.equal(pv.campaigns.find((c) => c.chapterId === chapters[0] && c.cadence === "daily").open, false);   // chapter 1's daily ended with it
  assert.equal(pv.campaigns.find((c) => c.chapterId === chapters[0] && c.cadence === "story").open, true);    // its story is still open
  pv = await mod("factoryPreview", { seasonId, as: "crew", date: "2027-01-12" });
  assert.ok(pv.campaigns.some((c) => c.name === "Mod Patrol") && pv.campaigns.some((c) => c.name === "Prestige Path"));
  for (const id of ["subx", "crewx"]) await db.doc(`${S}/factory/main/seasons/${seasonId}/campaigns/${id}`).delete();

  // Scheduled: edits need an unpublish first.
  assert.equal(await reason(mod("factorySave", { seasonId, node: "season", op: "update", data: { pitch: "x" } })), "locked");

  // A second season can't be published over the first.
  const two = (await mod("factoryDuplicate", { seasonId })).seasonId;
  let d2 = (await db.doc(`${S}/factory/main/seasons/${two}`).get()).data();
  assert.deepEqual([d2.status, d2.startsAt, d2.art, d2.badgeId, d2.number], ["draft", null, null, null, 2]);
  assert.equal((await db.collection(`${S}/factory/main/seasons/${two}/activities`).get()).size, 13);
  assert.equal((await db.collection(`${S}/factory/main/seasons/${two}/hunts/${hunt}/medals`).get()).size, 1);
  const g2 = await mod("factoryGetSeason", { seasonId: two });
  assert.equal(g2.stages.find((s) => s.key === "theme").checks[1].state, "warn");   // no art yet

  // Go live (as factoryTick would), then the live locks.
  await boss("factoryUnpublish", { seasonId });
  assert.equal((await db.doc(`${S}/badges/${badgeId}`).get()).get("status"), "draft");
  await mod("factorySubmit", { seasonId }); await boss("factoryPublish", { seasonId });
  await db.doc(`${S}/factory/main/seasons/${seasonId}`).update({ status: "live", revealed: true, startsAt: T.fromMillis(Date.now() - W), endsAt: T.fromMillis(Date.now() + 12 * W) });
  for (const coll of ["chapters", "campaigns", "activities"]) for (const d of (await db.collection(`${S}/factory/main/seasons/${seasonId}/${coll}`).get()).docs) await d.ref.update({ revealed: true });
  await db.doc(`${S}/factory/main/seasons/${seasonId}/chapters/${chapters[0]}`).update({ unlockAt: T.fromMillis(Date.now() - W) });
  const acts = (await db.collection(`${S}/factory/main/seasons/${seasonId}/activities`).get()).docs;
  const a0 = acts[0].id;
  assert.equal(await mod("factorySave", { seasonId, node: "activity", op: "update", data: { id: a0, title: "Clock in!" } }).then(() => "ok"), "ok");
  assert.equal(await reason(mod("factorySave", { seasonId, node: "activity", op: "update", data: { id: a0, xp: 999 } })), "live");
  assert.equal(await reason(mod("factorySave", { seasonId, node: "activity", op: "update", data: { id: a0, target: 2 } })), "live");
  assert.equal(await reason(mod("factorySave", { seasonId, node: "chapter", op: "update", data: { id: chapters[0], unlockAt: Date.now() + W } })), "pastDate");
  assert.equal(await reason(mod("factorySave", { seasonId, node: "activity", op: "delete", data: { id: a0 } })), "live");
  assert.equal(await reason(mod("factorySave", { seasonId, node: "medal", op: "update", data: { activityId: hunt, id: (await db.collection(`${S}/factory/main/seasons/${seasonId}/hunts/${hunt}/medals`).get()).docs[0].id, path: "/games" } })), "live");
  // A new event mid-season, with its own activity.
  const ev = (await mod("factorySave", { seasonId, node: "campaign", op: "create", data: { chapterId: chapters[1], name: "Full moon", cadence: "event", audience: "all", opensAt: Date.now() + W, closesAt: Date.now() + W + 3 * 86400000 } })).id;
  assert.ok((await mod("factorySave", { seasonId, node: "activity", op: "create", data: { campaignId: ev, title: "Howl", typeId: "checkin", target: 1, xp: 100 } })).id);
  assert.equal(await reason(mod("factorySave", { seasonId, node: "activity", op: "create", data: { campaignId: acts[0].get("campaignId"), title: "Sneaky", typeId: "checkin", target: 1, xp: 100 } })), "live");
  // End early (admin): finalized, ended.
  assert.equal(await reason(mod("factoryEnd", { seasonId })), "notAdmin");
  await boss("factoryEnd", { seasonId });
  assert.equal((await db.doc(`${S}/factory/main/seasons/${seasonId}`).get()).get("status"), "ended");

  // Ideas and types (admins).
  assert.equal(await reason(mod("factoryIdeaSave", { kind: "theme", data: { name: "Mine" } })), "notAdmin");
  const idea = (await boss("factoryIdeaSave", { kind: "theme", data: { name: "Static Bloom", pitch: "Flowers that hum.", tags: ["eerie"] } })).id;
  await boss("factoryIdeaSave", { id: idea, retired: true });
  const ideaDoc = (await db.doc(`${S}/factory/main/ideas/${idea}`).get()).data();
  assert.deepEqual([ideaDoc.kind, ideaDoc.name, ideaDoc.retired, ideaDoc.source], ["theme", "Static Bloom", true, "admin"]);
  await boss("factoryTypeToggle", { typeId: "ratings", enabled: true });
  assert.equal((await db.doc(`${S}/factory/main/activityTypes/ratings`).get()).get("enabled"), true);
  assert.equal(await reason(boss("factoryTypeToggle", { typeId: "nope", enabled: true })), "noType");

  // Everything went to adminLog.
  const actions = new Set(logs.map((l) => l.action));
  for (const a of ["factorySave", "factorySubmit", "factorySendBack", "factoryPublish", "factoryUnpublish", "factoryDuplicate", "factoryEnd", "factoryIdeaSave", "factoryTypeToggle"]) assert.ok(actions.has(a), a);
  assert.ok(logs.every((l) => l.feature === "factory"));

  // The list.
  const list = (await mod("factoryListSeasons")).seasons;
  assert.deepEqual(list.map((s) => [s.number, s.status]), [[2, "draft"], [1, "ended"]]);
  console.log("check-factory-builder: ok");
}

main().catch((err) => { console.error(err); process.exit(1); });
