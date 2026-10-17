#!/usr/bin/env node
// functions/scripts/brain-dump-rules-check.js: checks the Brain Dump rules (firestore.rules match /sites/{siteId}/brainDump/{uid},
// docs/specs/brain-dump.md §2) on STAGING with real rule evaluation, until proper rules tests exist (@firebase/rules-unit-testing needs
// Java 21; ROADMAP). DRY RUN by default (lists the users and the checks, changes nothing); --apply runs them. Refuses any project but
// staging.
//
//   node functions/scripts/brain-dump-rules-check.js           # dry run
//   node functions/scripts/brain-dump-rules-check.js --apply
//
// How: four throwaway test users (uids "bd-rules-check-*", never a real account, no passwords) get custom tokens with developer claims
// (Admin SDK createCustomToken; or, when the account can't sign tokens, Admin-SDK users with the same claims and a random one-time
// password): one with the "sub" role, one crew (crewGrade 2, crewStatus active), one admin, one with no access.
// Each is exchanged for an ID token (Identity Toolkit signInWithCustomToken, with the staging web API key, which is public), and every
// read and write goes through the Firestore REST API with that token, so the rules decide. Afterwards (always, even after a failure) the
// script deletes the four users and every brainDump doc they made. Needs Application Default Credentials (gcloud auth
// application-default login) with permission to create custom tokens (Service Account Token Creator) and to delete users.
const admin = require("firebase-admin");

const STAGING_PROJECT = "boomertanger-staging";
const API_KEY = "AIzaSyClJypz3Zilx0kiTU354ycmPvr2B3iQa7I";   // staging web config (site/src/lib/firebase.ts), public
const SITE_ID = "boomertanger";
const DOCS = `https://firestore.googleapis.com/v1/projects/${STAGING_PROJECT}/databases/(default)/documents`;
const USERS = {
  sub: { uid: "bd-rules-check-sub", claims: { roles: { [SITE_ID]: ["sub"] } } },
  crew: { uid: "bd-rules-check-crew", claims: { crewGrade: 2, crewStatus: "active" } },
  admin: { uid: "bd-rules-check-admin", claims: { roles: { [SITE_ID]: ["admin"] } } },
  none: { uid: "bd-rules-check-none", claims: {} },
};
const board = (extra = {}) => ({ v: 1, goal: "Rules check", goalDone: false, startDate: "2026-10-17", inbox: { items: [] }, categories: [], ...extra });

/** A plain JS value -> a Firestore REST value. */
function val(x) {
  if (x === null) return { nullValue: null };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === "string") return { stringValue: x };
  if (x instanceof Date) return { timestampValue: x.toISOString() };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(val) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, val(v)])) } };
}
const docName = (uid) => `projects/${STAGING_PROJECT}/databases/(default)/documents/sites/${SITE_ID}/brainDump/${uid}`;

const signIn = async (endpoint, body) => {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json", Referer: "https://staging.boomertanger.com/" }, body: JSON.stringify({ ...body, returnSecureToken: true }) });   // the web key only takes the site as referrer
  const b = await res.json();
  if (!b.idToken) throw new Error(`sign-in failed: ${b.error?.message || res.status}`);
  return b.idToken;
};
/**
 * An ID token for a test user carrying its claims. First choice: a custom token with developer claims (needs your account to be able to
 * sign as the Admin SDK service account: iam.serviceAccounts.signBlob). Fallback when that's denied: the Admin SDK creates the user with
 * the same claims (setCustomUserClaims) and a random one-time password the script never prints, and signs in with it. Either way the
 * token carries exactly these claims and the user is a throwaway "bd-rules-check-*" account.
 */
