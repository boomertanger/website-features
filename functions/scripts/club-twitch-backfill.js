#!/usr/bin/env node
// functions/scripts/club-twitch-backfill.js: Club Pass on STAGING (docs/specs/club-pass.md §12). Members who linked Twitch before Twitch
// counting have no club summary; this runs the same sub check (lib/club/twitch.js check) and recompute for every member with a Twitch
// link (platformLinks/twitch_*), and recomputes the owner (the owner source). DRY RUN by default: it reads Twitch's answer with the
// stored broadcaster token when that token is still fresh (it never refreshes it) and writes nothing; --apply does it.
//
//   node functions/scripts/club-twitch-backfill.js           # dry run
//   node functions/scripts/club-twitch-backfill.js --apply
//
// The channel's own Twitch account is never checked for a sub. Needs Application Default Credentials (gcloud auth
// application-default login) and Secret Manager Secret Accessor (TWITCH_CLIENT_SECRET, for --apply's token refresh; never printed).
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const STAGING_PROJECT = "boomertanger-staging";
const SITE_ID = "boomertanger";

function envFileValue(name) {
  try { const m = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").match(new RegExp(`^${name}=(.+)$`, "m")); return m ? m[1].trim() : ""; } catch { return ""; }
}
function resolveProjectId(nameOrId) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")).projects?.[nameOrId] ?? nameOrId; } catch { return nameOrId; }
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const pi = argv.indexOf("--project");
  const projectId = resolveProjectId(pi >= 0 ? argv[pi + 1] : "staging");
  if (projectId !== STAGING_PROJECT) throw new Error(`This script only runs on staging (${STAGING_PROJECT}); got "${projectId}".`);
  for (const a of argv) if (!["--apply", "--project", argv[pi + 1]].includes(a)) throw new Error(`Unknown argument: ${a}`);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const clientId = process.env.TWITCH_CLIENT_ID || envFileValue("TWITCH_CLIENT_ID");
  const channel = (process.env.TWITCH_LOGIN || envFileValue("TWITCH_LOGIN") || "boomertanger").toLowerCase();
  console.log(`Project: ${projectId}${apply ? "" : " (dry run: nothing is written; add --apply)"}`);

  const tokSnap = await db.doc(`sites/${SITE_ID}/private/twitchBroadcaster`).get();
  const bid = tokSnap.exists ? String(tokSnap.get("twitchUserId") || "") : "";
  const fresh = tokSnap.exists && (tokSnap.get("accessExpiresAt") || 0) > Date.now() + 60000;
  console.log(`Broadcaster token: ${tokSnap.exists ? `connected (${tokSnap.get("login")}, user ${bid})${fresh ? "" : ", access token due a refresh"}` : "NOT connected (subs can't be checked)"}`);

  let T = null, E = null;
  if (apply) {
    const { readSecret } = require("./youtube-cleanup");
    const clientSecret = tokSnap.exists ? await readSecret({ projectId, name: "TWITCH_CLIENT_SECRET" }) : "";
    T = require("../lib/club/hooks").twitchSubs({ db, auth: admin.auth(), clientId, clientSecret });
    E = require("../lib/club/entitlement").makeEntitlement({ db, auth: admin.auth() });
  }
  const handleOf = async (uid) => (await db.doc(`sites/${SITE_ID}/profiles/${uid}`).get()).get("handle") || null;

  const links = await db.collection("platformLinks").where(admin.firestore.FieldPath.documentId(), ">=", "twitch_").where(admin.firestore.FieldPath.documentId(), "<", "twitch`").get();
  console.log(`Members with a Twitch link: ${links.size}`);
  for (const link of links.docs) {
    const uid = link.get("uid"), twitchId = link.id.slice("twitch_".length), login = link.get("login") || "?";
    const [member, user] = await Promise.all([db.doc(`sites/${SITE_ID}/members/${uid}`).get(), db.doc(`users/${uid}`).get()]);
    const label = `@${(await handleOf(uid)) || "(no handle)"} (${uid}) Twitch ${login}`;
    if (!member.exists) { console.log(`  ${label}: no site member doc (signup not finished), skipped`); continue; }
    if (String(user.get("linked.twitch.id") || "") !== twitchId) { console.log(`  ${label}: users/${uid}.linked.twitch doesn't match this link, skipped`); continue; }
    const have = member.get("club.twitch");
    const own = bid ? twitchId === bid : login.toLowerCase() === channel;
    const now = `club.twitch now: ${have ? JSON.stringify(have) : "missing"}; plan now: ${member.get("club.plan") || "none"}`;
    if (!apply) {
      let would = own ? "the channel's own account: no sub check" : "would check";
      if (!own && fresh && clientId) {
        const res = await fetch(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${bid}&user_id=${twitchId}`, { headers: { Authorization: `Bearer ${tokSnap.get("accessToken")}`, "Client-Id": clientId } });
        const row = res.ok ? ((await res.json()).data || [])[0] : undefined;
        would = !res.ok ? `would check (Twitch answered HTTP ${res.status} to the read)` : row ? `would record: Tier ${Math.round(Number(row.tier) / 1000)} sub${row.is_gift ? " (gifted)" : ""}` : "would record: no sub";
      }
      console.log(`  ${label}: ${now} -> ${would}, then recompute`);
      continue;
    }
    const r = await T.check(uid);
    console.log(`  ${label}: ${r.own ? "channel's own account" : r.counting === false ? "linked (no token: not counted)" : r.sub ? `Tier ${r.tier} sub${r.gifted ? " (gifted)" : ""}` : "no sub"}; plan ${r.plan}`);
  }

  const ownerUid = (await db.doc(`sites/${SITE_ID}`).get()).get("ownerUid");
  if (ownerUid) {
    const m = await db.doc(`sites/${SITE_ID}/members/${ownerUid}`).get();
    const label = `owner @${(await handleOf(ownerUid)) || "?"} (${ownerUid})`;
    if (!apply) console.log(`  ${label}: plan now ${m.get("club.plan") || "none"}, roles ${(m.get("roles") || []).join(",")} -> would recompute (owner source: Sub Club)`);
    else { const r = await E.recompute(ownerUid); console.log(`  ${label}: plan ${r?.plan}${r?.rolesChanged ? " (the sub role was added)" : ""}`); }
  }
  console.log(apply ? "Done." : "Dry run: nothing written.");
}

if (require.main === module) main().then(() => process.exit(0)).catch((err) => { console.error(err.message || err); process.exit(1); });
