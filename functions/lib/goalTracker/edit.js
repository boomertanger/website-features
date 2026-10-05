// goalTrackerEdit (docs/specs/goal-tracker.md §4), the admin editing callable for the draft plan.
// It has the same request shape as adminEditItem ({ id, changes, reason }) but its own actions,
// because goal items need create, delete with children, reorder, config and seed, which
// adminEditItem (one existing item, field changes with a conflict check) doesn't cover.
//
//   goalTrackerEdit({ action, ... })      admins only; two tabs: last write wins, the reply carries the saved item
//     create        { type, parentId, changes, confirmVisible }   -> { id, item }
//     update        { id, changes, confirmVisible, reason }       -> { id, item, changed }
//     setStatus     { id, status }                                -> { id, item, changed }
//     delete        { id, reason }                                -> { removed }   (the item and all its children)
//     reorder       { id, direction: "up" | "down" }              -> { moved }
//     updateConfig  { changes }                                   -> { config }
//     metricSave    { metricId?, changes, confirmVisible }        -> { metricId, metric }   (new ones are manual)
//     metricDelete  { metricId }                                  -> { removed }   (items tied to it lose their meter)
//     seed          {}                                            -> { items, metrics }   (only when there are no items)
//   changes (item): title <= 120, description <= 600, help <= 200, status, startDate, dueDate, visibility,
//     relaunch { needed, weeks, side }, metricId + target (goals), level (milestones), icon (tracks).
//   Every edit writes the draft only: the item gets changedSincePublish and config.pendingChanges goes up.
//   Income items (tied to a USD metric, or in the track that has one) are private until confirmVisible.
const { HttpsError } = require("firebase-functions/v2/https");
const { callerInfo, requireAdmin, fail } = require("../vault/common");
const L = require("./logic");
const SEED = require("../../data/goal-tracker-seed.json");

const STEP = 10;
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v ?? null);
const sameValue = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

/** A Goal Tracker validation error becomes the HttpsError the site shows (reason + field). */
function wrap(err) {
  if (err instanceof L.Invalid) return new HttpsError("invalid-argument", err.message, { reason: err.reason, field: err.field });
  return err;
}

