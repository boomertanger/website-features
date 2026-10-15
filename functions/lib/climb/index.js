// Creator Climb backend (docs/specs/creator-climb.md §7-§11). Everything under sites/boomertanger/climb and public/climb is written only here
// (Admin SDK); lib/climb/build.js is the pure core.
//
//   climbRebuild   Firestore trigger on growthDaily/{day} writes: rebuilds that day's month and every later month (a month's start is the
//                  previous month's end), then public/climb; announces new milestones (activityLog "climb-milestone", never for imported
//                  ones). Skips writing what didn't change.
//   climbAdmin     callable, owner or site admin (checked here), rate-limited: { action: notes | eras | goals | exclude | correctionAdd |
//                  correctionRemove | rebuildAll, ... }. Every change writes adminLog (feature creatorClimb, changes { before, after }).
//
// Data (sites/boomertanger/…): climb/main (settings: eras, goals, likes, highlights, excludeUids + excludeHandles; import: combinedOnly,
// records, eras; lastRebuild) — the spec's "climb/main/settings" lives on the main doc itself (a path can't end in a collection);
// climb/main/months/{YYYY-MM}; climb/main/corrections/{id}; climb/main/private/state (lastBuildHash, announced[]) and private/limit-{uid};
// public/climb. build(deps) is what scripts/seed-climb-history.js runs (deps: db, now, adminLogEntry, staging).
const { onCall } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const crypto = require("crypto");
const B = require("./build");
const { SITE_ID, fail, callerInfo, requireAdmin } = require("../vault/common");
const { dayKey } = require("../growth/collect");

const FEATURE = "creatorClimb";
const LIMIT = { windowMs: 10 * 60 * 1000, max: 60 };
const REBUILD_GAP_MS = 60 * 1000;
const PLATFORM_NAME = { twitch: "Twitch", tiktok: "TikTok", youtube: "YouTube", all: "Combined", members: "boomertanger.com" };
const isStagingProject = () => (process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "").includes("staging");

