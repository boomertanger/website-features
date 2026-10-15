// Creator Climb core (docs/specs/creator-climb.md §3, §4, §8, §9): pure functions, no Firestore. lib/climb/index.js feeds them documents and
// writes what they return; scripts/check-climb.js runs them against the confirmed numbers.
//
//   importMonths(history)            the gitignored history file → { months: { "YYYY-MM": monthImport }, combinedOnly, records, eras } (validated)
//   validateHistory(history)         [problems] (empty = fine): month keys, points in date order inside their month, nothing after lastReadingDay
//   buildMonth({ key, imported, daily, corrections, streams, prevEnd, settings })   one climb/main/months/{key} doc
//   buildPublic({ months, combinedOnly, records, settings, streamsPeak, now, staging, siteMembers })   public/climb and the milestone list
//
// Readings: points are { d: "YYYY-MM-DD", v, s } (s: "import" | "collector" | "manual" | "correction"; Firestore can't nest arrays). A month's
// imported month-end that isn't its last chart point counts as one more reading on its lastReadingDay (or the month's last day): the old pages
// recorded month-ends the charts didn't show (September 2025). Totals are always the platforms added up (D2), never typed.
const PLATFORMS = ["twitch", "tiktok", "youtube"];
const DAY_MS = 864e5;
const SMALL_TIKTOK = 200;      // a crossover month with fewer new TikTok followers is a "Small month"
const UNDER = 5;               // member groups under this show "under 5" ("<5")
const CROSSOVER_FROM = "2025-08";   // the first month with all three platforms
const GAP_MIN_DAYS = 20;

