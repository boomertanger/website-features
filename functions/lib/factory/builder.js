// Fun Factory builder callables (docs/specs/fun-factory.md §7, §10). Drafts are never client-
// readable (firestore.rules), so the builder reads and writes through these. Mods and admins
// unless marked admin. Every write goes to adminLog (feature "factory").
//
//   factoryListSeasons()                         every season: status, dates, who drafted it
//   factoryGetSeason({ seasonId })               the whole tree (drafts included) + stage checks,
//                                                activity types and the other seasons' dates
//   factorySave({ seasonId, node, op, data })    create / update / delete / reorder a node of a Draft
//                                                or In review season; on a live one only titles,
//                                                instructions, art, hunt hints and new campaigns and
//                                                events (targets, XP, repeats and past dates refused)
//     node: season | chapter | campaign | activity | medal | badge     op: create | update | delete | reorder | art
//   factoryArtSignature()                        a signed Cloudinary upload into fun-factory/seasons
//   factorySubmit({ seasonId })                  Draft -> In review, when stages 1 to 6 pass
//   factoryPublish({ seasonId })          admin  In review -> Scheduled: every check again, no overlap,
//                                                campaign windows filled in, the season badge made active,
//                                                ideas marked "used in Season N"
//   factorySendBack({ seasonId, note })   admin  In review -> Draft, with the note
//   factoryUnpublish({ seasonId })        admin  Scheduled -> Draft
//   factoryEnd({ seasonId })              admin  ends a live season now and finalizes it (./season.js)
//   factoryDuplicate({ seasonId })               the tree as a new Draft, dates and art cleared
//   factoryIdeaSave({ id, kind, data, retired }) admin  add, edit or retire an idea
//   factoryTypeToggle({ typeId, enabled })   admin  switch an activity type on or off
//   factoryPreview({ seasonId, as, date })      the season as a member of that plan (fan | sub | crew)
//                                                would see it on that day: what's revealed by then, audience
//                                                filtered (Sub Club campaigns stay as a locked count for fan)
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const L = require("./logic");
const C = require("./checks");
const RL = require("../rewards/logic");
const { refs } = require("./record");
const { makeSeason } = require("./season");
const { callerInfo, requireStaff, requireAdmin } = require("../vault/common");
const { uploadGate } = require("../stash/gate");
const cloud = require("../vault/cloudinary");

const SITE_ID = "boomertanger";
const ART_FOLDER = "fun-factory/seasons";
const ART_MIN = 800;
const ART_MAX_BYTES = 5 * 1024 * 1024;
const POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"];
const IDEA_KINDS = ["theme", "chapter", "campaign", "activity", "reward"];
const MAX_MEDALS = 10;
const EDITABLE = ["draft", "review"];
const fail = (code, message, reason, extra = {}) => new HttpsError(code, message, { reason, ...extra });

// ---------- plain values for the browser (Timestamps -> milliseconds) ----------
function plain(v) {
  if (v == null || typeof v !== "object") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (Array.isArray(v)) return v.map(plain);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
}

// ---------- field validation ----------
const str = (v, max, { allowEmpty = true } = {}) => {
  if (v == null) return allowEmpty ? "" : null;
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length > max || (!allowEmpty && !t) ? undefined : t;
};
const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const msOrNull = (v) => (v === null ? null : typeof v === "number" && Number.isFinite(v) && v > Date.UTC(2020, 0, 1) && v < Date.UTC(2100, 0, 1) ? v : undefined);
const oneOf = (v, list) => (list.includes(v) ? v : undefined);
const idLike = (v) => (typeof v === "string" && /^[\w-]{1,80}$/.test(v) ? v : undefined);
const pathLike = (v) => (v === null || v === "" ? null : typeof v === "string" && /^\/[\w\-/]{0,120}$/.test(v) ? v : undefined);
function paramsOf(v, type) {
  if (v == null) return {};
  if (typeof v !== "object" || Array.isArray(v)) return undefined;
  const allowed = new Set([...(type?.params || []), "action"]);
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (x == null || x === "") continue;
    if (!allowed.has(k) || !(typeof x === "string" ? x.length <= 60 : Number.isInteger(x))) return undefined;
    if (k === "action" && (type?.actions || []).length && !type.actions.includes(x)) return undefined;
    out[k] = x;
  }
  return out;
}
const toTs = (v) => (v == null ? null : admin.firestore.Timestamp.fromMillis(v));

const FIELDS = {
  season: { name: (v) => str(v, 60), pitch: (v) => str(v, 200), tags: (v) => (Array.isArray(v) && v.length <= 6 && v.every((t) => typeof t === "string" && t.trim() && t.length <= 24) ? v.map((t) => t.trim().toLowerCase()) : undefined),
    startsAt: msOrNull, endsAt: msOrNull, dailyXpCap: (v) => (v === null ? null : int(v, 0, 100000)), staffRace: (v) => oneOf(v, L.STAFF_RACES), ideaId: (v) => (v == null ? null : idLike(v)) },
  chapter: { name: (v) => str(v, 60), blurb: (v) => str(v, 200), unlockAt: msOrNull, order: (v) => int(v, 0, 99), ideaId: (v) => (v == null ? null : idLike(v)) },
  campaign: { chapterId: idLike, name: (v) => str(v, 60), cadence: (v) => oneOf(v, L.CADENCES), audience: (v) => oneOf(v, L.AUDIENCES), opensAt: msOrNull, closesAt: msOrNull,
    order: (v) => int(v, 0, 99), bonus: (v) => (v == null ? null : typeof v === "object" && int(v.xp ?? 0, 0, 2000) !== undefined && (v.badgeId == null || idLike(v.badgeId)) ? { xp: v.xp || 0, badgeId: v.badgeId || null } : undefined), ideaId: (v) => (v == null ? null : idLike(v)) },
  activity: { campaignId: idLike, title: (v) => str(v, 80), instructions: (v) => str(v, 200), link: pathLike, typeId: idLike, target: (v) => int(v, 1, 1000), xp: (v) => int(v, 0, 2000),
    badgeId: (v) => (v == null || v === "" ? null : idLike(v)), repeat: (v) => oneOf(v, L.REPEATS), order: (v) => int(v, 0, 99), ideaId: (v) => (v == null ? null : idLike(v)) },
  medal: { path: (v) => (L.VISIT_SECTIONS.includes(v) ? v : undefined), position: (v) => oneOf(v, POSITIONS), hint: (v) => str(v, 120), order: (v) => int(v, 0, 99) },
};
const DATE_FIELDS = ["startsAt", "endsAt", "unlockAt", "opensAt", "closesAt"];
// What can still change once the season is live (spec §7 stage 8).
const LIVE_EDITABLE = { season: ["name", "pitch", "tags"], chapter: ["name", "blurb"], campaign: ["name"], activity: ["title", "instructions", "link"], medal: ["hint"] };

