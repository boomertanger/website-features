#!/usr/bin/env node
// functions/scripts/transfer-owner.js
//
// Moves site ownership to another member (docs/specs/foundation.md "Roles"), and
// optionally gives the new owner a handle (reserved words allowed: owner only) and
// demotes the previous admin to a regular member. All in one transaction:
//   - sites/boomertanger.ownerUid -> the new owner; "admin" added to their roles
//   - --handle: handles/{handle} created, the owner's old handle doc released,
//     profile.handle updated, users.handleChangedAt set 31 days back so the 30-day
//     cooldown doesn't block a later change
//   - --demote: that member's roles -> [] (they keep their handle and profile)
// Role changes reach custom claims through the mirrorMemberRoles trigger, which also
// writes their adminLog entries (actor "transfer-owner script"); this script writes
// the adminLog entries for the owner and handle changes itself.
//
// Needs Application Default Credentials:
//   gcloud auth application-default login
//
// Usage (from the functions/ folder):
//   node scripts/transfer-owner.js --project staging --to <email> [--handle <handle>] [--demote <email>]           # dry run
//   node scripts/transfer-owner.js --project staging --to <email> [--handle <handle>] [--demote <email>] --apply   # write it

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { HANDLE_RE, normalizeHandle } = require("../lib/accounts/validate");

const SITE_ID = "boomertanger";
const ACTOR = { uid: null, name: "transfer-owner script" };
const DAY = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const args = { project: null, to: null, demote: null, handle: null, apply: false };
  const take = (flag, i) => { if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`${flag} needs a value.`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.includes("=") ? a.split(/=(.*)/s) : [a, null];
    if (flag === "--apply") { args.apply = true; continue; }
    if (!["--project", "--to", "--demote", "--handle"].includes(flag)) throw new Error(`Unknown argument: ${a}`);
    args[flag.slice(2)] = inline ?? take(flag, i);
    if (inline === null) i++;
  }
  if (!args.project) throw new Error("--project is required (staging or production).");
  if (!args.to) throw new Error("--to <email> is required.");
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

// Same retention rule as functions/index.js (adminSettings/log.retentionDays, default 365).
async function expireAt(db) {
  let days = 365;
  const configured = (await db.doc("adminSettings/log").get().catch(() => null))?.get("retentionDays");
  if (Number.isFinite(configured) && configured > 0) days = configured;
  return admin.firestore.Timestamp.fromMillis(Date.now() + days * DAY);
}

async function lookup(db, email) {
  const user = await admin.auth().getUserByEmail(email).catch(() => null);
  if (!user) throw new Error(`No Firebase Auth user with email ${email}.`);
  const [member, profile] = await Promise.all([
    db.doc(`sites/${SITE_ID}/members/${user.uid}`).get(),
    db.doc(`sites/${SITE_ID}/profiles/${user.uid}`).get(),
  ]);
  if (!member.exists || !profile.exists) throw new Error(`${email} (${user.uid}) hasn't finished signing up on this project (no member/profile doc).`);
  return { email, uid: user.uid, handle: profile.get("handle"), roles: member.get("roles") || [], claims: user.customClaims || {} };
}

