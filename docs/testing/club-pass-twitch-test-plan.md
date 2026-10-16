# Club Pass: Twitch counting test plan (staging)

Spec: `docs/specs/club-pass.md` §12 (and §11 for My pass). Everything here is on **staging**
(`https://staging.boomertanger.com`, Firebase project `boomertanger-staging`). Nothing touches production.

You need:
- the owner's site account (signed in on staging),
- the **boomertanger** Twitch account (to connect the token and to gift a sub),
- a **test** Twitch account and a **second** site account for it (a fresh browser profile or a private window).

Hard-refresh each page before a step (Ctrl+Shift+R). The corner badge should show the latest build.

**Status (Oct 16, 2026):** steps 1 and 2 passed on staging (the token is connected as boomertanger with both scopes; the three
Club Pass EventSub subscriptions are enabled). Steps 3 to 7 are pending: they need a test Twitch account with a real sub.

## 1. Connect the broadcaster token
1. As the owner, open `/admin`. Find the **Twitch broadcaster** card. It says **Not connected**.
2. Press **Connect Twitch broadcaster**. Twitch opens and asks you to sign in.
3. Sign in to Twitch as **boomertanger** (not your test account). Allow both permissions.
4. You land back on `/admin`. The card says **Connected**: "Connected as boomertanger. Scopes:
   channel:manage:moderators, channel:read:subscriptions. Token healthy, refreshes on its own".
5. Wrong account check (optional): press **Reconnect**, sign in to Twitch as the test account.
   Expected: "That's <test account> on Twitch. Sign in to Twitch as boomertanger and connect again."
   The card still shows the boomertanger connection after a refresh.

## 2. Create the EventSub subscriptions
Tell Claude the token is connected. Claude runs (or you run, from the repo root):

    node functions/scripts/club-eventsub.js            # dry run: should say "Would create" x3
    node functions/scripts/club-eventsub.js --apply

Run the dry run again: the three types (`channel.subscribe`, `channel.subscription.message`,
`channel.subscription.end`) show **Keep ... (enabled)**. The Control Room's `stream.online` / `stream.offline`
aren't touched.

## 3. Link a test account (no sub yet) — pending (needs a test Twitch account with a real sub)
1. In the second browser, sign in with the second site account (finish signup if asked).
2. Open `/account#linked`, press **Link** next to Twitch, sign in to Twitch as the **test** account.
3. Open `/account/club` (My pass). Expected: **Fan Club**; the Twitch card shows the test login, **No sub**,
   "No sub to Boomertanger found · checked today <time>", and **Sub on Twitch ↗** and **Check again**.
   The fine print says "Prime and gifted subs count too." (not "start counting soon").

## 4. A real or gifted sub — pending (needs a test Twitch account with a real sub)
Either sub from the test account, or, from the boomertanger Twitch account, **gift a sub** to the test account.
Within a minute or two (EventSub), without pressing anything:
1. Reload My pass. Expected: **Sub Club**, gold pass; the Twitch card says "Tier 1 gifted sub to Boomertanger"
   (no "gifted" for a normal sub) with **Sub found**; Where your gold comes from lists **Twitch sub**.
2. The gold moment plays once (the pass pops, confetti, the Welcome to Sub Club stamp). Reload: it doesn't play again.
3. Optional: other pages that check Sub Club (e.g. `/club-pass`) now treat the account as Sub Club.

## 5. Check again — pending (needs a test Twitch account with a real sub)
1. On My pass press **Check again**. It says "Checking…", then the result line, and the pass stays right
   **without a reload**.
2. Press it again within a minute. Expected: "You just checked. Try again in a minute."
3. (Limit: 20 a day per member.)

## 6. The daily sweep — pending (needs a test Twitch account with a real sub)
It runs on its own every day at 05:30 America/Chicago. To run it now:
1. Google Cloud console > Cloud Scheduler (project boomertanger-staging) > the job for **clubTwitchSweep**
   > **Force run**.
2. Logs (Cloud Run > clubTwitchSweep > Logs) show a line like
   `clubTwitchSweep: {"subscribers":N,"linked":N,"fixed":0,"checked":N}`.
3. To see it fix something: when the gifted sub ends (or if EventSub missed an event), the next sweep shows
   `"fixed":1` and My pass goes back to Fan Club.

## 7. Unlink — pending (needs a test Twitch account with a real sub)
1. In the second browser, `/account#linked` > **Unlink** Twitch (the account needs another sign-in method).
2. My pass: **Fan Club**, Twitch card **Not linked** with **Link Twitch**. The gold source is gone.

## 8. A grant (owner / testing)
From the repo root (dry run first, then `--apply`):

    node functions/scripts/club-grant.js --handle <handle> --on --note "testing"
    node functions/scripts/club-grant.js --handle <handle> --on --note "testing" --apply

My pass for that account: **Sub Club**, the source **From Boomertanger**. Then remove it:

    node functions/scripts/club-grant.js --handle <handle> --off --apply

Back to Fan Club (unless another source still makes it gold). `/admin` > Activity log shows Club Pass grant / grantRemove.
`node functions/scripts/club-grant.js --list` lists members with the old staging-only "sub" role (none on Oct 16, 2026).

## 9. Disconnect
1. `/admin` > Twitch broadcaster > **Disconnect** > confirm. The card says **Not connected**.
2. My pass for the test account: the Twitch card says linked, "Twitch subs start counting soon.", no Check again.
3. Connect again (step 1) before you carry on testing.

## What to report
For each step: pass or what you saw instead, with the time. Server logs: Cloud Run logs for `clubLinkTwitch`,
`twitchEventSub` and `clubTwitchSweep` (they never contain tokens).
