// Scream Planner, shared server helpers (docs/specs/scream-planner.md section 4). Internal: the other planner modules
// require this; nothing here is callable. Admin SDK only; firestore.rules gives clients no writes.
//
//   sites/{siteId}/planner/main                       settings (deadlines, defaults)         admins read
//   …/planner/main/patterns/{id}                      the usual week                         admins read
//   …/planner/main/exceptions/{id}                    weeks off, days off, skipped patterns  admins read
//   …/planner/main/todos/{id}                         "Week not published", released seats   admins read
//   sites/{siteId}/planWeeks/{week}                   the week (2026-W43)                    staff read
//   …/planWeeks/{week}/ballot/{slug}, …/votes/{uid}   server only
//   sites/{siteId}/streams/{id}                       planned slot / published stream        public when published
//   …/streams/{id}/private/draft                      the working copy (uids)                staff read
//   …/streams/{id}/signups/{uid}                      availability, seats, game request      staff read
//   sites/{siteId}/public/usualWeek | ballot | schedule   public read
//   sites/{siteId}/notifyOutbox/{id}                  hand-off to Notifications (TTL 30 d)   closed
const admin = require("firebase-admin");
const L = require("./logic");
const { makeStore, fail, ms } = require("../crew/store");
const { SITE_ID, paths: crewPaths } = require("../crew/settings");

const OUTBOX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SITE = `sites/${SITE_ID}`;
const P = {
  site: SITE,
  settings: `${SITE}/planner/main`,
  patterns: `${SITE}/planner/main/patterns`,
  exceptions: `${SITE}/planner/main/exceptions`,
  todos: `${SITE}/planner/main/todos`,
  weeks: `${SITE}/planWeeks`,
  week: (w) => `${SITE}/planWeeks/${w}`,
  ballot: (w) => `${SITE}/planWeeks/${w}/ballot`,
  votes: (w) => `${SITE}/planWeeks/${w}/votes`,
  streams: `${SITE}/streams`,
  stream: (id) => `${SITE}/streams/${id}`,
  draft: (id) => `${SITE}/streams/${id}/private/draft`,
  signups: (id) => `${SITE}/streams/${id}/signups`,
  signup: (id, uid) => `${SITE}/streams/${id}/signups/${uid}`,
  games: `${SITE}/vaultGames`,
  usualWeek: `${SITE}/public/usualWeek`,
  publicBallot: `${SITE}/public/ballot`,
  publicSchedule: `${SITE}/public/schedule`,
  outbox: `${SITE}/notifyOutbox`,
  roster: crewPaths.roster,
  rosterCol: `${crewPaths.settings()}/roster`,
};

