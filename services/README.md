# Service Hub manifests

One JSON file per service on the site and stream (`<id>.json`), the single registry for the Service Hub (docs/specs/service-hub.md §3, §3a, §8a). The site build serves them all as `/services.json` with a build hash; `site/scripts/check-services.js` checks them before every build. Every new feature or page adds or updates its manifest here.

| Field | What it is |
|---|---|
| `id` | kebab-case, the file name, and it never changes (ratings, Talk Back messages and video tags point at it) |
| `name`, `blurb` | what members see; the blurb is one line |
| `type` | `feature` · `page` · `arcadeGame` · `streamSetup` · `adminTool` (`vaultGame`, `stream` and `video` are added by triggers, never as files) |
| `area` | the group it sits in: Watch, Play, Community, Crew, Account, Shop, Site, Admin |
| `version` | bump it when the service changes in a way members would notice (`"1.0"`, `"1.1"`); `"0.0"` while planned |
| `status` | `planned` · `building` · `live` · `retired` |
| `audience` | who can use it: `everyone` · `members` · `crew` · `staff` (mods and admins) · `admins` · `owner` |
| `routes` | the pages it owns, as `site/src/pages` routes (`/games/view` serves every `/games/<slug>`; `[slug]` for dynamic routes); `[]` when it has no page of its own |
| `nav` | its `site/src/lib/nav.js` entry id, or `null` |
| `testPlan` | its hand-run test plan under `docs/testing/`, or `null` |
| `checks` | 3 to 8 member walkthrough checks (Service Hub §6); empty until written |
| `videoTag` | `#bt-<id>`: put it in a YouTube description to link the video |
| `sections` | `{ "slug": "Label" }`: the sections that get an Ask pin (at most 3 per page to start; `{}` unless talkBack is `pins`) |
| `talkBack` | the page strip: `note` (the strip: Rate it and Talk back), `pins` (the strip plus Ask pins on `sections`), `rate` (the strip with only the Rate half: no Ask / Feedback, no pins), `skip` (no strip) |
| `help` | path to `site/src/data/help/<id>.json` (BOOMBOT's answers), or `null` |
