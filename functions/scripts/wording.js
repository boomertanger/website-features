// functions/scripts/wording.js: the shared "--wording <phrase>" mode of the seed scripts (seed-factory-ideas.js, seed-factory-types.js, seed-badges.js).
// A wording-only re-seed: it looks ONLY at documents that already exist and ONLY at text fields whose value in the data file contains the phrase and
// differs from Firestore, lists each one (document path, field, the exact old and new text) and writes just those fields (merge). It never creates a
// document and never touches another field, type, badge, holder count or idea. Dry run unless --apply.
//   entries: [{ ref, path, id, next (the file's fields for the doc), cur (the Firestore data, or undefined) }]
function planWording(entries, phrase) {
  const lines = [], writes = [], missing = [];
  let docs = 0, fields = 0;
  for (const e of entries) {
    const hit = Object.keys(e.next).filter((k) => typeof e.next[k] === "string" && e.next[k].includes(phrase));
    if (!hit.length) continue;
    if (!e.cur) { missing.push(e.path); continue; }
    const patch = {};
    for (const k of hit) {
      if (e.cur[k] === e.next[k]) continue;
      patch[k] = e.next[k];
      lines.push(`CHANGE  ${e.path}\n          field ${k}\n          - ${JSON.stringify(e.cur[k] ?? null)}\n          + ${JSON.stringify(e.next[k])}`);
      fields++;
    }
    if (Object.keys(patch).length) { docs++; writes.push([e.ref, patch]); }
  }
  return { lines, writes, missing, docs, fields };
}

/** Prints the plan, and writes it when apply is true. */
async function runWording(db, entries, phrase, apply) {
  const plan = planWording(entries, phrase);
  plan.lines.forEach((l) => console.log(l));
  if (plan.missing.length) console.log(`\nNot in Firestore (left alone, never created): ${plan.missing.join(", ")}`);
  console.log(`\nWording "${phrase}": ${plan.fields} field(s) in ${plan.docs} document(s) would change. No other field is touched.`);
  if (!apply) { console.log("\nDry run: nothing written. Add --apply to write it."); return; }
  for (let i = 0; i < plan.writes.length; i += 400) {
    const batch = db.batch();
    plan.writes.slice(i, i + 400).forEach(([ref, patch]) => batch.set(ref, patch, { merge: true }));
    await batch.commit();
  }
  console.log(`\nWritten: ${plan.writes.length} document(s), ${plan.fields} field(s).`);
}
module.exports = { planWording, runWording };
