// Boom Arcade (docs/specs/arcade-step1.md §4–§6): server-checked runs, per-version
// Desktop and Mobile boards (weekly and all-time), per-run votes and run counts.
// Every document here is written ONLY by these functions (Admin SDK); firestore.rules
// gives clients read access to games, versions, bests and boards, and nothing else.
//
//   sites/{siteId}/games/{gameId}                              registry + rolled-up stats
//   …/games/{gameId}/versions/{v}                              builds, checks, boardEpoch
//   …/versions/{v}/runs/{runId}                                every run (TTL: expireAt)
//   …/versions/{v}/bests/{uid}_{device}                        a member's all-time and weekly best
//   …/versions/{v}/boards/e{epoch}_{device}_{all|2026-W40}     top 100 rows
//   …/versions/{v}/counters/{0-9}                              sharded run and vote counts
//   sites/{siteId}/rateLimits/{key}                            startRun per hour (TTL: expireAt)
//   sites/{siteId}/private/arcadeSalt                          hashes visitor IPs; rotated daily
//
// Callable errors carry details.reason so the game can show the right message
// (same shape as lib/accounts). The runId handed to the client is
// "gameId/version/docId", so the other callables can find the run from it alone.
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const L = require("./logic");
const rewards = require("../rewards/grant");
const factory = require("../factory/record");

const SITE_ID = "boomertanger";
const SHARDS = 10;
const RUN_TTL_DAYS = 180;
const LIMITS = { visitor: 60, member: 120 };   // startRun per hour
const DAY_MS = 24 * 60 * 60 * 1000;

const fail = (code, message, reason, extra = {}) => new HttpsError(code, message, { reason, ...extra });
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hourKey = (now) => new Date(now).toISOString().slice(0, 13).replace(/\D/g, "");   // 2026092918 (UTC)