async function idTokenFor(u) {
  try {
    return await signIn("signInWithCustomToken", { token: await admin.auth().createCustomToken(u.uid, u.claims) });
  } catch (err) {
    if (!/signBlob|service account/i.test(String(err.message))) throw err;
    const password = require("crypto").randomBytes(24).toString("base64url");
    const email = `${u.uid}@example.com`;
    await admin.auth().createUser({ uid: u.uid, email, password }).catch(async (e) => { if (e.code !== "auth/uid-already-exists") throw e; await admin.auth().updateUser(u.uid, { email, password }); });
    await admin.auth().setCustomUserClaims(u.uid, u.claims);
    if (!idTokenFor.noted) { console.log("  (custom tokens need signBlob, which this account lacks: using Admin-SDK test users with the same claims instead)"); idTokenFor.noted = true; }
    return signIn("signInWithPassword", { email, password });
  }
}
/** "allow" or "deny" (any 403 / PERMISSION_DENIED); anything else throws. */
async function outcome(res) {
  if (res.ok) return "allow";
  const t = await res.text();
  if (res.status === 403 || /PERMISSION_DENIED/.test(t)) return "deny";
  throw new Error(`Unexpected HTTP ${res.status}: ${t.slice(0, 200)}`);
}
const read = (tok, uid) => fetch(`${DOCS}/sites/${SITE_ID}/brainDump/${uid}`, { headers: { Authorization: `Bearer ${tok}` } }).then(outcome);
/** Writes the whole doc; updatedAt = the server's time unless serverTime is false (then the client's own time). */
const write = (tok, uid, data, { serverTime = true } = {}) => fetch(`${DOCS}:commit`, {
  method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
  body: JSON.stringify({ writes: [{ update: { name: docName(uid), fields: val(serverTime ? data : { ...data, updatedAt: new Date() }).mapValue.fields }, ...(serverTime ? { updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }] } : {}) }] }),
}).then(outcome);
const del = (tok, uid) => fetch(`${DOCS}:commit`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ writes: [{ delete: docName(uid) }] }) }).then(outcome);

