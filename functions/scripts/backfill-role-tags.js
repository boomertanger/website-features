#!/usr/bin/env node
// functions/scripts/backfill-role-tags.js
//
// One-time backfill of the public role tag (sites/boomertanger/profiles/{uid}.roleTag: fan, sub,
// mod or admin, the highest; the owner is admin) for every member who already has a profile.
// After this, mirrorMemberRoles keeps it in step on every role change, and completeSignup sets it
// for new members. Dry run by default (lists what would change); --apply writes. Only touches
// profiles whose tag is missing or wrong.
//
// Needs Application Default Credentials (gcloud auth application-default login).
// Usage (from the functions/ folder):
//   node scripts/backfill-role-tags.js --project staging            # dry run
//   node scripts/backfill-role-tags.js --project staging --apply    # write it
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { roleTagFor } = require("../lib/accounts/validate");

const SITE_ID = "boomertanger";

function parseArgs(argv) {
  const args = { project: null, apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else if (argv[i] === "--apply") args.apply = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.project) throw new Error("--project is required (staging or production).");
  return args;
}
function resolveProjectId(nameOrId) {
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8"));
    return rc.projects?.[nameOrId] ?? nameOrId;
  } catch { return nameOrId; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const site = await db.doc(`sites/${SITE_ID}`).get();
  const ownerUid = site.get("ownerUid") || null;
  const [members, profiles] = await Promise.all([db.collection(`sites/${SITE_ID}/members`).get(), db.collection(`sites/${SITE_ID}/profiles`).get()]);
  const roles = new Map(members.docs.map((m) => [m.id, m.get("roles") || []]));
  const changes = [];
  for (const p of profiles.docs) {
    const tag = roleTagFor(roles.get(p.id) || [], { isOwner: p.id === ownerUid });
    if (p.get("roleTag") !== tag) changes.push({ ref: p.ref, uid: p.id, handle: p.get("handle"), from: p.get("roleTag") ?? null, to: tag });
  }
  console.log(`${projectId}: ${profiles.size} profiles, ${changes.length} to update${args.apply ? "" : " (dry run; --apply writes)"}`);
  for (const c of changes) console.log(`  @${c.handle || c.uid}: ${c.from ?? "(none)"} -> ${c.to}`);
  if (!args.apply || !changes.length) return;
  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    changes.slice(i, i + 400).forEach((c) => batch.update(c.ref, { roleTag: c.to }));
    await batch.commit();
  }
  console.log(`Wrote ${changes.length} role tags.`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