module.exports = function makeEdit({ store }) {
  const { R, FieldValue, db } = store;
  const stamp = () => FieldValue.serverTimestamp();
  const pending = () => ({ pendingChanges: FieldValue.increment(1) });

  const diffOf = (before, after) => {
    const changes = {};
    for (const k of Object.keys(after)) if (!sameValue(before[k], after[k])) changes[k] = { from: before[k] ?? null, to: after[k] };
    return changes;
  };
  const levelSet = (config) => new Set((config.levels || []).map((l) => l.n));

  async function loadItem(id) {
    if (typeof id !== "string" || !id || id.includes("/")) throw fail("invalid-argument", "Pick an item.", "id");
    const snap = await R.item(id).get();
    if (!snap.exists) throw fail("not-found", "That item no longer exists. Reload the plan.", "gone");
    return store.itemOf(snap);
  }

  function checkMetric(metrics, metricId) {
    if (metricId && !metrics[metricId]) throw new L.Invalid("metricId", "That metric doesn't exist.");
  }

  /** Throws confirmIncome when an income item would become visible without confirmation. */
  function incomeGuard({ all, metrics, item, wasVisible, confirm }) {
    const others = all.filter((i) => i.id !== item.id);
    const income = L.incomeIds([...others, item], metrics);
    if (income.has(item.id) && item.visibility !== "private" && !wasVisible && confirm !== true) {
      throw fail("failed-precondition", "This is about income. Confirm to make it visible to members.", "confirmIncome");
    }
    return income.has(item.id);
  }

  // ---------- create ----------
  async function create(c, d) {
    const type = d.type;
    if (!L.TYPES.includes(type)) throw fail("invalid-argument", "Pick what to add: a track, goal, milestone or task.", "type");
    const all = await store.loadAll();
    if (all.items.length >= L.MAX_ITEMS) throw fail("resource-exhausted", `The plan is full (${L.MAX_ITEMS} items).`, "tooMany");
    const parentType = L.PARENT_OF[type];
    let parentId = null;
    if (parentType) {
      parentId = d.parentId;
      const parent = all.items.find((i) => i.id === parentId);
      if (!parent || parent.type !== parentType) throw fail("invalid-argument", `A ${type} goes under a ${parentType}.`, "parent");
    } else if (d.parentId) throw fail("invalid-argument", "A track has no parent.", "parent");
    const input = { ...(d.changes || {}) };
    const fields = L.itemFields(type, { ...input, visibility: input.visibility ?? "members" }, { levels: levelSet(all.config), full: true });
    checkMetric(all.metrics, fields.metricId);
    const siblings = all.items.filter((i) => (i.parentId || null) === parentId);
    const ref = R.items.doc();
    const item = {
      type, parentId, level: type === "milestone" ? fields.level : null, status: type === "track" ? null : fields.status,
      startDate: fields.startDate ?? null, dueDate: fields.dueDate ?? null, help: fields.help ?? "", icon: fields.icon ?? "",
      relaunch: fields.relaunch ?? { needed: false, weeks: 0, side: "site" }, metricId: fields.metricId ?? null, target: fields.target ?? null,
      title: fields.title, description: fields.description, visibility: fields.visibility,
      order: (siblings.reduce((m, s) => Math.max(m, s.order ?? 0), 0)) + STEP, id: ref.id,
    };
    // Income defaults to private; making it visible needs the confirmation.
    const isIncome = L.incomeIds([...all.items, item], all.metrics).has(item.id);
    if (isIncome && input.visibility == null) item.visibility = "private";
    else incomeGuard({ all: all.items, metrics: all.metrics, item, wasVisible: false, confirm: d.confirmVisible });
    const { id, ...doc } = item;
    const batch = db.batch();
    batch.set(ref, { ...doc, changedSincePublish: true, createdAt: stamp(), updatedAt: stamp() });
    batch.set(R.config, pending(), { merge: true });
    await batch.commit();
    await store.log({ action: "create", itemPath: ref.path, itemTitle: item.title, actorUid: c.uid, actorName: c.name, reason: "", details: { type, parentId } });
    return { id, item };
  }

  // ---------- update and setStatus ----------
  async function update(c, d, { action = "update", only } = {}) {
    const before = await loadItem(d.id);
    const all = await store.loadAll();
    const changes = only ? { [only]: d.changes?.[only] } : d.changes;
    // A metric and its target travel together: sending one keeps the other as it was.
    if (changes && typeof changes === "object" && ("metricId" in changes) !== ("target" in changes)) {
      if (!("metricId" in changes)) changes.metricId = before.metricId;
      else changes.target = before.target;
    }
    const fields = L.itemFields(before.type, changes, { levels: levelSet(all.config) });
    if (!Object.keys(fields).length) return { id: before.id, item: before, changed: false };
    const nextMetric = "metricId" in fields ? fields.metricId : before.metricId;
    checkMetric(all.metrics, nextMetric);
    const next = { ...before, ...fields };
    const wasIncome = L.incomeIds(all.items, all.metrics).has(before.id);
    const nowIncome = L.incomeIds([...all.items.filter((i) => i.id !== before.id), next], all.metrics).has(before.id);
    if (nowIncome && next.visibility !== "private" && (before.visibility === "private" || !wasIncome) && d.confirmVisible !== true) {
      throw fail("failed-precondition", "This is about income. Confirm to make it visible to members.", "confirmIncome");
    }
    const diff = diffOf(before, fields);
    if (!Object.keys(diff).length) return { id: before.id, item: before, changed: false };
    const batch = db.batch();
    batch.update(R.item(before.id), { ...fields, changedSincePublish: true, updatedAt: stamp() });
    batch.set(R.config, pending(), { merge: true });
    await batch.commit();
    const reason = typeof d.reason === "string" ? d.reason.trim().slice(0, L.LIMITS.reason) : "";
    await store.log({ action: action === "status" ? "status" : "update", itemPath: R.item(before.id).path, itemTitle: next.title, actorUid: c.uid, actorName: c.name, reason, changes: diff });
    return { id: before.id, item: next, changed: true };
  }

  // ---------- delete ----------
  async function remove(c, d) {
    const item = await loadItem(d.id);
    const all = await store.loadAll();
    const gone = [item, ...L.descendants(all.items, item.id)];
    const ops = gone.map((g) => (b) => b.delete(R.item(g.id)));
    ops.push((b) => b.set(R.config, pending(), { merge: true }));
    await store.commitChunks(ops);
    const reason = typeof d.reason === "string" ? d.reason.trim().slice(0, L.LIMITS.reason) : "";
    await store.log({
      action: "delete", itemPath: R.item(item.id).path, itemTitle: item.title, actorUid: c.uid, actorName: c.name, reason,
      snapshot: { type: item.type, title: item.title, children: gone.length - 1, childTitles: gone.slice(1, 21).map((g) => g.title) },
    });
    return { removed: gone.length };
  }

  // ---------- reorder ----------
  async function reorder(c, d) {
    if (!["up", "down"].includes(d.direction)) throw fail("invalid-argument", "Move up or down.", "direction");
    const item = await loadItem(d.id);
    const all = await store.loadAll();
    const sibs = L.childrenOf(all.items, item.parentId);
    // Equal orders (older data) are renumbered first so the swap means something.
    const dup = new Set(sibs.map((s) => s.order)).size !== sibs.length;
    const renum = dup ? sibs.map((s, i) => ({ ...s, order: (i + 1) * STEP })) : sibs;
    const i = renum.findIndex((s) => s.id === item.id);
    const j = d.direction === "up" ? i - 1 : i + 1;
    if ((j < 0 || j >= renum.length) && !dup) return { moved: false };
    const batch = db.batch();
    if (dup) renum.forEach((s) => batch.update(R.item(s.id), { order: s.order, updatedAt: stamp() }));
    if (j >= 0 && j < renum.length) {
      const a = renum[i], b = renum[j];
      batch.update(R.item(a.id), { order: b.order, changedSincePublish: true, updatedAt: stamp() });
      batch.update(R.item(b.id), { order: a.order, changedSincePublish: true, updatedAt: stamp() });
      batch.set(R.config, pending(), { merge: true });
    }
    await batch.commit();
    if (j < 0 || j >= renum.length) return { moved: false };
    await store.log({ action: "reorder", itemPath: R.item(item.id).path, itemTitle: item.title, actorUid: c.uid, actorName: c.name, reason: "", details: { direction: d.direction } });
    return { moved: true };
  }

  // ---------- config ----------
  async function updateConfig(c, d) {
    const fields = L.configFields(d.changes);
    if (!Object.keys(fields).length) throw fail("invalid-argument", "Nothing to save.", "empty");
    const all = await store.loadAll();
    if (fields.levels) {
      const keep = new Set(fields.levels.map((l) => l.n));
      const stuck = all.items.find((i) => i.type === "milestone" && !keep.has(i.level));
      if (stuck) throw fail("failed-precondition", `"${stuck.title}" is on a level you removed. Move it first.`, "levelInUse");
    }
    const diff = {};
    for (const k of Object.keys(fields)) if (!sameValue(all.config[k], fields[k])) diff[k] = k === "levels" ? { changed: true } : { from: all.config[k] ?? null, to: fields[k] };
    if (!Object.keys(diff).length) return { config: all.config, changed: false };
    await R.config.set({ ...fields, pendingChanges: FieldValue.increment(1), updatedAt: stamp() }, { merge: true });
    await store.log({ action: "config", itemPath: R.config.path, itemTitle: "Goal Tracker settings", actorUid: c.uid, actorName: c.name, reason: "", changes: diff });
    return { config: { ...all.config, ...fields }, changed: true };
  }

  // ---------- metrics ----------
  async function metricSave(c, d) {
    const all = await store.loadAll();
    const existing = typeof d.metricId === "string" && d.metricId ? all.metrics[d.metricId] : null;
    if (d.metricId && !existing) throw fail("not-found", "That metric no longer exists.", "gone");
    const fields = L.metricFields(d.changes, { full: !existing });
    const next = { ...(existing || { source: "manual", value: null, updatedAt: null }), ...fields };
    const wasIncomeVisible = existing && L.isIncomeMetric(existing) && existing.visibility !== "private";
    if (L.isIncomeMetric(next) && next.visibility !== "private" && !wasIncomeVisible && d.confirmVisible !== true) {
      // A new USD metric defaults to private; asking for it visible needs the confirmation.
      if (!existing && !("visibility" in (d.changes || {}))) next.visibility = fields.visibility = "private";
      else throw fail("failed-precondition", "This is about income. Confirm to make it visible to members.", "confirmIncome");
    }
    let id = existing ? d.metricId : null;
    if (!existing) {
      if (Object.keys(all.metrics).length >= L.MAX_METRICS) throw fail("resource-exhausted", `Up to ${L.MAX_METRICS} metrics.`, "tooMany");
      const base = L.slug(fields.label); id = base;
      for (let n = 2; all.metrics[id]; n++) id = `${base}-${n}`;
    }
    const diff = existing ? diffOf(existing, fields) : { created: { to: fields.label } };
    if (existing && !Object.keys(diff).length) return { metricId: id, metric: existing, changed: false };
    const batch = db.batch();
    if (existing) batch.update(R.metric(id), fields);
    else batch.set(R.metric(id), { label: fields.label, unit: fields.unit, visibility: fields.visibility, source: "manual", value: null, updatedAt: null });
    batch.set(R.config, pending(), { merge: true });
    await batch.commit();
    await store.log({ action: "metric", itemPath: R.metric(id).path, itemTitle: next.label, actorUid: c.uid, actorName: c.name, reason: "", changes: diff });
    return { metricId: id, metric: { ...next, id }, changed: true };
  }

  async function metricDelete(c, d) {
    const all = await store.loadAll();
    const m = typeof d.metricId === "string" ? all.metrics[d.metricId] : null;
    if (!m) throw fail("not-found", "That metric no longer exists.", "gone");
    const tied = all.items.filter((i) => i.metricId === d.metricId);
    const history = await R.history(d.metricId).get();
    const ops = [
      ...history.docs.map((h) => (b) => b.delete(h.ref)),
      ...tied.map((i) => (b) => b.update(R.item(i.id), { metricId: null, target: null, changedSincePublish: true, updatedAt: stamp() })),
      (b) => b.delete(R.metric(d.metricId)),
      (b) => b.set(R.config, pending(), { merge: true }),
    ];
    await store.commitChunks(ops);
    await store.log({
      action: "metric", itemPath: R.metric(d.metricId).path, itemTitle: m.label, actorUid: c.uid, actorName: c.name, reason: "",
      changes: { deleted: { from: m.label, to: null } }, snapshot: { label: m.label, unit: m.unit || "", itemsUntied: tied.length },
    });
    return { removed: 1, untied: tied.length };
  }

  // ---------- seed ----------
  /** The starting plan (data/goal-tracker-seed.json, a copy of docs/specs/goal-tracker-seed.json), only into an empty plan. */
  async function seed(c) {
    const all = await store.loadAll();
    if (all.items.length) throw fail("failed-precondition", "The plan already has items. Delete them first to load the starting plan.", "notEmpty");
    const config = L.configFields({ northStar: SEED.config.northStar, story: SEED.config.story, result: SEED.config.result, levels: SEED.levels, relaunchAt: SEED.config.relaunchAt, nomineesAt: SEED.config.nomineesAt, showAt: SEED.config.showAt });
    const metrics = {};
    for (const m of SEED.metrics) {
      const f = L.metricFields({ label: m.label, unit: m.unit, visibility: m.visibility }, { full: true });
      const ok = m.source === "manual" || (typeof m.source === "string" && m.source.startsWith("auto:") && L.AUTO_KEYS.includes(m.source.slice(5)));
      if (!ok || !/^[A-Za-z0-9_-]{1,60}$/.test(m.id)) throw fail("internal", "The starting plan has a bad metric.", "badSeed");
      metrics[m.id] = { ...f, source: m.source, value: null, updatedAt: null };
    }
    const levels = new Set(config.levels.map((l) => l.n));
    const docs = [];
    const add = (node, type, parentId, order) => {
      const { children = [], type: _t, ...rest } = node;
      const fields = L.itemFields(type, rest, { levels, full: true });
      if (fields.metricId && !metrics[fields.metricId]) throw fail("internal", "The starting plan has a bad metric link.", "badSeed");
      const ref = R.items.doc();
      docs.push({
        ref, data: {
          type, parentId, level: type === "milestone" ? fields.level : null, status: type === "track" ? null : fields.status,
          startDate: fields.startDate ?? null, dueDate: fields.dueDate ?? null, help: fields.help ?? "", icon: fields.icon ?? "",
          relaunch: fields.relaunch ?? { needed: false, weeks: 0, side: "site" }, metricId: fields.metricId ?? null, target: fields.target ?? null,
          title: fields.title, description: fields.description, visibility: fields.visibility, order,
        },
      });
      children.forEach((ch, i) => add(ch, ch.type, ref.id, (i + 1) * STEP));
    };
    SEED.tracks.forEach((t, i) => add(t, "track", null, (i + 1) * STEP));
    if (docs.length > L.MAX_ITEMS) throw fail("internal", "The starting plan is too big.", "badSeed");
    const ops = [
      ...docs.map(({ ref, data }) => (b) => b.set(ref, { ...data, changedSincePublish: true, createdAt: stamp(), updatedAt: stamp() })),
      ...Object.entries(metrics).map(([id, m]) => (b) => b.set(R.metric(id), m)),
      (b) => b.set(R.config, { ...config, pendingChanges: docs.length, lastPublishedAt: null, updatedAt: stamp() }, { merge: true }),
    ];
    await store.commitChunks(ops, 450);
    await store.log({ action: "seed", itemPath: R.config.path, itemTitle: "Starting plan", actorUid: c.uid, actorName: c.name, reason: "", details: { items: docs.length, metrics: Object.keys(metrics).length } });
    return { items: docs.length, metrics: Object.keys(metrics).length };
  }

  async function handle(request) {
    const c = requireAdmin(await callerInfo(request));
    const d = request.data || {};
    try {
      switch (d.action) {
        case "create": return await create(c, d);
        case "update": return await update(c, d);
        case "setStatus": {
          const item = await loadItem(d.id);
          if (item.type === "track") throw fail("invalid-argument", "A track has no status.", "badType");
          return await update(c, { id: d.id, changes: { status: d.status }, reason: d.reason }, { action: "status", only: "status" });
        }
        case "delete": return await remove(c, d);
        case "reorder": return await reorder(c, d);
        case "updateConfig": return await updateConfig(c, d);
        case "metricSave": return await metricSave(c, d);
        case "metricDelete": return await metricDelete(c, d);
        case "seed": return await seed(c);
        default: throw fail("invalid-argument", "Unknown action.", "action");
      }
    } catch (err) { throw wrap(err); }
  }

  return { handle };
};