const CHECKS = [
  // [case, label, expected, run(tokens)]
  ["1 Own board", "sub user writes their own board", "allow", (t) => write(t.sub, USERS.sub.uid, board())],
  ["1 Own board", "sub user reads their own board", "allow", (t) => read(t.sub, USERS.sub.uid)],
  ["1 Own board", "crew user writes and reads their own board", "allow", async (t) => (await write(t.crew, USERS.crew.uid, board())) === "allow" ? read(t.crew, USERS.crew.uid) : "deny"],
  ["1 Own board", "admin writes and reads their own board", "allow", async (t) => (await write(t.admin, USERS.admin.uid, board())) === "allow" ? read(t.admin, USERS.admin.uid) : "deny"],
  ["2 Another user", "sub user reads the admin's board", "deny", (t) => read(t.sub, USERS.admin.uid)],
  ["2 Another user", "sub user writes the admin's board", "deny", (t) => write(t.sub, USERS.admin.uid, board())],
  ["2 Another user", "admin reads the sub user's board (admins can't either)", "deny", (t) => read(t.admin, USERS.sub.uid)],
  ["2 Another user", "admin deletes the sub user's board", "deny", (t) => del(t.admin, USERS.sub.uid)],
  ["3 No access", "no-access user writes their own board", "deny", (t) => write(t.none, USERS.none.uid, board())],
  ["3 No access", "no-access user reads their own board (it exists)", "deny", async (t) => { await admin.firestore().doc(`sites/${SITE_ID}/brainDump/${USERS.none.uid}`).set({ ...board(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }); return read(t.none, USERS.none.uid); }],
  ["4 Bad writes", "an extra key", "deny", (t) => write(t.sub, USERS.sub.uid, board({ extra: 1 }))],
  ["4 Bad writes", "a missing key (no inbox)", "deny", (t) => { const b = board(); delete b.inbox; return write(t.sub, USERS.sub.uid, b); }],
  ["4 Bad writes", "goal of 301 characters", "deny", (t) => write(t.sub, USERS.sub.uid, board({ goal: "x".repeat(301) }))],
  ["4 Bad writes", "updatedAt set by the browser, not request.time", "deny", (t) => write(t.sub, USERS.sub.uid, board(), { serverTime: false })],
  ["4 Bad writes", "41 categories", "deny", (t) => write(t.sub, USERS.sub.uid, board({ categories: Array.from({ length: 41 }, (_, i) => ({ id: `c${i}` })) }))],
  ["4 Bad writes", "301 Inbox items", "deny", (t) => write(t.sub, USERS.sub.uid, board({ inbox: { items: Array.from({ length: 301 }, (_, i) => ({ id: `i${i}`, text: "x" })) } }))],
  ["4 Bad writes", "v: 2", "deny", (t) => write(t.sub, USERS.sub.uid, board({ v: 2 }))],
  ["4 Bad writes", "goal at the limit (300 characters) still saves", "allow", (t) => write(t.sub, USERS.sub.uid, board({ goal: "x".repeat(300) }))],
  ["1 Own board", "sub user deletes their own board", "allow", (t) => del(t.sub, USERS.sub.uid)],
];

async function cleanup() {
  const db = admin.firestore();
  for (const u of Object.values(USERS)) {
    await db.doc(`sites/${SITE_ID}/brainDump/${u.uid}`).delete().catch(() => {});
    await admin.auth().deleteUser(u.uid).catch((err) => { if (err.code !== "auth/user-not-found") console.error(`  couldn't delete user ${u.uid}: ${err.code}`); });
  }
  const left = (await Promise.all(Object.values(USERS).map((u) => db.doc(`sites/${SITE_ID}/brainDump/${u.uid}`).get()))).filter((s) => s.exists).length;
  const users = (await Promise.all(Object.values(USERS).map((u) => admin.auth().getUser(u.uid).then(() => 1, () => 0)))).reduce((a, b) => a + b, 0);
  console.log(`Cleanup: ${users} test users and ${left} test boards left (both should be 0).`);
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const pi = argv.indexOf("--project");
  const project = pi >= 0 ? argv[pi + 1] : "staging";
  const projectId = project === "staging" ? STAGING_PROJECT : project;
  if (projectId !== STAGING_PROJECT) throw new Error(`This script only runs on staging (${STAGING_PROJECT}); got "${projectId}".`);
  console.log(`Project: ${projectId}${apply ? "" : " (dry run: no users are made and nothing is read or written; add --apply)"}`);
  console.log(`Test users: ${Object.entries(USERS).map(([k, u]) => `${u.uid} (${k})`).join(", ")}`);
  if (!apply) { for (const [c, label, want] of CHECKS) console.log(`  would check  ${c.padEnd(15)} ${label}: expect ${want}`); return; }
  // Custom tokens are signed through IAM (signBlob) as the project's Firebase Admin SDK service account; your account needs Service
  // Account Token Creator on it (it can't sign with plain user credentials).
  admin.initializeApp({ projectId, serviceAccountId: `firebase-adminsdk-fbsvc@${STAGING_PROJECT}.iam.gserviceaccount.com` });
  const results = [];
  try {
    const tokens = {};
    for (const [k, u] of Object.entries(USERS)) tokens[k] = await idTokenFor(u);
    for (const [c, label, want, run] of CHECKS) {
      let got;
      try { got = await run(tokens); } catch (err) { got = `error: ${err.message}`; }
      results.push({ c, label, want, got, ok: got === want });
      console.log(`  ${got === want ? "PASS" : "FAIL"}  ${c.padEnd(15)} ${label}: expected ${want}, got ${got}`);
    }
  } finally { await cleanup(); }
  const byCase = {};
  for (const r of results) (byCase[r.c] ||= []).push(r.ok);
  console.log("By case:"); for (const [c, oks] of Object.entries(byCase)) console.log(`  ${c}: ${oks.every(Boolean) ? "PASS" : "FAIL"} (${oks.filter(Boolean).length}/${oks.length})`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

if (require.main === module) main().catch((err) => { console.error(err.message || err); process.exit(1); });
