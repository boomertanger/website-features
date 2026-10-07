// Wiring checks for the Scream Planner (called by check-planner.js): the callables and plannerTick against the
// in-memory Firestore (scripts/fixtures/fake-firestore.js). Same pattern as check-crew.js. No credentials needed.
const assert = require("assert/strict");
const admin = require("firebase-admin");
const { makeDb } = require("./fixtures/fake-firestore");

module.exports = async function wiring(L) {
  process.env.GCLOUD_PROJECT ||= "boomertanger-staging";
  process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
  if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const db = makeDb();
  const real = admin.firestore;
  const fake = () => db;
  fake.Timestamp = real.Timestamp; fake.FieldValue = real.FieldValue;
  Object.defineProperty(admin, "firestore", { value: fake, configurable: true, writable: true });

  const T = real.Timestamp;
  const TZ = "America/Chicago";
  const S = "sites/boomertanger";
  const { hooks, functions: fns } = (() => { const b = require("../lib/planner").build({ adminLogEntry: async (_db, f) => ({ ...f, createdAt: T.now() }) }); return b; })();
  const { plannerRefs } = require("../lib/planner/refs");
  const at = (d, t) => L.zonedToUtc(d, t, TZ);
  const call = (fn, uid, data, verified = true) => fns[fn].run({ auth: { uid, token: { email_verified: verified } }, data });
  const reason = async (p) => { try { await p; return "ok"; } catch (e) { return e.details?.reason || e.message; } };
  const get = async (path) => (await db.doc(`${S}/${path}`).get()).data();
  const list = async (path) => (await db.collection(`${S}/${path}`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const MIN = 60000;

  // ---------- the cast ----------
  await db.doc(S).set({ ownerUid: "boss", timezone: TZ });
  const person = async (uid, { roles = [], roster = null }) => {
    await db.doc(`${S}/members/${uid}`).set({ roles });
    await db.doc(`${S}/profiles/${uid}`).set({ handle: uid });
    if (roster) await db.doc(`${S}/crew/main/roster/${uid}`).set({ handle: uid, status: "active", ...roster });
  };
  const ALLDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  await person("boss", { roles: ["admin"] });
  await person("adm1", { roles: ["admin"], roster: { track: "admin", grade: 2 } });
  await person("adm0", { roles: ["admin"], roster: { track: "admin", grade: 1 } });       // A1 Steward
  await person("m1", { roles: ["mod"], roster: { track: "mod", grade: 3, availability: { days: ALLDAYS, note: "" } } });   // Warden
  await person("m2", { roles: ["mod"], roster: { track: "mod", grade: 1, availability: { days: [], note: "" } } });        // Initiate
  await person("m3", { roles: ["mod"], roster: { track: "mod", grade: 2, status: "goingDark" } });
  await person("m4", { roles: ["mod"], roster: { track: "mod", grade: 2, availability: { days: ["wed"], note: "" } } });   // Watcher
  await person("m5", { roles: ["mod"], roster: { track: "mod", grade: 3, leadBlockedUntil: T.fromMillis(Date.now() + 20 * 86400000) } });
  await person("fan", {});
  await person("unv", {});
  const game = (slug, o) => db.doc(`${S}/vaultGames/${slug}`).set({ title: slug.toUpperCase(), sortTitle: slug, hidden: false, wantedCount: 0, status: "wishlist", tags: { auto: [], boomer: [] }, createdAt: T.fromMillis(Date.now() - 1000), ...o });
  await game("granny", { wantedCount: 5, tags: { auto: ["horror"], boomer: [] } });
  await game("vr-one", { wantedCount: 3, tags: { auto: ["VR"], boomer: [] } });
  await game("vr-two", { wantedCount: 1 });
  await game("alien", { status: "playing" });
  await game("hid", { wantedCount: 99, hidden: true });
  await game("done", { status: "finished", wantedCount: 40 });
  await game("extra1", {}); await game("extra2", {}); await game("extra3", {});

  // ---------- settings, patterns, exceptions ----------
  assert.equal(await reason(call("plannerSaveSettings", "adm1", {})), "notOwner");
  assert.equal(await reason(call("plannerSaveSettings", "boss", { deadlines: { closeDow: 1, closeTime: "09:00" } })), "invalid");
  assert.equal(await reason(call("plannerSaveSettings", "boss", { defaults: { ballotSeed: 99 } })), "invalid");
  const saved = await call("plannerSaveSettings", "boss", { defaults: { gameCount: 2 } });
  assert.deepEqual(saved.settings.deadlines, L.DEFAULT_SETTINGS.deadlines);
  assert.equal((await get("planner/main")).defaults.votesPerMember, 3);
  assert.ok((await list("adminLog")).length === 0 && (await db.collection("adminLog").get()).docs.some((d) => d.get("feature") === "screamPlanner" && d.get("action") === "settings"));

  const pat = (o) => ({ label: "Monster Monday", icon: "M", dow: 1, start: "19:00", end: "22:00", type: "platform", platforms: ["twitch", "youtube"], gameCount: 2, ...o });
  assert.equal(await reason(call("patternSave", "m1", pat({}))), "notAdmin");
  assert.equal(await reason(call("patternSave", "adm1", pat({ start: "7pm" }))), "invalid");
  const p1 = await call("patternSave", "adm1", pat({}));
  assert.equal(await reason(call("patternSave", "adm1", pat({ label: "Clash", start: "21:00", end: "23:00" }))), "overlap");
  const p2 = await call("patternSave", "adm1", pat({ label: "VR night", dow: 3, tagHints: ["vr"], gameHints: ["granny"] }));
  const p3 = await call("patternSave", "adm1", pat({ label: "Backstage VOD recording", dow: 7, start: "19:00", end: "21:00", type: "backstage", platforms: undefined }));
  assert.equal(await reason(call("patternSave", "adm1", { ...pat({}), id: "nope" })), "noPattern");
  const usual = await get("public/usualWeek");
  assert.deepEqual(usual.patterns.map((p) => [p.label, p.membersOnly]), [["Monster Monday", false], ["VR night", false], ["Backstage VOD recording", true]]);
  assert.equal(usual.tz, TZ);

  const A = L.nextWeek(L.nextWeek(L.weekOf(Date.now(), TZ))), B = L.nextWeek(A);
  const monA = L.weekMonday(A), monB = L.weekMonday(B);
  assert.equal(await reason(call("exceptionSave", "adm1", { kind: "weekOff", from: "x", label: "Holiday" })), "invalid");
  const exB = await call("exceptionSave", "adm1", { kind: "weekOff", from: monB, to: L.addDays(monB, 6), label: "Week off: holiday" });
  const exPast = await call("exceptionSave", "adm1", { kind: "dayOff", from: "2020-01-01", label: "Long ago" });
  assert.deepEqual((await get("public/usualWeek")).exceptions.map((e) => e.label), ["Week off: holiday"]);   // only upcoming public ones
  await call("exceptionDelete", "adm1", { id: exPast.id });
  assert.equal(await reason(call("exceptionDelete", "adm1", { id: exPast.id })), "noException");

  // ---------- plannerTick opens the week ----------
  const dlA = L.weekDeadlines(A, L.DEFAULT_SETTINGS.deadlines, TZ);
  let r = await hooks.runTick(dlA.opensAt - 5 * MIN);
  assert.equal(r.opened, null);                                               // not yet
  assert.equal((await db.doc(`${S}/planWeeks/${A}`).get()).exists, false);
  r = await hooks.runTick(dlA.opensAt + 5 * MIN);
  assert.equal(r.opened, A);
  let wk = await get(`planWeeks/${A}`);
  assert.equal(wk.state, "open"); assert.equal(wk.weekOff, null);
  assert.equal(wk.closesAt.toMillis(), dlA.closesAt); assert.equal(wk.publishBy.toMillis(), dlA.publishBy); assert.equal(wk.opensAt.toMillis(), dlA.opensAt);
  assert.equal(wk.streamIds.length, 3);
  assert.deepEqual(wk.counts, { slots: 3, seatsOpen: 4, votes: 0 });          // two platform slots need Captain + YouTube lead; backstage needs none
  assert.equal((await hooks.runTick(dlA.opensAt + 20 * MIN)).opened, null);   // a second tick does nothing
  assert.equal((await list("planWeeks")).length, 1);                                                  // still one week
  const streams = (await list("streams")).sort((a, b) => a.plannedStart.toMillis() - b.plannedStart.toMillis());
  assert.equal(streams.length, 3);
  const [mon, wed, sun] = streams;
  assert.equal(mon.state, "planned"); assert.equal(mon.published, false); assert.equal(mon.week, A); assert.equal(mon.slug, monA);
  assert.equal(mon.plannedStart.toMillis(), at(monA, "19:00")); assert.equal(wed.plannedStart.toMillis(), at(L.addDays(monA, 2), "19:00"));
  assert.equal(wed.theme.label, "VR night"); assert.deepEqual(wed.theme.tagHints, ["vr"]);
  assert.equal(sun.type, "backstage"); assert.equal(sun.audience, "fanClub"); assert.deepEqual(sun.rooms, []);
  assert.deepEqual(wed.rooms, ["twitch", "ytLandscape", "ytVertical"]); assert.equal(wed.plannedGameCount, 2);
  const draftOf = async (id) => (await db.doc(`${S}/streams/${id}/private/draft`).get()).data();
  assert.equal((await draftOf(wed.id)).crew.captain, null);
  // The ballot: top Most wanted wishlist games and every playing game; hidden and non-wishlist games stay off.
  const ballot = await list(`planWeeks/${A}/ballot`);
  assert.deepEqual(ballot.map((b) => b.id).sort(), ["alien", "granny", "vr-one", "vr-two"]);
  assert.equal(ballot.find((b) => b.id === "alien").seededFrom, "owner"); assert.equal(ballot.find((b) => b.id === "granny").seededFrom, "mostWanted");
  assert.deepEqual(wk.ballotSlugs.slice().sort(), ["alien", "granny", "vr-one", "vr-two"]);
  // Crew availability is prefilled from their usual days (a mod with no days stays blank).
  assert.equal((await get(`streams/${wed.id}/signups/m1`)).availability, "yes");
  assert.equal((await get(`streams/${wed.id}/signups/m1`)).prefilled, true);
  assert.equal((await get(`streams/${mon.id}/signups/m4`)).availability, "no");
  assert.equal((await get(`streams/${wed.id}/signups/m4`)).availability, "yes");
  assert.equal((await db.doc(`${S}/streams/${wed.id}/signups/m2`).get()).exists, false);
  assert.equal((await db.doc(`${S}/streams/${wed.id}/signups/m3`).get()).exists, false);          // going dark: not prefilled
  // Public documents.
  const pb = await get("public/ballot");
  assert.equal(pb.week, A); assert.equal(pb.state, "open"); assert.equal(pb.closesAt, dlA.closesAt); assert.deepEqual(pb.games.map((g) => g.slug).sort(), ["alien", "granny", "vr-one", "vr-two"]);
  assert.equal(JSON.stringify(pb).includes("uid"), false);
  const sched = await get("public/schedule");
  const entry = sched.weeks.find((x) => x.week === A);
  assert.equal(entry.state, "planning"); assert.equal(entry.hero, null); assert.equal(entry.publishBy, dlA.publishBy);

  // ---------- the ballot ----------
  assert.equal(await reason(call("ballotVote", "unv", { slugs: ["granny"] }, false)), "emailNotVerified");
  assert.equal(await reason(call("ballotVote", "nobody", { slugs: ["granny"] })), "needsSignup");
  assert.equal(await reason(call("ballotVote", "fan", { slugs: ["granny", "vr-one", "vr-two", "alien"] })), "tooManyVotes");
  assert.equal(await reason(call("ballotVote", "fan", { slugs: ["granny", "granny"] })), "duplicate");
  assert.equal(await reason(call("ballotVote", "fan", { slugs: ["done"] })), "notOnBallot");
  let v = await call("ballotVote", "fan", { slugs: ["granny", "vr-one"] });
  assert.equal(v.votesLeft, 1);
  await call("ballotVote", "m4", { slugs: ["vr-one", "alien"] });                // staff vote like anyone
  assert.deepEqual((await list(`planWeeks/${A}/ballot`)).map((b) => [b.id, b.votes]).sort(), [["alien", 1], ["granny", 1], ["vr-one", 2], ["vr-two", 0]]);
  v = await call("ballotVote", "fan", { slugs: ["vr-two"] });                    // moving votes: granny and vr-one go back
  assert.deepEqual((await list(`planWeeks/${A}/ballot`)).map((b) => [b.id, b.votes]).sort(), [["alien", 1], ["granny", 0], ["vr-one", 1], ["vr-two", 1]]);
  assert.deepEqual((await get(`planWeeks/${A}/votes/fan`)).slugs, ["vr-two"]);
  await call("ballotVote", "fan", { slugs: ["granny", "vr-one"] });
  const pb2 = await get("public/ballot");
  assert.deepEqual(pb2.games.map((g) => g.slug), ["vr-one", "granny", "alien", "vr-two"]);   // vr-one 2; granny and alien 1 each: the higher Most wanted count (granny) wins the tie
  assert.equal((await get(`planWeeks/${A}`)).counts.votes, 4);
  let mine = await call("ballotMine", "fan", {});
  assert.deepEqual([mine.week, mine.open, mine.votesLeft, mine.addsLeft], [A, true, 1, 2]);
  assert.deepEqual(mine.votes.sort(), ["granny", "vr-one"]);
  assert.equal(await reason(call("ballotMine", "nobody", {})), "needsSignup");
  // Adding games: 2 a week, no hidden games, nothing already on the ballot.
  assert.equal(await reason(call("ballotAddGame", "fan", { slug: "hid" })), "noGame");
  assert.equal(await reason(call("ballotAddGame", "fan", { slug: "granny" })), "onBallot");
  assert.equal(await reason(call("ballotAddGame", "fan", { slug: "nothere" })), "noGame");
  assert.equal((await call("ballotAddGame", "fan", { slug: "extra1" })).addsLeft, 1);
  await call("ballotAddGame", "fan", { slug: "extra2" });
  assert.equal(await reason(call("ballotAddGame", "fan", { slug: "extra3" })), "addLimit");
  assert.equal((await get(`planWeeks/${A}/ballot/extra1`)).seededFrom, "member");
  assert.equal((await get(`planWeeks/${A}/ballot/extra1`)).addedBy.handle, "fan");
  assert.equal((await get("public/ballot")).games.find((g) => g.slug === "extra1").addedBy, "fan");
  assert.equal((await call("ballotAddGame", "m4", { slug: "extra3" })).addsLeft, 1);
  assert.ok((await get(`planWeeks/${A}`)).ballotSlugs.includes("extra3"));
  assert.equal((await call("ballotMine", "fan", {})).addsLeft, 0);
  // The Vault refuses to delete a game that is on a ballot taking votes.
  assert.deepEqual((await plannerRefs(db, "extra1")).ballots, [A]);
  assert.deepEqual(await plannerRefs(db, "done"), { ballots: [], slots: [] });

  // ---------- planning slots ----------
  assert.equal(await reason(call("planSlot", "m1", { week: A, date: monA, start: "10:00", end: "12:00" })), "notAdmin");
  assert.equal(await reason(call("planSlot", "adm1", { week: A, date: monA, start: "20:00", end: "23:00", plannedGameCount: 1 })), "overlap");
  assert.equal(await reason(call("planSlot", "adm1", { week: A, date: L.addDays(monB, 0), start: "10:00", end: "12:00" })), "outsideWeek");
  assert.equal(await reason(call("planSlot", "adm1", { week: "2026-W99", date: monA, start: "10:00", end: "12:00" })), "args");
  assert.equal(await reason(call("planSlot", "adm1", { week: B, date: monB, start: "10:00", end: "12:00" })), "noWeek");
  const extra = await call("planSlot", "adm1", { week: A, date: L.addDays(monA, 1), start: "20:00", end: "23:00", plannedGameCount: 1, theme: { label: "Tuesday test", icon: "T" }, rooms: ["twitch"], title: "Tuesday test" });
  assert.equal(extra.slug, L.addDays(monA, 1));
  let ed = await draftOf(extra.streamId);
  assert.equal(ed.state, "planned"); assert.deepEqual(ed.rooms, ["twitch"]); assert.deepEqual(ed.platforms, ["twitch"]); assert.equal(ed.title, "Tuesday test");
  assert.equal((await get(`streams/${extra.streamId}`)).published, false);
  await call("planSlot", "adm1", { week: A, streamId: extra.streamId, date: L.addDays(monA, 1), start: "21:00", end: "23:00", rooms: ["twitch", "tiktok"], plannedGameCount: 3 });
  ed = await draftOf(extra.streamId);
  assert.equal(ed.plannedStart.toMillis(), at(L.addDays(monA, 1), "21:00")); assert.deepEqual(Object.keys(ed.crew.chats), ["twitch", "tiktok"]); assert.equal(ed.plannedGameCount, 3);
  assert.equal((await get(`streams/${extra.streamId}`)).plannedStart.toMillis(), at(L.addDays(monA, 1), "21:00"));       // unpublished: the top-level mirrors the draft
  assert.equal(await reason(call("planSlot", "adm1", { week: A, remove: true, streamId: extra.streamId })), "ok");
  assert.equal((await db.doc(`${S}/streams/${extra.streamId}`).get()).exists, false);
  assert.equal((await db.doc(`${S}/streams/${extra.streamId}/private/draft`).get()).exists, false);
  assert.equal((await get(`planWeeks/${A}`)).counts.slots, 3);

  // ---------- crew: availability, seats, game requests ----------
  assert.equal(await reason(call("crewAvailability", "fan", { streamId: wed.id, availability: "yes" })), "notCrew");
  assert.equal(await reason(call("crewAvailability", "m3", { streamId: wed.id, availability: "yes" })), "notCrew");          // going dark
  assert.equal(await reason(call("crewAvailability", "m1", { streamId: wed.id, availability: "perhaps" })), "args");
  assert.equal((await call("crewAvailability", "m2", { streamId: wed.id, availability: "yes" })).availability, "yes");
  assert.equal((await get(`streams/${wed.id}/signups/m2`)).prefilled, false);
  // seats follow Mod Machina 6a
  assert.equal(await reason(call("dutySignUp", "m2", { streamId: wed.id, seats: [{ room: "twitch", role: "lead" }] })), "gradeTooLow");
  assert.equal(await reason(call("dutySignUp", "m2", { streamId: wed.id, seats: [{ role: "captain" }] })), "gradeTooLow");
  assert.equal(await reason(call("dutySignUp", "m2", { streamId: wed.id, seats: [{ room: "tiktok", role: "deckhand" }] })), "roomOff");
  assert.equal(await reason(call("dutySignUp", "m5", { streamId: wed.id, seats: [{ room: "twitch", role: "lead" }] })), "leadBlocked");
  assert.equal(await reason(call("dutySignUp", "m5", { streamId: wed.id, seats: [{ room: "twitch", role: "deckhand" }] })), "ok");   // a strike blocks Lead and Captain only
  assert.equal(await reason(call("dutySignUp", "m3", { streamId: wed.id, seats: [{ room: "twitch", role: "deckhand" }] })), "notCrew");
  assert.equal(await reason(call("dutySignUp", "fan", { streamId: wed.id, seats: [{ room: "twitch", role: "deckhand" }] })), "notCrew");
  assert.equal(await reason(call("dutySignUp", "m2", { streamId: wed.id, seats: [] })), "args");
  assert.equal(await reason(call("dutySignUp", "m2", { streamId: wed.id, seats: [{ room: "twitch", role: "deckhand" }, { room: "twitch", role: "deckhand" }] })), "args");
  let su = await call("dutySignUp", "m2", { streamId: wed.id, seats: [{ room: "twitch", role: "deckhand" }] });
  assert.deepEqual(su.seats, [{ room: "twitch", role: "deckhand", status: "requested" }]);
  await call("dutySignUp", "m1", { streamId: wed.id, seats: [{ role: "captain" }, { room: "ytLandscape", role: "lead" }, { room: "ytVertical", role: "lead" }] });
  const m4su = await call("dutySignUp", "m4", { streamId: wed.id, seats: [{ role: "captain" }] });
  assert.equal(m4su.seats[0].needsOwnerOk, true);                                // a Watcher may ask for Captain; the owner has to OK it
  // confirming: the Captain or an admin or the owner
  assert.equal(await reason(call("dutyConfirm", "m2", { streamId: wed.id, uid: "m2", seat: { room: "twitch", role: "deckhand" } })), "notAllowed");
  assert.equal(await reason(call("dutyConfirm", "adm0", { streamId: wed.id, uid: "m1", seat: { role: "captain" } })), "ok");        // A1 Steward can confirm crew
  assert.equal((await draftOf(wed.id)).crew.captain.uid, "m1");
  assert.equal(await reason(call("dutyConfirm", "adm0", { streamId: wed.id, uid: "m4", seat: { role: "captain" } })), "needsOwner");   // a Watcher as Captain needs the owner
  assert.equal(await reason(call("dutyConfirm", "m1", { streamId: wed.id, uid: "m1", seat: { role: "captain" } })), "notRequested");   // already confirmed
  assert.equal(await reason(call("dutyConfirm", "m1", { streamId: wed.id, uid: "m2", seat: { room: "twitch", role: "deckhand" } })), "ok");   // the Captain confirms
  assert.equal(await reason(call("dutyConfirm", "m1", { streamId: wed.id, uid: "m1", seat: { room: "ytLandscape", role: "lead" } })), "ok");
  assert.equal(await reason(call("dutyConfirm", "m1", { streamId: wed.id, uid: "m1", seat: { room: "ytVertical", role: "lead" } })), "ok");   // one lead covers both YouTube rooms
  assert.equal(await reason(call("dutyConfirm", "boss", { streamId: wed.id, uid: "m4", seat: { role: "captain" } })), "seatTaken");        // owner OK, but the seat is filled
  assert.equal(await reason(call("dutyConfirm", "m1", { streamId: wed.id, uid: "m5", seat: { room: "twitch", role: "deckhand" } })), "ok");
  let dr = await draftOf(wed.id);
  assert.deepEqual(L.publicCrew(dr.crew), { captain: "m1", chats: { twitch: { lead: null, deckhands: ["m2", "m5"] }, ytLandscape: { lead: "m1", deckhands: [] }, ytVertical: { lead: "m1", deckhands: [] } }, caps: { deckhands: 2 } });
  assert.deepEqual((await get(`planWeeks/${A}`)).counts, { slots: 3, seatsOpen: 2, votes: 4 + 0 });
  // game requests: availability yes and a requested seat, one per mod per slot
  assert.equal(await reason(call("modGameRequest", "m4", { streamId: mon.id, gameSlug: "granny" })), "needsAvailability");     // no sign-up row marked yes yet there (prefilled no)
  assert.equal(await reason(call("modGameRequest", "m2", { streamId: sun.id, gameSlug: "granny" })), "needsAvailability");
  await call("crewAvailability", "m2", { streamId: sun.id, availability: "yes" });
  assert.equal(await reason(call("modGameRequest", "m2", { streamId: sun.id, gameSlug: "granny" })), "needsSeat");
  assert.equal(await reason(call("modGameRequest", "m1", { streamId: wed.id, gameSlug: "hid" })), "noGame");
  assert.equal(await reason(call("modGameRequest", "m1", { streamId: wed.id, gameSlug: "granny", note: "x".repeat(141) })), "noteTooLong");
  await call("modGameRequest", "m1", { streamId: wed.id, gameSlug: "vr-two", note: "VR please" });
  assert.equal((await call("modGameRequest", "m1", { streamId: wed.id, gameSlug: "granny", note: "Scary one" })).gameRequest.gameSlug, "granny");   // replaces: one per mod per slot
  assert.deepEqual((await get(`streams/${wed.id}/signups/m1`)).gameRequest, { gameSlug: "granny", note: "Scary one", status: "open" });
  // the unavailable mod loses pending requests
  await call("dutySignUp", "m2", { streamId: mon.id, seats: [{ room: "twitch", role: "deckhand" }] });
  await call("crewAvailability", "m2", { streamId: mon.id, availability: "no" });
  assert.equal((await get(`streams/${mon.id}/signups/m2`)).seats[0].status, "dropped");
  assert.equal(await reason(call("dutySignUp", "m2", { streamId: mon.id, seats: [{ room: "twitch", role: "deckhand" }] })), "unavailable");

  // ---------- planGames and the tray ----------
  assert.equal(await reason(call("planTray", "m1", { streamId: wed.id })), "notAdmin");
  let tray = await call("planTray", "adm1", { streamId: wed.id });
  assert.deepEqual(tray.groups.map((g) => g.id), ["modRequests", "votes", "theme", "picks"]);
  assert.deepEqual(tray.groups[0].items.map((i) => [i.slug, i.byHandle, i.seat]), [["granny", "m1", "Captain, confirmed"]]);
  assert.deepEqual(tray.groups[1].items.map((i) => i.slug), ["vr-one", "alien", "vr-two", "extra1", "extra2", "extra3"]);   // by votes (granny sits in the mod requests group); zero-vote ties end up by Most wanted then newest
  assert.equal(tray.groups[1].items[0].slug, "vr-one"); assert.equal(tray.groups[1].items[0].fitsTheme, true);
  assert.ok(!JSON.stringify(tray).includes("\"hid\""));
  assert.equal(await reason(call("planGames", "adm1", { streamId: wed.id, slugs: ["granny", "vr-one", "alien"] })), "tooManyGames");
  assert.equal(await reason(call("planGames", "adm1", { streamId: wed.id, slugs: ["hid"] })), "noGame");
  assert.equal(await reason(call("planGames", "adm1", { streamId: wed.id, slugs: ["granny", "granny"] })), "args");
  const pg = await call("planGames", "adm1", { streamId: wed.id, slugs: ["granny", "vr-one"] });
  assert.deepEqual(pg.plannedGames.map((g) => [g.gameId, g.order, g.source.kind]), [["granny", 0, "modRequest"], ["vr-one", 1, "ballot"]]);
  assert.equal(pg.plannedGames[0].source.byHandle, "m1"); assert.equal(pg.plannedGames[1].source.votes, 2);
  assert.equal((await get(`streams/${wed.id}/signups/m1`)).gameRequest.status, "planned");         // heads-up for the mod
  assert.deepEqual((await draftOf(wed.id)).plannedGameIds, ["granny", "vr-one"]);
  assert.deepEqual((await get(`streams/${wed.id}`)).plannedGameIds, ["granny", "vr-one"]);         // never published: mirrored
  await call("planGames", "adm1", { streamId: wed.id, slugs: ["vr-one", "alien"] });
  assert.equal((await get(`streams/${wed.id}/signups/m1`)).gameRequest.status, "open");           // left out: back to open
  assert.equal((await draftOf(wed.id)).plannedGames[1].source.kind, "ballot");                    // alien has one vote
  tray = await call("planTray", "adm1", { streamId: mon.id });
  assert.deepEqual(tray.groups[1].items.filter((i) => i.alsoOn.length).map((i) => [i.slug, i.alsoOn]), [["vr-one", ["Wed"]], ["alien", ["Wed"]]]);   // already planned on Wednesday
  await call("planGames", "adm1", { streamId: wed.id, slugs: ["granny", "vr-one"] });
  await call("planGames", "adm1", { streamId: mon.id, slugs: ["alien"] });
  assert.deepEqual((await plannerRefs(db, "alien")).slots, [mon.id]);                                     // the Vault will refuse to delete it
  // ---------- closing, reopening, the nudge ----------
  assert.equal((await hooks.runTick(dlA.closesAt - MIN)).closed.length, 0);
  r = await hooks.runTick(dlA.closesAt + MIN);
  assert.deepEqual(r.closed, [A]);
  assert.equal((await get(`planWeeks/${A}`)).state, "closed");
  assert.equal((await get("public/ballot")).state, "closed");
  assert.equal(await reason(call("ballotVote", "fan", { slugs: ["granny"] })), "closed");
  assert.equal(await reason(call("ballotAddGame", "m4", { slug: "done" })), "closed");
  assert.equal(await reason(call("crewAvailability", "m1", { streamId: wed.id, availability: "maybe" })), "closed");
  assert.equal(await reason(call("modGameRequest", "m1", { streamId: wed.id, gameSlug: "vr-one" })), "closed");
  assert.equal(await reason(call("dutySignUp", "m4", { streamId: mon.id, seats: [{ room: "twitch", role: "deckhand" }] })), "unavailable");   // seat sign-ups stay open after Close (m4 is "no" on Monday)
  assert.equal(await reason(call("dutySignUp", "m4", { streamId: wed.id, seats: [{ room: "twitch", role: "lead" }] })), "ok");
  assert.equal(await reason(call("weekReopen", "adm1", { week: A })), "notOwner");
  assert.equal(await reason(call("weekReopen", "boss", { week: A, closesAt: Date.now() - 1000 })), "closeInPast");
  await call("weekReopen", "boss", { week: A, closesAt: Date.now() + 3 * 86400000 });
  assert.equal((await get(`planWeeks/${A}`)).state, "open");
  assert.equal(await reason(call("ballotVote", "fan", { slugs: ["granny"] })), "ok");
  assert.ok((await db.collection("adminLog").get()).docs.some((d) => d.get("action") === "reopen"));
  assert.equal(await reason(call("weekOpen", "boss", { week: A })), "exists");
  assert.equal(await reason(call("weekOpen", "adm1", { week: B })), "notOwner");
  // nudge: past "publish by" with the week still unpublished: a to-do on /admin
  r = await hooks.runTick(dlA.publishBy + MIN);
  assert.deepEqual(r.nudged, [A]);
  assert.equal((await get(`planner/main/todos/publish_${A}`)).text, `Week not published: ${A}`);
  assert.deepEqual((await hooks.runTick(dlA.publishBy + 20 * MIN)).nudged, []);                  // once
  // A week off opens empty with its label and no ballot (tick for week B after A's Monday).
  r = await hooks.runTick(L.weekDeadlines(B, L.DEFAULT_SETTINGS.deadlines, TZ).opensAt + MIN);
  assert.equal(r.opened, B);
  const wkB = await get(`planWeeks/${B}`);
  assert.deepEqual(wkB.weekOff, { label: "Week off: holiday", public: true, exceptionId: exB.id }); assert.deepEqual(wkB.streamIds, []); assert.equal((await list(`planWeeks/${B}/ballot`)).length, 0);
  assert.equal((await get("public/schedule")).weeks.find((x) => x.week === B).weekOff.label, "Week off: holiday");
  assert.equal((await get("public/ballot")).week, A);                                             // the ballot stays on the week that has one
  assert.equal(await reason(call("ballotVote", "fan", { week: B, slugs: ["granny"] })), "closed");

  // ---------- publish ----------
  assert.equal(await reason(call("publishWeek", "adm1", { week: A })), "notOwner");
  const chk = await call("publishWeek", "boss", { week: A, check: true });
  assert.equal(chk.check, true); assert.deepEqual(chk.hero, { frame: "bulbs", doors: "jaws" });
  assert.ok(chk.warnings.some((x) => x.kind === "noGames" && x.streamId === sun.id));
  assert.ok(chk.warnings.some((x) => x.kind === "minCrew" && x.streamId === mon.id));
  assert.equal((await get(`planWeeks/${A}`)).state, "closed");                                    // a check writes nothing
  assert.equal(await reason(call("publishWeek", "boss", { week: A, hero: { frame: "disco", doors: "jaws" } })), "invalid");
  await db.doc(`${S}/planWeeks/${B}`).update({ hero: null });
  const pubd = await call("publishWeek", "boss", { week: A, hero: { frame: "surprise", doors: "surprise" } });
  assert.equal(pubd.published, 3); assert.equal(pubd.publishedRev, 1); assert.equal(pubd.changed, 3);
  assert.ok(L.FRAME_POOL.includes(pubd.hero.frame) && L.DOOR_STYLES.includes(pubd.hero.doors));
  wk = await get(`planWeeks/${A}`);
  assert.equal(wk.state, "published"); assert.equal(wk.publishedRev, 1); assert.deepEqual(wk.hero, pubd.hero); assert.equal(wk.hasUnpublishedChanges, false);
  assert.ok(wk.earlySignupUntil.toMillis() > Date.now() + 47 * 3600000);
  assert.equal((await db.doc(`${S}/planner/main/todos/publish_${A}`).get()).exists, false);          // the nudge is cleared
  const pubWed = await get(`streams/${wed.id}`);
  assert.equal(pubWed.published, true); assert.equal(pubWed.state, "scheduled"); assert.equal(pubWed.rev, 1);
  assert.equal(pubWed.crew.captain, "m1");                                                           // handles in the public doc
  assert.equal(JSON.stringify(pubWed).includes("\"uid\""), false);
  assert.deepEqual(pubWed.plannedGameIds, ["granny", "vr-one"]);
  assert.equal((await draftOf(wed.id)).crew.captain.uid, "m1");                                      // uids stay in the draft
  const ev = (await db.collection("activityLog").get()).docs.map((d) => d.data());
  assert.ok(ev.some((e) => e.feature === "schedule" && e.type === "week-published" && e.summary === "Next week's schedule is up: 3 streams"));
  let outbox = await list("notifyOutbox");
  const wp = outbox.filter((o) => o.type === "week-published");
  assert.equal(wp.length, 1); assert.equal(wp[0].audience, "members"); assert.equal(wp[0].status, "pending"); assert.equal(wp[0].week, A);
  assert.ok(wp[0].expireAt.toMillis() > Date.now() + 29 * 86400000 && wp[0].expireAt.toMillis() < Date.now() + 31 * 86400000);   // 30-day TTL field
  assert.equal((await get("public/ballot")).state, "closed");                                        // publishing before Close closes the ballot
  assert.equal((await get(`planWeeks/${A}`)).closedEarly, true);
  assert.equal((await get("public/schedule")).weeks.find((x) => x.week === A).state, "published");
  assert.deepEqual((await get("public/schedule")).weeks.find((x) => x.week === A).hero, pubd.hero);
  assert.ok((await db.collection("adminLog").get()).docs.some((d) => d.get("action") === "publish" && d.get("details").streams === 3));
  assert.equal(await reason(call("publishWeek", "boss", { week: A })), "nothingToPublish");
  assert.equal(await reason(call("ballotVote", "fan", { slugs: ["granny"] })), "closed");
  // the early sign-up window: +3 Gears for the first seat request within 48 hours of publishing
  const g0 = (await db.collection(`${S}/crew/main/gears`).get()).docs.length;
  su = await call("dutySignUp", "m5", { streamId: sun.id, seats: [{ role: "captain" }] }).catch((e) => e.details?.reason);
  assert.equal(su, "leadBlocked");
  su = await call("dutySignUp", "m1", { streamId: sun.id, seats: [{ room: "twitch", role: "deckhand" }] }).catch((e) => e.details?.reason);
  assert.equal(su, "roomOff");                                                                        // backstage has no rooms; only the Captain seat
  su = await call("dutySignUp", "m1", { streamId: sun.id, seats: [{ role: "captain" }] });
  assert.equal(su.earlyGears, true);
  assert.equal((await db.collection(`${S}/crew/main/gears`).get()).docs.length, g0 + 1);
  const gl = (await db.collection(`${S}/crew/main/gears`).get()).docs.map((d) => d.data()).find((x) => x.source === "earlySignup");
  assert.deepEqual([gl.uid, gl.amount, gl.ref], ["m1", 3, sun.id]);
  su = await call("dutySignUp", "m1", { streamId: sun.id, seats: [{ role: "captain" }] });          // a second request pays nothing
  assert.equal(su.earlyGears, false);

  // ---------- changes after publishing: Publish changes ----------
  await call("planGames", "adm1", { streamId: wed.id, slugs: ["vr-one", "granny"] });                // reorder: draft only
  assert.equal((await get(`planWeeks/${A}`)).hasUnpublishedChanges, true);
  assert.equal((await get(`streams/${wed.id}`)).hasUnpublishedChanges, true);
  assert.deepEqual((await get(`streams/${wed.id}`)).plannedGameIds, ["granny", "vr-one"]);          // the public doc still shows the published order
  assert.deepEqual((await draftOf(wed.id)).plannedGameIds, ["vr-one", "granny"]);
  const again = await call("publishWeek", "boss", { week: A });
  assert.equal(again.changed, 1); assert.equal(again.publishedRev, 2);
  assert.deepEqual((await get(`streams/${wed.id}`)).plannedGameIds, ["vr-one", "granny"]);
  assert.equal((await list("notifyOutbox")).filter((o) => o.type === "week-published").length, 2);
  assert.equal((await db.collection("activityLog").get()).docs.filter((d) => d.get("type") === "week-published").length, 1);   // the activity event is for the first publish
  assert.equal((await get(`planWeeks/${A}`)).hasUnpublishedChanges, false);
  // a hero change alone can be published
  const heroNow = (await get(`planWeeks/${A}`)).hero;
  const newFrame = L.FRAME_POOL.find((f) => f !== heroNow.frame);
  const h2 = await call("publishWeek", "boss", { week: A, hero: { frame: newFrame, doors: heroNow.doors } });
  assert.equal(h2.changed, 0); assert.equal((await get(`planWeeks/${A}`)).hero.frame, newFrame);
  assert.equal((await list("notifyOutbox")).filter((o) => o.type === "week-published").length, 2);   // nothing changed for viewers: no notification

  // ---------- delay and cancel ----------
  assert.equal(await reason(call("delayStream", "adm0", { streamId: mon.id, date: monA, start: "21:00" })), "notAllowed");   // A1 Steward: no
  assert.equal(await reason(call("delayStream", "m1", { streamId: mon.id, date: monA, start: "21:00" })), "notAllowed");
  assert.equal(await reason(call("cancelStream", "adm0", { streamId: mon.id })), "notAllowed");
  const tue = await call("planSlot", "adm1", { week: A, date: monA, start: "22:30", end: "23:30", plannedGameCount: 1, theme: { label: "Late" }, rooms: ["twitch"] });
  assert.equal(await reason(call("delayStream", "adm1", { streamId: mon.id, date: monA, start: "21:30" })), "overlap");          // 21:30-00:30 hits the 22:30 slot
  assert.equal(await reason(call("delayStream", "adm1", { streamId: mon.id, date: monA, start: "19:00", end: "22:00" })), "noChange");
  await call("planSlot", "adm1", { week: A, streamId: tue.streamId, remove: true });          // a planned (never published) slot is simply removed
  assert.equal(await reason(call("planSlot", "adm1", { week: A, streamId: mon.id, remove: true })), "cancelInstead");
  const dl1 = await call("delayStream", "adm1", { streamId: mon.id, date: monA, start: "20:00", reason: "Tech problems" });
  assert.equal(dl1.plannedStart, at(monA, "20:00")); assert.equal(dl1.plannedEnd, at(monA, "23:00")); assert.equal(dl1.delayCount, 1);   // same length by default
  assert.equal((await get(`streams/${mon.id}`)).plannedStart.toMillis(), at(monA, "20:00"));          // takes effect at once: no re-publish
  const dm = await get(`streams/${mon.id}`);
  assert.equal(dm.delay.count, 1); assert.equal(dm.delay.originalStart.toMillis(), at(monA, "19:00")); assert.equal(dm.delay.reason, "Tech problems"); assert.equal(dm.delay.by, "@adm1");
  assert.equal(await reason(call("delayStream", "adm1", { streamId: mon.id, date: monA, start: "20:30", end: "22:30" })), "ok");
  assert.equal((await get(`streams/${mon.id}`)).delay.count, 2); assert.equal((await get(`streams/${mon.id}`)).delay.originalStart.toMillis(), at(monA, "19:00"));   // originalStart stays the first time
  outbox = await list("notifyOutbox");
  assert.ok(outbox.some((o) => o.type === "stream-delayed" && o.audience === "members" && o.payload.title.includes("moved to 8:30 PM")));
  assert.ok((await db.collection("activityLog").get()).docs.some((d) => d.get("type") === "stream-delayed"));
  // crew seats stay after a delay and are asked "still on?"
  await call("delayStream", "adm1", { streamId: wed.id, date: L.addDays(monA, 2), start: "20:00", reason: "Later tonight" });
  assert.equal((await draftOf(wed.id)).crew.captain.uid, "m1");
  assert.deepEqual((await get(`streams/${wed.id}/signups/m1`)).reconfirm, { count: 1, needed: true });
  assert.equal(await reason(call("dutyKeep", "m1", { streamId: wed.id })), "ok");
  assert.equal((await get(`streams/${wed.id}/signups/m1`)).reconfirm, undefined);
  // cancel: seats released, games leave the plan, notices written; a started stream can't be moved or cancelled
  await db.doc(`${S}/streams/${sun.id}`).update({ actualStart: T.now() });
  assert.equal(await reason(call("cancelStream", "boss", { streamId: sun.id })), "started");
  assert.equal(await reason(call("delayStream", "boss", { streamId: sun.id, date: L.addDays(monA, 6), start: "20:00" })), "started");
  await db.doc(`${S}/streams/${sun.id}`).update({ actualStart: admin.firestore.FieldValue.delete() });
  assert.equal(await reason(call("cancelStream", "boss", { streamId: wed.id, reason: "Sick" })), "ok");
  const cw = await get(`streams/${wed.id}`);
  assert.equal(cw.state, "cancelled"); assert.equal(cw.cancel.reason, "Sick"); assert.equal(cw.cancel.by, "@boss"); assert.equal(cw.crew.captain, null); assert.deepEqual(cw.plannedGameIds, []);
  assert.equal(cw.plannedGames.length, 2);                                                           // kept as a record
  assert.equal((await draftOf(wed.id)).crew.captain, null);
  assert.ok((await get(`streams/${wed.id}/signups/m1`)).seats.every((s) => s.status === "dropped"));
  assert.ok((await list("notifyOutbox")).some((o) => o.type === "stream-cancelled" && o.audience === "members"));
  assert.ok((await list("notifyOutbox")).some((o) => o.type === "stream-cancelled" && o.audience === "uids" && o.uids.includes("m1")));
  assert.ok((await db.collection("activityLog").get()).docs.some((d) => d.get("type") === "stream-cancelled"));
  assert.equal(await reason(call("cancelStream", "boss", { streamId: wed.id })), "badState");
  assert.deepEqual((await plannerRefs(db, "granny")).slots, []);                                     // a cancelled slot no longer holds the game
  assert.equal((await get(`planWeeks/${A}`)).counts.slots, 2);                                         // a cancelled stream no longer counts as a slot

  // ---------- reminders (24 h and 1 h), once each ----------
  // use the Monday stream: give it a confirmed Deckhand then walk the clock.
  await call("dutySignUp", "m2", { streamId: mon.id, seats: [{ room: "twitch", role: "deckhand" }] }).catch(() => {});
  await call("crewAvailability", "m2", { streamId: mon.id, availability: "yes" }).catch(() => {});
  await db.doc(`${S}/planWeeks/${A}`).update({ state: "published" });
  await db.doc(`${S}/streams/${mon.id}/signups/m2`).update({ availability: "yes" });
  await call("dutySignUp", "m2", { streamId: mon.id, seats: [{ room: "twitch", role: "deckhand" }] });
  await call("dutySignUp", "m1", { streamId: mon.id, seats: [{ role: "captain" }] });
  await call("dutyConfirm", "boss", { streamId: mon.id, uid: "m1", seat: { role: "captain" } });
  await call("dutyConfirm", "m1", { streamId: mon.id, uid: "m2", seat: { room: "twitch", role: "deckhand" } });
  const monStart = (await get(`streams/${mon.id}`)).plannedStart.toMillis();
  assert.equal((await hooks.runTick(monStart - 25 * 3600000)).reminders, 0);
  r = await hooks.runTick(monStart - 23 * 3600000);
  assert.equal(r.reminders, 2);
  assert.deepEqual((await list("notifyOutbox")).filter((o) => o.type === "crew-reminder-24h").map((o) => o.uids[0]).sort(), ["m1", "m2"]);
  assert.equal((await hooks.runTick(monStart - 22 * 3600000)).reminders, 0);                         // the same reminder is never written twice
  r = await hooks.runTick(monStart - 30 * MIN);
  assert.equal(r.reminders, 2);
  assert.equal((await list("notifyOutbox")).filter((o) => o.type === "crew-reminder-1h").length, 2);
  assert.equal((await hooks.runTick(monStart + MIN)).reminders, 0);                                  // started: no more

  // ---------- a mod who loses Active status loses the seats ----------
  await db.doc(`${S}/crew/main/roster/m2`).update({ status: "alumni" });
  r = await hooks.runTick(monStart - 3 * 3600000);
  assert.equal(r.released, 1);
  assert.deepEqual(L.publicCrew(await (async () => (await draftOf(mon.id)).crew)()).chats.twitch.deckhands, []);
  assert.equal((await get(`streams/${mon.id}`)).crew.chats.twitch.deckhands.length, 0);
  assert.ok((await get(`planner/main/todos/seat_${mon.id}_m2`)).text.includes("@m2"));
  assert.equal((await get(`streams/${mon.id}/signups/m2`)).seats.every((s) => s.status !== "confirmed"), true);
  assert.equal((await draftOf(mon.id)).crew.captain.uid, "m1");                                      // the rest of the crew stays
  assert.equal((await hooks.runTick(monStart - 2 * 3600000)).released, 0);

  // ---------- hidden games leave the ballot, votes returned ----------
  await db.doc(`${S}/planWeeks/${B}`).update({ weekOff: null });                                     // give B a ballot to prune
  await db.doc(`${S}/planWeeks/${B}`).update({ state: "open", ballotSlugs: ["granny", "vr-one"], publishBy: T.fromMillis(Date.now() + 9e11) });
  await db.doc(`${S}/planWeeks/${B}/ballot/granny`).set({ votes: 1, seededFrom: "mostWanted" });
  await db.doc(`${S}/planWeeks/${B}/ballot/vr-one`).set({ votes: 1, seededFrom: "mostWanted" });
  await db.doc(`${S}/planWeeks/${B}/votes/fan`).set({ slugs: ["granny", "vr-one"] });
  await db.doc(`${S}/vaultGames/granny`).update({ hidden: true });
  r = await hooks.runTick(monStart - 3600000);
  assert.equal(r.pruned, 1);
  assert.equal((await db.doc(`${S}/planWeeks/${B}/ballot/granny`).get()).exists, false);
  assert.deepEqual((await get(`planWeeks/${B}/votes/fan`)).slugs, ["vr-one"]);
  assert.deepEqual((await get(`planWeeks/${B}`)).ballotSlugs, ["vr-one"]);

  // ---------- no time zone: the planner stops instead of guessing ----------
  await db.doc(S).update({ timezone: admin.firestore.FieldValue.delete() });
  assert.equal(await reason(call("planSlot", "adm1", { week: A, date: monA, start: "10:00", end: "11:00" })), "noTimezone");
  assert.equal(await reason(hooks.runTick(Date.now())), "noTimezone");
  await db.doc(S).update({ timezone: TZ });
};
