#!/usr/bin/env node
// functions/scripts/set-owner.js
//
// Makes a member the site owner (docs/specs/foundation.md "Roles"): sets
// sites/boomertanger.ownerUid and adds "admin" to that member's roles. The
// mirrorMemberRoles function then copies the roles into their custom claims and
// writes the adminLog entry. The member must have signed up on that project
// first (sign in once, finish the signup steps, then send the uid from
// Account > Profile or the Firebase console). Needs Application Default
// Credentials:
//   gcloud auth application-default login
//
// Usage (from the functions/ folder):
//   node scripts/set-owner.js --project staging --uid <uid>           # dry run
//   node scripts/set-owner.js --project staging --uid <uid> --apply   # write it

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const SITE_ID = "boomertanger";

function parseArgs(argv) {
  const args = { project: null, uid: null, apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else if (argv[i] === "--uid") args.uid = argv[++i];
    else if (argv[i].startsWith("--uid=")) args.uid = argv[i].slice("--uid=".length);
    else if (argv[i] === "--apply") args.apply = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.project) throw new Error("--project is required (staging or production).");
  if (!args.uid) throw new Error("--uid is required.");
  return args;
}

function resolveProjectId(nameOrId) {
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8"));
    return rc.projects?.[nameOrId] ?? nameOrId;
  } catch {
    return nameOrId;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const db = admin.firestore();

  const user = await admin.auth().getUser(args.uid).catch(() => null);
  if (!user) throw new Error(`No Firebase Auth user ${args.uid} in ${projectId}.`);
  const siteRef = db.doc(`sites/${SITE_ID}`);
  const memberRef = db.doc(`sites/${SITE_ID}/members/${args.uid}`);
  const [site, member, profile] = await Promise.all([siteRef.get(), memberRef.get(), db.doc(`sites/${SITE_ID}/profiles/${args.uid}`).get()]);
  if (!site.exists) throw new Error(`sites/${SITE_ID} doesn't exist yet. Run seed-site.js first.`);
  if (!member.exists) throw new Error(`${args.uid} hasn't finished signing up (no sites/${SITE_ID}/members doc).`);

  const roles = member.get("roles") || [];
  const currentOwner = site.get("ownerUid") || null;
  console.log(`Project: ${projectId}`);
  console.log(`Member:  ${args.uid} (${profile.exists ? "@" + profile.get("handle") : "no profile"}, ${user.email || "no email"})`);
  console.log(`Owner:   ${currentOwner || "(none)"} -> ${args.uid}`);
  console.log(`Roles:   ${JSON.stringify(roles)} -> ${JSON.stringify([...new Set([...roles, "admin"])].sort())}`);
  if (currentOwner && currentOwner !== args.uid) console.log(`\nWARNING: this replaces the current owner ${currentOwner} (their admin role is kept).`);

  if (!args.apply) {
    console.log("\nDry run: nothing written. Add --apply to write it.");
    return;
  }
  const batch = db.batch();
  batch.set(siteRef, { ownerUid: args.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  batch.update(memberRef, {
    roles: [...new Set([...roles, "admin"])].sort(),
    rolesChangedBy: { uid: null, name: "set-owner script" },
    rolesChangedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  console.log("\nWritten. The member's admin claim arrives within a minute; they may need to sign out and back in.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