const msOf = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const hashOf = (v) => crypto.createHash("sha256").update(stable(v)).digest("hex");
/** Firestore keeps no undefined values: drop them (deeply). */
const clean = (v) => JSON.parse(JSON.stringify(v));

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const now = deps.now || Date.now;
  const staging = deps.staging != null ? deps.staging : isStagingProject();
  const site = db.doc(`sites/${SITE_ID}`);
  const R = {
    main: site.collection("climb").doc("main"),
    months: site.collection("climb").doc("main").collection("months"),
    month: (k) => site.collection("climb").doc("main").collection("months").doc(k),
    corrections: site.collection("climb").doc("main").collection("corrections"),
    state: site.collection("climb").doc("main").collection("private").doc("state"),
    limit: (uid) => site.collection("climb").doc("main").collection("private").doc(`limit-${uid}`),
    public: site.collection("public").doc("climb"),
    daily: site.collection("growthDaily"),
    streams: site.collection("streams"),
  };
  const ts = (ms) => Timestamp.fromMillis(ms);

  /** The settings on climb/main, with the eras' open ends filled in ("The build" runs until the day before "Back on air" starts). */
  async function settingsOf() {
    const s = await R.main.get();
    const d = s.exists ? s.data() : {};
    const eras = (Array.isArray(d.eras) && d.eras.length ? d.eras : (d.import && d.import.eras) || []).map((e) => ({ ...e }));
    const dated = eras.filter((e) => e.from).sort((a, b) => (a.from < b.from ? -1 : 1));
    dated.forEach((e, i) => { if (!e.to && dated[i + 1]) { const n = new Date(Date.parse(`${dated[i + 1].from}T00:00:00Z`) - 864e5); e.to = n.toISOString().slice(0, 10); } });
    const back = eras.find((e) => e.id === "back-on-air");
    return {
      raw: d, eras, goals: d.goals || {}, likes: d.likes || {}, highlights: d.highlights || {}, excludeUids: d.excludeUids || [],
      startDay: back && back.from ? back.from : null, import: d.import || { combinedOnly: {}, records: [], eras: [] },
    };
  }

  // ---------------------------------------------------------------------------------------------- reading a month's inputs
  async function dailyOf(key) {
    const snap = await R.daily.where(admin.firestore.FieldPath.documentId(), ">=", `${key}-01`).where(admin.firestore.FieldPath.documentId(), "<=", `${key}-31`).get();
    return snap.docs.map((d) => ({ day: d.id, ...d.data() }));
  }
  async function correctionsOf(key) {
    const snap = await R.corrections.where("day", ">=", `${key}-01`).where("day", "<=", `${key}-31`).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  /** Streams that ended around the month (a day either side, for the Los Angeles date), with their beat times and combined peak. */
  async function streamsOf(key) {
    const [y, m] = key.split("-").map(Number);
    const from = Date.UTC(y, m - 1, 1) - 864e5, to = Date.UTC(y, m, 1) + 864e5;
    const snap = await R.streams.where("actualEnd", ">=", ts(from)).where("actualEnd", "<", ts(to)).get();
    return snap.docs.map((d) => {
      const s = d.data(), beats = s.beats || {};
      const endMs = msOf(beats.end && beats.end.endedAt) || msOf(s.actualEnd);
      const startMs = msOf(beats.start && beats.start.startedAt) || msOf(s.actualStart);
      return { id: d.id, endMs, startMs, peak: s.stats && typeof s.stats.peak === "number" ? s.stats.peak : null, afterShowOf: s.afterShowOf || null, adhoc: s.adhoc === true, type: s.type || null, state: s.state };
    }).filter((s) => s.state === "ended");
  }
  /** Every month key there is: the stored months and the months growthDaily has readings in. */
  async function monthKeys() {
    const [months, days] = await Promise.all([R.months.listDocuments(), R.daily.listDocuments()]);
    return [...new Set([...months.map((r) => r.id), ...days.map((r) => r.id.slice(0, 7))])].filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  }

  // ---------------------------------------------------------------------------------------------- rebuilding
  /** Rebuilds one month from its inputs; writes it when it changed. Returns the built month. */
  async function rebuildMonth(key, settings, prev) {
    const [snap, daily, corrections, streams] = await Promise.all([R.month(key).get(), dailyOf(key), correctionsOf(key), streamsOf(key)]);
    const cur = snap.exists ? snap.data() : null;
    const imported = cur && cur.imported ? cur.imported : null;
    if (!imported && !daily.length) return null;
    const prevEnd = prev && prev.key === B.prevMonth(key) ? prev.monthEnd || {} : {};
    const prevMembersEnd = prev && prev.key === B.prevMonth(key) && prev.members ? prev.members.end : null;
    const m = clean(B.buildMonth({ key, imported, daily, corrections, streams, prevEnd, prevMembersEnd, settings, dayKey }));
    const { updatedAt: _u, ...curNoTime } = cur || {};
    if (!cur || stable(curNoTime) !== stable(m)) await R.month(key).set({ ...m, updatedAt: FieldValue.serverTimestamp() });
    return m;
  }
  /** Rebuilds the months from `fromKey` on (all of them when it's null), then public/climb. Returns { months, milestones, changed }. */
  async function rebuildFrom(fromKey = null, { announce = true } = {}) {
    const settings = await settingsOf();
    const keys = await monthKeys();
    const months = [];
    let prev = null;
    for (const key of keys) {
      let m;
      if (fromKey && key < fromKey) {
        const s = await R.month(key).get();
        m = s.exists ? s.data() : null;
      } else m = await rebuildMonth(key, settings, prev);
      if (m) { months.push(m); prev = m; }
    }
    return publish(months, settings, { announce });
  }
  async function publish(months, settings, { announce = true } = {}) {
    // the latest reading by its day id (a descending document-id query would need a composite index)
    const dayRefs = (await R.daily.listDocuments()).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.id)).sort((x, y) => (x.id < y.id ? -1 : 1));
    const latestDaily = dayRefs.length ? await dayRefs[dayRefs.length - 1].get() : null;
    const lastReadingAt = latestDaily && latestDaily.exists ? msOf(latestDaily.get("collectedAt")) : null;
    const built = B.buildPublic({ months, combinedOnly: settings.import.combinedOnly || {}, records: settings.import.records || [], settings, now: now(), staging, lastReadingAt });
    const pub = clean(built.public);
    const stateSnap = await R.state.get();
    const state = stateSnap.exists ? stateSnap.data() : {};
    const hash = hashOf(pub);
    let changed = false;
    if (state.lastBuildHash !== hash) { await R.public.set({ ...pub, updatedAt: FieldValue.serverTimestamp() }); changed = true; }
    // announce what's new and live (imported milestones never are)
    const announced = new Set(state.announced || []);
    const fresh = [...built.milestones, ...built.memberMilestones].filter((m) => m.src !== "import" && !announced.has(m.id));
    if (announce) for (const m of fresh.slice(0, 5)) {
      const what = m.platform === "members" ? `boomertanger.com reached ${m.value.toLocaleString("en-US")} members` : m.platform === "all" ? `Boomertanger passed ${m.value.toLocaleString("en-US")} followers across every platform` : `${PLATFORM_NAME[m.platform]} passed ${m.value.toLocaleString("en-US")} ${m.platform === "youtube" ? "subscribers" : "followers"}`;
      try { await db.collection("activityLog").add({ feature: FEATURE, type: "climb-milestone", summary: what.slice(0, 200), link: "/climb", actorName: null, milestoneId: m.id, createdAt: FieldValue.serverTimestamp() }); }
      catch (err) { console.error("climb: activityLog write failed", err); }
    }
    // every milestone found so far is remembered, imported ones included, so none is ever announced twice (or late)
    const all = [...built.milestones, ...built.memberMilestones].map((m) => m.id);
    const nextAnnounced = [...new Set([...announced, ...all])];
    if (changed || nextAnnounced.length !== announced.size) await R.state.set({ lastBuildHash: hash, announced: nextAnnounced }, { merge: true });
    const summary = { months: pub.counts.months, milestones: pub.counts.milestones };
    await R.main.set({ lastRebuild: { at: ts(now()), ...summary } }, { merge: true });
    return { ...summary, changed, announced: announce ? Math.min(fresh.length, 5) : 0 };
  }

  // ---------------------------------------------------------------------------------------------- climbAdmin
  async function rateLimit(uid) {
    const at = now();
    await db.runTransaction(async (tx) => {
      const s = await tx.get(R.limit(uid));
      const d = s.exists ? s.data() : {};
      const fresh = !d.windowStart || at - d.windowStart > LIMIT.windowMs;
      const count = fresh ? 0 : d.count || 0;
      if (count >= LIMIT.max) throw fail("resource-exhausted", "That's a lot of changes at once. Try again in a few minutes.", "rateLimited");
      tx.set(R.limit(uid), { windowStart: fresh ? at : d.windowStart, count: count + 1 }, { merge: true });
    });
  }
  async function log(c, action, itemTitle, changes, details) {
    try {
      const entry = await deps.adminLogEntry(db, { feature: FEATURE, action, itemPath: R.main.path, itemTitle, actorUid: c.uid, actorName: c.name, reason: "", changes, details });
      await db.collection("adminLog").add(entry);
    } catch (err) { console.error("climb: adminLog write failed", err); }
  }
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const isDay = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

  async function adminAction(request) {
    const c = await callerInfo(request);
    requireAdmin(c);
    await rateLimit(c.uid);
    const d = request.data || {};
    const s = await settingsOf();
    switch (d.action) {
      case "notes": {
        if (!/^\d{4}-\d{2}$/.test(d.month || "")) throw fail("invalid-argument", "Pick a month.", "month");
        const likes = d.likes == null || d.likes === "" ? null : Number(d.likes);
        if (likes != null && (!Number.isFinite(likes) || likes < 0 || likes > 1e10)) throw fail("invalid-argument", "Live likes must be a number.", "likes");
        const highlights = (Array.isArray(d.highlights) ? d.highlights : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 12);
        const before = { likes: s.likes[d.month] ?? null, highlights: s.highlights[d.month] ?? null };
        await R.main.set({ likes: { [d.month]: likes == null ? FieldValue.delete() : likes }, highlights: { [d.month]: highlights.length ? highlights : FieldValue.delete() } }, { merge: true });
        await log(c, "notes", `Month notes ${d.month}`, { before, after: { likes, highlights } });
        const out = await rebuildFrom(d.month);
        return { ok: true, ...out };
      }
      case "eras": {
        const eras = (Array.isArray(d.eras) ? d.eras : []).slice(0, 8).map((e) => ({ id: str(e.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, "-") || null, label: str(e.label, 40), from: e.from && isDay(e.from) ? e.from : null, to: e.to && isDay(e.to) ? e.to : null, ...(str(e.note, 200) ? { note: str(e.note, 200) } : {}) }));
        if (!eras.length || eras.some((e) => !e.id || !e.label)) throw fail("invalid-argument", "Every era needs a name.", "eras");
        if (eras.some((e) => e.from && e.to && e.to < e.from)) throw fail("invalid-argument", "An era ends before it starts.", "eras");
        await R.main.set({ eras }, { merge: true });
        await log(c, "eras", "Eras", { before: s.raw.eras || s.import.eras || [], after: eras });
        const out = await rebuildFrom(null);
        return { ok: true, ...out };
      }
      case "goals": {
        const goals = {};
        for (const k of ["twitch", "tiktok", "youtube", "all", "members"]) { const v = d.goals && d.goals[k]; if (v === null || v === "" || v === undefined) continue; const n = Number(v); if (!Number.isFinite(n) || n <= 0 || n > 1e9) throw fail("invalid-argument", "Goals are whole numbers above zero.", "goals"); goals[k] = Math.round(n); }
        // the whole goals map is replaced, so a cleared goal goes away
        if (s.raw && Object.keys(s.raw).length) await R.main.update({ goals }); else await R.main.set({ goals }, { merge: true });
        await log(c, "goals", "Goals", { before: s.goals, after: goals });
        const out = await rebuildFrom("9999-99");
        return { ok: true, ...out };
      }
      case "exclude": {
        const handle = str(d.handle, 40).replace(/^@/, "").toLowerCase();
        if (!handle || !/^[a-z0-9_.-]+$/.test(handle)) throw fail("invalid-argument", "Type a handle.", "handle");
        const h = await db.doc(`handles/${handle}`).get();
        const uid = h.exists ? h.get("uid") : null;
        if (!uid) throw fail("not-found", `No account with the handle @${handle}.`, "noHandle");
        const list = (s.raw.excludeHandles || []).filter((x) => x.uid !== uid);
        const add = d.remove !== true;
        const next = add ? [...list, { uid, handle }] : list;
        await R.main.set({ excludeUids: next.map((x) => x.uid), excludeHandles: next }, { merge: true });
        await log(c, add ? "excludeAdd" : "excludeRemove", `@${handle}`, { before: s.raw.excludeHandles || [], after: next });
        return { ok: true, excluded: next };
      }
      case "correctionAdd": {
        if (!isDay(d.day)) throw fail("invalid-argument", "Pick a day.", "day");
        if (!B.PLATFORMS.includes(d.platform)) throw fail("invalid-argument", "Pick a platform.", "platform");
        const value = Number(d.value);
        if (!Number.isFinite(value) || value < 0 || value > 1e9 || Math.round(value) !== value) throw fail("invalid-argument", "The correct number is a whole number.", "value");
        const reason = str(d.reason, 300);
        if (reason.length < 3) throw fail("invalid-argument", "Say why (a few words).", "reason");
        const key = d.day.slice(0, 7);
        const ms = await R.month(key).get();
        const pts = ms.exists ? ((ms.get("points") || {})[d.platform] || []) : [];
        const orig = pts.find((p) => p.d === d.day && p.s !== "correction");
        const daily = await R.daily.doc(d.day).get();
        const dv = daily.exists ? (d.platform === "youtube" ? daily.get("youtube.subscribers") : daily.get(`${d.platform}.followers`)) : null;
        const before = orig ? orig.v : typeof dv === "number" ? dv : null;
        const ref = await R.corrections.add({ day: d.day, platform: d.platform, value, before, reason, by: { uid: c.uid, name: c.name }, at: FieldValue.serverTimestamp() });
        await log(c, "correctionAdd", `${PLATFORM_NAME[d.platform]} on ${d.day}`, { before, after: value }, { correctionId: ref.id, reason });
        const out = await rebuildFrom(key);
        return { ok: true, id: ref.id, ...out };
      }
      case "correctionRemove": {
        if (typeof d.id !== "string" || !d.id || d.id.length > 64) throw fail("invalid-argument", "Which correction?", "id");
        const ref = R.corrections.doc(d.id), snap = await ref.get();
        if (!snap.exists) throw fail("not-found", "That correction isn't there.", "noCorrection");
        if (snap.get("removedAt")) return { ok: true, already: true };
        await ref.update({ removedAt: FieldValue.serverTimestamp(), removedBy: { uid: c.uid, name: c.name } });
        await log(c, "correctionRemove", `${PLATFORM_NAME[snap.get("platform")] || ""} on ${snap.get("day")}`, { before: snap.get("value"), after: snap.get("before") }, { correctionId: d.id });
        const out = await rebuildFrom(String(snap.get("day")).slice(0, 7));
        return { ok: true, ...out };
      }
      case "rebuildAll": {
        const last = msOf(s.raw.lastRebuild && s.raw.lastRebuild.at);
        if (last && now() - last < REBUILD_GAP_MS) throw fail("resource-exhausted", "It just rebuilt. Give it a minute.", "rateLimited");
        const out = await rebuildFrom(null);
        await log(c, "rebuildAll", "Rebuild now", null, out);
        return { ok: true, ...out };
      }
      default: throw fail("invalid-argument", "Unknown action.", "action");
    }
  }

  const functions = {
    climbRebuild: onDocumentWritten(`sites/{siteId}/growthDaily/{day}`, async (event) => {
      if (event.params.siteId !== SITE_ID || !/^\d{4}-\d{2}-\d{2}$/.test(event.params.day)) return;
      await rebuildFrom(event.params.day.slice(0, 7));
    }),
    climbAdmin: onCall(adminAction),
  };
  return { functions, rebuildFrom, rebuildMonth, publish, settingsOf, adminAction, refs: R, FEATURE };
}

module.exports = { build };
