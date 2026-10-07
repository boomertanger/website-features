// Scream Planner, the weekly ballot (docs/specs/scream-planner.md section 4e): members vote (3 a week) and add
// Vault games (2 a week) while the open week is taking votes. Counts live in planWeeks/{week}/ballot/{slug}
// (server only); each member's own picks in planWeeks/{week}/votes/{uid} (no client read; ballotMine returns them).
const { onCall } = require("firebase-functions/v2/https");
const L = require("./logic");
const { P, fail, ms } = require("./core");
const { callerInfo, requireVerifiedMember } = require("../vault/common");

module.exports = function ballotFns({ core }) {
  const { db, FieldValue } = core;

  /** The week a ballot call is about: the one named, else the newest open week. */
  async function targetWeek(week) {
    const wk = week ? await core.loadWeek(week) : await core.openWeekDoc();
    if (!wk) throw fail("failed-precondition", "No ballot is open right now.", "closed");
    return wk;
  }
  const isOpen = (wk) => !wk.weekOff && wk.state === "open" && Date.now() < ms(wk.closesAt);
  const needOpen = (wk) => { if (!isOpen(wk)) throw fail("failed-precondition", "Voting is closed for that week.", "closed", { week: wk.id }); };

  const ballotVote = onCall(async (request) => {
    const c = requireVerifiedMember(await callerInfo(request));
    const wk = await targetWeek(request.data?.week);
    needOpen(wk);
    const settings = await core.loadSettings();
    const rows = (await db.collection(P.ballot(wk.id)).get()).docs;
    const check = L.checkVotes(request.data?.slugs, rows.map((r) => r.id), settings.defaults.votesPerMember);
    if (!check.ok) throw fail("failed-precondition", ({ args: "slugs must be a list of games.", duplicate: "One vote per game.", tooManyVotes: `You have ${settings.defaults.votesPerMember} votes a week.`, notOnBallot: "That game isn't on the ballot." })[check.reason], check.reason);
    const vref = db.doc(`${P.votes(wk.id)}/${c.uid}`);
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(vref);
      const before = cur.exists ? cur.get("slugs") || [] : [];
      const deltas = L.voteDeltas(before, check.slugs);
      const refs = Object.keys(deltas).map((s) => db.doc(`${P.ballot(wk.id)}/${s}`));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      snaps.forEach((snap, i) => {
        if (!snap.exists) return;
        const slug = refs[i].id, d = deltas[slug];
        tx.update(refs[i], { votes: Math.max(0, (snap.get("votes") || 0) + d), ...(d > 0 ? { lastVoteAt: FieldValue.serverTimestamp() } : {}) });
      });
      tx.set(vref, { slugs: check.slugs, updatedAt: FieldValue.serverTimestamp() });
    });
    await core.rebuildPublicBallot();
    await core.refreshCounts(wk.id);
    return { ok: true, week: wk.id, slugs: check.slugs, votesLeft: settings.defaults.votesPerMember - check.slugs.length };
  });

  const ballotAddGame = onCall(async (request) => {
    const c = requireVerifiedMember(await callerInfo(request));
    const wk = await targetWeek(request.data?.week);
    needOpen(wk);
    const slug = request.data?.slug;
    if (typeof slug !== "string" || !slug) throw fail("invalid-argument", "slug is required.", "args");
    const settings = await core.loadSettings();
    const g = await db.doc(`${P.games}/${slug}`).get();
    if (!g.exists || g.get("hidden") === true) throw fail("not-found", "That game isn't in the Vault.", "noGame");
    const rows = (await db.collection(P.ballot(wk.id)).get()).docs;
    if (rows.some((r) => r.id === slug)) throw fail("already-exists", "That game is already on the ballot.", "onBallot");
    const mine = rows.filter((r) => r.get("addedByUid") === c.uid).length;
    if (mine >= settings.defaults.ballotAddsPerMember) throw fail("resource-exhausted", `You can add ${settings.defaults.ballotAddsPerMember} games a week.`, "addLimit", { limit: settings.defaults.ballotAddsPerMember });
    try {
      await db.doc(`${P.ballot(wk.id)}/${slug}`).create({ votes: 0, seededFrom: "member", addedBy: { handle: c.handle }, addedByUid: c.uid, createdAt: FieldValue.serverTimestamp() });
    } catch (err) { if (err.code === 6 || /ALREADY_EXISTS/.test(String(err.message))) throw fail("already-exists", "That game is already on the ballot.", "onBallot"); throw err; }
    await db.doc(P.week(wk.id)).update({ ballotSlugs: [...rows.map((r) => r.id), slug] });
    await core.rebuildPublicBallot();
    return { ok: true, week: wk.id, slug, addsLeft: settings.defaults.ballotAddsPerMember - mine - 1 };
  });

  const ballotMine = onCall(async (request) => {
    const c = await callerInfo(request);
    if (!c.member) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    const wk = request.data?.week ? await core.loadWeek(request.data.week) : (await core.openWeekDoc());
    const settings = await core.loadSettings();
    if (!wk) return { week: null, open: false, votes: [], adds: [], votesLeft: settings.defaults.votesPerMember, addsLeft: settings.defaults.ballotAddsPerMember };
    const [v, rows] = await Promise.all([db.doc(`${P.votes(wk.id)}/${c.uid}`).get(), db.collection(P.ballot(wk.id)).get()]);
    const votes = v.exists ? v.get("slugs") || [] : [];
    const adds = rows.docs.filter((r) => r.get("addedByUid") === c.uid).map((r) => r.id);
    return { week: wk.id, open: isOpen(wk), closesAt: ms(wk.closesAt), votes, adds, votesLeft: Math.max(0, settings.defaults.votesPerMember - votes.length), addsLeft: Math.max(0, settings.defaults.ballotAddsPerMember - adds.length) };
  });

  /**
   * Hidden or deleted Vault games drop off the ballot and their votes are returned (section 4e). Run by plannerTick
   * for every week still taking votes. Returns how many games were pruned.
   */
  async function pruneBallot(week) {
    const rows = (await db.collection(P.ballot(week)).get()).docs;
    if (!rows.length) return 0;
    const games = await core.getAll(rows.map((r) => db.doc(`${P.games}/${r.id}`)));
    const gone = rows.filter((r, i) => !games[i].exists || games[i].get("hidden") === true).map((r) => r.id);
    if (!gone.length) return 0;
    for (const slug of gone) await db.doc(`${P.ballot(week)}/${slug}`).delete();
    for (const v of (await db.collection(P.votes(week)).get()).docs) {
      const slugs = v.get("slugs") || [];
      if (slugs.some((s) => gone.includes(s))) await v.ref.update({ slugs: slugs.filter((s) => !gone.includes(s)), updatedAt: FieldValue.serverTimestamp() });
    }
    await db.doc(P.week(week)).update({ ballotSlugs: rows.map((r) => r.id).filter((s) => !gone.includes(s)) });
    await core.refreshCounts(week);
    return gone.length;
  }

  return { functions: { ballotVote, ballotAddGame, ballotMine }, pruneBallot };
};
