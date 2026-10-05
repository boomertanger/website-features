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
//     5. writes the public summary sites/{siteId}/public/factory (only when it changed), so pages know
//        what's on without querying the season tree: the live season (name, number, art, the current
//        chapter, the next unlock, endsAt, the season badge, huntPaths: pages with live medals); off-
//        season, the next Scheduled season and the last one's top 3.
//   Board rows carry each member's featured badge (emoji, art, rarity) for the leaderboard, refreshed
//   whenever the rows change.
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
    try { if (await writeSummary(now)) log.push("summary updated"); } catch (err) { console.error("factoryTick: summary failed", err); }
    return log;
  }

  // 5. The public summary (sites/{siteId}/public/factory).
  async function writeSummary(now) {
    const all = (await R.seasons.get()).docs.map(data);
    const live = all.find((x) => x.status === "live" && L.ms(x.startsAt) <= now && now < L.ms(x.endsAt));
    const next = all.filter((x) => x.status === "scheduled" && L.ms(x.startsAt) > now).sort((a, b) => L.ms(a.startsAt) - L.ms(b.startsAt))[0] || null;
    const last = all.filter((x) => x.status === "ended").sort((a, b) => L.ms(b.endsAt) - L.ms(a.endsAt))[0] || null;
    const badgeOf = async (id) => {
      if (!id) return null;
      const b = await R.site.collection("badges").doc(id).get();
      return b.exists ? { id, name: b.get("name") || "", emoji: b.get("emoji") || null, rarity: b.get("rarity") || 3 } : null;
    };
    const out = { live: false, liveSeasonId: null, updatedAt: null };
    if (live) {
      const chapters = (await R.chapters(live.id).get()).docs.map(data).sort((a, b) => L.ms(a.unlockAt) - L.ms(b.unlockAt) || (a.order || 0) - (b.order || 0));
      const openCh = chapters.filter((c) => c.revealed === true && L.ms(c.unlockAt) <= now);
      const cur = openCh[openCh.length - 1] || null;
      const upcoming = chapters.find((c) => L.ms(c.unlockAt) > now) || null;
      // Pages with medals in a hunt that's counting now (its activity revealed, its campaign open).
      const [camps, acts, hunts] = await Promise.all([R.campaigns(live.id).where("revealed", "==", true).get(), R.activities(live.id).where("revealed", "==", true).get(), R.hunts(live.id).get()]);
      const campById = new Map(camps.docs.map((d) => [d.id, data(d)]));
      const huntPaths = new Set();
      for (const h of hunts.docs) {
        const a = acts.docs.find((d) => d.id === h.get("activityId"));
        const c = a && campById.get(a.get("campaignId"));
        if (!a || a.get("typeId") !== "medals" || !c || !L.campaignOpen(c, live, now)) continue;
        (await h.ref.collection("medals").get()).docs.forEach((m) => { if (typeof m.get("path") === "string") huntPaths.add(m.get("path").replace(/\/+$/, "") || "/"); });
      }
      Object.assign(out, {
        live: true, liveSeasonId: live.id, name: live.name || "", number: live.number ?? null, pitch: live.pitch || "", art: live.art?.url || null,
        startsAt: L.ms(live.startsAt), endsAt: L.ms(live.endsAt), chapters: chapters.length,
        chapter: cur ? { number: chapters.indexOf(cur) + 1, name: cur.name || "", id: cur.id } : null,
        nextUnlockAt: upcoming ? L.ms(upcoming.unlockAt) : null, nextChapterNumber: upcoming ? chapters.indexOf(upcoming) + 1 : null,
        badge: await badgeOf(live.badgeId), huntPaths: [...huntPaths].sort(),
      });
    }
    out.next = next ? { id: next.id, name: next.name || "", number: next.number ?? null, startsAt: L.ms(next.startsAt) } : null;
    if (last) {
      const board = await R.boards(last.id).doc("all").get();
      out.last = { id: last.id, name: last.name || "", number: last.number ?? null, endedAt: L.ms(last.endsAt), top3: (board.get("rows") || []).slice(0, 3).map((x) => ({ uid: x.uid, handle: x.handle || null, displayName: x.displayName || null, seasonXp: x.seasonXp || 0, featured: x.featured || null })) };
    } else out.last = null;
    const ref = R.site.collection("public").doc("factory");
    const cur = await ref.get();
    const strip = (x) => JSON.stringify({ ...x, updatedAt: null });
    if (cur.exists && strip(cur.data()) === strip(out)) return false;
    await ref.set({ ...out, updatedAt: Timestamp.fromMillis(now) });
    return true;
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
    let featured = null;   // uid -> featured badge, read only when some board's rows changed
    const plainRow = ({ featured: _f, ...x }) => x;
    for (const board of ["all", "sub", "crew"]) {
      const top = rows.filter((r) => board === "all" || r.tier === board).slice(0, BOARD_SIZE)
        .map((r, i) => ({ rank: i + 1, uid: r.uid, handle: r.handle || null, displayName: r.displayName || r.handle || null, seasonXp: r.seasonXp, tier: r.tier }));
      const ref = R.boards(s.id).doc(board);
      const cur = await ref.get();
      if (cur.exists && JSON.stringify((cur.get("rows") || []).map(plainRow)) === JSON.stringify(top) && cur.get("count") === counts[board]) continue;
      featured ||= await featuredBadges(rows.slice(0, BOARD_SIZE * 3).map((x) => x.uid));
      await ref.set({ board, rows: top.map((x) => ({ ...x, featured: featured.get(x.uid) || null })), count: counts[board], updatedAt: Timestamp.fromMillis(now) });
    }
    return rows;
  }

  /** uid -> { id, emoji, art, rarity } for each member's featured badge (profiles, then the catalog). */
  async function featuredBadges(uids) {
    const out = new Map();
    const list = [...new Set(uids)].filter(Boolean);
    if (!list.length) return out;
    const profiles = [];
    for (let i = 0; i < list.length; i += 100) profiles.push(...(await db.getAll(...list.slice(i, i + 100).map((u) => R.profile(u)))));
    const ids = [...new Set(profiles.map((p) => p.exists && p.get("featuredBadge")).filter(Boolean))];
    const badges = new Map();
    for (let i = 0; i < ids.length; i += 100) (await db.getAll(...ids.slice(i, i + 100).map((id) => R.site.collection("badges").doc(id)))).forEach((b) => { if (b.exists) badges.set(b.id, { id: b.id, emoji: b.get("emoji") || null, art: b.get("art") || null, rarity: b.get("rarity") || 1 }); });
    profiles.forEach((p) => { const b = p.exists && badges.get(p.get("featuredBadge")); if (b) out.set(p.id, b); });
    return out;
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

  return { tick, reveal, rollBoards, finalize, writeSummary };
}

module.exports = { makeSeason, BOARD_SIZE };
