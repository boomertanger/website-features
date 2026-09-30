# Growth collector — daily follower and subscriber counts

Status: approved (Sep 29, 2026). Feeds the footer's Follow badges ("Shared power",
`docs/design/mockups/footer-power.html`, design-system.md §8f) and keeps a daily history
for the owner. Code: `functions/lib/growth/` (`collect.js` is the shared core), callables and
schedule exported from `functions/index.js`. Related: `accounts.md` (Twitch app, owner),
`foundation.md` (site.json socials).

## 1. What it collects

| Platform | How | Values |
| --- | --- | --- |
| Twitch | Helix `GET /channels/followers?broadcaster_id=…&first=1` with an app access token (client credentials, the accounts Twitch app: `TWITCH_CLIENT_ID` param + `TWITCH_CLIENT_SECRET`). The broadcaster id is looked up once from `TWITCH_LOGIN` (`GET /users?login=`) and kept in `private/growthConfig`. | `followers` (total) |
| YouTube | Data API `channels.list?part=statistics&id=YOUTUBE_CHANNEL_ID` with `YOUTUBE_API_KEY` (1 quota unit per run). | `subscribers`, `views`, `videos`. YouTube rounds public subscriber counts to 3 significant figures (and can hide them: `subscribers: null`). |
| TikTok | Built, switched off. Login Kit OAuth (scopes `user.info.basic,user.info.stats,video.list`); each run refreshes the access token (the refresh token rotates and is saved), then `GET /v2/user/info/?fields=follower_count` and `POST /v2/video/list/` (`max_count: 1`). | `followers`, `latestVideoAt` (the newest video's `create_time`, ISO) |
| Instagram | Not collected. | The badge shows "Follow". |

Channel and account ids (public): YouTube `UCM3E9VJ9nmXE0sKDavHblFA`, Twitch `boomertanger`
(`functions/.env`).

## 2. When

- `collectGrowthDaily`: `onSchedule({ schedule: "0 5 * * *", timeZone: "America/Los_Angeles" })`, every day at 05:00 Pacific.
- `runGrowthCollectorNow`: owner-only callable (the caller's uid is `sites/{siteId}.ownerUid`) that runs the same code and returns `{ day, summary, errors, tiktok: "ok" | "off" | "error" }` (never tokens or keys). /admin has a "Run the collector now" button for it.
- `functions/scripts/run-growth-once.js --project <alias>`: the same code from your machine with ADC (it reads the secrets from Secret Manager, never prints them). Dry run by default: fetches and prints, writes nothing (a dry run skips TikTok, because refreshing rotates the token). `--apply` writes.

## 3. Storage (all under `sites/boomertanger`, written only by Cloud Functions)

| Path | Holds | Read |
| --- | --- | --- |
| `growthDaily/{YYYY-MM-DD}` (Los Angeles date) | `twitch: { followers } \| null`, `youtube: { subscribers, views, videos } \| null`, `tiktok: { followers, latestVideoAt } \| null`, `collectedAt`, `errors: [{ platform, message }]`. A second run the same day replaces the doc. | site admins |
| `public/socials` | `twitch: { followers, updatedAt }`, `youtube: { subscribers, views, videos, updatedAt }`, `tiktok: { followers, latestVideoAt, updatedAt } \| null`, `instagram: { followers: null, updatedAt: null }`, `youtubeGoal: 1000` | everyone |
| `private/growthConfig` | `twitchLogin`, `twitchBroadcasterId` | nobody |
| `private/tiktokAuth` | `accessToken`, `accessExpiresAt`, `refreshToken`, `refreshExpiresAt`, `openId`, `scope`, `connectedBy`, `connectedAt` | nobody |

## 4. Failure

- Each platform runs on its own. A failing platform adds `{ platform, message }` to that day's `errors` and keeps its last good value (and its `updatedAt`) in `public/socials`.
- The footer hides a count whose `updatedAt` is older than 7 days: the badge shows "Follow".
- TikTok not connected, or its client key or secret not set: skipped quietly (no error, `tiktok: null`).

## 5. TikTok connect (owner only, switched off until TikTok approves the app)

1. /admin shows "Connect TikTok" to the owner only (display check; the callables check on the server). It's disabled until `site.json.tiktokClientKey` and the `TIKTOK_CLIENT_KEY` param are set and `TIKTOK_CLIENT_SECRET` holds the real secret.
2. The button sends the owner to `https://www.tiktok.com/v2/auth/authorize/` with the scopes above, `redirect_uri = <origin>/auth/tiktok/callback` and a CSRF state (sessionStorage).
3. `/auth/tiktok/callback` checks the state and hands the code to `tiktokConnect({ code, redirectUri })` (owner only; the redirect URI must be on the project's allowlist in `lib/growth/index.js`), which swaps it server side and stores the tokens in `private/tiktokAuth`.
4. `tiktokStatus` (owner only) tells /admin whether TikTok is configured and connected.

To switch TikTok on: register the redirect URIs in the TikTok app, then set `TIKTOK_CLIENT_KEY` in `functions/.env` and `tiktokClientKey` in `site/src/data/site.json`, run `firebase functions:secrets:set TIKTOK_CLIENT_SECRET --project <alias>` with the real secret, redeploy functions, and press Connect TikTok.

## 6. Rules

Inside `match /sites/{siteId}`: `growthDaily/{day}` read if `hasSiteRole(siteId, 'admin')`, no writes; `public/{docId}` public read, no writes; `private/{docId}` no client access (already there). No client writes anywhere here.

## 7. Setup (per project; staging now, production at launch)

1. `functions/.env`: `TWITCH_LOGIN`, `YOUTUBE_CHANNEL_ID`, `TIKTOK_CLIENT_KEY` (empty for now). `TWITCH_CLIENT_ID` and the `TWITCH_CLIENT_SECRET` secret are shared with accounts.
2. Secrets, set by the owner (never in chat): `firebase functions:secrets:set YOUTUBE_API_KEY --project <alias>` (a Google Cloud API key restricted to the YouTube Data API v3), and `firebase functions:secrets:set TIKTOK_CLIENT_SECRET --project <alias>` (a placeholder such as `pending` until TikTok approves; values under 16 characters count as unset). A function can't deploy while a secret it uses doesn't exist.
3. `firebase deploy --project <alias> --only firestore:rules`, then `--only functions` (a first 2nd-gen scheduled deploy may fail once with an Eventarc/IAM error; retry after a couple of minutes). Check Cloud Scheduler for `firebase-schedule-collectGrowthDaily-us-central1` at `0 5 * * *` America/Los_Angeles.
4. Run it once: /admin "Run the collector now", or `node functions/scripts/run-growth-once.js --project <alias> --apply`. `public/socials` should then hold the Twitch and YouTube numbers.