const show = (label, m) => console.log(`${label.padEnd(9)} ${m.email}  uid ${m.uid}  @${m.handle}  roles ${JSON.stringify(m.roles)}  claims ${JSON.stringify(m.claims)}`);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  admin.initializeApp({ projectId });
  const db = admin.firestore();

  const handle = args.handle ? normalizeHandle(args.handle) : null;
  if (handle && !HANDLE_RE.test(handle)) throw new Error(`"${args.handle}" isn't a valid handle (3-20 of a-z, 0-9, _).`);

  const site = await db.doc(`sites/${SITE_ID}`).get();
  if (!site.exists) throw new Error(`sites/${SITE_ID} doesn't exist yet. Run seed-site.js first.`);
  const to = await lookup(db, args.to);
  const demote = args.demote ? await lookup(db, args.demote) : null;
  if (demote && demote.uid === to.uid) throw new Error("--to and --demote are the same member.");
  const handleDoc = handle ? await db.doc(`handles/${handle}`).get() : null;
  if (handleDoc?.exists && handleDoc.get("uid") !== to.uid) throw new Error(`@${handle} belongs to another member (${handleDoc.get("uid")}).`);

  const currentOwner = site.get("ownerUid") || null;
  console.log(`Project: ${projectId}\n`);
  console.log("Now:");
  show("to", to);
  if (demote) show("demote", demote);
  console.log(`owner     ${currentOwner || "(none)"}${currentOwner === to.uid ? " (already the new owner)" : currentOwner === demote?.uid ? " (the member being demoted)" : ""}`);

  const newRoles = [...new Set([...to.roles, "admin"])].sort();
  console.log("\nPlan:");
  console.log(`  sites/${SITE_ID}.ownerUid: ${currentOwner || "(none)"} -> ${to.uid}`);
  console.log(`  ${to.email} roles: ${JSON.stringify(to.roles)} -> ${JSON.stringify(newRoles)} (claims follow via mirrorMemberRoles)`);
  if (handle) console.log(`  ${to.email} handle: @${to.handle} -> @${handle} (handles/${to.handle} released, cooldown cleared)`);
  if (demote) console.log(`  ${demote.email} roles: ${JSON.stringify(demote.roles)} -> [] (keeps @${demote.handle})`);
  if (currentOwner && currentOwner !== to.uid && currentOwner !== demote?.uid) console.log(`  NOTE: the previous owner ${currentOwner} keeps their roles (not demoted).`);

  if (!args.apply) {
    console.log("\nDry run: nothing written. Add --apply to write it.");
    return;
  }

  const now = admin.firestore.Timestamp.now();
  const stamp = admin.firestore.FieldValue.serverTimestamp();
  const exp = await expireAt(db);
  const log = (fields) => ({ feature: "accounts", reason: "", createdAt: stamp, expireAt: exp, actorUid: ACTOR.uid, actorName: ACTOR.name, ...fields });

  await db.runTransaction(async (tx) => {
    const siteRef = db.doc(`sites/${SITE_ID}`);
    const toMemberRef = db.doc(`sites/${SITE_ID}/members/${to.uid}`);
    const toProfileRef = db.doc(`sites/${SITE_ID}/profiles/${to.uid}`);
    const newHandleRef = handle ? db.doc(`handles/${handle}`) : null;
    const oldHandleRef = handle && to.handle !== handle ? db.doc(`handles/${to.handle}`) : null;
    const demoteRef = demote ? db.doc(`sites/${SITE_ID}/members/${demote.uid}`) : null;
    // Reads first (re-checked inside the transaction).
    const [siteSnap, toMember, newHandle, oldHandle, demoteMember] = await Promise.all([
      tx.get(siteRef), tx.get(toMemberRef),
      newHandleRef ? tx.get(newHandleRef) : null, oldHandleRef ? tx.get(oldHandleRef) : null,
      demoteRef ? tx.get(demoteRef) : null,
    ]);
    if (newHandle?.exists && newHandle.get("uid") !== to.uid) throw new Error(`@${handle} was taken meanwhile.`);
    const prevOwner = siteSnap.get("ownerUid") || null;

    tx.set(siteRef, { ownerUid: to.uid, updatedAt: stamp }, { merge: true });
    tx.set(db.collection("adminLog").doc(), log({
      action: "owner", itemPath: `sites/${SITE_ID}`, itemTitle: "Site owner",
      changes: { ownerUid: { before: prevOwner, after: to.uid } },
    }));
    tx.update(toMemberRef, { roles: [...new Set([...(toMember.get("roles") || []), "admin"])].sort(), rolesChangedBy: ACTOR, rolesChangedAt: stamp });

    if (handle && to.handle !== handle) {
      tx.set(newHandleRef, { uid: to.uid, createdAt: now });
      if (oldHandle?.exists && oldHandle.get("uid") === to.uid) tx.delete(oldHandleRef);
      tx.update(toProfileRef, { handle });
      tx.update(db.doc(`users/${to.uid}`), { handleChangedAt: admin.firestore.Timestamp.fromMillis(Date.now() - 31 * DAY) });
      tx.set(db.collection("adminLog").doc(), log({
        action: "handle", itemPath: `sites/${SITE_ID}/profiles/${to.uid}`, itemTitle: `@${handle}`,
        changes: { handle: { before: to.handle, after: handle } },
      }));
    }
    if (demoteMember) tx.update(demoteRef, { roles: [], rolesChangedBy: ACTOR, rolesChangedAt: stamp });
  });

  console.log("\nWritten. Checking the claims (the trigger takes a few seconds)...");
  const want = (m, isAdmin) => (m.customClaims?.roles?.[SITE_ID] || []).includes("admin") === isAdmin;
  for (let i = 0; i < 20; i++) {
    const [a, d] = await Promise.all([admin.auth().getUser(to.uid), demote ? admin.auth().getUser(demote.uid) : null]);
    if (want(a, true) && (!d || want(d, false))) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("\nAfter:");
  show("to", await lookup(db, to.email));
  if (demote) show("demote", await lookup(db, demote.email));
  console.log(`owner     ${(await db.doc(`sites/${SITE_ID}`).get()).get("ownerUid")}`);
  console.log("\nThe site picks up the new roles on each member's next page load.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