function makeCore({ db = admin.firestore(), adminLogEntry } = {}) {
  const { FieldValue, Timestamp } = admin.firestore;
  const crew = makeStore({ db, adminLogEntry });
  const ts = (v) => (v == null ? null : Timestamp.fromMillis(v));

  /** The site's zone, from sites/{siteId}.timezone. Never assumed: a site without one can't plan. */
  async function siteTz() {
    const snap = await db.doc(SITE).get();
    const tz = snap.exists ? snap.get("timezone") : null;
    if (typeof tz !== "string" || !tz) throw fail("failed-precondition", "The site has no time zone set (sites/{siteId}.timezone).", "noTimezone");
    return tz;
  }

  /** planner/main merged over the defaults; created with the defaults the first time. */
  async function loadSettings() {
    const ref = db.doc(P.settings), snap = await ref.get();
    if (!snap.exists) { await ref.set(L.DEFAULT_SETTINGS, { merge: true }); return L.mergeSettings({}); }
    return L.mergeSettings(snap.data());
  }

  /** The caller as the planner needs them: crew's who() plus the roster details seats care about. */
  async function whoPlus(uid) {
    const w = await crew.who(uid);
    const r = w.roster || null;
    return {
      ...w,
      track: r?.track === "admin" ? "admin" : r ? "mod" : null,
      adminGrade: r?.track === "admin" && Number.isInteger(r.grade) ? r.grade : null,
      person: { isAdmin: w.isAdmin, isMod: w.isMod, grade: w.grade, rosterStatus: r ? r.status : null, leadBlockedUntilMs: ms(r?.leadBlockedUntil) },
    };
  }
  /** Active crew: an admin, or a mod whose status is Active or Check-in (the crew view's audience). */
  const onDuty = (w) => w.isAdmin || (w.isMod && !!w.roster && ["active", "checkIn"].includes(w.roster.status));

  async function logAdmin(w, { action, path, title, reason = "", changes, details }) {
    await db.collection("adminLog").add(await adminLogEntry(db, {
      feature: "screamPlanner", action, itemPath: path || P.settings, itemTitle: title || "Scream Planner",
      actorUid: w ? w.uid : null, actorName: w ? w.name : "Automatic", reason, changes, details,
    }));
  }
  async function activity(type, summary, extra = {}) {
    try {
      await db.collection("activityLog").add({ feature: "schedule", type, summary, link: "/schedule", actorName: null, ...extra, createdAt: FieldValue.serverTimestamp() });
    } catch (err) { console.error("planner: activityLog write failed", err); }
  }
  /**
   * One event for the Notifications service (section 4f). With an `id` it is written once (a repeat run is a
   * no-op), which is what keeps reminders from sending twice. Expires after 30 days (TTL on expireAt).
   */
  async function outbox({ id = null, type, audience, uids, streamId = null, week = null, payload = {} }) {
    const doc = {
      type, audience, ...(uids ? { uids } : {}), streamId, week, payload, status: "pending",
      createdAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + OUTBOX_TTL_MS),
    };
    if (!id) { await db.collection(P.outbox).add(doc); return true; }
    try { await db.doc(`${P.outbox}/${id}`).create(doc); return true; }
    catch (err) { if (err.code === 6 || /ALREADY_EXISTS/.test(String(err.message))) return false; throw err; }
  }

  async function loadWeek(week) {
    if (!L.isWeekId(week)) throw fail("invalid-argument", "week must look like 2026-W43.", "args");
    const snap = await db.doc(P.week(week)).get();
    if (!snap.exists) throw fail("not-found", "That week hasn't been opened.", "noWeek");
    return { id: week, ...snap.data() };
  }
  /** The newest week still taking votes (state open), or null. */
  async function openWeekDoc() {
    const snap = await db.collection(P.weeks).get();
    const open = snap.docs.filter((d) => d.get("state") === "open").sort((a, b) => b.id.localeCompare(a.id))[0];
    return open ? { id: open.id, ...open.data() } : null;
  }
  async function streamsOfWeek(week) {
    const snap = await db.collection(P.streams).where("week", "==", week).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  /** Drafts (the working copies, with times as currently planned) of every stream in a week, with their ids. */
  async function draftsOfWeek(week) {
    const ids = (await streamsOfWeek(week)).map((s) => s.id);
    const snaps = await getAll(ids.map((id) => db.doc(P.draft(id))));
    return snaps.map((x, i) => (x.exists ? { id: ids[i], ...x.data() } : null)).filter(Boolean);
  }
  /** db.getAll that tolerates an empty list (the SDK throws on none). */
  async function getAll(refs) { return refs.length ? db.getAll(...refs) : []; }
  async function loadStream(id) {
    if (typeof id !== "string" || !id) throw fail("invalid-argument", "streamId is required.", "args");
    const [top, dr] = await Promise.all([db.doc(P.stream(id)).get(), db.doc(P.draft(id)).get()]);
    if (!top.exists || !dr.exists) throw fail("not-found", "That stream isn't in the planner.", "noStream");
    return { id, top: top.data(), draft: dr.data() };
  }

  /** The public face of a draft: handles instead of uids. Absent optional fields are deleted from the public doc. */
  function projectPublic(draft, overrides = {}) {
    const out = { ...draft, crew: L.publicCrew(draft.crew), ...overrides };
    for (const k of ["theme", "delay", "cancel"]) if (out[k] === undefined || out[k] === null) out[k] = FieldValue.delete();
    delete out.updatedAt;
    out.updatedAt = FieldValue.serverTimestamp();
    return out;
  }
  /**
   * Saves a stream's working copy. A stream that was never published mirrors its draft into the top-level doc
   * (staff-only until published); a published one changes only the draft, until Publish changes.
   * `alsoPublic` pushes the draft's public face to the top-level doc regardless (seats, delay, cancel).
   */
  async function saveDraft(id, draft, { alsoPublic = false, fields = null } = {}) {
    const next = { ...draft, updatedAt: FieldValue.serverTimestamp() };
    await db.doc(P.draft(id)).set(next);
    if (alsoPublic || draft.published !== true) {
      let pub = projectPublic(draft);
      if (fields) pub = Object.fromEntries(Object.entries(pub).filter(([k]) => fields.includes(k) || k === "updatedAt"));
      await db.doc(P.stream(id)).set(pub, { merge: true });
    }
  }

  /** Recomputes planWeeks/{week}.counts and the unpublished flag from the week's streams and ballot. */
  async function refreshCounts(week) {
    const [streams, ballot] = await Promise.all([streamsOfWeek(week), db.collection(P.ballot(week)).get()]);
    const votes = ballot.docs.reduce((n, d) => n + (d.get("votes") || 0), 0);
    const counts = L.weekCounts(streams.map((s) => ({ ...s, crew: s.crew && s.crew.chats ? crewFromPublic(s) : s.crew })), votes);
    const unpublished = streams.some((s) => s.hasUnpublishedChanges === true);
    const ref = db.doc(P.week(week));
    if ((await ref.get()).exists) await ref.update({ counts, streamIds: streams.map((s) => s.id).sort(), ...(unpublished ? { hasUnpublishedChanges: true } : {}) });
    return counts;
  }
  /** crewGaps only asks whether a seat is filled, so a public crew (handles) works as is; kept as a seam. */
  const crewFromPublic = (s) => ({ captain: s.crew.captain ? { handle: s.crew.captain } : null, chats: Object.fromEntries(Object.entries(s.crew.chats).map(([r, c]) => [r, { lead: c.lead ? { handle: c.lead } : null, deckhands: (c.deckhands || []).map((h) => ({ handle: h })) }])), caps: s.crew.caps });

  // ---------- the public documents ----------
  /** public/usualWeek: the patterns as display cards plus upcoming public exceptions. */
  async function rebuildUsualWeek() {
    const tz = await siteTz();
    const [pats, exs] = await Promise.all([db.collection(P.patterns).get(), db.collection(P.exceptions).get()]);
    const today = L.localParts(Date.now(), tz).date;
    const patterns = pats.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.active !== false)
      .sort((a, b) => a.dow - b.dow || String(a.start).localeCompare(String(b.start)))
      .map((p) => ({ id: p.id, label: p.label, icon: p.icon || null, dow: p.dow, start: p.start, end: p.end, type: p.type, membersOnly: p.type === "backstage", platforms: p.platforms || L.platformsForRooms(p.rooms || []), gameCount: p.gameCount || null }));
    const exceptions = exs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.public !== false && (e.to || e.from) >= today)
      .sort((a, b) => a.from.localeCompare(b.from)).map((e) => ({ id: e.id, kind: e.kind, from: e.from, to: e.to || e.from, label: e.label, patternIds: e.patternIds || [] }));
    await db.doc(P.usualWeek).set({ patterns, exceptions, tz, updatedAt: FieldValue.serverTimestamp() });
  }

  /** public/ballot: the open (latest) week's ballot with counts and the closing time. Own picks come from ballotMine. */
  async function rebuildPublicBallot() {
    const weeks = (await db.collection(P.weeks).get()).docs.filter((d) => !d.get("weekOff")).sort((a, b) => b.id.localeCompare(a.id));
    const wk = weeks.find((d) => d.get("state") === "open") || weeks[0];
    if (!wk) { await db.doc(P.publicBallot).set({ week: null, state: "none", games: [], updatedAt: FieldValue.serverTimestamp() }); return; }
    const rows = (await db.collection(P.ballot(wk.id)).get()).docs.map((d) => ({ slug: d.id, ...d.data() }));
    const vault = await getAll(rows.map((r) => db.doc(`${P.games}/${r.slug}`)));
    const info = new Map(vault.map((g, i) => [rows[i].slug, g]));
    const ranked = L.rankBallot(rows.map((r) => ({ ...r, wanted: info.get(r.slug)?.get("wantedCount") || 0, lastVoteMs: ms(r.lastVoteAt) || 0 })));
    const games = ranked.filter((r) => info.get(r.slug)?.exists && info.get(r.slug).get("hidden") !== true).map((r) => {
      const g = info.get(r.slug);
      return { slug: r.slug, title: g.get("title"), cover: g.get("cover") || null, status: g.get("status") || null, tags: [...(g.get("tags")?.auto || []), ...(g.get("tags")?.boomer || [])], votes: r.votes || 0, wanted: g.get("wantedCount") || 0, seededFrom: r.seededFrom, addedBy: r.addedBy?.handle || null };
    });
    const state = wk.get("state") === "open" && Date.now() < ms(wk.get("closesAt")) ? "open" : "closed";
    await db.doc(P.publicBallot).set({
      week: wk.id, state, opensAt: ms(wk.get("opensAt")), closesAt: ms(wk.get("closesAt")), games,
      totalVotes: games.reduce((n, g) => n + g.votes, 0), votesPerMember: (await loadSettings()).defaults.votesPerMember, updatedAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * public/schedule: what /schedule reads besides the streams themselves (see "Reads for the pages" in the spec):
   * every week from the current one on, with its state, the marquee and door choice once published, and the week-off label.
   */
  async function rebuildSchedule() {
    const tz = await siteTz();
    const current = L.weekOf(Date.now(), tz);
    const docs = (await db.collection(P.weeks).get()).docs.filter((d) => d.id >= current).sort((a, b) => a.id.localeCompare(b.id));
    const weeks = docs.map((d) => {
      const x = d.data(), pub = x.state === "published";
      const b = L.weekBounds(d.id, tz);
      return {
        week: d.id, state: pub ? "published" : "planning", startsMs: b.startMs, endsMs: b.endMs,
        publishBy: ms(x.publishBy), publishedAt: pub ? ms(x.publishedAt) : null, publishedRev: x.publishedRev || 0,
        hero: pub ? x.hero || null : null, weekOff: x.weekOff && x.weekOff.public !== false ? { label: x.weekOff.label } : x.weekOff ? { label: null } : null,
        streamCount: pub ? (x.counts?.slots || 0) : null,
      };
    });
    await db.doc(P.publicSchedule).set({ currentWeek: current, tz, weeks, updatedAt: FieldValue.serverTimestamp() });
  }

  return { db, FieldValue, Timestamp, crew, requireAuth: crew.requireAuth, text: crew.text, ts, siteTz, loadSettings, whoPlus, onDuty, logAdmin, activity, outbox, loadWeek, openWeekDoc, streamsOfWeek, draftsOfWeek, getAll, loadStream, projectPublic, saveDraft, refreshCounts, rebuildUsualWeek, rebuildPublicBallot, rebuildSchedule };
}

const requireOwner = (w) => { if (!w.isOwner) throw fail("permission-denied", "Only the owner can do that.", "notOwner"); };
const requireAdmin = (w) => { if (!w.isAdmin) throw fail("permission-denied", "Admins only.", "notAdmin"); };

module.exports = { makeCore, P, fail, ms, requireOwner, requireAdmin, OUTBOX_TTL_MS };
