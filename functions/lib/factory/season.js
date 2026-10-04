// Fun Factory scheduler work (docs/specs/fun-factory.md §10, §11), run by factoryTick every 5 minutes.
//
//   tick(now)
//     1. a Scheduled season whose startsAt has passed goes live (and revealed), unless another
//        season is live or the two overlap (seasons can't overlap; it stays Scheduled-late and logs)
//     2. in a live season, reveals chapters (unlockAt), campaigns (opensAt, once their chapter is
//        revealed) and activities (once their campaign is), stamping revealedAt
//     3. rolls up boards/{all|sub|crew}: the top 100 by season XP and a count, like the Arcade's
//        pre-built boards (admins are never in standings, so never on a board)
//     4. a live season past endsAt is finalized: final boards, season trophies through grantTrophy
//        (places 1-3, kind "season": 150 / 100 / 75 XP, rewards.md §7), a "plaque" for places 4-10,
//        the season badge (season.badgeId) to everyone who completed every Story campaign, then
//        status "ended". Every grant is idempotent, so a finalize that stops halfway just reruns.
const admin = require("firebase-admin");
const L = require("./logic");
const { refs } = require("./record");

const BOARD_SIZE = 100;
const READ_ROWS = 1000;
const ORD = ["", "1st", "2nd", "3rd"];
const ordinal = (n) => ORD[n] || `${n}th`;

function makeSeason({ db = admin.firestore(), grant = null } = {}) {
  const R = refs(db);
  const { Timestamp } = admin.firestore;
  const G = () => grant || require("../rewards/grant");
  const data = (d) => ({ id: d.id, ...d.data() });

  async function tick(now = Date.now()) {
    const log = [];
    const live = (await R.seasons.where("status", "==", "live").get()).docs.map(data);

    // 1. Scheduled -> live
    const scheduled = (await R.seasons.where("status", "==", "scheduled").get()).docs.map(data);
    for (const s of scheduled.filter((x) => L.ms(x.startsAt) <= now)) {
      const clash = live.find((x) => x.id !== s.id && (L.ms(x.endsAt) > now || L.seasonsOverlap(x, s)));
      if (clash) { log.push(`${s.id}: can't go live while ${clash.id} is live`); continue; }
      if (L.ms(s.endsAt) <= now) { log.push(`${s.id}: its end has passed; left Scheduled`); continue; }
      await R.season(s.id).update({ status: "live", revealed: true, liveAt: Timestamp.fromMillis(now) });
      live.push({ ...s, status: "live", revealed: true });
      log.push(`${s.id}: live`);
    }

    for (const s of live) {
      if (L.ms(s.endsAt) <= now) { log.push(...(await finalize(s, now))); continue; }
      log.push(...(await reveal(s, now)));
      await rollBoards(s, now);
    }
    return log;
  }

  // 2. Reveal what's due, top down.
  async function reveal(s, now) {
    const out = [];
    const stamp = { revealed: true, revealedAt: Timestamp.fromMillis(now) };
    const chapters = (await R.chapters(s.id).get()).docs.map(data);
    for (const c of chapters) if (L.revealDue(c, now)) { await R.chapters(s.id).doc(c.id).update(stamp); c.revealed = true; out.push(`${s.id}: chapter ${c.id}`); }
    const chapterOpen = new Map(chapters.map((c) => [c.id, c.revealed === true]));
    const campaigns = (await R.campaigns(s.id).get()).docs.map(data);
    for (const c of campaigns) {
      if (L.revealDue(c, now) && (!c.chapterId || chapterOpen.get(c.chapterId))) { await R.campaigns(s.id).doc(c.id).update(stamp); c.revealed = true; out.push(`${s.id}: campaign ${c.id}`); }
    }
    const campOpen = new Map(campaigns.map((c) => [c.id, c.revealed === true]));
    const hidden = await R.activities(s.id).where("revealed", "==", false).get();
    for (const a of hidden.docs) if (campOpen.get(a.get("campaignId"))) { await a.ref.update(stamp); out.push(`${s.id}: activity ${a.id}`); }
    return out;
  }

  // 3. Boards: top 100 per board (all, sub, crew) and how many members are on it.
  async function rollBoards(s, now) {
    const snap = await R.standings(s.id).orderBy("seasonXp", "desc").limit(READ_ROWS).get();
    const rows = L.rankRows(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    const [all, sub, crew] = await Promise.all([
      R.standings(s.id).where("seasonXp", ">", 0).count().get(),
      R.standings(s.id).where("tier", "==", "sub").count().get(),
      R.standings(s.id).where("tier", "==", "crew").count().get(),
    ]);
    const counts = { all: all.data().count, sub: sub.data().count, crew: crew.data().count };
    for (const board of ["all", "sub", "crew"]) {
      const top = rows.filter((r) => board === "all" || r.tier === board).slice(0, BOARD_SIZE)
        .map((r, i) => ({ rank: i + 1, uid: r.uid, handle: r.handle || null, displayName: r.displayName || r.handle || null, seasonXp: r.seasonXp, tier: r.tier }));
      const ref = R.boards(s.id).doc(board);
      const cur = await ref.get();
      if (cur.exists && JSON.stringify(cur.get("rows")) === JSON.stringify(top) && cur.get("count") === counts[board]) continue;
      await ref.set({ board, rows: top, count: counts[board], updatedAt: Timestamp.fromMillis(now) });
    }
    return rows;
  }

  // 4. Season end.
  async function finalize(s, now) {
    const out = [];
    const rows = await rollBoards(s, now);
    for (const a of L.seasonAwards(rows)) {
      const label = a.kind === "season" ? `${ordinal(a.place)} · ${s.name}` : `Top 10 · ${s.name}`;
      try {
        const r = await G().grantTrophy(a.uid, { kind: a.kind, place: a.place, label, period: s.name || s.id, ref: s.id });
        if (r.granted) out.push(`${s.id}: ${a.kind} #${a.place} to ${a.uid}`);
      } catch (err) { console.error(`factory: trophy for ${a.uid} failed`, err); }
    }
    if (s.badgeId) {
      const story = (await R.campaigns(s.id).where("cadence", "==", "story").get()).docs.filter((c) => c.get("enabled") !== false && (c.get("audience") || "all") === "all").map((c) => c.id);
      if (story.length) {
        const progress = await R.season(s.id).collection("progress").get();
        for (const p of progress.docs) {
          const camps = p.get("camps") || {};
          if (!story.every((id) => camps[id]?.completedAt)) continue;
          try {
            const r = await G().grantBadge(p.id, s.badgeId, { feature: "factory", ref: `season:${s.id}` });
            if (r.granted) out.push(`${s.id}: season badge to ${p.id}`);
          } catch (err) { console.error(`factory: season badge for ${p.id} failed`, err); }
        }
      }
    }
    await R.season(s.id).update({ status: "ended", endedAt: Timestamp.fromMillis(now), frozenAt: Timestamp.fromMillis(now) });
    out.push(`${s.id}: ended`);
    return out;
  }

  return { tick, reveal, rollBoards, finalize };
}

module.exports = { makeSeason, BOARD_SIZE };
