// The Trophy Room's badge catalog loader (docs/specs/rewards.md §9). Shared by the seedBadgeCatalog callable
// (owner only, staging and production) and scripts/seed-badges.js (staging only, needs credentials).
//
// The file functions/data/trophy-room-badges.json owns a badge's definition. A badge already in Firestore keeps
// holders, pctHeld, buriedAt and art (counted or set by the service, not the file). Nothing is ever deleted: a badge
// that is in Firestore but not in the file is only listed.
const admin = require("firebase-admin");

const SITE_ID = "boomertanger";
const KEEP = ["holders", "pctHeld", "buriedAt", "art"];

const ts = (v) => (v == null ? null : admin.firestore.Timestamp.fromMillis(typeof v === "number" ? v : Date.parse(v)));
/** The fields the file owns for a badge doc. */
function badgeDoc(b) {
  return {
    name: b.name, collection: b.collection, rarity: b.rarity, source: b.source, how: b.how || "", emoji: b.emoji || null,
    xp: b.xp, secret: b.secret || null, limited: b.limited ? { label: b.limited.label || null, opensAt: ts(b.limited.opensAt), closesAt: ts(b.limited.closesAt) } : null,
    crewOnly: !!b.crewOnly, ladder: b.ladder || null, status: b.status || "active", awardableBy: b.awardableBy || null,
    ...(b.drop ? { drop: b.drop } : {}),
  };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const norm = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toMillis === "function" ? x.toMillis() : x)));

/** Throws on a duplicate or missing id or an unknown collection. */
function validate(data) {
  const ids = new Set();
  for (const b of data.badges) {
    if (!b.id || ids.has(b.id)) throw new Error(`Duplicate or missing badge id: ${b.id}`);
    ids.add(b.id);
    if (!data.collections.some((c) => c.id === b.collection)) throw new Error(`${b.id}: unknown collection ${b.collection}`);
  }
  return ids;
}

/**
 * Compares the file with Firestore. Returns { summary, writes } where writes is [[ref, doc, merge]].
 * summary: { version, total, created: [ids], changed: [{ id, fields }], unchanged, extra: [ids], collections: { created, changed } }
 */
async function planCatalog(db, data) {
  const ids = validate(data);
  const site = db.doc(`sites/${SITE_ID}`);
  const [existing, existingCols] = await Promise.all([site.collection("badges").get(), site.collection("collections").get()]);
  const have = new Map(existing.docs.map((d) => [d.id, d.data()]));
  const haveCols = new Map(existingCols.docs.map((d) => [d.id, d.data()]));
  const writes = [], created = [], changed = [];
  let unchanged = 0;
  for (const b of data.badges) {
    const next = badgeDoc(b), cur = have.get(b.id);
    if (!cur) { created.push(b.id); writes.push([site.collection("badges").doc(b.id), { ...next, holders: 0, pctHeld: 0, createdAt: admin.firestore.FieldValue.serverTimestamp() }, false]); continue; }
    const fields = Object.keys(next).filter((k) => !same(norm(next[k]), norm(cur[k] ?? null)));
    if (!fields.length) { unchanged++; continue; }
    changed.push({ id: b.id, fields });
    writes.push([site.collection("badges").doc(b.id), next, true]);     // merge: holders and pctHeld stay
  }
  let colNew = 0, colChanged = 0;
  data.collections.forEach((c, order) => {
    const next = { name: c.name, icon: c.icon || null, blurb: c.blurb || "", order, crewOnly: c.id === "crew" };
    const cur = haveCols.get(c.id);
    if (!cur) colNew++; else if (Object.keys(next).some((k) => !same(next[k], cur[k] ?? null))) colChanged++; else return;
    writes.push([site.collection("collections").doc(c.id), next, true]);
  });
  const extra = [...have.keys()].filter((id) => !ids.has(id));
  return { summary: { version: data.version, total: data.badges.length, created, changed, unchanged, extra, collections: { created: colNew, changed: colChanged } }, writes };
}

async function applyWrites(db, writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach(([ref, doc, merge]) => (merge ? batch.set(ref, doc, { merge: true }) : batch.set(ref, doc)));
    await batch.commit();
  }
  return writes.length;
}

module.exports = { SITE_ID, KEEP, badgeDoc, same, norm, validate, planCatalog, applyWrites };
