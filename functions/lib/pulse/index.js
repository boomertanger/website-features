// Traffic Pulse backend (docs/specs/traffic-pulse.md §3, §6, §7, §9). Everything under sites/boomertanger/pulse/main is written ONLY here (and by
// scripts/pulse-sample.js on staging); admins read it (firestore.rules). lib/pulse/core.js is the pure part. Nothing here loads
// rewards/grant.js (scripts/check-pulse.js checks), and no other feature's data is written: sign-ups, ratings, broken links, streams and the
// growth counts are read only.
//
//   pulseBeacon   HTTPS POST from the /p proxy (site/functions/p.js): x-pulse-key must match PULSE_PROXY_KEY; 8 KB cap; the host must be this
//                 project's site; bots dropped; staff dropped while settings.excludeStaff (default on); a per-visitor rate limit. The visitor is
//                 a hash of IP + user agent + host + today's salt (private/salt, replaced at midnight Los Angeles); IP and user agent are never
//                 stored. Unique markers (uniq/{day}_{hash}[_{service}], uniqMembers/{day}_{uid}) expire through TTL; the batch goes to
//                 buffer/{autoId} (no IP, no uid, no user agent; expireAt 48 h).
//   pulseRollup   every 15 min: unrolled buffer batches → days/{date}, services/{id}/days/{date}, paths/{hash}/days/{date}, sources/{date};
//                 then the fast alerts (traffic spike, error surge).
//   pulseDaily    00:30 Los Angeles: the new salt, yesterday closed (new members, stream rollups, scores/current, moves/current, the join path),
//                 the slow alerts (traffic drop, missing page surge, slow page, goal off pace, record), automatic notes (Service Hub versions,
//                 streams), the monthly rollup on the 1st, and retention (daily docs older than 25 months, once their month is rolled up).
//   pulseCfPull   hourly: Cloudflare Web Analytics (visits, countries, browsers, Core Web Vitals p75 per path) through the GraphQL Analytics API,
//                 kept under their own labels; "not connected" until PULSE_CF=on in functions/.env binds CLOUDFLARE_ANALYTICS_TOKEN. Also the
//                 beacon silence alert (no events for 2 h while Cloudflare still sees visits).
//   pulseReport   06:00 and 06:30 Los Angeles: the weekly report on Mondays (06:00), the monthly report on the 1st (06:30) → reports/{id}.
//   pulseAdmin    callable, site admins (role checks inside): alert ack / snooze, notes, move done / undo, CSV; settings (goals, alert rules,
//                 staff exclusion, sampling, campaign tags) need the owner or an Overseer (A2+) and write adminLog (feature trafficPulse).
// Alerts also go to notifyOutbox as type "pulse-alert", audience admins, no message text, with a dedupeKey (Boom Alerts isn't built yet).
const { onRequest, onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const C = require("./core");
const { SITE_ID, fail, callerInfo, requireAdmin } = require("../vault/common");

const PULSE_PROXY_KEY = defineSecret("PULSE_PROXY_KEY");
const CF_ON = process.env.PULSE_CF === "on";   // read at deploy: binds the token secret only once it exists
const CLOUDFLARE_ANALYTICS_TOKEN = CF_ON ? defineSecret("CLOUDFLARE_ANALYTICS_TOKEN") : null;
const CF_ACCOUNT_ID = defineString("CF_ACCOUNT_ID", { default: "" });
const CF_SITE_TAG = defineString("CF_WEB_ANALYTICS_SITE_TAG", { default: "" });
const TZ = C.TZ;
const FEATURE = "trafficPulse";
const DAY_MS = 864e5;
const BUFFER_TTL = 2 * DAY_MS, UNIQ_TTL = 2 * DAY_MS, MEMBER_TTL = 8 * DAY_MS, OUTBOX_TTL = 30 * DAY_MS;
const KEEP_MONTHS = 25;
const DEFAULT_SETTINGS = {
  excludeStaff: true, sampling: 1,
  rules: {
    spike: { on: true, factor: 3, minViews: 30 }, drop: { on: true, below: 0.5, minUsual: 100 }, silence: { on: true, hours: 2 },
    errors: { on: true, factor: 3, abs: 20 }, missing: { on: true, hits: 10 }, slow: { on: true, lcp: 2.5, days: 3 },
    goal: { on: true, behind: 0.15, daysLeft: 7 }, record: { on: true },
  },
};
const SEVERITY = { spike: "urgent", drop: "urgent", silence: "urgent", errors: "watch", missing: "watch", slow: "urgent", goal: "watch", record: "good" };
const isStagingProject = () => (process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "").includes("staging");
const msOf = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
const deep = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" ? deep(a[k], v) : v; return o; };
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysInMonth = (month) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
/** Los Angeles midnight of a day, as ms. */
const laMidnight = (day) => { const guess = Date.parse(`${day}T08:00:00Z`); const p = C.laParts(guess); return guess - (Number(p.hh) * 60 + Number(p.mm)) * 60000; };

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { FieldValue, Timestamp, FieldPath } = admin.firestore;
  const now = deps.now || Date.now;
  const staging = deps.staging != null ? deps.staging : isStagingProject();
  const base = `sites/${SITE_ID}/pulse/main`;
  const R = {
    main: db.doc(base),
    buffer: db.collection(`${base}/buffer`),
    salt: db.doc(`${base}/private/salt`),
    state: db.doc(`${base}/private/state`),
    uniq: (id) => db.doc(`${base}/uniq/${id}`),
    uniqMember: (id) => db.doc(`${base}/uniqMembers/${id}`),
    day: (d) => db.doc(`${base}/days/${d}`),
    days: db.collection(`${base}/days`),
    service: (id) => db.doc(`${base}/services/${id}`),
    services: db.collection(`${base}/services`),
    serviceDay: (id, d) => db.doc(`${base}/services/${id}/days/${d}`),
    serviceDays: (id) => db.collection(`${base}/services/${id}/days`),
    path: (h) => db.doc(`${base}/paths/${h}`),
    pathDay: (h, d) => db.doc(`${base}/paths/${h}/days/${d}`),
    paths: db.collection(`${base}/paths`),
    source: (d) => db.doc(`${base}/sources/${d}`),
    sources: db.collection(`${base}/sources`),
    stream: (id) => db.doc(`${base}/streams/${id}`),
    month: (m) => db.doc(`${base}/months/${m}`),
    scores: db.doc(`${base}/scores/current`),
    moves: db.doc(`${base}/moves/current`),
    alerts: db.collection(`${base}/alerts`),
    alert: (id) => db.doc(`${base}/alerts/${id}`),
    goals: db.collection(`${base}/goals`),
    goal: (id) => db.doc(`${base}/goals/${id}`),
    notes: db.collection(`${base}/notes`),
    note: (id) => db.doc(`${base}/notes/${id}`),
    reports: db.collection(`${base}/reports`),
    report: (id) => db.doc(`${base}/reports/${id}`),
    settings: db.doc(`${base}/settings/main`),
    ref: (tag) => db.doc(`${base}/refs/${tag}`),
    refs: db.collection(`${base}/refs`),
    outbox: db.collection(`sites/${SITE_ID}/notifyOutbox`),
    site: db.doc(`sites/${SITE_ID}`),
  };
  const ts = (ms) => Timestamp.fromMillis(ms);

  // ---------------------------------------------------------------------------------------------- settings (cached a minute per instance)
  let settingsCache = null, settingsAt = 0;
  async function settings(fresh = false) {
    if (!fresh && settingsCache && now() - settingsAt < 60000) return settingsCache;
    const s = await R.settings.get();
    settingsCache = deep(DEFAULT_SETTINGS, s.exists ? s.data() : {});
    settingsAt = now();
    return settingsCache;
  }

  // ---------------------------------------------------------------------------------------------- the daily salt
  let saltCache = null;
  async function saltFor(day) {
    if (saltCache && saltCache.day === day) return saltCache.salt;
    const salt = await db.runTransaction(async (tx) => {
      const s = await tx.get(R.salt);
      if (s.exists && s.get("day") === day) return s.get("salt");
      const v = crypto.randomBytes(32).toString("hex");
      tx.set(R.salt, { day, salt: v, at: FieldValue.serverTimestamp() });
      return v;
    });
    saltCache = { day, salt };
    return salt;
  }

  // ---------------------------------------------------------------------------------------------- pulseBeacon
  const limiter = new Map();   // per visitor hash, per instance: at most 150 events in 10 minutes
  function limited(hash, n) {
    const t = now(), w = limiter.get(hash);
    if (!w || t - w.start > 600000) { limiter.set(hash, { start: t, n }); if (limiter.size > 20000) limiter.clear(); return false; }
    w.n += n;
    return w.n > 150;
  }
  /** Creates a marker; true when it didn't exist yet. */
  async function mark(ref, expireMs) {
    try { await ref.create({ expireAt: ts(expireMs) }); return true; }
    catch (err) { if (err && (err.code === 6 || /ALREADY_EXISTS/.test(String(err.message)))) return false; throw err; }
  }
  async function beacon(req, res) {
    res.set("cache-control", "no-store");
    if (req.method !== "POST") { res.status(405).end(); return; }
    const key = req.get("x-pulse-key") || "";
    const want = deps.proxyKey || PULSE_PROXY_KEY.value();
    if (!want || key.length !== want.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(want))) { res.status(403).end(); return; }
    const raw = req.rawBody || Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));
    if (!raw || raw.length > 8192) { res.status(413).end(); return; }
    const host = (req.get("x-pulse-host") || "").toLowerCase();
    const origin = req.get("x-pulse-origin") || "";
    if (!C.hostAllowed(host, staging)) { res.status(204).end(); return; }
    if (origin) { try { if (new URL(origin).hostname.toLowerCase() !== host) { res.status(204).end(); return; } } catch { res.status(204).end(); return; } }
    const ua = req.get("x-pulse-ua") || "";
    if (C.isBot(ua)) { res.status(204).end(); return; }
    let batch = null;
    try { batch = C.cleanBatch(JSON.parse(raw.toString("utf8"))); } catch { batch = null; }
    if (!batch) { res.status(204).end(); return; }
    const st = await settings();
    if (batch.st && st.excludeStaff) { res.status(204).end(); return; }
    if (st.sampling < 1 && Math.random() > st.sampling) { res.status(204).end(); return; }
    const t = now(), p = C.laParts(t);
    const salt = await saltFor(p.day);
    const ip = req.get("x-pulse-ip") || "";
    const hash = crypto.createHash("sha256").update(`${ip}|${ua}|${host}|${salt}`).digest("hex").slice(0, 32);
    if (limited(hash, batch.ev.length)) { res.status(204).end(); return; }
    for (const e of batch.ev) {
      if (e.e !== "view") continue;
      e.uv = await mark(R.uniq(`${p.day}_${hash}`), t + UNIQ_TTL);
      e.us = await mark(R.uniq(`${p.day}_${hash}_${e.s}`), t + UNIQ_TTL);
      if (batch.u) {
        e.um = await mark(R.uniqMember(`${p.day}_${batch.u}`), t + MEMBER_TTL);
        if (e.um) {
          const prev = await db.getAll(...Array.from({ length: 7 }, (_, i) => R.uniqMember(`${addDays(p.day, -(i + 1))}_${batch.u}`)));
          e.mr = prev.some((d) => d.exists);
        }
      }
    }
    await R.buffer.add({ atMs: t, at: FieldValue.serverTimestamp(), day: p.day, hh: p.hh, mm: p.mm, in: batch.in, ev: batch.ev, rolled: false, expireAt: ts(t + BUFFER_TTL) });
    res.status(204).end();
  }

  // ---------------------------------------------------------------------------------------------- pulseRollup
  /** Plain numbers → FieldValue.increment, deeply; strings stay. */
  const inc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? FieldValue.increment(v) : v && typeof v === "object" ? inc(v) : v]));
  async function rollup() {
    let total = 0;
    for (let round = 0; round < 5; round++) {
      const snap = await R.buffer.where("rolled", "==", false).orderBy("atMs").limit(1500).get();
      if (snap.empty) break;
      const t = C.tally(snap.docs.map((d) => d.data()));
      const w = db.bulkWriter();
      for (const [day, v] of Object.entries(t.days)) w.set(R.day(day), { ...inc(v), day, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      for (const [id, byDay] of Object.entries(t.services)) {
        w.set(R.service(id), { id, lastSeen: FieldValue.serverTimestamp() }, { merge: true });
        for (const [day, v] of Object.entries(byDay)) w.set(R.serviceDay(id, day), { ...inc(v), day }, { merge: true });
      }
      for (const [h, byDay] of Object.entries(t.paths)) {
        const first = Object.values(byDay)[0];
        w.set(R.path(h), { path: first.path, service: first.service, lastSeen: FieldValue.serverTimestamp() }, { merge: true });
        for (const [day, v] of Object.entries(byDay)) w.set(R.pathDay(h, day), { ...inc({ views: v.views, engaged: v.engaged }), path: v.path, service: v.service, day }, { merge: true });
      }
      for (const [day, v] of Object.entries(t.sources)) w.set(R.source(day), { ...inc(v), day }, { merge: true });
      for (const d of snap.docs) w.update(d.ref, { rolled: true });
      await w.close();
      total += snap.size;
      if (snap.size < 1500) break;
    }
    await fastAlerts();
    return { batches: total };
  }

  // ---------------------------------------------------------------------------------------------- alerts
  async function raise(type, { service = null, key, title, facts = {}, }) {
    const st = await settings();
    if (!st.rules[type] || !st.rules[type].on) return null;
    const dedupeKey = `pulse:${type}:${key}`;
    const id = crypto.createHash("sha1").update(dedupeKey).digest("hex").slice(0, 20);
    const ref = R.alert(id), snap = await ref.get();
    if (snap.exists && snap.get("state") !== "resolved") { await ref.set({ lastAt: FieldValue.serverTimestamp(), facts }, { merge: true }); return id; }
    await ref.set({ id, type, severity: SEVERITY[type], service, title: String(title).slice(0, 140), facts, state: "new", dedupeKey,
      firstAt: FieldValue.serverTimestamp(), lastAt: FieldValue.serverTimestamp(), ack: null, snoozeUntil: null, resolvedAt: null });
    try {
      await R.outbox.add({ type: "pulse-alert", audience: "admins", subject: { kind: "pulseAlert", id }, payload: { alertType: type, severity: SEVERITY[type], service },
        priority: SEVERITY[type] === "urgent" ? "high" : "normal", dedupeKey, status: "pending", createdAt: FieldValue.serverTimestamp(), expireAt: ts(now() + OUTBOX_TTL) });
    } catch (err) { console.error("pulse: notifyOutbox write failed", err && err.message); }
    return id;
  }
  async function resolveWhere(type, keep) {
    const snap = await R.alerts.where("type", "==", type).where("state", "in", ["new", "ack", "snoozed"]).get();
    for (const d of snap.docs) if (!keep(d.data())) await d.ref.update({ state: "resolved", resolvedAt: FieldValue.serverTimestamp() });
  }
  /** The usual value of a field: the median of the same weekday over the last 4 weeks. */
  async function usualOf(refFor, day, pick) {
    const docs = await db.getAll(...[7, 14, 21, 28].map((n) => refFor(addDays(day, -n))));
    return C.usual(docs.filter((d) => d.exists).map((d) => pick(d.data())));
  }
  async function fastAlerts() {
    const st = await settings(), p = C.laParts(now());
    const svc = await R.services.listDocuments();
    const spiking = new Set(), surging = new Set();
    for (const ref of svc) {
      const today = await R.serviceDay(ref.id, p.day).get();
      if (!today.exists) continue;
      const d = today.data(), hourViews = (d.hours || {})[p.hh] || 0;
      if (hourViews >= st.rules.spike.minViews) {
        const u = await usualOf((day) => R.serviceDay(ref.id, day), p.day, (x) => (x.hours || {})[p.hh] || 0);
        if (hourViews >= Math.max(1, u) * st.rules.spike.factor) {
          const src = await R.source(p.day).get();
          const refs = Object.entries((src.exists && src.get("refs")) || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => ({ from: k, n }));
          spiking.add(ref.id);
          await raise("spike", { service: ref.id, key: `${ref.id}:${p.day}:${p.hh}`, title: `Traffic spike on ${ref.id}`, facts: { views: hourViews, usual: u, hour: p.hh, from: refs } });
        }
      }
      const errs = d.errors || 0;
      if (errs >= 5) {
        const u = await usualOf((day) => R.serviceDay(ref.id, day), p.day, (x) => x.errors || 0);
        if (errs >= st.rules.errors.abs || errs >= Math.max(1, u) * st.rules.errors.factor) { surging.add(ref.id); await raise("errors", { service: ref.id, key: `${ref.id}:${p.day}`, title: `Error surge on ${ref.id}`, facts: { errors: errs, usual: u } }); }
      }
    }
    await resolveWhere("spike", (a) => spiking.has(a.service));
    await resolveWhere("errors", (a) => surging.has(a.service));
  }

  // ---------------------------------------------------------------------------------------------- pulseDaily
  /** Sums a service's daily docs between two days (inclusive). */
  async function serviceSums(id, from, to) {
    const snap = await R.serviceDays(id).where(FieldPath.documentId(), ">=", from).where(FieldPath.documentId(), "<=", to).get();
    const s = { views: 0, uniques: 0, engaged: 0, scroll75: 0, ctaClicks: 0, errors: 0, lcp: [], days: snap.size };
    for (const d of snap.docs) {
      const x = d.data();
      s.views += x.views || 0; s.uniques += x.uniques || 0; s.engaged += x.engaged || 0; s.errors += x.errors || 0;
      s.scroll75 += (x.scroll || {})["75"] || 0;
      s.ctaClicks += Object.values(x.ctas || {}).reduce((a, b) => a + (Number(b) || 0), 0);
      if (x.vitals && typeof x.vitals.lcp === "number") s.lcp.push(x.vitals.lcp);
    }
    s.lcpPass = s.lcp.length ? s.lcp.filter((v) => v <= 2.5).length / s.lcp.length : null;
    return s;
  }
  async function siteSums(from, to) {
    const snap = await R.days.where(FieldPath.documentId(), ">=", from).where(FieldPath.documentId(), "<=", to).get();
    const s = { views: 0, uniques: 0, engaged: 0, joinOpens: 0, newMembers: 0, members: 0, memberReturns: 0, errors: 0, days: snap.docs.map((d) => ({ day: d.id, ...d.data() })) };
    for (const d of s.days) { s.views += d.views || 0; s.uniques += d.uniques || 0; s.engaged += d.engaged || 0; s.joinOpens += d.joinOpens || 0; s.newMembers += d.newMembers || 0; s.members += d.members || 0; s.memberReturns += d.memberReturns || 0; s.errors += d.errors || 0; }
    return s;
  }
  async function serviceMeta() {
    const names = {}, utility = new Set(), versions = {}, love = {};
    try {
      const items = await db.collection(`sites/${SITE_ID}/services/main/items`).get();
      for (const d of items.docs) {
        const x = d.data();
        names[d.id] = x.name || d.id;
        if (x.utility === true || x.focus === "utility") utility.add(d.id);
        versions[d.id] = x.version || null;
        const r = x.ratings || {};
        if (typeof r.score === "number") love[d.id] = { score: r.score, n: r.n || 0 };
      }
    } catch (err) { console.warn("pulse: couldn't read the Service Hub items", err && err.message); }
    return { names, utility, versions, love };
  }
  async function countMembers(fromMs, toMs) {
    try { return (await db.collection(`sites/${SITE_ID}/members`).where("joinedAt", ">=", ts(fromMs)).where("joinedAt", "<", ts(toMs)).count().get()).data().count; }
    catch (err) { console.warn("pulse: members count failed", err && err.message); return 0; }
  }
  async function daily() {
    const t = now(), p = C.laParts(t), y = addDays(p.day, -1);
    await saltFor(p.day);   // today's salt (yesterday's is gone)
    const st = await settings(true);
    const yFrom = laMidnight(y), yTo = laMidnight(p.day);
    // yesterday's new members (count query), and the stream rollups
    const newMembers = await countMembers(yFrom, yTo);
    await R.day(y).set({ day: y, newMembers }, { merge: true });
    await streamRollups(y, yFrom, yTo);
    // scores and moves over the last 28 days (and the 28 before, for the trend)
    const from = addDays(y, -27), prevFrom = addDays(y, -55), prevTo = addDays(y, -28);
    const meta = await serviceMeta();
    const ids = (await R.services.listDocuments()).map((r) => r.id);
    const sums = {};
    for (const id of ids) {
      const [cur, prev] = await Promise.all([serviceSums(id, from, y), serviceSums(id, prevFrom, prevTo)]);
      sums[id] = { ...cur, prevViews: prev.views, loveScore: meta.love[id] ? meta.love[id].score : null, loveCount: meta.love[id] ? meta.love[id].n : 0 };
    }
    const scored = C.vitals(sums, { names: meta.names, utility: meta.utility });
    const site = await siteSums(from, y);
    const accounts = await countMembers(laMidnight(from), yTo);
    const started = site.days.reduce((a, x) => a + (((x.ctas || {})["signup-started"]) || 0), 0);   // the beacon sends it once per session while signup is unfinished
    const join = C.joinPath({ visited: site.uniques, opened: site.joinOpens, started, accounts, returned: site.memberReturns });
    const mv = C.moves(scored, { join });
    const doneSnap = await R.moves.get();
    const done = (doneSnap.exists && doneSnap.get("done")) || {};
    const week = isoWeek(y);
    await R.scores.set({ day: y, from, services: scored, site: { views: site.views, uniques: site.uniques, engaged: site.engaged, newMembers: site.newMembers }, join, updatedAt: FieldValue.serverTimestamp() });
    await R.moves.set({ day: y, list: mv.map((m) => ({ ...m, done: done[m.id] === week })), done, updatedAt: FieldValue.serverTimestamp() });
    await slowAlerts(y, st, scored);
    await autoNotes(y, yFrom, yTo, meta);
    if (p.day.endsWith("-01")) await monthRollup(addDays(p.day, -1).slice(0, 7));
    await retention(p.day);
    return { day: y, services: ids.length, moves: mv.length };
  }
  const isoWeek = (day) => { const d = new Date(`${day}T12:00:00Z`); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / DAY_MS + 1) / 7)).padStart(2, "0")}`; };
  async function streamRollups(y, yFrom, yTo) {
    let snap;
    try { snap = await db.collection(`sites/${SITE_ID}/streams`).where("actualEnd", ">=", ts(yFrom)).where("actualEnd", "<", ts(yTo + DAY_MS)).get(); } catch { return; }
    for (const d of snap.docs) {
      const s = d.data(), start = msOf(s.actualStart), end = msOf(s.actualEnd);
      if (!start || !end || s.state !== "ended") continue;
      const winEnd = end + 3600000;
      const days = [...new Set([C.laParts(start).day, C.laParts(winEnd).day])];
      const docs = await db.getAll(...days.map((x) => R.day(x)));
      let visits = 0, peak = { at: null, n: 0 };
      const refs = { twitch: 0, youtube: 0, tiktok: 0 };
      for (const dd of docs) {
        if (!dd.exists) continue;
        const x = dd.data();
        for (const [hh, n] of Object.entries(x.hours || {})) { const hs = laMidnight(dd.id) + Number(hh) * 3600000; if (hs + 3600000 > start && hs < winEnd) visits += n; }
        for (const [hh, r] of Object.entries(x.hourRefs || {})) { const hs = laMidnight(dd.id) + Number(hh) * 3600000; if (hs + 3600000 > start && hs < winEnd) for (const k of Object.keys(refs)) refs[k] += r[k] || 0; }
        for (const [hm, n] of Object.entries(x.liveMinutes || {})) { const ms = laMidnight(dd.id) + Number(hm.slice(0, 2)) * 3600000 + Number(hm.slice(2)) * 60000; if (ms >= start && ms < end && n > peak.n) peak = { at: ms, n }; }
      }
      const joins = await countMembers(start, winEnd);
      await R.stream(d.id).set({ id: d.id, title: s.title || null, start: ts(start), end: ts(end), visits, joins, refs, peakMinute: peak.at ? { at: ts(peak.at), views: peak.n } : null, updatedAt: FieldValue.serverTimestamp() });
    }
  }
  async function slowAlerts(y, st, scored) {
    const yd = await R.day(y).get(), views = yd.exists ? yd.get("views") || 0 : 0;
    // traffic drop (site): under 50% of usual for the whole day
    const u = await usualOf(R.day, y, (x) => x.views || 0);
    const dropping = u >= st.rules.drop.minUsual && views < u * st.rules.drop.below;
    if (dropping) await raise("drop", { key: `site:${y}`, title: "Traffic drop across the site", facts: { day: y, views, usual: u } });
    await resolveWhere("drop", (a) => dropping && a.facts && a.facts.day === y);
    // missing page surge: a broken link reported 10+ times and seen yesterday
    try {
      const bl = await db.collection(`sites/${SITE_ID}/brokenLinks`).where("lastAt", ">=", ts(laMidnight(y))).get();
      for (const d of bl.docs) if (!d.get("fixedAt") && (d.get("count") || 0) >= st.rules.missing.hits) await raise("missing", { key: `${d.id}:${y}`, title: "Missing page surge", facts: { path: d.get("path"), count: d.get("count") } });
    } catch (err) { console.warn("pulse: broken links read failed", err && err.message); }
    // slow page: LCP p75 over the limit 3 days in a row
    for (const s of scored) {
      const docs = await db.getAll(...[0, 1, 2].map((n) => R.serviceDay(s.id, addDays(y, -n))));
      const lcps = docs.map((d) => (d.exists && d.get("vitals") ? d.get("vitals").lcp : null));
      if (lcps.every((v) => typeof v === "number" && v > st.rules.slow.lcp)) await raise("slow", { service: s.id, key: `${s.id}:${y}`, title: `Slow pages on ${s.name}`, facts: { lcp: lcps } });
    }
    // goals off pace (a week or less left)
    const month = y.slice(0, 7), dim = daysInMonth(month), dom = Number(y.slice(8, 10));
    if (dim - dom <= st.rules.goal.daysLeft) {
      const goals = await R.goals.where("month", "==", month).get();
      const ms = await siteSums(`${month}-01`, y);
      for (const g of goals.docs) {
        const x = g.data(), cur = x.kind === "visitors" ? ms.uniques : x.kind === "members" ? ms.newMembers : x.kind === "returnRate" ? (ms.members ? (ms.memberReturns / ms.members) * 100 : 0) : 0;
        const pace = C.goalPace({ kind: x.kind, target: x.target }, cur, dom, dim);
        if (pace.fraction < pace.expected * (1 - st.rules.goal.behind)) await raise("goal", { key: `${g.id}:${month}`, title: "A goal is off pace", facts: { goal: g.id, now: cur, target: x.target } });
      }
    }
    // record: the best day ever
    const st2 = await R.state.get(), best = st2.exists ? st2.get("bestDay") || { views: 0 } : { views: 0 };
    if (views > (best.views || 0) && views >= 50) {
      await R.state.set({ bestDay: { day: y, views } }, { merge: true });
      if (best.views) await raise("record", { key: `day:${y}`, title: "Record day", facts: { day: y, views, previous: best } });
    }
  }
  async function autoNotes(y, yFrom, yTo, meta) {
    const s = await R.state.get(), seen = (s.exists && s.get("versions")) || {};
    const changed = Object.entries(meta.versions).filter(([id, v]) => v && seen[id] && seen[id] !== v);
    for (const [id, v] of changed) await R.notes.add({ day: y, service: id, text: `${meta.names[id] || id} ${v}`, auto: "version", by: null, at: FieldValue.serverTimestamp() });
    await R.state.set({ versions: meta.versions }, { merge: true });
    try {
      const streams = await db.collection(`sites/${SITE_ID}/streams`).where("actualEnd", ">=", ts(yFrom)).where("actualEnd", "<", ts(yTo)).get();
      for (const d of streams.docs) if (d.get("state") === "ended") await R.note(`stream-${d.id}`).set({ day: y, service: null, text: `Stream: ${String(d.get("title") || "untitled").slice(0, 100)}`, auto: "stream", streamId: d.id, by: null, at: FieldValue.serverTimestamp() });
    } catch { /* no streams index yet: skip */ }
  }
  async function monthRollup(month) {
    const s = await siteSums(`${month}-01`, `${month}-31`);
    await R.month(month).set({ month, views: s.views, uniques: s.uniques, engaged: s.engaged, newMembers: s.newMembers, joinOpens: s.joinOpens, errors: s.errors, days: s.days.length, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  async function retention(today) {
    const cut = addDays(today, -Math.round(KEEP_MONTHS * 30.44));
    const old = await R.days.where(FieldPath.documentId(), "<", cut).limit(200).get();
    const w = db.bulkWriter();
    for (const d of old.docs) {
      const m = await R.month(d.id.slice(0, 7)).get();
      if (!m.exists) { await monthRollup(d.id.slice(0, 7)); }
      w.delete(d.ref);
      w.delete(R.source(d.id));
    }
    for (const ref of await R.services.listDocuments()) {
      const o = await R.serviceDays(ref.id).where(FieldPath.documentId(), "<", cut).limit(200).get();
      o.docs.forEach((d) => w.delete(d.ref));
    }
    for (const ref of await R.paths.listDocuments()) {
      const o = await db.collection(`${ref.path}/days`).where(FieldPath.documentId(), "<", cut).limit(200).get();
      o.docs.forEach((d) => w.delete(d.ref));
    }
    await w.close();
  }

  // ---------------------------------------------------------------------------------------------- pulseCfPull
  async function cfPull() {
    const token = CF_ON && CLOUDFLARE_ANALYTICS_TOKEN ? CLOUDFLARE_ANALYTICS_TOKEN.value() : "";
    const account = CF_ACCOUNT_ID.value(), site = CF_SITE_TAG.value();
    if (!token || !account || !site) {
      await R.settings.set({ cf: { status: "not-connected", checkedAt: FieldValue.serverTimestamp(), missing: [!token && "token", !account && "account id", !site && "site tag"].filter(Boolean) } }, { merge: true });
      return { status: "not-connected" };
    }
    const t = now(), p = C.laParts(t), start = new Date(laMidnight(p.day)).toISOString(), end = new Date(t).toISOString();
    const query = `query($account: String!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject, $vfilter: AccountRumWebVitalsEventsAdaptiveGroupsFilter_InputObject) {
      viewer { accounts(filter: { accountTag: $account }) {
        pages: rumPageloadEventsAdaptiveGroups(limit: 1000, filter: $filter) { count sum { visits } dimensions { requestPath countryName userAgentBrowser } }
        vitals: rumWebVitalsEventsAdaptiveGroups(limit: 1000, filter: $vfilter) { count quantiles { largestContentfulPaintP75 interactionToNextPaintP75 cumulativeLayoutShiftP75 } dimensions { requestPath } }
      } } }`;
    const filter = { AND: [{ datetime_geq: start, datetime_leq: end }, { siteTag: site }, { bot: 0 }] };
    const vfilter = { AND: [{ datetime_geq: start, datetime_leq: end }, { siteTag: site }] };
    try {
      const r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query, variables: { account, filter, vfilter } }) });
      const j = await r.json();
      if (!r.ok || (j.errors && j.errors.length)) throw new Error((j.errors && j.errors[0] && j.errors[0].message) || `HTTP ${r.status}`);
      const acc = (((j.data || {}).viewer || {}).accounts || [])[0] || { pages: [], vitals: [] };
      let visits = 0;
      const countries = {}, browsers = {}, byPath = {};
      for (const g of acc.pages || []) {
        const v = (g.sum && g.sum.visits) || 0, dm = g.dimensions || {};
        visits += v;
        if (dm.countryName) countries[dm.countryName.replace(/[./]/g, "_")] = (countries[dm.countryName.replace(/[./]/g, "_")] || 0) + v;
        if (dm.userAgentBrowser) browsers[dm.userAgentBrowser.replace(/[./]/g, "_")] = (browsers[dm.userAgentBrowser.replace(/[./]/g, "_")] || 0) + v;
      }
      for (const g of acc.vitals || []) { const q = g.quantiles || {}, path = (g.dimensions || {}).requestPath; if (path) byPath[path] = { lcp: q.largestContentfulPaintP75 != null ? q.largestContentfulPaintP75 / 1000 : null, inp: q.interactionToNextPaintP75 ?? null, cls: q.cumulativeLayoutShiftP75 ?? null, n: g.count || 0 }; }
      await R.day(p.day).set({ cf: { visits, countries, browsers, at: FieldValue.serverTimestamp() } }, { merge: true });
      // vitals per service: the paths the beacon has seen tell which service a path belongs to
      const perService = {};
      for (const [path, v] of Object.entries(byPath)) {
        const ps = await R.path(C.pathHash(path)).get();
        const sid = ps.exists ? ps.get("service") : "unassigned";
        const s = (perService[sid] ||= { lcp: [], inp: [], cls: [], n: 0 });
        if (v.lcp != null) s.lcp.push(v.lcp); if (v.inp != null) s.inp.push(v.inp); if (v.cls != null) s.cls.push(v.cls); s.n += v.n;
      }
      const w = db.bulkWriter();
      for (const [sid, s] of Object.entries(perService)) w.set(R.serviceDay(sid, p.day), { vitals: { lcp: C.median(s.lcp) || null, inp: C.median(s.inp) || null, cls: C.median(s.cls) || null, n: s.n } }, { merge: true });
      await w.close();
      await R.settings.set({ cf: { status: "ok", checkedAt: FieldValue.serverTimestamp(), error: null } }, { merge: true });
      // beacon silence: Cloudflare sees visits but no beacon events for 2 h
      const st = await settings(true);
      const last = await R.buffer.orderBy("atMs", "desc").limit(1).get();
      const lastMs = last.empty ? 0 : last.docs[0].get("atMs");
      const silent = visits > 20 && now() - lastMs > st.rules.silence.hours * 3600000;
      if (silent) await raise("silence", { key: `site:${p.day}`, title: "The beacon has gone quiet", facts: { cfVisits: visits, lastEventAt: lastMs || null } });
      await resolveWhere("silence", () => silent);
      return { status: "ok", visits };
    } catch (err) {
      await R.settings.set({ cf: { status: "error", error: String((err && err.message) || err).slice(0, 200), checkedAt: FieldValue.serverTimestamp() } }, { merge: true });
      return { status: "error" };
    }
  }

  // ---------------------------------------------------------------------------------------------- pulseReport
  async function makeReport(kind, from, to, id) {
    const [cur, prev] = await Promise.all([siteSums(from, to), siteSums(addDays(from, -(Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1)), addDays(from, -1))]);
    const scores = await R.scores.get(), moves = await R.moves.get();
    const svc = scores.exists ? scores.get("services") || [] : [];
    const ranked = svc.filter((s) => s.ok).sort((a, b) => (b.score || 0) - (a.score || 0));
    const srcSnap = await R.sources.where(FieldPath.documentId(), ">=", from).where(FieldPath.documentId(), "<=", to).get();
    const refs = {};
    srcSnap.docs.forEach((d) => Object.entries(d.get("refs") || {}).forEach(([k, n]) => (refs[k] = (refs[k] || 0) + n)));
    const streams = await R.stream("x").parent.where("start", ">=", ts(laMidnight(from))).where("start", "<", ts(laMidnight(addDays(to, 1)))).get().catch(() => ({ docs: [] }));
    const best = streams.docs.map((d) => d.data()).sort((a, b) => (b.visits || 0) - (a.visits || 0))[0] || null;
    const alerts = await R.alerts.where("firstAt", ">=", ts(laMidnight(from))).get().catch(() => ({ docs: [] }));
    const goals = await R.goals.where("month", "==", to.slice(0, 7)).get();
    const pick = (s) => ({ views: s.views, uniques: s.uniques, engaged: s.engaged, newMembers: s.newMembers, joinOpens: s.joinOpens });
    await R.report(id).set({ id, kind, from, to, headline: { now: pick(cur), prev: pick(prev) },
      top: ranked.slice(0, 5).map((s) => ({ id: s.id, name: s.name, score: s.score, views: s.views, group: s.group })),
      bottom: ranked.slice(-5).reverse().map((s) => ({ id: s.id, name: s.name, score: s.score, views: s.views, group: s.group })),
      focus: svc.map((s) => ({ id: s.id, group: s.group })), sources: Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => ({ from: k, n })),
      bestStream: best ? { id: best.id, title: best.title, visits: best.visits, joins: best.joins } : null,
      goals: goals.docs.map((g) => ({ id: g.id, ...g.data() })), alerts: alerts.docs.map((d) => ({ id: d.id, type: d.get("type"), state: d.get("state"), title: d.get("title") })),
      moves: moves.exists ? (moves.get("list") || []).slice(0, 5) : [], createdAt: FieldValue.serverTimestamp() });
    return id;
  }
  async function report() {
    const p = C.laParts(now()), out = [];
    if (p.weekday === "Mon" && p.hh === "06" && Number(p.mm) < 30) { const to = addDays(p.day, -1), from = addDays(to, -6); out.push(await makeReport("week", from, to, `w-${isoWeek(to)}`)); }
    if (p.day.endsWith("-01") && p.hh === "06" && Number(p.mm) >= 30) { const to = addDays(p.day, -1), m = to.slice(0, 7); out.push(await makeReport("month", `${m}-01`, to, `m-${m}`)); }
    return out;
  }

  // ---------------------------------------------------------------------------------------------- pulseAdmin
  async function tierOf(c) {
    if (c.isOwner) return "owner";
    try { const store = require("../crew/store").makeStore({ db, adminLogEntry: deps.adminLogEntry }); return store.a2plus(await store.who(c.uid)) ? "overseer" : "steward"; }
    catch { return "steward"; }
  }
  async function log(c, action, itemTitle, changes) {
    if (!deps.adminLogEntry) return;
    try { const e = await deps.adminLogEntry(db, { feature: FEATURE, action, itemPath: R.settings.path, itemTitle, actorUid: c.uid, actorName: c.name, reason: "", changes }); await db.collection("adminLog").add(e); }
    catch (err) { console.error("pulse: adminLog write failed", err && err.message); }
  }
  const s = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const isDay = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const GOAL_KINDS = ["visitors", "members", "fanClub", "returnRate", "serviceViews"];
  async function adminAction(request) {
    const c = requireAdmin(await callerInfo(request));
    const d = request.data || {};
    const tier = await tierOf(c);
    const needOverseer = () => { if (tier === "steward") throw fail("permission-denied", "View only. Overseer and Right Hand change settings.", "needsOverseer"); };
    const who = { uid: c.uid, name: c.name };
    switch (d.action) {
      case "alertAck": { const ref = R.alert(s(d.id, 40)); if (!(await ref.get()).exists) throw fail("not-found", "That alert isn't there.", "noAlert"); await ref.update({ state: "ack", ack: { ...who, at: FieldValue.serverTimestamp() } }); return { ok: true }; }
      case "alertSnooze": { const days = d.days === 7 ? 7 : 1; const ref = R.alert(s(d.id, 40)); if (!(await ref.get()).exists) throw fail("not-found", "That alert isn't there.", "noAlert"); await ref.update({ state: "snoozed", snoozeUntil: ts(now() + days * DAY_MS), snoozedBy: who }); return { ok: true }; }
      case "noteAdd": {
        const text = s(d.text, 200); if (text.length < 2) throw fail("invalid-argument", "Write a short note.", "text");
        const day = isDay(d.day) ? d.day : C.laParts(now()).day;
        const ref = await R.notes.add({ day, service: s(d.service, 64) || null, text, auto: null, by: who, at: FieldValue.serverTimestamp() });
        return { ok: true, id: ref.id };
      }
      case "noteDelete": { const ref = R.note(s(d.id, 60)); const n = await ref.get(); if (!n.exists) return { ok: true }; if (n.get("auto")) throw fail("failed-precondition", "Automatic notes stay.", "auto"); await ref.delete(); return { ok: true }; }
      case "moveDone": case "moveUndo": {
        const id = s(d.id, 80); if (!id) throw fail("invalid-argument", "Which move?", "id");
        const snap = await R.moves.get(); const day = snap.exists ? snap.get("day") : C.laParts(now()).day;
        await R.moves.set({ done: { [id]: d.action === "moveDone" ? isoWeek(day) : FieldValue.delete() } }, { merge: true });
        return { ok: true };
      }
      case "goalSave": {
        needOverseer();
        if (!GOAL_KINDS.includes(d.kind)) throw fail("invalid-argument", "Pick what the goal counts.", "kind");
        const target = Number(d.target); if (!Number.isFinite(target) || target <= 0 || target > 1e9) throw fail("invalid-argument", "The target is a number above zero.", "target");
        const month = /^\d{4}-\d{2}$/.test(d.month || "") ? d.month : C.laParts(now()).month;
        const service = d.kind === "serviceViews" ? s(d.service, 64) : null;
        if (d.kind === "serviceViews" && !service) throw fail("invalid-argument", "Pick a service.", "service");
        const id = s(d.id, 40) || (await R.goals.add({})).id;
        const before = (await R.goal(id).get()).data() || null;
        const after = { id, kind: d.kind, target: d.kind === "returnRate" ? Math.min(100, target) : Math.round(target), month, service, label: s(d.label, 60) || null, by: who, updatedAt: FieldValue.serverTimestamp() };
        await R.goal(id).set(after);
        await log(c, "goalSave", `Goal ${d.kind} ${month}`, { before, after: { ...after, updatedAt: null } });
        return { ok: true, id };
      }
      case "goalDelete": { needOverseer(); const ref = R.goal(s(d.id, 40)); const g = await ref.get(); if (!g.exists) return { ok: true }; await ref.delete(); await log(c, "goalDelete", `Goal ${g.get("kind")}`, { before: g.data(), after: null }); return { ok: true }; }
      case "settingsSave": {
        needOverseer();
        const cur = await settings(true), patch = {};
        if (typeof d.excludeStaff === "boolean") patch.excludeStaff = d.excludeStaff;
        if (d.sampling != null) { const v = Number(d.sampling); if (!(v > 0 && v <= 1)) throw fail("invalid-argument", "Sampling is between 0 and 1.", "sampling"); patch.sampling = v; }
        if (d.rules && typeof d.rules === "object") {
          patch.rules = {};
          for (const [k, v] of Object.entries(d.rules)) {
            if (!DEFAULT_SETTINGS.rules[k] || !v || typeof v !== "object") continue;
            const r = {};
            for (const [f, x] of Object.entries(v)) { if (!(f in DEFAULT_SETTINGS.rules[k])) continue; r[f] = f === "on" ? x === true : Number(x); if (f !== "on" && !(Number.isFinite(r[f]) && r[f] >= 0)) throw fail("invalid-argument", "Rule numbers are zero or more.", "rules"); }
            patch.rules[k] = r;
          }
        }
        await R.settings.set(patch, { merge: true });
        settingsCache = null;
        await log(c, "settingsSave", "Settings", { before: { excludeStaff: cur.excludeStaff, sampling: cur.sampling, rules: cur.rules }, after: patch });
        return { ok: true };
      }
      case "refSave": {
        needOverseer();
        const tag = s(d.tag, 40).toLowerCase(); if (!/^[a-z0-9_-]{2,40}$/.test(tag)) throw fail("invalid-argument", "A tag is 2 to 40 letters, digits, - or _.", "tag");
        const path = s(d.path, 200) || "/"; if (!path.startsWith("/")) throw fail("invalid-argument", "The page starts with /.", "path");
        const before = (await R.ref(tag).get()).data() || null;
        const after = { tag, label: s(d.label, 60) || tag, path, by: who, updatedAt: FieldValue.serverTimestamp() };
        await R.ref(tag).set(after);
        await log(c, "refSave", `Tag ${tag}`, { before, after: { ...after, updatedAt: null } });
        return { ok: true };
      }
      case "refDelete": { needOverseer(); const ref = R.ref(s(d.tag, 40)); const r = await ref.get(); if (!r.exists) return { ok: true }; await ref.delete(); await log(c, "refDelete", `Tag ${r.id}`, { before: r.data(), after: null }); return { ok: true }; }
      case "cfTryAgain": { const r = await cfPull(); return { ok: true, ...r }; }
      case "csv": {
        const table = ["days", "services", "sources"].includes(d.table) ? d.table : "days";
        const from = isDay(d.from) ? d.from : addDays(C.laParts(now()).day, -27), to = isDay(d.to) ? d.to : C.laParts(now()).day;
        const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        if (table === "days") { const x = await siteSums(from, to); return { ok: true, csv: ["day,views,uniques,engaged,newMembers,joinOpens,errors", ...x.days.map((r) => [r.day, r.views || 0, r.uniques || 0, r.engaged || 0, r.newMembers || 0, r.joinOpens || 0, r.errors || 0].join(","))].join("\n") }; }
        if (table === "sources") { const snap = await R.sources.where(FieldPath.documentId(), ">=", from).where(FieldPath.documentId(), "<=", to).get(); const rows = []; snap.docs.forEach((r) => Object.entries(r.get("refs") || {}).forEach(([k, n]) => rows.push([r.id, q(k), n].join(",")))); return { ok: true, csv: ["day,from,views", ...rows].join("\n") }; }
        const sc = await R.scores.get(); const list = sc.exists ? sc.get("services") || [] : [];
        return { ok: true, csv: ["service,name,score,views,engaged,reach,engagement,health,love,group", ...list.map((r) => [r.id, q(r.name), r.score ?? "", r.views, r.eng, r.reach, r.engagement, r.health, r.love ?? "", r.group || ""].join(","))].join("\n") };
      }
      default: throw fail("invalid-argument", "Unknown action.", "action");
    }
  }

  const functions = {
    pulseBeacon: onRequest({ secrets: [PULSE_PROXY_KEY], cors: false, maxInstances: 20, memory: "256MiB", timeoutSeconds: 20 }, beacon),
    pulseRollup: onSchedule({ schedule: "every 15 minutes", timeZone: TZ, timeoutSeconds: 300 }, async () => { await rollup(); }),
    pulseDaily: onSchedule({ schedule: "30 0 * * *", timeZone: TZ, timeoutSeconds: 540, memory: "512MiB" }, async () => { await daily(); }),
    pulseCfPull: onSchedule({ schedule: "5 * * * *", timeZone: TZ, timeoutSeconds: 120, ...(CF_ON ? { secrets: [CLOUDFLARE_ANALYTICS_TOKEN] } : {}) }, async () => { await cfPull(); }),
    pulseReport: onSchedule({ schedule: "0,30 6 * * *", timeZone: TZ, timeoutSeconds: 300 }, async () => { await report(); }),
    pulseAdmin: onCall(adminAction),
  };
  return { functions, beacon, rollup, daily, cfPull, report, makeReport, adminAction, settings, refs: R, FEATURE, DEFAULT_SETTINGS };
}

module.exports = { build };