const monthOf = (d) => d.slice(0, 7);
const lastDayOf = (key) => { const [y, m] = key.split("-").map(Number); return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const prevMonth = (key) => { const [y, m] = key.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
const nextMonth = (key) => { const [y, m] = key.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
const msOfDay = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const round1 = (n) => Math.round(n * 10) / 10;
const isDay = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const isMonth = (k) => typeof k === "string" && /^\d{4}-\d{2}$/.test(k);
const num = (n) => (typeof n === "number" && Number.isFinite(n) ? n : null);

// ---------------------------------------------------------------------------------------------- the history import (§3)
function validateHistory(h) {
  const out = [];
  if (!h || typeof h !== "object" || !h.months) return ["The file has no months."];
  for (const [k, m] of Object.entries(h.months)) {
    if (!isMonth(k)) { out.push(`${k}: not a YYYY-MM month`); continue; }
    if (!m.platforms || !Object.keys(m.platforms).length) out.push(`${k}: no platforms`);
    for (const [p, v] of Object.entries(m.platforms || {})) {
      if (!PLATFORMS.includes(p)) out.push(`${k}: unknown platform ${p}`);
      if (num(v.monthEnd) == null) out.push(`${k} ${p}: no month-end number`);
      const pts = v.points || [];
      pts.forEach((pt, i) => {
        if (!Array.isArray(pt) || !isDay(pt[0]) || num(pt[1]) == null) out.push(`${k} ${p}: point ${i + 1} isn't ["YYYY-MM-DD", n]`);
        else {
          if (monthOf(pt[0]) !== k) out.push(`${k} ${p}: ${pt[0]} is outside the month`);
          if (i && pts[i - 1][0] >= pt[0]) out.push(`${k} ${p}: ${pt[0]} is out of date order`);
          if (m.lastReadingDay && pt[0] > m.lastReadingDay) out.push(`${k} ${p}: ${pt[0]} is after lastReadingDay ${m.lastReadingDay}`);
        }
      });
    }
    // D2: the month's total is the platforms added up; it is never typed, so there is nothing to disagree with. A typed total, if present, must match.
    if (num(m.total) != null) {
      const sum = Object.values(m.platforms || {}).reduce((a, v) => a + (num(v.monthEnd) || 0), 0);
      if (sum !== m.total) out.push(`${k}: the platforms add up to ${sum}, not ${m.total}`);
    }
  }
  for (const [k, v] of Object.entries(h.combinedOnly || {})) if (!isMonth(k) || num(v) == null) out.push(`combinedOnly ${k}: not a month and a number`);
  return out;
}

/** The import as month pieces: points (src import), the imported month-ends and starting balances, streams, hours, likes, highlights, notes. */
function importMonths(h) {
  const problems = validateHistory(h);
  if (problems.length) { const e = new Error(`The history file has problems:\n- ${problems.join("\n- ")}`); e.problems = problems; throw e; }
  const months = {};
  for (const [k, m] of Object.entries(h.months).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const points = {}, monthEnd = {}, startingBalance = {}, notes = {};
    for (const [p, v] of Object.entries(m.platforms)) {
      points[p] = (v.points || []).map(([d, n]) => ({ d, v: n, s: "import" }));
      monthEnd[p] = v.monthEnd;
      if (num(v.startingBalance) != null) startingBalance[p] = v.startingBalance;
      if (v.note) notes[p] = String(v.note);
    }
    months[k] = {
      points, monthEnd, startingBalance, notes, lastReadingDay: isDay(m.lastReadingDay) ? m.lastReadingDay : null,
      streams: num(m.streams), hours: num(m.hours), likes: num(m.likes), highlights: Array.isArray(m.highlights) ? m.highlights.map(String) : [],
    };
  }
  return {
    months,
    combinedOnly: Object.fromEntries(Object.entries(h.combinedOnly || {}).sort(([a], [b]) => (a < b ? -1 : 1))),
    records: Array.isArray(h.records) ? h.records : [],
    eras: Array.isArray(h.eras) ? h.eras : [],
  };
}

// ---------------------------------------------------------------------------------------------- one month (§8, §9)
/**
 * Every reading of one platform in a month, in date order: the points, plus the imported month-end as its own reading on lastReadingDay when
 * the chart missed it. Compared with the last IMPORTED point only, so a month the collector carries on in (the sheet's last month) keeps its
 * later collector readings, and the month-end is never added on a day that already has a reading.
 */
function readingsOf(month, p) {
  const pts = ((month.points || {})[p] || []).slice();
  const end = month.imported && month.imported.monthEnd ? month.imported.monthEnd[p] : null;
  if (num(end) != null) {
    const imps = pts.filter((x) => x.s === "import"), lastImp = imps[imps.length - 1];
    if (!lastImp || lastImp.v !== end) {
      const day0 = month.imported.lastReadingDay || lastDayOf(month.key);
      const day = lastImp && lastImp.d > day0 ? lastImp.d : day0;
      if (!pts.some((x) => x.d === day)) { pts.push({ d: day, v: end, s: "import" }); pts.sort((a, b) => (a.d < b.d ? -1 : 1)); }
    }
  }
  return pts;
}

/** Merges the imported points, the day's collector or manual readings and the corrections into one point per day per platform. */
function mergePoints({ key, imported, daily, corrections }) {
  const by = Object.fromEntries(PLATFORMS.map((p) => [p, new Map()]));
  for (const p of PLATFORMS) for (const pt of ((imported && imported.points) || {})[p] || []) by[p].set(pt.d, pt);
  // collector / manual > import for the same day
  for (const doc of daily || []) {
    if (!doc || monthOf(doc.day) !== key) continue;
    const tw = doc.twitch && num(doc.twitch.followers), yt = doc.youtube && num(doc.youtube.subscribers), tt = doc.tiktok && num(doc.tiktok.followers);
    if (tw != null) by.twitch.set(doc.day, { d: doc.day, v: tw, s: "collector" });
    if (yt != null) by.youtube.set(doc.day, { d: doc.day, v: yt, s: "collector" });   // a hidden YouTube count (null) skips the day
    if (tt != null) by.tiktok.set(doc.day, { d: doc.day, v: tt, s: doc.tiktok.source === "manual" ? "manual" : "collector" });
  }
  // a correction replaces that day's value (the original reading is kept on the correction)
  for (const c of corrections || []) {
    if (!c || c.removedAt || monthOf(c.day) !== key || !PLATFORMS.includes(c.platform) || num(c.value) == null) continue;
    by[c.platform].set(c.day, { d: c.day, v: c.value, s: "correction" });
  }
  return Object.fromEntries(PLATFORMS.map((p) => [p, [...by[p].values()].sort((a, b) => (a.d < b.d ? -1 : 1))]).filter(([, v]) => v.length));
}

/** Streams that count in a month (§9): ended in the month (LA), not after-shows, not ad hoc backstage streams; live time Start beat → End beat. */
function streamStats(streams, key, dayKey) {
  let count = 0, minutes = 0;
  let peak = null;
  for (const s of streams || []) {
    if (!s || s.afterShowOf || (s.adhoc && s.type === "backstage")) continue;
    const end = s.endMs, start = s.startMs;
    if (end == null || dayKey(end).slice(0, 7) !== key) continue;
    count++;
    if (start != null && end > start) minutes += Math.round((end - start) / 60000);
    if (num(s.peak) != null && s.peak > 0 && (!peak || s.peak > peak.value)) peak = { value: s.peak, day: dayKey(end), streamId: s.id || null };
  }
  return { count, minutes, peak };
}

const under = (n) => (num(n) == null ? null : n < UNDER ? "<5" : n);

/**
 * One climb/main/months/{key} doc. imported: the month's import pieces (or null); daily: that month's growthDaily docs ({ day, ...doc });
 * corrections: that month's corrections; streams: [{ id, endMs, startMs, peak, afterShowOf, adhoc, type }]; prevEnd: the previous calendar
 * month's month-end per platform ({} when it has none: a first month or the first month after the gap, whose first reading is its start);
 * settings: { likes, highlights }. dayKey: ms → LA day.
 */
function buildMonth({ key, imported, daily, corrections, streams, prevEnd = {}, prevMembersEnd = null, settings = {}, dayKey }) {
  const points = mergePoints({ key, imported, daily, corrections });
  const m = { key, points, imported: imported || null };
  const monthEnd = {}, startingBalance = {}, gain = {};
  for (const p of PLATFORMS) {
    const r = readingsOf(m, p);
    if (!r.length) continue;
    monthEnd[p] = r[r.length - 1].v;
    const sb = imported && imported.startingBalance && num(imported.startingBalance[p]) != null ? imported.startingBalance[p] : null;
    if (num(prevEnd[p]) != null) gain[p] = monthEnd[p] - prevEnd[p];
    else { startingBalance[p] = sb != null ? sb : r[0].v; gain[p] = monthEnd[p] - startingBalance[p]; }
  }
  const startTotal = PLATFORMS.reduce((a, p) => a + (num(prevEnd[p]) != null ? prevEnd[p] : num(startingBalance[p]) != null ? startingBalance[p] : 0), 0);
  const all = PLATFORMS.reduce((a, p) => a + (gain[p] || 0), 0);
  const st = streamStats(streams, key, dayKey);
  const hasImportStreams = imported && num(imported.streams) != null;
  // site members (from launch): the day's site blocks
  const site = (daily || []).filter((d) => d && monthOf(d.day) === key && d.site && num(d.site.members) != null).sort((a, b) => (a.day < b.day ? -1 : 1));
  let members = null;
  if (site.length) {
    const last = site[site.length - 1].site;
    const joined = site.reduce((a, d) => a + (num(d.site.joined) || 0), 0), left = site.reduce((a, d) => a + (num(d.site.left) || 0), 0);
    const by = last.byMethod || {};
    members = {
      points: site.map((d) => ({ d: d.day, v: d.site.members })),
      start: num(prevMembersEnd) != null ? prevMembersEnd : site[0].site.members - (num(site[0].site.joined) || 0) + (num(site[0].site.left) || 0),
      end: last.members, joined: under(joined), left: under(left), fanClub: under(num(last.fanClub)), subClub: under(num(last.subClub) || 0),
      byMethod: { google: under(num(by.google) || 0), email: under(num(by.email) || 0), twitch: under(num(by.twitch) || 0), unknown: under(num(by.unknown) || 0) },
    };
  }
  const tiktokNew = gain.tiktok, newMembers = members && typeof members.joined === "number" ? members.joined : null;
  const crossover = key >= CROSSOVER_FROM && num(gain.tiktok) != null && num(gain.twitch) != null && num(gain.youtube) != null && gain.tiktok > 0
    ? { tiktok: tiktokNew, twitchPer100: round1((gain.twitch / tiktokNew) * 100), youtubePer100: round1((gain.youtube / tiktokNew) * 100),
        ...(newMembers != null && all > 0 ? { membersPer100: round1((newMembers / all) * 100) } : {}), small: tiktokNew < SMALL_TIKTOK }
    : null;
  const likes = settings.likes && num(settings.likes[key]) != null ? settings.likes[key] : imported ? imported.likes : null;
  const highlights = settings.highlights && Array.isArray(settings.highlights[key]) ? settings.highlights[key] : imported ? imported.highlights : [];
  return {
    key, points, monthEnd, startingBalance, gain: { ...gain, all }, rate: startTotal > 0 ? round1((all / startTotal) * 100) : null,
    streams: hasImportStreams ? imported.streams : st.count,
    minutes: hasImportStreams ? Math.round((imported.hours || 0) * 60) : st.minutes,
    peak: st.peak, likes: num(likes), highlights: highlights || [], notes: (imported && imported.notes) || {},
    members, crossover, imported: imported || null,
  };
}

// ---------------------------------------------------------------------------------------------- milestones (§9)
const platformSteps = (first, max) => { const out = []; for (let v = 100; v <= max; v += v < 1000 ? 100 : 1000) if (v > first) out.push(v); return out; };
const thousandSteps = (first, max) => { const out = []; for (let v = 1000; v <= max; v += 1000) if (v > first) out.push(v); return out; };
const memberSteps = (first, max) => { const out = []; for (let v = 10; v <= max; v += v < 100 ? 10 : v < 1000 ? 100 : 1000) if (v > first) out.push(v); return out; };
/** The milestones in a reading series (in date order): one per threshold, dated by the first reading at or above it, never repeated. */
function milestonesOf(id, readings, steps) {
  if (!readings.length) return [];
  const max = Math.max(...readings.map((r) => r.v));
  return steps(readings[0].v, max).map((value) => { const hit = readings.find((r) => r.v >= value); return { id: `${id}-${value}`, platform: id, value, day: hit.d, src: hit.s === "import" ? "import" : "live" }; });
}

/** Combined readings: every day each platform that has started has a reading (the combined-only months first, as month-end readings). */
function combinedReadings(perPlatform, combinedOnly) {
  const early = Object.entries(combinedOnly || {}).map(([k, v]) => ({ d: lastDayOf(k), v, s: "import" }));
  const firsts = Object.fromEntries(PLATFORMS.filter((p) => perPlatform[p].length).map((p) => [p, perPlatform[p][0].d]));
  const maps = Object.fromEntries(PLATFORMS.map((p) => [p, new Map(perPlatform[p].map((r) => [r.d, r]))]));
  const days = [...new Set(PLATFORMS.flatMap((p) => perPlatform[p].map((r) => r.d)))].sort();
  const out = [];
  for (const d of days) {
    let sum = 0, ok = true, imp = true;
    for (const p of PLATFORMS) {
      if (!firsts[p] || firsts[p] > d) continue;
      const r = maps[p].get(d);
      if (!r) { ok = false; break; }
      sum += r.v;
      if (r.s !== "import") imp = false;
    }
    if (ok) out.push({ d, v: sum, s: imp ? "import" : "live" });
  }
  return [...early, ...out];
}

// ---------------------------------------------------------------------------------------------- public/climb (§8)
/**
 * months: the built month docs, in month order. Returns { public, milestones, memberMilestones }.
 * settings: { eras, goals, startDay (Back on air) }; records: the imported records; streamsPeak: the best counted Control Room stream { value,
 * day, streamId } or null; siteMembers: { latest, monthEnd[] } is read from the months; staging marks the members line.
 */
function buildPublic({ months, combinedOnly = {}, records = [], settings = {}, now, staging = false, lastReadingAt = null }) {
  const perPlatform = Object.fromEntries(PLATFORMS.map((p) => [p, months.flatMap((m) => readingsOf(m, p))]));
  const combined = combinedReadings(perPlatform, combinedOnly);
  const milestones = [
    ...PLATFORMS.flatMap((p) => milestonesOf(p, perPlatform[p], platformSteps)),
    ...milestonesOf("all", combined, thousandSteps),
  ].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.platform === "all" ? 1 : -1));
  // members (from launch)
  const mReadings = months.flatMap((m) => (m.members ? m.members.points.map((r) => ({ d: r.d, v: r.v, s: "live" })) : []));
  const memberMilestones = milestonesOf("members", mReadings, memberSteps);
  // month-ends from January 2025
  const monthEnd = [
    ...Object.entries(combinedOnly).map(([k, v]) => ({ month: k, day: lastDayOf(k), all: v })),
    ...months.filter((m) => Object.keys(m.monthEnd || {}).length).map((m) => {
      const row = { month: m.key, day: null, all: PLATFORMS.reduce((a, p) => a + (m.monthEnd[p] || 0), 0) };
      let day = null;
      for (const p of PLATFORMS) { if (m.monthEnd[p] == null) continue; row[p] = m.monthEnd[p]; const r = readingsOf(m, p); const d = r[r.length - 1].d; if (!day || d > day) day = d; }
      row.day = day;
      return row;
    }),
  ];
  // totals: each platform's latest reading
  const latest = Object.fromEntries(PLATFORMS.filter((p) => perPlatform[p].length).map((p) => [p, perPlatform[p][perPlatform[p].length - 1]]));
  const totals = { ...Object.fromEntries(Object.entries(latest).map(([p, r]) => [p, r.v])), all: Object.values(latest).reduce((a, r) => a + r.v, 0) };
  const lastDay = Object.values(latest).reduce((a, r) => (!a || r.d > a ? r.d : a), null);
  // the gap: the last imported reading → the first reading after it (none yet: open until today)
  const all = PLATFORMS.flatMap((p) => perPlatform[p]).sort((a, b) => (a.d < b.d ? -1 : 1));
  const lastImport = [...all].reverse().find((r) => r.s === "import");
  const firstLive = lastImport ? all.find((r) => r.d > lastImport.d && r.s !== "import") : null;
  const gaps = [];
  if (lastImport && (!firstLive || (msOfDay(firstLive.d) - msOfDay(lastImport.d)) / DAY_MS > GAP_MIN_DAYS)) gaps.push({ from: lastImport.d, to: firstLive ? firstLive.d : null });
  // crossover (§9): from August 2025, over the months with all three gains
  const xm = months.filter((m) => m.crossover);
  const sums = (list) => list.reduce((a, m) => ({ tiktok: a.tiktok + m.gain.tiktok, twitch: a.twitch + m.gain.twitch, youtube: a.youtube + m.gain.youtube }), { tiktok: 0, twitch: 0, youtube: 0 });
  const per100 = (s) => ({ tiktok: s.tiktok, twitch: s.tiktok > 0 ? round1((s.twitch / s.tiktok) * 100) : null, youtube: s.tiktok > 0 ? round1((s.youtube / s.tiktok) * 100) : null });
  const eras = (settings.eras || []).map((e) => ({ id: e.id, label: e.label, from: e.from || null, to: e.to || null, ...(e.note ? { note: e.note } : {}) }));
  const eraOf = (key) => eras.find((e) => e.from && key >= e.from.slice(0, 7) && (!e.to || key <= e.to.slice(0, 7))) || null;
  let crossover = null;
  if (xm.length) {
    const head = per100(sums(xm));
    const mm = xm.filter((m) => m.crossover.membersPer100 != null);
    const allNew = mm.reduce((a, m) => a + (m.gain.all || 0), 0), memNew = mm.reduce((a, m) => a + (typeof m.members.joined === "number" ? m.members.joined : 0), 0);
    crossover = {
      span: { from: xm[0].key, to: xm[xm.length - 1].key }, ...head,
      ...(mm.length && allNew > 0 ? { members: round1((memNew / allNew) * 100) } : {}),
      eras: eras.map((e) => { const list = xm.filter((m) => eraOf(m.key) === e); return list.length ? { era: e.id, label: e.label, ...per100(sums(list)) } : null; }).filter(Boolean),
    };
  }
  // members (site)
  const memMonths = months.filter((m) => m.members);
  const memLatest = mReadings.length ? mReadings[mReadings.length - 1] : null;
  const members = memLatest ? {
    total: memLatest.v, perThousand: totals.all > 0 ? round1((memLatest.v / totals.all) * 1000) : null, start: settings.startDay || null, staging: !!staging,
    monthEnd: memMonths.map((m) => ({ month: m.key, day: m.members.points[m.members.points.length - 1].d, total: m.members.end })),
    milestones: memberMilestones.map(({ src, ...x }) => x),
  } : { total: null, perThousand: null, start: settings.startDay || null, staging: !!staging, monthEnd: [], milestones: [] };
  const goals = Object.fromEntries(Object.entries(settings.goals || {}).filter(([, v]) => num(v) != null && v > 0));
  const pub = {
    lastReading: lastDay ? { day: lastDay, at: lastReadingAt } : null,
    totals, members, crossover, monthEnd, gaps, eras,
    milestones: milestones.map(({ src, ...x }) => x),
    goals, counts: { months: months.filter((m) => Object.keys(m.monthEnd || {}).length).length + Object.keys(combinedOnly).length, milestones: milestones.length },
    records: records.filter((r) => r && r.kind === "peakViewers").map((r) => ({ id: r.id, month: r.month, platform: r.platform, value: r.value, label: r.label })),
  };
  return { public: pub, milestones, memberMilestones, combined };
}

// ---------------------------------------------------------------------------------------------- records (§9; members read them from the months)
function recordsOf(months, streamsPeak = null) {
  let biggest = null, jump = null, most = null;
  for (const m of months) {
    if (num(m.gain && m.gain.all) != null && (!biggest || m.gain.all > biggest.value)) biggest = { month: m.key, value: m.gain.all };
    if (num(m.streams) != null && (!most || m.streams > most.value)) most = { month: m.key, value: m.streams };
  }
  for (const p of PLATFORMS) {
    const r = months.flatMap((m) => readingsOf(m, p));
    for (let i = 1; i < r.length; i++) { const v = r[i].v - r[i - 1].v; if (!jump || v > jump.value) jump = { platform: p, value: v, from: r[i - 1].d, to: r[i].d }; }
  }
  return { biggestMonth: biggest, bestJump: jump, mostStreams: most, peakViewers: streamsPeak };
}

module.exports = {
  PLATFORMS, SMALL_TIKTOK, CROSSOVER_FROM, GAP_MIN_DAYS,
  validateHistory, importMonths, readingsOf, mergePoints, streamStats, buildMonth, buildPublic, recordsOf, milestonesOf, combinedReadings,
  monthOf, lastDayOf, prevMonth, nextMonth,
};