/** The season tree as a member of plan `as` sees it at time `at` (the same rules as factoryTick and the rules file). */
function previewOf(t, as, at) {
  const s = t.season;
  const who = { roles: as === "crew" ? ["mod"] : as === "sub" ? ["sub"] : [], staging: true };
  const wins = C.chapterWindows(s, t.chapters);
  const shown = new Set(wins.filter((c) => c.start != null && c.start <= at).map((c) => c.id));
  const chapters = wins.map((c, i) => shown.has(c.id)
    ? { id: c.id, number: i + 1, name: c.name || "", blurb: c.blurb || "", unlockAt: c.start, revealed: true }
    : { id: c.id, number: i + 1, name: null, unlockAt: c.start, revealed: false });
  const byCh = new Map(wins.map((c) => [c.id, c]));
  const campaigns = [], lockedSub = [];
  for (const c of t.campaigns) {
    if (!shown.has(c.chapterId) || c.enabled === false || L.heldBack(c)) continue;
    const w = C.campaignWindow(c, byCh.get(c.chapterId), s);
    if (w.start == null || w.start > at) continue;
    const view = { ...c, opensAt: w.start, closesAt: c.cadence === "story" || c.cadence === "milestone" ? (c.closesAt ?? null) : w.end ?? null, revealed: true, open: w.start <= at && (w.end == null || at < w.end) && at < (s.endsAt ?? Infinity) };
    if (L.audienceOk(c.audience || "all", who)) campaigns.push(view);
    else if (c.audience === "sub") lockedSub.push({ id: c.id, chapterId: c.chapterId, name: c.name });
  }
  const ids = new Set(campaigns.map((c) => c.id));
  const activities = t.activities.filter((a) => ids.has(a.campaignId) && a.enabled !== false).map((a) => ({ ...a, revealed: true }));
  const { createdBy, updatedBy, submittedBy, publishedBy, reviewNote, ...season } = s;
  return { season: { ...season, revealed: true }, chapters, campaigns, activities, lockedSub, as, at };
}

