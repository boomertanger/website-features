// Where the Scream Planner still uses a Vault game (docs/specs/scream-planner.md section 10): on a ballot that is
// still taking votes, or in a planned or scheduled slot. The Vault's delete callable refuses while this is non-empty
// (details.reason "inPlanner"). Pure reads, so the checks run it against the in-memory Firestore.
const SITE = "sites/boomertanger";

/** -> { ballots: [week ids], slots: [stream ids] } */
async function plannerRefs(db, slug) {
  const wk = await db.collection(`${SITE}/planWeeks`).where("ballotSlugs", "array-contains", slug).get();
  const ballots = wk.docs.filter((d) => d.get("state") !== "published").map((d) => d.id);
  const st = await db.collection(`${SITE}/streams`).where("plannedGameIds", "array-contains", slug).get();
  const slots = st.docs.filter((d) => ["planned", "scheduled"].includes(d.get("state"))).map((d) => d.id);
  return { ballots, slots };
}

module.exports = { plannerRefs };
