#!/usr/bin/env node
// functions/scripts/club-grant.js: Club Pass grants on STAGING (docs/specs/club-pass.md §12). A grant is a pass source for the owner
// and for testing: it makes the pass gold (the "sub" role) through lib/club/entitlement.js, the same as every other source.
// DRY RUN by default: it says what it would do and changes nothing; --apply does it. Refuses any project but staging.
//
//   node functions/scripts/club-grant.js --list                                   # members with the old staging-only "sub" role
//   node functions/scripts/club-grant.js --handle gbo --on --note "testing"       # dry run: would grant
//   node functions/scripts/club-grant.js --handle gbo --on --note "testing" --apply
//   node functions/scripts/club-grant.js --uid <uid> --off --apply                # removes the grant (the pass recomputes)
//   node functions/scripts/club-grant.js --convert-legacy --apply                 # every old "sub" role member -> a grant
//
// Needs Application Default Credentials (gcloud auth application-default login). adminLog: feature clubPass, action grant / grantRemove.
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const STAGING_PROJECT = "boomertanger-staging";
const SITE_ID = "boomertanger";

function parseArgs(argv) {
  const a = { project: "staging", apply: false, list: false, convert: false, uid: null, handle: null, on: null, note: "" };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--apply") a.apply = true;
    else if (x === "--list") a.list = true;
    else if (x === "--convert-legacy") a.convert = true;
    else if (x === "--on") a.on = true;
    else if (x === "--off") a.on = false;
    else if (x === "--uid") a.uid = argv[++i];
    else if (x === "--handle") a.handle = String(argv[++i] || "").replace(/^@/, "").toLowerCase();
    else if (x === "--note") a.note = argv[++i] || "";
    else if (x === "--project") a.project = argv[++i];
    else throw new Error(`Unknown argument: ${x}`);
  }
  if (!a.list && !a.convert && (a.on === null || (!a.uid && !a.handle))) throw new Error("Say --list, --convert-legacy, or --uid/--handle with --on or --off.");
  return a;
}

function resolveProjectId(nameOrId) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")).projects?.[nameOrId] ?? nameOrId; } catch { return nameOrId; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (projectId !== STAGING_PROJECT) throw new Error(`This script only runs on staging (${STAGING_PROJECT}); got "${projectId}".`);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const { makeEntitlement } = require("../lib/club/entitlement");
  const { adminLogEntry } = require("./import-vault");
  const E = makeEntitlement({ db, auth: admin.auth() });
  const BY = { uid: null, name: "club-grant.js" };
  const handleOf = async (uid) => (await db.doc(`sites/${SITE_ID}/profiles/${uid}`).get()).get("handle") || null;
  console.log(`Project: ${projectId}${args.apply ? "" : " (dry run: nothing changes; add --apply)"}`);

  // The old staging-only "sub" role: members who have it with no Club Pass source behind it.
  const legacy = async () => {
    const snap = await db.collection(`sites/${SITE_ID}/members`).where("roles", "array-contains", "sub").get();
    const out = [];
    for (const d of snap.docs) if (!d.get("club.sources")) out.push({ uid: d.id, handle: await handleOf(d.id) });
    return out;
  };
  const grant = async (uid, on, note) => {
    const member = await db.doc(`sites/${SITE_ID}/members/${uid}`).get();
    if (!member.exists) { console.log(`  ${uid}: not a site member, skipped`); return; }
    const handle = await handleOf(uid), had = !!member.get("club.sources.grant");
    const label = handle ? `@${handle}` : uid;
    if (had === on) { console.log(`  ${label}: grant already ${on ? "on" : "off"}`); return; }
    if (!args.apply) { console.log(`  ${label}: would turn the grant ${on ? "on" : "off"}${note ? ` (${note})` : ""}`); return; }
    const r = await E.setGrant(uid, { on, note, by: BY });
    await db.collection("adminLog").add(await adminLogEntry(db, { feature: "clubPass", action: on ? "grant" : "grantRemove", itemPath: `sites/${SITE_ID}/members/${uid}`, itemTitle: label, actorUid: null, actorName: BY.name, reason: note || "", details: { plan: r?.after?.plan ?? null } }));
    console.log(`  ${label}: grant ${on ? "on" : "off"}; the pass is now ${r?.after?.plan === "sub" ? "Sub Club" : "Fan Club"}${r?.after?.rolesChanged ? " (the sub role changed)" : ""}`);
  };

  if (args.list || args.convert) {
    const rows = await legacy();
    console.log(`Members with the old "sub" role and no Club Pass source: ${rows.length}`);
    for (const r of rows) console.log(`  ${r.handle ? `@${r.handle}` : "(no handle)"}  ${r.uid}`);
    if (args.convert) for (const r of rows) await grant(r.uid, true, "converted from the old staging sub role");
    return;
  }
  let uid = args.uid;
  if (!uid) {
    const h = await db.doc(`handles/${args.handle}`).get();
    uid = h.exists ? h.get("uid") : null;
    if (!uid) throw new Error(`No member with the handle @${args.handle}.`);
  }
  await grant(uid, args.on, args.note);
}

module.exports = { parseArgs };
if (require.main === module) main().then(() => process.exit(0)).catch((err) => { console.error(err.message || err); process.exit(1); });
