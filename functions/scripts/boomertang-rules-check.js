#!/usr/bin/env node
// functions/scripts/boomertang-rules-check.js: checks the Boomertang rules (firestore.rules match /sites/{siteId}/tang/main..., docs/specs/boomertang.md §3,
// §5) on STAGING with real rule evaluation, until proper rules tests exist (@firebase/rules-unit-testing needs Java 21; ROADMAP). DRY RUN by default
// (lists the users and the checks, changes nothing); --apply runs them. Refuses any project but staging.
//
//   node functions/scripts/boomertang-rules-check.js           # dry run
//   node functions/scripts/boomertang-rules-check.js --apply
//
// How: four throwaway test users (uids "tang-rules-check-*", never a real account): a Fan Club member (a members doc), a Sub Club member (a members
// doc with the "sub" role), an admin, and a signed-in account with no members doc. Each gets a custom token with its claims (Admin SDK
// createCustomToken; when this account can't sign tokens, an Admin-SDK user with the same claims and a random one-time password the script never
// prints), exchanged for an ID token (Identity Toolkit, with the staging web API key, which is public); a visitor is a request with no token. The
// script makes four test issues (v99n1 a members-only back issue, v99n2 the members-only newest issue, v99n3 a draft, v99n4 public), a page and a
// poll in each, and a vote, and points tang/main.currentIssueId at v99n2 while it runs. Every read and write goes through the Firestore REST API with
// the user's token, so the rules decide. Afterwards (always, even after a failure) it puts tang/main back as it was and deletes the users, their
// members / profile / users docs, the adminLog entries the role mirror wrote, and everything it made under tang/main. Needs Application Default
// Credentials with permission to create tokens (Service Account Token Creator) and to delete users.
const crypto = require("crypto");
const admin = require("firebase-admin");

const STAGING_PROJECT = "boomertanger-staging";
const API_KEY = "AIzaSyClJypz3Zilx0kiTU354ycmPvr2B3iQa7I";   // staging web config (site/src/lib/firebase.ts), public
const SITE_ID = "boomertanger";
const BASE = `sites/${SITE_ID}/tang/main`;
const DOCS = `https://firestore.googleapis.com/v1/projects/${STAGING_PROJECT}/databases/(default)/documents`;
const USERS = {
  fan: { uid: "tang-rules-check-fan", roles: [], member: true },
  sub: { uid: "tang-rules-check-sub", roles: ["sub"], member: true },
  admin: { uid: "tang-rules-check-admin", roles: ["admin"], member: false },   // the staff path reads the claims only: no members doc, so no role-mirror side effects
  none: { uid: "tang-rules-check-none", roles: [], member: false },
};
const claimsOf = (u) => (u.roles.length ? { roles: { [SITE_ID]: [...u.roles] } } : {});
const ISSUES = {
  v99n1: { status: "published", access: "members" },   // a members-only back issue
  v99n2: { status: "published", access: "members" },   // the members-only newest issue (currentIssueId while the check runs)
  v99n3: { status: "draft", access: "members" },       // a draft
  v99n4: { status: "published", access: "public" },    // made public by the owner
};

const signIn = async (endpoint, body) => {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json", Referer: "https://staging.boomertanger.com/" }, body: JSON.stringify({ ...body, returnSecureToken: true }) });
  const b = await res.json();
  if (!b.idToken) throw new Error(`sign-in failed: ${b.error?.message || res.status}`);
  return b.idToken;
};
async function idTokenFor(u) {
  try {
    return await signIn("signInWithCustomToken", { token: await admin.auth().createCustomToken(u.uid, claimsOf(u)) });
  } catch (err) {
    if (!/signBlob|service account/i.test(String(err.message))) throw err;
    const password = crypto.randomBytes(24).toString("base64url");
    const email = `${u.uid}@example.com`;
    await admin.auth().createUser({ uid: u.uid, email, password }).catch(async (e) => { if (e.code !== "auth/uid-already-exists") throw e; await admin.auth().updateUser(u.uid, { email, password }); });
    await admin.auth().setCustomUserClaims(u.uid, claimsOf(u));
    if (!idTokenFor.noted) { console.log("  (custom tokens need signBlob, which this account lacks: using Admin-SDK test users with the same claims instead)"); idTokenFor.noted = true; }
    return signIn("signInWithPassword", { email, password });
  }
}
async function outcome(res) {
  if (res.ok) return "allow";
  const t = await res.text();
  if (res.status === 403 || /PERMISSION_DENIED/.test(t)) return "deny";
  throw new Error(`Unexpected HTTP ${res.status}: ${t.slice(0, 200)}`);
}
const auth = (tok) => (tok ? { Authorization: `Bearer ${tok}` } : {});
const read = (tok, p) => fetch(`${DOCS}/${p}`, { headers: auth(tok) }).then(outcome);
const write = (tok, p, fields) => fetch(`${DOCS}:commit`, { method: "POST", headers: { ...auth(tok), "Content-Type": "application/json" }, body: JSON.stringify({ writes: [{ update: { name: `projects/${STAGING_PROJECT}/databases/(default)/documents/${p}`, fields } }] }) }).then(outcome);
const S = (s) => ({ stringValue: s });