module.exports = function builder({ adminLogEntry, recordAssetCreated, performAssetDeletion, cloudSecrets, cloudCreds }) {
  const db = admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const R = refs(db);
  const Season = makeSeason({ db });
  const col = { chapter: R.chapters, campaign: R.campaigns, activity: R.activities };

  const crew = async (request) => requireStaff(await callerInfo(request));
  const adminOnly = async (request) => requireAdmin(await callerInfo(request));
  async function log(c, action, seasonId, title, details = {}, reason = "") {
    try {
      await db.collection("adminLog").add(await adminLogEntry(db, {
        feature: "factory", action, itemPath: seasonId ? `sites/${SITE_ID}/factory/main/seasons/${seasonId}` : `sites/${SITE_ID}/factory/main`,
        itemTitle: title || seasonId || "Night Shift", actorUid: c.uid, actorName: c.name, reason, details,
      }));
    } catch (err) { console.error("factory: adminLog failed", err); }
  }
  async function types() {
    const snap = await R.types.get();
    return Object.fromEntries(snap.docs.map((d) => [d.id, { enabled: d.get("enabled") === true, params: d.get("params") || [], actions: d.get("actions") || [], name: d.get("name") }]));
  }
  async function others(exceptId) {
    const snap = await R.seasons.get();
    return snap.docs.filter((d) => d.id !== exceptId).map((d) => ({ id: d.id, number: d.get("number") ?? null, name: d.get("name") || "", status: d.get("status"), startsAt: L.ms(d.get("startsAt")) || null, endsAt: L.ms(d.get("endsAt")) || null }));
  }
  async function loadSeason(seasonId) {
    if (!idLike(seasonId)) throw fail("invalid-argument", "Unknown season.", "args");
    const s = await R.season(seasonId).get();
    if (!s.exists) throw fail("not-found", "That season doesn't exist.", "noSeason");
    return s;
  }
  async function tree(seasonId) {
    const s = await loadSeason(seasonId);
    const [ch, ca, ac, hu] = await Promise.all([R.chapters(seasonId).get(), R.campaigns(seasonId).get(), R.activities(seasonId).get(), R.hunts(seasonId).get()]);
    const hunts = await Promise.all(hu.docs.map(async (h) => ({ id: h.id, ...plain(h.data()), medals: (await h.ref.collection("medals").get()).docs.map((m) => ({ id: m.id, ...plain(m.data()) })).sort((a, b) => (a.order || 0) - (b.order || 0)) })));
    const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id));
    const season = { id: s.id, ...plain(s.data()) };
    if (season.badgeId) {
      const b = await db.doc(`sites/${SITE_ID}/badges/${season.badgeId}`).get();
      season.badge = b.exists ? { id: b.id, name: b.get("name"), rarity: b.get("rarity"), emoji: b.get("emoji") || null, status: b.get("status") } : null;
    }
    return {
      season,
      chapters: ch.docs.map((d) => ({ id: d.id, ...plain(d.data()) })).sort(byOrder),
      campaigns: ca.docs.map((d) => ({ id: d.id, ...plain(d.data()) })).sort(byOrder),
      activities: ac.docs.map((d) => ({ id: d.id, ...plain(d.data()) })).sort(byOrder),
      hunts,
    };
  }
  async function checked(seasonId) {
    const [t, ty, ot] = await Promise.all([tree(seasonId), types(), others(seasonId)]);
    const res = C.stageChecks(t, { types: Object.fromEntries(Object.entries(ty).map(([k, v]) => [k, v.enabled])), others: ot, now: Date.now() });
    return { tree: t, types: ty, others: ot, ...res };
  }

  // ---------- reads ----------
  const factoryListSeasons = onCall(async (request) => {
    await crew(request);
    const snap = await R.seasons.get();
    const seasons = (await Promise.all(snap.docs.map(async (d) => {
      const x = plain(d.data());
      // A live season's additions waiting on an admin (a mod's campaign or event; fun-factory.md §13d): one small query, live seasons only.
      const pendingAdditions = x.status === "live"
        ? (await R.campaigns(d.id).where("approval", "in", ["pending", "changes"]).get()).docs.map((p) => ({ id: p.id, name: p.get("name") || "", cadence: p.get("cadence") || "event", approval: p.get("approval"), addedBy: p.get("addedBy") || null }))
        : [];
      return { id: d.id, number: x.number ?? null, name: x.name || "", status: x.status || "draft", startsAt: x.startsAt || null, endsAt: x.endsAt || null, createdBy: x.createdBy || null, updatedAt: x.updatedAt || null, test: !!x.test, art: x.art?.url || null, pending: pendingAdditions.length, pendingAdditions };
    }))).sort((a, b) => (b.number ?? -1) - (a.number ?? -1) || (b.updatedAt || 0) - (a.updatedAt || 0));
    return { ok: true, seasons };
  });

  const factoryGetSeason = onCall(async (request) => {
    await crew(request);
    return { ok: true, ...(await checked(request.data?.seasonId)) };
  });

  // ---------- factorySave ----------
  function clean(node, data, { partial }) {
    const spec = FIELDS[node];
    const out = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (!spec[k]) continue;
      const x = spec[k](v);
      if (x === undefined) throw fail("invalid-argument", `That ${k} isn't valid.`, "field", { field: k });
      out[k] = DATE_FIELDS.includes(k) ? toTs(x) : x;
    }
    if (!partial && node === "campaign" && (!out.chapterId || !out.cadence)) throw fail("invalid-argument", "A campaign needs a chapter and a cadence.", "args");
    if (!partial && node === "activity" && (!out.campaignId || !out.typeId)) throw fail("invalid-argument", "An activity needs a campaign and a type.", "args");
    return out;
  }
  const isPast = (ts, now) => ts != null && L.ms(ts) <= now;

  /** A mod can change their own pending or sent-back addition (not another mod's); their edit to a sent-back one
   *  returns it to "pending". Admins change any. Returns the campaign doc when it's held back, else null. */
  async function guardHeld(c, seasonId, campaignId, { edits = true } = {}) {
    if (!campaignId) return null;
    const ref = R.campaigns(seasonId).doc(campaignId);
    const camp = await ref.get();
    if (!camp.exists || !L.heldBack(camp.data())) return null;
    if (!c.isAdmin && camp.get("addedBy")?.uid !== c.uid) throw fail("permission-denied", "That addition belongs to another mod. An admin can change it.", "notYours");
    if (edits && !c.isAdmin && camp.get("approval") === "changes") await setApproval(seasonId, campaignId, "pending", {});
    return camp;
  }
  /** The campaign and every activity in it move together. */
  async function setApproval(seasonId, campaignId, approval, extra) {
    const batch = db.batch();
    batch.update(R.campaigns(seasonId).doc(campaignId), { approval, ...extra });
    for (const a of (await R.activities(seasonId).where("campaignId", "==", campaignId).get()).docs) batch.update(a.ref, { approval });
    await batch.commit();
  }

  /** Live season: only the fields in LIVE_EDITABLE on revealed nodes, and dates only in the future. */
  function liveGuard(node, op, before, patch, now) {
    const revealed = before?.revealed === true || node === "season";
    if (op === "delete") { if (revealed) throw fail("failed-precondition", "Live parts of a season can't be deleted.", "live"); return; }
    if (op === "create") {
      if (node === "campaign") return;                       // new campaigns and events
      if (node === "activity" || node === "medal") return;   // checked against their (unrevealed) campaign by the caller
      throw fail("failed-precondition", "Once a season is live you can only add campaigns and events.", "live");
    }
    for (const k of Object.keys(patch)) {
      if (DATE_FIELDS.includes(k)) {
        if (isPast(before?.[k], now) || isPast(patch[k], now)) throw fail("failed-precondition", "Dates that have already passed can't change.", "pastDate", { field: k });
        if (revealed && node !== "campaign") throw fail("failed-precondition", "That date is locked now the season is live.", "live", { field: k });
        continue;
      }
      if (revealed && !(LIVE_EDITABLE[node] || []).includes(k)) throw fail("failed-precondition", "Targets, XP and repeats are locked once a season is live. You can still change titles and instructions.", "live", { field: k });
    }
  }

  const factorySave = onCall(async (request) => {
    const c = await crew(request);
    const { seasonId, node, op, data = {} } = request.data || {};
    const now = Date.now();
    if (!["season", "chapter", "campaign", "activity", "medal", "badge"].includes(node) || !["create", "update", "delete", "reorder", "art"].includes(op)) throw fail("invalid-argument", "Unknown change.", "args");

    // A new season.
    if (node === "season" && op === "create") {
      const all = await others(null);
      const number = Math.max(0, ...all.map((s) => s.number ?? 0)) + 1;
      const id = `s${String(number).padStart(2, "0")}-${crypto.randomBytes(3).toString("hex")}`;
      const fields = clean("season", data, { partial: true });
      await R.season(id).set({ number, name: fields.name || "", pitch: fields.pitch || "", tags: fields.tags || [], art: null, startsAt: fields.startsAt ?? null, endsAt: fields.endsAt ?? null, status: "draft", revealed: false, dailyXpCap: null, staffRace: "together", badgeId: null, ideaId: fields.ideaId ?? null, createdBy: { uid: c.uid, name: c.name }, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
      await log(c, "factorySave", id, fields.name || `Season ${number}`, { node, op });
      return { ok: true, seasonId: id };
    }

    const sSnap = await loadSeason(seasonId);
    const status = sSnap.get("status") || "draft";
    const live = status === "live";
    if (!EDITABLE.includes(status) && !live) throw fail("failed-precondition", status === "scheduled" ? "Unpublish the season to edit it." : "This season can't be edited any more.", "locked");
    const touch = () => R.season(seasonId).update({ updatedAt: Timestamp.now(), updatedBy: { uid: c.uid, name: c.name } });
    let result = { ok: true };

    if (node === "season") {
      if (op === "art") result = await setArt(c, sSnap, data);
      else if (op === "update") {
        const patch = clean("season", data, { partial: true });
        if ("staffRace" in patch && !c.isAdmin) throw fail("permission-denied", "Only admins can change where staff race.", "notAdmin");
        if (live) liveGuard("season", "update", sSnap.data(), patch, now);
        await R.season(seasonId).update(patch);
      } else if (op === "delete") {
        if (status !== "draft") throw fail("failed-precondition", "Only a draft can be deleted.", "locked");
        throw fail("failed-precondition", "Deleting seasons isn't available yet.", "notYet");
      } else throw fail("invalid-argument", "Unknown change.", "args");
    } else if (node === "badge") {
      if (op !== "update") throw fail("invalid-argument", "Unknown change.", "args");
      result = await setBadge(c, sSnap, data, live);
    } else if (node === "medal") {
      if (live) await guardHeld(c, seasonId, (await R.activities(seasonId).doc(idLike(data.activityId) || "_").get()).get("campaignId"));
      result = await saveMedal(sSnap, op, data, live, now);
    } else if (op === "reorder") {
      if (live) throw fail("failed-precondition", "The order is fixed once a season is live.", "live");
      const ids = Array.isArray(data.ids) ? data.ids.filter((x) => idLike(x)).slice(0, 100) : [];
      const batch = db.batch();
      ids.forEach((id, i) => batch.update(col[node](seasonId).doc(id), { order: i }));
      await batch.commit();
    } else {
      const ref = op === "create" ? col[node](seasonId).doc() : col[node](seasonId).doc(idLike(data.id) || "_");
      const before = op === "create" ? null : await ref.get();
      if (op !== "create" && !before.exists) throw fail("not-found", "That part of the season is gone. Refresh the builder.", "noNode");
      if (op === "delete") {
        if (live) {
          liveGuard(node, "delete", before.data(), {}, now);
          if (node === "campaign") await guardHeld(c, seasonId, ref.id, { edits: false });
          if (node === "activity") await guardHeld(c, seasonId, before.get("campaignId"));
        }
        await deleteNode(seasonId, node, ref);
      } else {
        const patch = clean(node, data, { partial: op === "update" });
        delete patch.id;
        // An activity's parameters must fit its type (a new type re-checks the old parameters).
        if (node === "activity" && (patch.typeId || data.params !== undefined)) {
          const typeId = patch.typeId || before?.get("typeId");
          const ty = (await types())[typeId];
          if (!ty) throw fail("invalid-argument", "Unknown activity type.", "type");
          const p = paramsOf(data.params !== undefined ? data.params : before?.get("params") || {}, ty);
          if (p === undefined) throw fail("invalid-argument", "Those parameters don't fit the type.", "params");
          if (typeId === "medals" && op !== "create") p.huntId = data.id;
          patch.params = p;
        }
        let joined = null;   // the (held-back) campaign a new live activity joins
        if (live) {
          if (op === "create" && node === "activity") {
            const camp = await R.campaigns(seasonId).doc(patch.campaignId).get();
            if (!camp.exists || camp.get("revealed") === true) throw fail("failed-precondition", "Add activities to a new campaign or event; live campaigns are locked.", "live");
            joined = await guardHeld(c, seasonId, camp.id);
          }
          liveGuard(node, op, before?.data() || null, patch, now);
          if (op === "update" && node === "campaign") await guardHeld(c, seasonId, ref.id);
          if (op === "update" && node === "activity") await guardHeld(c, seasonId, before.get("campaignId"));
        }
        if (op === "create") {
          const order = (await col[node](seasonId).get()).size;
          const base = node === "chapter" ? { name: "", blurb: "", unlockAt: null }
            : node === "campaign" ? { name: "", audience: "all", opensAt: null, closesAt: null, bonus: null, enabled: true }
            : { title: "", instructions: "", link: null, params: {}, target: 1, xp: 0, badgeId: null, repeat: "none", enabled: true };
          // A mod's new campaign or event on a live season, and every activity in it, wait for an admin; an admin's go live.
          const who = { uid: c.uid, name: c.name };
          const hold = live && node === "campaign" ? { approval: c.isAdmin ? "approved" : "pending", addedBy: who }
            : live && node === "activity" ? { approval: joined ? joined.get("approval") : "approved", addedBy: joined?.get("addedBy") || who } : {};
          await ref.set({ ...base, order, ...patch, ...hold, revealed: false, createdAt: Timestamp.now() });
          if (node === "activity" && patch.typeId === "medals") await R.hunts(seasonId).doc(ref.id).set({ activityId: ref.id, name: patch.title || "Hunt" }, { merge: true });
          if (node === "activity" && patch.typeId === "medals") await ref.update({ params: { ...(patch.params || {}), huntId: ref.id } });
          result = { ok: true, id: ref.id };
        } else {
          await ref.update(patch);
          if (node === "activity" && (patch.typeId || before.get("typeId")) === "medals") await R.hunts(seasonId).doc(ref.id).set({ activityId: ref.id, name: patch.title ?? before.get("title") ?? "Hunt" }, { merge: true });
          result = { ok: true, id: ref.id };
        }
      }
    }
    await touch();
    await log(c, "factorySave", seasonId, sSnap.get("name"), { node, op, id: data?.id ?? result.id ?? null, fields: Object.keys(data || {}).filter((k) => k !== "id").slice(0, 12) });
    return result;
  });

  /** Deleting a chapter takes its campaigns and their activities; a campaign takes its activities. */
  async function deleteNode(seasonId, node, ref) {
    const batch = db.batch();
    const dropActivity = async (id) => {
      batch.delete(R.activities(seasonId).doc(id));
      const hunt = R.hunts(seasonId).doc(id);
      (await hunt.collection("medals").get()).docs.forEach((m) => batch.delete(m.ref));
      batch.delete(hunt);
    };
    if (node === "chapter") {
      const camps = await R.campaigns(seasonId).where("chapterId", "==", ref.id).get();
      for (const cp of camps.docs) {
        for (const a of (await R.activities(seasonId).where("campaignId", "==", cp.id).get()).docs) await dropActivity(a.id);
        batch.delete(cp.ref);
      }
    }
    if (node === "campaign") for (const a of (await R.activities(seasonId).where("campaignId", "==", ref.id).get()).docs) await dropActivity(a.id);
    if (node === "activity") await dropActivity(ref.id);
    else batch.delete(ref);
    await batch.commit();
  }

  async function saveMedal(sSnap, op, data, live, now) {
    const activityId = idLike(data.activityId);
    if (!activityId) throw fail("invalid-argument", "Which hunt?", "args");
    const act = await R.activities(sSnap.id).doc(activityId).get();
    if (!act.exists || act.get("typeId") !== "medals") throw fail("invalid-argument", "That activity isn't a medal hunt.", "args");
    const hunt = R.hunts(sSnap.id).doc(activityId);
    const medals = hunt.collection("medals");
    if (op === "create") {
      if (live && act.get("revealed") === true) throw fail("failed-precondition", "A live hunt's medals are fixed; you can still change hints.", "live");
      if ((await medals.get()).size >= MAX_MEDALS) throw fail("failed-precondition", `A hunt has at most ${MAX_MEDALS} medals.`, "tooMany");
      const fields = clean("medal", data, { partial: true });
      if (!fields.path) throw fail("invalid-argument", "Pick the page the medal hides on.", "field", { field: "path" });
      await hunt.set({ activityId, name: act.get("title") || "Hunt" }, { merge: true });
      const ref = medals.doc();
      await ref.set({ path: fields.path, position: fields.position || "bottom-right", hint: fields.hint || "", order: (await medals.get()).size });
      return { ok: true, id: ref.id };
    }
    const ref = medals.doc(idLike(data.id) || "_");
    const before = await ref.get();
    if (!before.exists) throw fail("not-found", "That medal is gone. Refresh the builder.", "noNode");
    if (op === "delete") {
      if (live && act.get("revealed") === true) throw fail("failed-precondition", "A live hunt's medals are fixed.", "live");
      await ref.delete();
      return { ok: true };
    }
    const patch = clean("medal", data, { partial: true });
    if (live && act.get("revealed") === true) liveGuard("medal", "update", { ...before.data(), revealed: true }, patch, now);
    await ref.update(patch);
    return { ok: true, id: ref.id };
  }

  /** The season's badge in the Trophy Room catalog: draft until the season is published. */
  async function setBadge(c, sSnap, data, live) {
    const name = str(data.name, 40, { allowEmpty: false });
    const rarity = int(data.rarity, 1, 5);
    const emoji = data.emoji == null ? "🏅" : str(data.emoji, 8, { allowEmpty: false });
    if (!name || !rarity || !emoji) throw fail("invalid-argument", "A badge needs a name, a rarity (1 to 5) and an emoji.", "badge");
    if (live) throw fail("failed-precondition", "The season badge is fixed once the season is live.", "live");
    const id = sSnap.get("badgeId") || `factory-${sSnap.id}`;
    const ref = db.doc(`sites/${SITE_ID}/badges/${id}`);
    const cur = await ref.get();
    if (cur.exists && cur.get("status") === "active" && cur.get("source") !== "factory") throw fail("failed-precondition", "That badge belongs to something else.", "badge");
    const seasonName = sSnap.get("name") || `Season ${sSnap.get("number") ?? ""}`.trim();
    await ref.set({
      name, rarity, emoji, collection: "limited", source: "factory", how: `Finish every Story campaign in ${seasonName}.`, xp: RL.XP_BY_RARITY[rarity],
      secret: null, limited: { label: seasonName, opensAt: null, closesAt: null }, crewOnly: false, ladder: null, awardableBy: null,
      status: cur.exists ? cur.get("status") : "draft", factorySeasonId: sSnap.id,
      ...(cur.exists ? {} : { holders: 0, pctHeld: 0, createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    if (sSnap.get("badgeId") !== id) await sSnap.ref.update({ badgeId: id });
    return { ok: true, badgeId: id };
  }

  // ---------- art ----------
  const factoryArtSignature = onCall({ secrets: cloudSecrets }, async (request) => {
    const c = await crew(request);
    await uploadGate(c, "seasonArt");   // Cloud Stash: paused or stopped uploads are refused first
    return { ok: true, ...cloud.uploadParams({ creds: cloudCreds(), folder: ART_FOLDER }) };
  });
  async function setArt(c, sSnap, data) {
    const publicId = data.uploadPublicId;
    if (typeof publicId !== "string" || !publicId.startsWith(`${ART_FOLDER}/`) || publicId.length > 200) throw fail("invalid-argument", "That upload isn't season art.", "art");
    const creds = cloudCreds();
    const info = await cloud.resourceInfo(fetch, creds, publicId, "upload");
    const problem = !info ? "notFound" : !cloud.ALLOWED_FORMATS.includes(String(info.format || "").toLowerCase()) ? "format"
      : !(info.bytes > 0) || info.bytes > ART_MAX_BYTES ? "tooBig" : info.width < ART_MIN || info.height < ART_MIN ? "tooSmall"
      : Math.abs(info.width / info.height - 1) > 0.05 ? "notSquare" : null;
    if (problem) throw fail("invalid-argument", { notFound: "The upload didn't arrive. Try again.", format: "Use a JPG, PNG or WebP.", tooBig: "Keep it under 5 MB.", tooSmall: `Use at least ${ART_MIN} by ${ART_MIN} pixels.`, notSquare: "Season art is square." }[problem], "art", { problem });
    const assetId = await recordAssetCreated({ url: info.secure_url, publicId: info.public_id, feature: "funFactory", sizeBytes: info.bytes, linkedCollection: `sites/${SITE_ID}/factory/main/seasons`, linkedDocId: sSnap.id, linkedField: "art.url" });
    const old = sSnap.get("art");
    await sSnap.ref.update({ art: { url: info.secure_url, publicId: info.public_id, assetId, width: info.width, height: info.height } });
    if (old?.assetId && old.assetId !== assetId) await performAssetDeletion(old.assetId, creds, { clearLinkedField: false }).catch((err) => console.error("factory: old art not deleted", err));
    return { ok: true, art: { url: info.secure_url } };
  }

  // ---------- status flow ----------
  async function move(seasonId, from, to, extra = {}) {
    return db.runTransaction(async (tx) => {
      const s = await tx.get(R.season(seasonId));
      if (!s.exists) throw fail("not-found", "That season doesn't exist.", "noSeason");
      if (!from.includes(s.get("status"))) throw fail("failed-precondition", `The season is ${s.get("status")}, not ${from.join(" or ")}.`, "status", { status: s.get("status") });
      tx.update(s.ref, { status: to, statusAt: Timestamp.now(), ...extra });
      return s;
    });
  }

  const factorySubmit = onCall(async (request) => {
    const c = await crew(request);
    const r = await checked(request.data?.seasonId);
    if (!r.readyToSubmit) throw fail("failed-precondition", "Finish stages 1 to 6 first.", "notReady", { stages: r.stages.filter((s) => !s.ok).map((s) => s.key) });
    const s = await move(r.tree.season.id, ["draft"], "review", { submittedBy: { uid: c.uid, name: c.name }, reviewNote: null });
    await log(c, "factorySubmit", s.id, s.get("name"));
    return { ok: true, status: "review" };
  });

  const factoryPublish = onCall(async (request) => {
    const c = await adminOnly(request);
    const r = await checked(request.data?.seasonId);
    const t = r.tree, s = t.season;
    if (s.status !== "review") throw fail("failed-precondition", "Only a season in review can be published.", "status");
    if (!r.readyToSubmit) throw fail("failed-precondition", "Some checks no longer pass. Send it back to draft.", "notReady", { stages: r.stages.filter((x) => !x.ok).map((x) => x.key) });
    const clash = r.others.find((o) => !["draft", "archived"].includes(o.status) && o.startsAt && o.endsAt && L.seasonsOverlap(o, s));
    if (clash) throw fail("failed-precondition", `It overlaps ${clash.name || clash.id}. Seasons can't overlap.`, "overlap");
    if (s.startsAt <= Date.now()) throw fail("failed-precondition", "The start date has passed. Move it to the future first.", "pastStart");
    // Fill in every campaign's window from its chapter (Daily and Weekly end with their chapter;
    // Story, Milestone and Event run to their own dates or the season's end).
    const wins = new Map(C.chapterWindows(s, t.chapters).map((x) => [x.id, x]));
    const batch = db.batch();
    for (const cp of t.campaigns) {
      const w = C.campaignWindow(cp, wins.get(cp.chapterId), s);
      batch.update(R.campaigns(s.id).doc(cp.id), { opensAt: toTs(w.start), closesAt: cp.cadence === "story" || cp.cadence === "milestone" ? (cp.closesAt ? toTs(cp.closesAt) : null) : toTs(w.end), revealed: false });
    }
    for (const ch of t.chapters) batch.update(R.chapters(s.id).doc(ch.id), { revealed: false });
    for (const a of t.activities) batch.update(R.activities(s.id).doc(a.id), { revealed: false, repeat: a.repeat || (t.campaigns.find((x) => x.id === a.campaignId)?.cadence === "daily" ? "daily" : t.campaigns.find((x) => x.id === a.campaignId)?.cadence === "weekly" ? "weekly" : "none") });
    batch.update(R.season(s.id), { status: "scheduled", revealed: false, statusAt: Timestamp.now(), publishedBy: { uid: c.uid, name: c.name }, reviewNote: null });
    if (s.badgeId) batch.update(db.doc(`sites/${SITE_ID}/badges/${s.badgeId}`), { status: "active" });
    // Ideas used in this season: "Used in S02".
    const used = new Set([s.ideaId, ...t.chapters.map((x) => x.ideaId), ...t.campaigns.map((x) => x.ideaId), ...t.activities.map((x) => x.ideaId)].filter(Boolean));
    const label = `S${String(s.number ?? 0).padStart(2, "0")}`;
    for (const id of used) batch.set(R.root.collection("ideas").doc(id), { usedIn: FieldValue.arrayUnion(label) }, { merge: true });
    await batch.commit();
    await log(c, "factoryPublish", s.id, s.name, { startsAt: s.startsAt, endsAt: s.endsAt, ideas: used.size });
    return { ok: true, status: "scheduled" };
  });

  const factorySendBack = onCall(async (request) => {
    const c = await adminOnly(request);
    const note = str(request.data?.note, 500, { allowEmpty: false });
    if (!note) throw fail("invalid-argument", "Say what needs changing.", "note");
    const s = await move(request.data?.seasonId, ["review"], "draft", { reviewNote: { text: note, by: c.name, at: Timestamp.now() } });
    await log(c, "factorySendBack", s.id, s.get("name"), {}, note);
    return { ok: true, status: "draft" };
  });

  const factoryUnpublish = onCall(async (request) => {
    const c = await adminOnly(request);
    const s = await move(request.data?.seasonId, ["scheduled"], "draft");
    if (s.get("badgeId")) await db.doc(`sites/${SITE_ID}/badges/${s.get("badgeId")}`).update({ status: "draft" }).catch(() => {});
    await log(c, "factoryUnpublish", s.id, s.get("name"));
    return { ok: true, status: "draft" };
  });

  const factoryEnd = onCall({ timeoutSeconds: 540 }, async (request) => {
    const c = await adminOnly(request);
    const s = await loadSeason(request.data?.seasonId);
    if (s.get("status") !== "live") throw fail("failed-precondition", "Only a live season can be ended.", "status");
    const now = Date.now();
    await s.ref.update({ endsAt: Timestamp.fromMillis(now), endedEarlyBy: { uid: c.uid, name: c.name } });
    const out = await Season.finalize({ id: s.id, ...s.data(), endsAt: Timestamp.fromMillis(now) }, now);
    await log(c, "factoryEnd", s.id, s.get("name"), { results: out.length });
    return { ok: true, status: "ended" };
  });

  const factoryDuplicate = onCall(async (request) => {
    const c = await crew(request);
    const t = await tree(request.data?.seasonId);
    const all = await others(null);
    const number = Math.max(0, ...all.map((s) => s.number ?? 0)) + 1;
    const id = `s${String(number).padStart(2, "0")}-${crypto.randomBytes(3).toString("hex")}`;
    const now = Timestamp.now();
    const strip = (x, drop) => Object.fromEntries(Object.entries(x).filter(([k]) => !["id", "revealed", "revealedAt", ...drop].includes(k)));
    const writes = [[R.season(id), { number, name: `${t.season.name || "Untitled"} (copy)`, pitch: t.season.pitch || "", tags: t.season.tags || [], art: null, startsAt: null, endsAt: null, status: "draft", revealed: false, dailyXpCap: t.season.dailyXpCap ?? null, staffRace: t.season.staffRace || "together", badgeId: null, ideaId: t.season.ideaId || null, duplicatedFrom: t.season.id, createdBy: { uid: c.uid, name: c.name }, createdAt: now, updatedAt: now }]];
    for (const ch of t.chapters) writes.push([R.chapters(id).doc(ch.id), { ...strip(ch, ["createdAt"]), unlockAt: null, revealed: false, createdAt: now }]);
    for (const cp of t.campaigns) writes.push([R.campaigns(id).doc(cp.id), { ...strip(cp, ["createdAt"]), opensAt: null, closesAt: null, revealed: false, createdAt: now }]);
    for (const a of t.activities) writes.push([R.activities(id).doc(a.id), { ...strip(a, ["createdAt"]), revealed: false, createdAt: now }]);
    for (const h of t.hunts) {
      writes.push([R.hunts(id).doc(h.id), { activityId: h.activityId || h.id, name: h.name || "Hunt" }]);
      for (const m of h.medals || []) writes.push([R.hunts(id).doc(h.id).collection("medals").doc(m.id), strip(m, [])]);
    }
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      writes.slice(i, i + 400).forEach(([ref, d]) => batch.set(ref, d));
      await batch.commit();
    }
    await log(c, "factoryDuplicate", id, `${t.season.name} (copy)`, { from: t.season.id });
    return { ok: true, seasonId: id };
  });

  // ---------- ideas and types ----------
  const IDEA_FIELDS = {
    name: (v) => str(v, 60), text: (v) => str(v, 200), pitch: (v) => str(v, 200), emoji: (v) => (v == null ? null : str(v, 8)), theme: (v) => (v == null ? null : str(v, 60)),
    tags: (v) => (Array.isArray(v) && v.length <= 8 && v.every((t) => typeof t === "string" && t.length <= 24) ? v : undefined),
    cadence: (v) => (v == null ? null : oneOf(v, L.CADENCES)), audience: (v) => (v == null ? null : oneOf(v, L.AUDIENCES)),
    title: (v) => str(v, 80), instructions: (v) => str(v, 200), typeId: (v) => (v == null ? null : idLike(v)), target: (v) => (v == null ? null : int(v, 1, 1000)), xp: (v) => (v == null ? null : int(v, 0, 2000)),
    params: (v) => (v == null ? {} : typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string" || Number.isInteger(x)) ? v : undefined),
  };
  const factoryIdeaSave = onCall(async (request) => {
    const c = await adminOnly(request);
    const { id, kind, data = {}, retired } = request.data || {};
    if (id != null && !idLike(id)) throw fail("invalid-argument", "Unknown idea.", "args");
    const ref = id ? R.root.collection("ideas").doc(id) : R.root.collection("ideas").doc();
    const cur = id ? await ref.get() : null;
    if (id && !cur.exists) throw fail("not-found", "That idea is gone.", "noIdea");
    const k = cur?.get("kind") || kind;
    if (!IDEA_KINDS.includes(k)) throw fail("invalid-argument", "Pick what kind of idea it is.", "kind");
    const patch = {};
    for (const [f, v] of Object.entries(data)) {
      if (!IDEA_FIELDS[f]) continue;
      const x = IDEA_FIELDS[f](v);
      if (x === undefined) throw fail("invalid-argument", `That ${f} isn't valid.`, "field", { field: f });
      patch[f] = x;
    }
    if (typeof retired === "boolean") patch.retired = retired;
    if (!cur) {
      const label = patch.name || patch.title;
      if (!label) throw fail("invalid-argument", "An idea needs a name or title.", "field");
      await ref.set({ kind: k, ...patch, retired: patch.retired ?? false, usedIn: [], source: "admin", addedBy: { uid: c.uid, name: c.name }, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    } else {
      await ref.update({ ...patch, updatedAt: Timestamp.now() });
    }
    await log(c, "factoryIdeaSave", null, patch.name || patch.title || cur?.get("name") || cur?.get("title") || ref.id, { id: ref.id, kind: k, retired: patch.retired ?? null });
    return { ok: true, id: ref.id };
  });

  const factoryTypeToggle = onCall(async (request) => {
    const c = await adminOnly(request);
    const { typeId, enabled } = request.data || {};
    if (!idLike(typeId) || typeof enabled !== "boolean") throw fail("invalid-argument", "typeId and enabled are required.", "args");
    const ref = R.types.doc(typeId);
    const snap = await ref.get();
    if (!snap.exists) throw fail("not-found", "Unknown activity type.", "noType");
    await ref.update({ enabled, toggledBy: { uid: c.uid, name: c.name }, toggledAt: Timestamp.now() });
    await log(c, "factoryTypeToggle", null, snap.get("name") || typeId, { typeId, enabled });
    return { ok: true, typeId, enabled };
  });

  // ---------- factoryPreview({ seasonId, as, date }) ----------
  const factoryPreview = onCall(async (request) => {
    await crew(request);
    const { as = "fan", date } = request.data || {};
    if (!["fan", "sub", "crew"].includes(as)) throw fail("invalid-argument", "Preview as fan, sub or crew.", "args");
    const t = await tree(request.data?.seasonId);
    const m = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
    // Noon Central on that day (any time that day shows the same chapters and campaigns).
    const at = m ? (Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, +m.slice(8, 10), 17)) : Date.now();
    return { ok: true, ...previewOf(t, as, at) };
  });

  // ---------- approving a mod's additions to a live season (fun-factory.md §13d) ----------
  async function heldCampaign(request) {
    const c = await adminOnly(request);
    const { seasonId, campaignId } = request.data || {};
    const sSnap = await loadSeason(seasonId);
    if (sSnap.get("status") !== "live") throw fail("failed-precondition", "Only a live season has additions to approve.", "notLive");
    if (!idLike(campaignId)) throw fail("invalid-argument", "Which addition?", "args");
    const camp = await R.campaigns(seasonId).doc(campaignId).get();
    if (!camp.exists) throw fail("not-found", "That addition is gone. Refresh the builder.", "noNode");
    if (!L.heldBack(camp.data())) throw fail("failed-precondition", "That one isn't waiting for approval.", "notPending");
    return { c, sSnap, camp };
  }
  const factoryApproveAddition = onCall(async (request) => {
    const { c, sSnap, camp } = await heldCampaign(request);
    await setApproval(sSnap.id, camp.id, "approved", { approvedBy: { uid: c.uid, name: c.name }, approvedAt: Timestamp.now(), reviewNote: null });
    await log(c, "factoryApproveAddition", sSnap.id, sSnap.get("name"), { campaignId: camp.id, name: camp.get("name") || "", addedBy: camp.get("addedBy") || null });
    return { ok: true };
  });
  const factorySendBackAddition = onCall(async (request) => {
    const { c, sSnap, camp } = await heldCampaign(request);
    const note = str(request.data?.note, 300, { allowEmpty: false });
    if (!note) throw fail("invalid-argument", "Tell the mod what to change.", "note");
    await setApproval(sSnap.id, camp.id, "changes", { reviewNote: note, sentBackBy: { uid: c.uid, name: c.name }, sentBackAt: Timestamp.now() });
    await log(c, "factorySendBackAddition", sSnap.id, sSnap.get("name"), { campaignId: camp.id, name: camp.get("name") || "", addedBy: camp.get("addedBy") || null }, note);
    return { ok: true };
  });

  return {
    factoryApproveAddition, factorySendBackAddition,
    factoryListSeasons, factoryGetSeason, factoryPreview, factorySave, factoryArtSignature, factorySubmit, factoryPublish,
    factorySendBack, factoryUnpublish, factoryEnd, factoryDuplicate, factoryIdeaSave, factoryTypeToggle,
  };
};
module.exports.previewOf = previewOf;