module.exports = function arcade() {
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const Timestamp = admin.firestore.Timestamp;

  const site = db.doc(`sites/${SITE_ID}`);
  const gameRef = (gameId) => site.collection("games").doc(gameId);
  const versionRef = (gameId, v) => gameRef(gameId).collection("versions").doc(v);
  const saltRef = site.collection("private").doc("arcadeSalt");

  // ---------- the daily salt (visitor IP keys) ----------
  // Cached per instance for a few minutes; created on first use and rotated by
  // rollupArcadeStats once a day (the old value is overwritten, so it's gone).
  let saltCache = null;
  async function salt() {
    const now = Date.now();
    if (saltCache && saltCache.day === L.dayKey(now) && now - saltCache.readAt < 10 * 60 * 1000) return saltCache.value;
    const value = await db.runTransaction(async (tx) => {
      const snap = await tx.get(saltRef);
      if (snap.exists && snap.get("day") === L.dayKey(now)) return snap.get("value");
      const fresh = crypto.randomBytes(32).toString("hex");
      tx.set(saltRef, { value: fresh, day: L.dayKey(now), rotatedAt: Timestamp.now() });
      return fresh;
    });
    saltCache = { value, day: L.dayKey(now), readAt: now };
    return value;
  }

  // ---------- rate limit: startRun per hour ----------
  async function rateLimit(request) {
    const now = Date.now(), hour = hourKey(now);
    const uid = request.auth?.uid || null;
    let key, limit;
    if (uid) { key = `arcade_u_${sha256(`${uid}|${hour}`).slice(0, 32)}`; limit = LIMITS.member; }
    else {
      const ip = request.rawRequest?.ip || "unknown";
      key = `arcade_ip_${sha256(`${await salt()}|${ip}|${hour}`).slice(0, 32)}`;
      limit = LIMITS.visitor;
    }
    const ref = site.collection("rateLimits").doc(key);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? snap.get("count") || 0 : 0;
      if (count >= limit) throw fail("resource-exhausted", "Too many runs this hour. Take a breather and try again later.", "rateLimit");
      tx.set(ref, { count: count + 1, expireAt: Timestamp.fromMillis(now + DAY_MS) }, { merge: true });
    });
  }

  // The live game and its current version, or a refusal the client can show.
  async function liveVersion(gameId) {
    const game = await gameRef(gameId).get();
    if (!game.exists || game.get("status") !== "live") throw fail("failed-precondition", "That game isn't open right now.", "gameClosed");
    const v = game.get("currentVersion");
    const version = await versionRef(gameId, v).get();
    if (!version.exists || version.get("status") !== "released") throw fail("failed-precondition", "That game isn't open right now.", "gameClosed");
    return { game, v, version };
  }

  // Loads a run and checks the caller started it (same uid, or the visitor's runKey).
  // The id alone proves nothing: the game and version must exist, and ownership is
  // always checked on the run's uid or runKey hash.
  async function ownRun(request, runId, runKey) {
    const id = L.parseRunId(runId);
    if (!id) throw fail("invalid-argument", "Unknown run.", "runId");
    const ref = versionRef(id.gameId, id.version).collection("runs").doc(id.docId);
    const [game, version, snap] = await db.getAll(gameRef(id.gameId), versionRef(id.gameId, id.version), ref);
    if (!game.exists || !version.exists || !snap.exists) throw fail("not-found", "Unknown run.", "runId");
    const run = snap.data();
    const mine = run.uid
      ? request.auth?.uid === run.uid
      : typeof runKey === "string" && runKey.length === 32 && sha256(runKey) === run.runKeyHash;
    if (!mine) throw fail("permission-denied", "That run belongs to someone else.", "notYours");
    return { id, ref, run };
  }

  const shard = (gameId, v) => versionRef(gameId, v).collection("counters").doc(String(Math.floor(Math.random() * SHARDS)));

  // ---------- startRun({ gameId, device, build }) ----------
  // Called at the first splat tap without blocking it (the clock starts locally).
  // Auth optional. Returns { runId, runKey? (visitors only), version, build }.
  const startRun = onCall(async (request) => {
    const { gameId, device, build } = request.data || {};
    if (!L.validId(gameId) || !L.DEVICES.includes(device) || typeof build !== "string" || build.length > 20) {
      throw fail("invalid-argument", "gameId, device (desktop or mobile) and build are required.", "args");
    }
    const { v, version } = await liveVersion(gameId);
    if (!(version.get("acceptedBuilds") || []).includes(build)) {
      throw fail("failed-precondition", "Refresh the page to play the latest version.", "build");
    }
    await rateLimit(request);

    const uid = request.auth?.uid || null;
    const runKey = uid ? null : crypto.randomBytes(16).toString("hex");
    const now = Timestamp.now();
    const ref = versionRef(gameId, v).collection("runs").doc();
    await ref.set({
      uid, runKeyHash: runKey ? sha256(runKey) : null,
      device, build, epoch: version.get("boardEpoch") || 1,
      startedAt: now, finishedAt: null, result: null,
      expireAt: Timestamp.fromMillis(now.toMillis() + RUN_TTL_DAYS * DAY_MS),
    });
    return { runId: L.runPath(gameId, v, ref.id), ...(runKey ? { runKey } : {}), version: v, build };
  });

  // Rank past the top 100: members with a faster best, plus one.
  async function countRank(bests, device, field, where, secs) {
    const q = bests.where("device", "==", device).where(where.field, "==", where.value).where(`${field}.secs`, "<", secs);
    const agg = await q.count().get();
    return agg.data().count + 1;
  }

  // ---------- finishRun({ runId, runKey?, result, secs, penalties, reached, splits }) ----------
  // Once per run. Records the checks; a passing win by a signed-up member with a
  // verified email updates their bests and the boards it places on, in one transaction.
  // Returns { counted, onBoard, personalBest, rank: { all, week }, reason }.
  const finishRun = onCall(async (request) => {
    const d = request.data || {};
    const { id, ref, run } = await ownRun(request, d.runId, d.runKey);
    if (run.finishedAt) throw fail("failed-precondition", "That run is already finished.", "finished");

    const vSnap = await versionRef(id.gameId, id.version).get();
    const checksCfg = vSnap.get("checks") || {};
    const now = Timestamp.now();
    const serverSecs = (now.toMillis() - run.startedAt.toMillis()) / 1000;
    if (serverSecs > (checksCfg.maxRunMins || 30) * 60) throw fail("deadline-exceeded", "That run started too long ago.", "expired");

    const result = L.RESULTS.includes(d.result) ? d.result : null;
    if (!result) throw fail("invalid-argument", "Unknown result.", "result");
    const splits = Array.isArray(d.splits) ? d.splits.slice(0, 20) : null;
    const checks = L.checkRun({ result, secs: d.secs, penalties: d.penalties, reached: d.reached, splits, device: run.device }, { serverSecs, checks: checksCfg });
    const counted = result !== "tappedOut";
    const secs = typeof d.secs === "number" && Number.isFinite(d.secs) ? Math.round(d.secs * 100) / 100 : null;

    const uid = run.uid;
    const token = request.auth?.token || {};
    const profileRef = uid ? site.collection("profiles").doc(uid) : null;
    const profile = profileRef ? await profileRef.get() : null;
    const currentEpoch = vSnap.get("boardEpoch") || 1;
    const block = L.boardBlock({
      result, ok: checks.ok, uid, signedUp: !!profile?.exists,
      verified: token.email_verified === true, epoch: run.epoch, currentEpoch,
    });

    const base = {
      finishedAt: now, result, secs, penalties: Number.isInteger(d.penalties) ? d.penalties : null,
      reached: typeof d.reached === "number" ? d.reached : null, splits: checks.reasons.includes("splits") ? null : splits,
      serverSecs: Math.round(serverSecs * 100) / 100, checks, voted: { liked: false, wantMore: false }, onBoard: false,
    };

    let out = { counted, onBoard: false, personalBest: false, rank: { all: null, week: null }, reason: block };
    const versionDoc = versionRef(id.gameId, id.version);
    const bests = versionDoc.collection("bests");

    if (!block) {
      const week = L.weekKey(now);
      const bestRef = bests.doc(`${uid}_${run.device}`);
      const allRef = versionDoc.collection("boards").doc(L.boardId(currentEpoch, run.device, "all"));
      const weekRef = versionDoc.collection("boards").doc(L.boardId(currentEpoch, run.device, week));
      const handle = profile.get("handle") || null, displayName = profile.get("displayName") || handle;
      const row = { uid, handle, displayName, secs, penalties: base.penalties, at: now };
      const entry = { secs, penalties: base.penalties, runId: d.runId, at: now };

      out = await db.runTransaction(async (tx) => {
        const [bestSnap, allSnap, weekSnap, runSnap] = await Promise.all([tx.get(bestRef), tx.get(allRef), tx.get(weekRef), tx.get(ref)]);
        if (runSnap.get("finishedAt")) throw fail("failed-precondition", "That run is already finished.", "finished");
        const best = bestSnap.exists && bestSnap.get("epoch") === currentEpoch ? bestSnap.data() : {};
        const prevWeek = best.week?.key === week ? best.week : null;
        const allBest = L.beats(secs, now, best.allTime);
        const weekBest = L.beats(secs, now, prevWeek);
        let rankAll = L.rankOf(allSnap.get("rows"), uid), rankWeek = L.rankOf(weekSnap.get("rows"), uid);
        let onBoard = false;
        if (allBest || weekBest) {
          tx.set(bestRef, {
            uid, device: run.device, epoch: currentEpoch, handle, displayName,
            allTime: allBest ? entry : best.allTime,
            week: weekBest ? { key: week, ...entry } : prevWeek,
          });
        }
        if (allBest) {
          const r = L.insertRow(allSnap.get("rows"), row);
          if (r.changed) tx.set(allRef, { period: "all", device: run.device, epoch: currentEpoch, rows: r.rows, updatedAt: now });
          rankAll = r.rank; onBoard = onBoard || r.rank != null;
        }
        if (weekBest) {
          const r = L.insertRow(weekSnap.get("rows"), row);
          if (r.changed) tx.set(weekRef, { period: week, device: run.device, epoch: currentEpoch, rows: r.rows, updatedAt: now });
          rankWeek = r.rank; onBoard = onBoard || r.rank != null;
        }
        tx.update(ref, { ...base, onBoard });
        return { counted, onBoard, personalBest: allBest, rank: { all: rankAll, week: rankWeek }, reason: allBest || weekBest ? null : "notBest" };
      });

      // Past the top 100: a count of faster bests (only when it matters).
      try {
        if (out.rank.all == null && out.personalBest) out.rank.all = await countRank(bests, run.device, "allTime", { field: "epoch", value: currentEpoch }, secs);
        if (out.rank.week == null && (out.personalBest || out.reason === null)) out.rank.week = await countRank(bests, run.device, "week", { field: "week.key", value: week }, secs);
      } catch (err) {
        console.error("finishRun: rank count failed", err);
      }
    } else {
      await ref.update(base);
    }

    // Trophy Room: Splat Finisher for a member's first finished Tap the Splat run, Top 10 for
    // reaching any all-time top 10. Never lets a rewards problem fail the run.
    if (!block && uid) {
      try {
        if (result === "win" && checks.ok && id.gameId === "tapTheSplat") await rewards.grantBadge(uid, "splat-finisher", { feature: "arcade", ref: "splat-finisher" });
        if (out.rank.all != null && out.rank.all <= 10) await rewards.grantBadge(uid, "top-10", { feature: "arcade", ref: "top-10" });
      } catch (err) {
        console.error("finishRun: rewards", err);
      }
    }

    // Fun Factory (docs/specs/fun-factory.md §5): a signed-up member's run counts as played (any
    // result), finished (a passing win), a new personal best, and placed on a board. Never fails the run.
    if (uid && profile?.exists) {
      const p = { gameId: id.gameId };
      await Promise.all([
        factory.recordFactoryEvent(uid, "arcade", { action: "play", ...p }, `play-${id.docId}`),
        result === "win" && checks.ok && factory.recordFactoryEvent(uid, "arcade", { action: "finish", ...p }, `finish-${id.docId}`),
        out.personalBest && factory.recordFactoryEvent(uid, "arcade", { action: "best", ...p }, `best-${id.docId}`),
        out.onBoard && factory.recordFactoryEvent(uid, "arcade", { action: "board", ...p }, `board-${id.docId}`),
      ]);
    }

    if (counted) {
      await shard(id.gameId, id.version).set({ runs: FieldValue.increment(1), ...(result === "win" && checks.ok ? { finished: FieldValue.increment(1) } : {}) }, { merge: true });
    }
    if (!checks.ok) console.warn("finishRun: checks failed", d.runId, checks.reasons.join(","));
    return out;
  });

  // ---------- voteRun({ runId, runKey?, kind }) ----------
  // "liked" or "wantMore", once per kind on an ended run (not a tap-out).
  const voteRun = onCall(async (request) => {
    const d = request.data || {};
    if (!L.VOTE_KINDS.includes(d.kind)) throw fail("invalid-argument", "Unknown vote.", "kind");
    const { id, ref } = await ownRun(request, d.runId, d.runKey);
    const fresh = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.get("finishedAt") || snap.get("result") === "tappedOut") throw fail("failed-precondition", "Finish a run first.", "notEnded");
      if (snap.get(`voted.${d.kind}`) === true) return false;
      tx.update(ref, { [`voted.${d.kind}`]: true });
      return true;
    });
    if (fresh) await shard(id.gameId, id.version).set({ [d.kind]: FieldValue.increment(1) }, { merge: true });
    return { ok: true, counted: fresh };
  });

  // ---------- rollupArcadeStats (every 5 minutes) ----------
  // Sums each live game's current-version shards into games/{gameId}.stats, keeps
  // games/{gameId}.boardEpoch equal to the current version's (pages build board ids
  // from the game doc alone), and rotates private/arcadeSalt once a day.
  const rollupArcadeStats = onSchedule({ schedule: "every 5 minutes", timeZone: L.WEEK_TZ }, async () => {
    const games = await site.collection("games").where("status", "==", "live").get();
    for (const game of games.docs) {
      const v = game.get("currentVersion");
      if (!v) continue;
      const [shards, version] = await Promise.all([versionRef(game.id, v).collection("counters").get(), versionRef(game.id, v).get()]);
      const sum = { runs: 0, finished: 0, liked: 0, wantMore: 0 };
      shards.docs.forEach((s) => Object.keys(sum).forEach((k) => { sum[k] += s.get(k) || 0; }));
      const prev = game.get("stats") || {};
      const epoch = version.get("boardEpoch") || 1;
      const update = {};
      if (Object.keys(sum).some((k) => prev[k] !== sum[k])) update.stats = { ...sum, updatedAt: Timestamp.now() };
      if (game.get("boardEpoch") !== epoch) update.boardEpoch = epoch;
      if (Object.keys(update).length) await game.ref.update(update);
    }
    const saltSnap = await saltRef.get();
    if (!saltSnap.exists || saltSnap.get("day") !== L.dayKey(Date.now())) {
      await saltRef.set({ value: crypto.randomBytes(32).toString("hex"), day: L.dayKey(Date.now()), rotatedAt: Timestamp.now() });
    }
  });

  // ---------- syncArcadeNames (profile trigger) ----------
  // A member's new handle or display name: rewrite their bests, and their rows on
  // the current all-time and weekly boards of every game's current version.
  const syncArcadeNames = onDocumentWritten("sites/{siteId}/profiles/{uid}", async (event) => {
    const { siteId, uid } = event.params;
    if (siteId !== SITE_ID || !event.data.after.exists) return;
    const b = event.data.before.exists ? event.data.before.data() : {}, a = event.data.after.data();
    if (b.handle === a.handle && b.displayName === a.displayName) return;
    const names = { handle: a.handle || null, displayName: a.displayName || a.handle || null };
    const week = L.weekKey(Date.now());

    const games = await site.collection("games").get();
    for (const game of games.docs) {
      const v = game.get("currentVersion");
      if (!v) continue;
      const vRef = versionRef(game.id, v);
      const epoch = (await vRef.get()).get("boardEpoch") || 1;
      const mine = await vRef.collection("bests").where("uid", "==", uid).get();
      for (const best of mine.docs) {
        await best.ref.update(names);
        const device = best.get("device");
        for (const period of ["all", week]) {
          const boardRef = vRef.collection("boards").doc(L.boardId(epoch, device, period));
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(boardRef);
            const rows = snap.get("rows") || [];
            if (!rows.some((r) => r.uid === uid)) return;
            tx.update(boardRef, { rows: rows.map((r) => (r.uid === uid ? { ...r, ...names } : r)) });
          });
        }
      }
    }
  });

  return { startRun, finishRun, voteRun, rollupArcadeStats, syncArcadeNames };
};

module.exports.SITE_ID = SITE_ID;
