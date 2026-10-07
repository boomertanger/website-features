// Scream Planner, plannerTick (docs/specs/scream-planner.md section 7): every 15 minutes it opens next week at the set
// time, closes voting, nudges the owner about an unpublished week, writes the crew's 24 h and 1 h reminders into the
// outbox, releases the seats of mods who lost their status, prunes the ballot and rebuilds the public documents.
// Every step is idempotent, so a late or repeated run does no harm. runTick(nowMs) is exported for the checks.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const L = require("./logic");
const { P, ms } = require("./core");

module.exports = function tick({ core, plan, crewFns, ballot }) {
  const { db, FieldValue, ts } = core;

  async function runTick(nowMs = Date.now()) {
    const out = { opened: null, closed: [], nudged: [], reminders: 0, released: 0, pruned: 0 };
    const tz = await core.siteTz();
    const settings = await core.loadSettings();

    // 1. Open next week once its open time has come (never twice: openWeek returns created:false).
    const target = L.targetWeekAt(nowMs, tz);
    if (nowMs >= L.weekDeadlines(target, settings.deadlines, tz).opensAt) {
      const r = await plan.openWeek(target, { nowMs });
      if (r.created) out.opened = target;
    }

    const weeks = (await db.collection(P.weeks).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    const current = L.weekOf(nowMs, tz);

    // 2. Close voting when the close time has passed.
    for (const wk of weeks) if (wk.state === "open" && nowMs >= ms(wk.closesAt)) { await plan.closeWeek(wk.id); out.closed.push(wk.id); }

    // 3. "Week not published": a to-do for the owner on /admin once the publish-by time has passed.
    for (const wk of weeks) {
      if (wk.state === "published" || wk.weekOff || wk.id <= current || nowMs < ms(wk.publishBy)) continue;
      const ref = db.doc(`${P.todos}/publish_${wk.id}`);
      if ((await ref.get()).exists) continue;
      await ref.set({ kind: "weekNotPublished", week: wk.id, text: `Week not published: ${wk.id}`, link: "/schedule/plan", publishBy: wk.publishBy, createdAt: FieldValue.serverTimestamp() });
      out.nudged.push(wk.id);
    }

    // 4. Hidden or deleted games leave the ballot (votes returned).
    for (const wk of weeks) if (!wk.weekOff && wk.state !== "published" && wk.id > current) out.pruned += await ballot.pruneBallot(wk.id);

    // 5. Crew reminders, 24 h and 1 h, one outbox event per person per stream (the document id makes a repeat run a no-op).
    const soon = (await db.collection(P.streams).where("plannedStart", ">", ts(nowMs)).where("plannedStart", "<=", ts(nowMs + 24 * L.HOUR)).get()).docs;
    for (const s of soon) {
      if (s.get("published") !== true || s.get("state") !== "scheduled") continue;
      const startMs = ms(s.get("plannedStart")), kind = L.reminderDue(startMs, nowMs);
      if (!kind) continue;
      const draft = (await db.doc(P.draft(s.id)).get()).data();
      for (const uid of L.crewUids(draft.crew)) {
        const seats = L.seatsHeldBy(draft.crew, uid);
        const wrote = await core.outbox({ id: `crew-reminder-${kind}_${s.id}_${uid}_${startMs}`, type: `crew-reminder-${kind}`, audience: "uids", uids: [uid], streamId: s.id, week: draft.week, payload: { title: `${draft.title || "Stream"} starts in ${kind === "1h" ? "an hour" : "about a day"}`, start: startMs, seats, link: "/schedule/plan" } });
        if (wrote) out.reminders++;
      }
    }

    // 6. A mod who is no longer Active (or lost the role) loses their seats; the owner gets a to-do (section 10).
    const upcoming = (await db.collection(P.streams).where("plannedStart", ">", ts(nowMs)).get()).docs.filter((d) => ["planned", "scheduled"].includes(d.get("state")));
    const duty = new Map();
    for (const s of upcoming) {
      const dsnap = await db.doc(P.draft(s.id)).get();
      if (!dsnap.exists) continue;
      let draft = dsnap.data();
      for (const uid of L.crewUids(draft.crew)) {
        if (!duty.has(uid)) duty.set(uid, core.onDuty(await core.whoPlus(uid)));
        if (duty.get(uid)) continue;
        const handle = [draft.crew.captain, ...Object.values(draft.crew.chats || {}).flatMap((c) => [c.lead, ...(c.deckhands || [])])].find((x) => x?.uid === uid)?.handle;
        draft = { ...draft, crew: L.removeSeat(draft.crew, uid) };
        await core.saveDraft(s.id, draft, { alsoPublic: true, fields: ["crew"] });
        await crewFns.releaseAll(s.id, uid, "lostStatus");
        await db.doc(`${P.todos}/seat_${s.id}_${uid}`).set({ kind: "seatReleased", streamId: s.id, uid, text: `${handle ? `@${handle}` : "A crew member"} is no longer on duty; their seats on ${draft.title || "a stream"} were released`, week: draft.week, link: "/schedule/plan", createdAt: FieldValue.serverTimestamp() });
        await core.refreshCounts(draft.week);
        out.released++;
      }
    }

    // 7. The public documents (exceptions expire, the ballot closes on time).
    await core.rebuildUsualWeek();
    await core.rebuildPublicBallot();
    await core.rebuildSchedule();
    return out;
  }

  const plannerTick = onSchedule({ schedule: "every 15 minutes", timeZone: "America/Chicago", timeoutSeconds: 300 }, async () => {
    const r = await runTick(Date.now());
    console.log(`plannerTick: ${JSON.stringify(r)}`);
  });

  return { plannerTick, runTick };
};
