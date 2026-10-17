// Boomertang (docs/specs/boomertang.md §5): the magazine's two callables. Everything under sites/boomertanger/tang/main is written ONLY by
// these functions and by scripts/seed-boomertang.js (Admin SDK); firestore.rules gives clients the reads §3 allows and no writes.
//
//   tangAdmin  the owner      { action: "publish", issueId }               draft -> published; currentIssueId follows the newest published issue;
//                                                                          one activityLog entry (feature "boomertang", type "tang-issue")
//                             { action: "setAccess", issueId, access }     public | members; refused for an issue whose text is in the repo
//                             { action: "addEdition", issueId, note }      a 1-120 character note, dated today in Central
//                             { action: "poll", pollId, op }               open | close | reopen (a closed poll's result is the final verdict)
//   tangVote   members        { pollId, optionId }                         one vote per poll, changeable while it's open; one transaction moves
//                                                                          counts; rate-limited like other member writes
//                             { issueId, mine: true }                      the caller's own votes in an issue's polls (votes are server-only)
//
// Data: tang/main { currentIssueId }, tang/main/issues/{issueId} { vol, no, title, status, access, textInRepo, publishedAt, editions },
// tang/main/issues/{issueId}/pages/{slug} { body } (members-only text, seeded), tang/main/polls/{pollId} { issueId, question, options,
// counts, open, closesAt, closedAt }, tang/main/pollVotes/{pollId}_{uid} { optionId, at } (server only). adminLog feature "boomertang".
//
// This module must not load rewards/grant.js or anything in lib/live (CLAUDE.md, spec §5): it needs only firebase-admin and the shared
// caller helpers, so deploying tangAdmin and tangVote never redeploys anything else.
// build(deps) is what scripts/check-boomertang-fn.js runs against an in-memory Firestore. deps: adminLogEntry, db, now().
const crypto = require("crypto");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const L = require("./logic");
const { SITE_ID, fail, callerInfo } = require("../vault/common");