const CHECKS = [
  // [case, label, expected, run(tokens)]
  ["1 The magazine", "a visitor reads tang/main", "allow", (t) => read(null, BASE)],
  ["1 The magazine", "an admin writes tang/main (functions only)", "deny", (t) => write(t.admin, BASE, { currentIssueId: S("v99n4") })],
  ["2 Issues", "a visitor reads a published issue", "allow", (t) => read(null, `${BASE}/issues/v99n1`)],
  ["2 Issues", "a Sub Club member reads a draft", "deny", (t) => read(t.sub, `${BASE}/issues/v99n3`)],
  ["2 Issues", "an admin reads a draft (preview)", "allow", (t) => read(t.admin, `${BASE}/issues/v99n3`)],
  ["2 Issues", "an admin writes an issue (functions only)", "deny", (t) => write(t.admin, `${BASE}/issues/v99n4`, { status: S("draft") })],
  ["3 Public pages", "a visitor reads a public issue's page", "allow", (t) => read(null, `${BASE}/issues/v99n4/pages/p`)],
  ["4 Back issue", "a visitor reads a members-only back issue's page", "deny", (t) => read(null, `${BASE}/issues/v99n1/pages/p`)],
  ["4 Back issue", "a signed-in account without a members doc", "deny", (t) => read(t.none, `${BASE}/issues/v99n1/pages/p`)],
  ["4 Back issue", "Fan Club reads it", "allow", (t) => read(t.fan, `${BASE}/issues/v99n1/pages/p`)],
  ["4 Back issue", "Sub Club reads it", "allow", (t) => read(t.sub, `${BASE}/issues/v99n1/pages/p`)],
  ["5 Newest issue", "Fan Club reads the newest issue's page", "deny", (t) => read(t.fan, `${BASE}/issues/v99n2/pages/p`)],
  ["5 Newest issue", "Sub Club reads it first", "allow", (t) => read(t.sub, `${BASE}/issues/v99n2/pages/p`)],
  ["5 Newest issue", "an admin reads it", "allow", (t) => read(t.admin, `${BASE}/issues/v99n2/pages/p`)],
  ["6 Drafts", "Sub Club reads a draft's page", "deny", (t) => read(t.sub, `${BASE}/issues/v99n3/pages/p`)],
  ["6 Drafts", "an admin reads a draft's page", "allow", (t) => read(t.admin, `${BASE}/issues/v99n3/pages/p`)],
  ["7 Polls", "a visitor reads a public issue's poll", "allow", (t) => read(null, `${BASE}/polls/v99n4-q`)],
  ["7 Polls", "a visitor reads a back issue's poll", "deny", (t) => read(null, `${BASE}/polls/v99n1-q`)],
  ["7 Polls", "Fan Club reads a back issue's poll", "allow", (t) => read(t.fan, `${BASE}/polls/v99n1-q`)],
  ["7 Polls", "Fan Club reads the newest issue's poll", "deny", (t) => read(t.fan, `${BASE}/polls/v99n2-q`)],
  ["7 Polls", "Sub Club reads the newest issue's poll", "allow", (t) => read(t.sub, `${BASE}/polls/v99n2-q`)],
  ["7 Polls", "Fan Club writes a poll's counts (tangVote only)", "deny", (t) => write(t.fan, `${BASE}/polls/v99n4-q`, { issueId: S("v99n4") })],
  ["8 Votes", "Fan Club reads its own vote (server only)", "deny", (t) => read(t.fan, `${BASE}/pollVotes/v99n4-q_${USERS.fan.uid}`)],
  ["8 Votes", "an admin reads a vote", "deny", (t) => read(t.admin, `${BASE}/pollVotes/v99n4-q_${USERS.fan.uid}`)],
  ["8 Votes", "Fan Club writes a vote", "deny", (t) => write(t.fan, `${BASE}/pollVotes/v99n4-q_${USERS.fan.uid}`, { optionId: S("a") })],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mainBefore;   // tang/main as it was (null: it didn't exist)

async function setup(db) {
  const { FieldValue } = admin.firestore;
  const m = await db.doc(BASE).get();
  mainBefore = m.exists ? m.data() : null;
  for (const [id, d] of Object.entries(ISSUES)) {
    await db.doc(`${BASE}/issues/${id}`).set({ vol: 99, no: Number(id.slice(4)), title: `Rules check ${id}`, textInRepo: false, editions: [], publishedAt: null, test: true, ...d });
    await db.doc(`${BASE}/issues/${id}/pages/p`).set({ body: "Rules check (test data)", updatedAt: FieldValue.serverTimestamp() });
    await db.doc(`${BASE}/polls/${id}-q`).set({ issueId: id, question: "Rules check?", options: [{ id: "a", label: "A" }], counts: { a: 1 }, open: true, closesAt: null, test: true });
  }
  await db.doc(`${BASE}/pollVotes/v99n4-q_${USERS.fan.uid}`).set({ optionId: "a", test: true });
  await db.doc(BASE).set({ currentIssueId: "v99n2" }, { merge: true });
  for (const u of Object.values(USERS)) if (u.member) await db.doc(`sites/${SITE_ID}/members/${u.uid}`).set({ roles: u.roles, joinedAt: FieldValue.serverTimestamp(), rolesChangedBy: { uid: null, name: "boomertang-rules-check" } });
  await sleep(6000);   // mirrorMemberRoles copies the roles into the claims; let it finish before the tokens are made
}

async function cleanup(db) {
  if (mainBefore === null) await db.doc(BASE).delete().catch(() => {});
  else if (mainBefore) await db.doc(BASE).set(mainBefore).catch(() => {});
  for (const id of Object.keys(ISSUES)) {
    await db.doc(`${BASE}/issues/${id}/pages/p`).delete().catch(() => {});
    await db.doc(`${BASE}/issues/${id}`).delete().catch(() => {});
    await db.doc(`${BASE}/polls/${id}-q`).delete().catch(() => {});
  }
  await db.doc(`${BASE}/pollVotes/v99n4-q_${USERS.fan.uid}`).delete().catch(() => {});
  for (const u of Object.values(USERS)) await db.doc(`sites/${SITE_ID}/members/${u.uid}`).delete().catch(() => {});
  await sleep(6000);   // the role mirror runs again on those deletes; remove what it writes after it
  let logs = 0;
  for (const u of Object.values(USERS)) {
    for (const p of [`users/${u.uid}`, `sites/${SITE_ID}/profiles/${u.uid}`]) await db.doc(p).delete().catch(() => {});
    const l = await db.collection("adminLog").where("itemPath", "==", `sites/${SITE_ID}/members/${u.uid}`).get();
    for (const d of l.docs) { await d.ref.delete(); logs++; }
    await admin.auth().deleteUser(u.uid).catch((err) => { if (err.code !== "auth/user-not-found") console.error(`  couldn't delete user ${u.uid}: ${err.code}`); });
  }
  const left = (await Promise.all([...Object.keys(ISSUES).map((id) => db.doc(`${BASE}/issues/${id}`).get()), ...Object.values(USERS).map((u) => db.doc(`sites/${SITE_ID}/members/${u.uid}`).get())])).filter((s) => s.exists).length;
  const users = (await Promise.all(Object.values(USERS).map((u) => admin.auth().getUser(u.uid).then(() => 1, () => 0)))).reduce((a, b) => a + b, 0);
  const m = await db.doc(BASE).get();
  const restored = mainBefore === null ? !m.exists : JSON.stringify(m.data()) === JSON.stringify(mainBefore);
  console.log(`Cleanup: ${users} test users and ${left} test docs left (both should be 0); ${logs} role-mirror log entries removed; tang/main ${restored ? "back as it was" : "NOT restored: check it"}.`);
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const pi = argv.indexOf("--project");
  const project = pi >= 0 ? argv[pi + 1] : "staging";
  const projectId = project === "staging" ? STAGING_PROJECT : project;
  if (projectId !== STAGING_PROJECT) throw new Error(`This script only runs on staging (${STAGING_PROJECT}); got "${projectId}".`);
  console.log(`Project: ${projectId}${apply ? "" : " (dry run: no users or test data are made, nothing is read or written; add --apply)"}`);
  console.log(`Test users: ${Object.entries(USERS).map(([k, u]) => `${u.uid} (${k})`).join(", ")}, and a visitor (no token)`);
  if (!apply) { for (const [c, label, want] of CHECKS) console.log(`  would check  ${c.padEnd(15)} ${label}: expect ${want}`); return; }
  admin.initializeApp({ projectId, serviceAccountId: `firebase-adminsdk-fbsvc@${STAGING_PROJECT}.iam.gserviceaccount.com` });
  const db = admin.firestore();
  const results = [];
  try {
    await setup(db);
    const tokens = {};
    for (const [k, u] of Object.entries(USERS)) tokens[k] = await idTokenFor(u);
    for (const [c, label, want, run] of CHECKS) {
      let got;
      try { got = await run(tokens); } catch (err) { got = `error: ${err.message}`; }
      results.push({ c, label, want, got, ok: got === want });
      console.log(`  ${got === want ? "PASS" : "FAIL"}  ${c.padEnd(15)} ${label}: expected ${want}, got ${got}`);
    }
  } finally { await cleanup(db); }
  const byCase = {};
  for (const r of results) (byCase[r.c] ||= []).push(r.ok);
  console.log("By case:"); for (const [c, oks] of Object.entries(byCase)) console.log(`  ${c}: ${oks.every(Boolean) ? "PASS" : "FAIL"} (${oks.filter(Boolean).length}/${oks.length})`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

if (require.main === module) main().catch((err) => { console.error(err.message || err); process.exit(1); });
