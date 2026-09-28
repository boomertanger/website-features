#!/usr/bin/env node
// functions/scripts/seed-site.js
//
// Creates or updates the site settings document sites/boomertanger from
// site/src/data/site.json (docs/specs/accounts.md, docs/specs/foundation.md
// "Platform-ready data model"): name, tagline, wordmark, legal name, socials,
// modules, email domain and the current terms version. ownerUid is never touched
// here (set-owner.js sets it). Runs locally with the Admin SDK, so it needs
// Application Default Credentials:
//   gcloud auth application-default login
//
// Usage (from the functions/ folder):
//   node scripts/seed-site.js --project staging           # dry run: show what would change
//   node scripts/seed-site.js --project staging --apply   # write it
//
// --project takes an alias from .firebaserc (staging, production) or a raw project id.

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const SITE_JSON = path.join(__dirname, "..", "..", "site", "src", "data", "site.json");

function parseArgs(argv) {
  const args = { project: null, apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = argv[++i];
    else if (argv[i].startsWith("--project=")) args.project = argv[i].slice("--project=".length);
    else if (argv[i] === "--apply") args.apply = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.project) throw new Error("--project is required (e.g. --project staging).");
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

// The fields sites/{siteId} holds today. Follower counts stay out: they come
// from the growth collector later, not from a typed-in file.
function siteDoc(site) {
  return {
    name: site.name,
    tagline: site.tagline,
    footerTagline: site.footerTagline,
    wordmark: site.wordmark,
    legalName: site.legalName,
    timezone: site.timezone,
    emailDomain: site.emailDomain,
    socials: site.socials.map(({ id, label, url }) => ({ id, label, url })),
    modules: site.modules,
    termsVersion: site.termsVersion,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  const site = JSON.parse(fs.readFileSync(SITE_JSON, "utf8"));
  if (!site.siteId || !site.termsVersion) throw new Error("site.json needs siteId and termsVersion.");

  admin.initializeApp({ projectId });
  const ref = admin.firestore().doc(`sites/${site.siteId}`);
  const snap = await ref.get();
  const next = siteDoc(site);
  const current = snap.exists ? snap.data() : {};

  console.log(`Project: ${projectId}`);
  console.log(`Document: sites/${site.siteId} (${snap.exists ? "exists" : "new"})`);
  const changed = Object.keys(next).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(next[k]));
  if (!changed.length) {
    console.log("Nothing to change.");
    return;
  }
  for (const k of changed) {
    console.log(`  ${k}: ${JSON.stringify(current[k] ?? null)} -> ${JSON.stringify(next[k])}`);
  }
  if (snap.exists && current.ownerUid) console.log(`  (ownerUid ${current.ownerUid} is kept)`);

  if (!args.apply) {
    console.log("\nDry run: nothing written. Add --apply to write it.");
    return;
  }
  await ref.set({ ...next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  console.log("\nWritten.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