const VOTES_PER_HOUR = 60;
const issueLink = (vol, no) => `/boomertang/vol-${vol}/no-${no}`;

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const now = deps.now || Date.now;
  const caller = deps.callerInfo || callerInfo;
  const base = `sites/${SITE_ID}/tang/main`;
  const R = {
    main: () => db.doc(base),
    issue: (id) => db.doc(`${base}/issues/${id}`),
    issues: () => db.collection(`${base}/issues`),
    poll: (id) => db.doc(`${base}/polls/${id}`),
    polls: () => db.collection(`${base}/polls`),
    vote: (pollId, uid) => db.doc(`${base}/pollVotes/${pollId}_${uid}`),
    rate: (uid, hour) => db.doc(`sites/${SITE_ID}/rateLimits/tang_vote_${crypto.createHash("sha256").update(`${uid}|${hour}`).digest("hex").slice(0, 32)}`),
  };

  async function log(c, { action, itemPath, itemTitle, details }) {
    try {
      const entry = await deps.adminLogEntry(db, { feature: "boomertang", action, itemPath, itemTitle, actorUid: c.uid, actorName: c.name || "Owner", details });
      await db.collection("adminLog").add(entry);
    } catch (err) { console.error("tangAdmin: adminLog write failed", err?.message || err); }
  }
  const issueId = (v) => { if (!L.ISSUE_ID.test(String(v || ""))) throw fail("invalid-argument", "That isn't an issue.", "badIssue"); return v; };

  // ---------- tangAdmin (owner only) ----------
  const tangAdmin = onCall(async (request) => {
    const c = await caller(request);
    if (!c.isOwner) throw fail("permission-denied", "Only the owner runs the magazine.", "notOwner");
    const d = request.data || {};
    switch (d.action) {
      case "publish": {
        const id = issueId(d.issueId);
        const out = await db.runTransaction(async (tx) => {
          const [snap, main] = await Promise.all([tx.get(R.issue(id)), tx.get(R.main())]);
          if (!snap.exists) throw fail("not-found", "That issue isn't set up yet.", "noIssue");
          if (snap.get("status") === "published") throw fail("failed-precondition", "That issue is already out.", "alreadyPublished");
          const current = main.exists ? main.get("currentIssueId") || null : null;
          const becomesCurrent = L.newer(id, current);
          tx.update(R.issue(id), { status: "published", publishedAt: FieldValue.serverTimestamp() });
          tx.set(R.main(), becomesCurrent ? { currentIssueId: id } : {}, { merge: true });
          return { vol: snap.get("vol"), no: snap.get("no"), title: snap.get("title") || id, becomesCurrent, previous: current };
        });
        try {
          await db.collection("activityLog").add({ feature: "boomertang", type: "tang-issue", summary: `Boomertang Vol. ${out.vol} · No. ${out.no} is out: ${out.title}`, link: issueLink(out.vol, out.no), actorName: null, issueId: id, createdAt: FieldValue.serverTimestamp() });
        } catch (err) { console.error("tangAdmin: activityLog write failed", err?.message || err); }
        await log(c, { action: "publish", itemPath: R.issue(id).path, itemTitle: out.title, details: { becomesCurrent: out.becomesCurrent, previousCurrent: out.previous } });
        return { ok: true, issueId: id, current: out.becomesCurrent ? id : out.previous };
      }
      case "setAccess": {
        const id = issueId(d.issueId);
        if (!["public", "members"].includes(d.access)) throw fail("invalid-argument", "Access is public or members.", "badAccess");
        const snap = await R.issue(id).get();
        if (!snap.exists) throw fail("not-found", "That issue isn't set up yet.", "noIssue");
        if (snap.get("textInRepo") === true) throw fail("failed-precondition", "This issue's text is in the repo, so it's always free for everyone.", "textInRepo");
        if (snap.get("access") === d.access) return { ok: true, unchanged: true };
        await R.issue(id).update({ access: d.access });
        await log(c, { action: "setAccess", itemPath: snap.ref.path, itemTitle: snap.get("title") || id, details: { from: snap.get("access") || null, to: d.access } });
        return { ok: true };
      }
      case "addEdition": {
        const id = issueId(d.issueId);
        const note = L.editionNote(d.note);
        if (!note) throw fail("invalid-argument", `An edition note is 1 to ${L.NOTE_MAX} characters.`, "badNote");
        const date = L.todayCentral(now());
        const title = await db.runTransaction(async (tx) => {
          const snap = await tx.get(R.issue(id));
          if (!snap.exists) throw fail("not-found", "That issue isn't set up yet.", "noIssue");
          const editions = Array.isArray(snap.get("editions")) ? snap.get("editions") : [];
          if (editions.length >= L.EDITIONS_MAX) throw fail("resource-exhausted", "This issue's edition log is full.", "editionsFull");
          tx.update(R.issue(id), { editions: [{ date, note }, ...editions] });
          return snap.get("title") || id;
        });
        await log(c, { action: "addEdition", itemPath: R.issue(id).path, itemTitle: title, details: { date, note } });
        return { ok: true, edition: { date, note } };
      }
      case "poll": {
        const pollId = String(d.pollId || "");
        if (!L.POLL_ID.test(pollId)) throw fail("invalid-argument", "That isn't a poll.", "badPoll");
        if (!["open", "close", "reopen"].includes(d.op)) throw fail("invalid-argument", "Open, close or reopen.", "badOp");
        const snap = await R.poll(pollId).get();
        if (!snap.exists) throw fail("not-found", "That poll isn't set up.", "noPoll");
        const open = d.op !== "close";
        await R.poll(pollId).update(open ? { open: true, closedAt: null } : { open: false, closedAt: FieldValue.serverTimestamp() });
        await log(c, { action: `poll-${d.op}`, itemPath: snap.ref.path, itemTitle: snap.get("question") || pollId });
        return { ok: true, open };
      }
      default:
        throw fail("invalid-argument", "Unknown action.", "badAction");
    }
  });

  // ---------- tangVote (signed-in members) ----------
  async function readerOf(c) {
    return { signedIn: true, member: c.member, sub: c.roles.includes("sub"), admin: c.isAdmin, owner: c.isOwner };
  }
  async function readable(issueIdV, c) {
    const [issue, main] = await Promise.all([R.issue(issueIdV).get(), R.main().get()]);
    if (!issue.exists) return false;
    return L.canRead({ id: issueIdV, ...issue.data() }, main.exists ? main.get("currentIssueId") || null : null, await readerOf(c));
  }

  const tangVote = onCall(async (request) => {
    const c = await caller(request);
    if (!c.member) throw fail("failed-precondition", "Finish signing up first.", "needsSignup");
    const d = request.data || {};

    if (d.mine === true) {
      const id = issueId(d.issueId);
      if (!(await readable(id, c))) throw fail("permission-denied", "You can't open this issue yet.", "locked");
      const polls = await R.polls().where("issueId", "==", id).get();
      const refs = polls.docs.map((p) => R.vote(p.id, c.uid));
      const votes = {};
      if (refs.length) (await db.getAll(...refs)).forEach((s, i) => { if (s.exists) votes[polls.docs[i].id] = s.get("optionId"); });
      return { votes };
    }

    const pollId = String(d.pollId || ""), optionId = String(d.optionId || "");
    if (!L.POLL_ID.test(pollId) || !L.OPTION_ID.test(optionId)) throw fail("invalid-argument", "That isn't a vote.", "badVote");
    const at = now();
    const result = await db.runTransaction(async (tx) => {
      const rateRef = R.rate(c.uid, Math.floor(at / 3600000));
      const [poll, vote, rate] = await Promise.all([tx.get(R.poll(pollId)), tx.get(R.vote(pollId, c.uid)), tx.get(rateRef)]);
      if (!poll.exists) throw fail("not-found", "That poll isn't here.", "noPoll");
      if (!L.pollOpen(poll.data(), at)) throw fail("failed-precondition", "Voting is closed on this poll.", "closed");
      const options = (poll.get("options") || []).map((o) => o.id);
      if (!options.includes(optionId)) throw fail("invalid-argument", "That isn't one of the answers.", "badOption");
      const count = rate.exists ? rate.get("count") || 0 : 0;
      if (count >= VOTES_PER_HOUR) throw fail("resource-exhausted", "That's a lot of votes. Try again in a little while.", "rateLimit");
      const issueRef = R.issue(poll.get("issueId")), mainRef = R.main();
      const [issue, main] = await Promise.all([tx.get(issueRef), tx.get(mainRef)]);
      const ok = issue.exists && L.canRead({ id: issue.id, ...issue.data() }, main.exists ? main.get("currentIssueId") || null : null, await readerOf(c));
      if (!ok) throw fail("permission-denied", "You can't open this issue yet.", "locked");
      const from = vote.exists ? vote.get("optionId") : null;
      const counts = L.moveVote(poll.get("counts"), from, optionId);
      tx.set(rateRef, { count: count + 1, expireAt: Timestamp.fromMillis(at + 2 * 3600000) }, { merge: true });
      if (from === optionId) return { counts: poll.get("counts") || {}, mine: optionId, changed: false };
      tx.update(R.poll(pollId), { counts });
      tx.set(R.vote(pollId, c.uid), { optionId, at: Timestamp.fromMillis(at), pollId, uid: c.uid });
      return { counts, mine: optionId, changed: true };
    });
    return { ok: true, ...result };
  });

  return { functions: { tangAdmin, tangVote }, R };
}

module.exports = (deps) => build(deps).functions;
module.exports.build = build;
