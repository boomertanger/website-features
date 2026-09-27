# site/ — the new Boomertanger site (Astro)

Milestone 1 of the new site: the real site shell (header, navigation, Live
Beacon, phone tab bar, footer) and the home page from the approved mockup
(`docs/design/mockups/home-5c-refined.html`: hero 3B, home 4C/6A), plus
placeholder pages. Spec: `docs/specs/foundation.md`. Design rules:
`docs/design-system.md` (§5 "Site shell", §8d).

- Static output (no SSR adapter), built into `site/dist`.
- The UI kit is imported at build time from `../shared` (`bt-ui.css`,
  `shared/ui/hero-carousel.js`, `shared/ui/pill-switch.js`), never jsDelivr.
- No Firebase or MemberSpace code yet. Member content is **PREVIEW DATA**
  from `src/data/preview-*.json`.

## Run it locally

Node 22 (see `.nvmrc`).

```sh
cd site
npm install
npm run dev       # http://localhost:4321
npm run build     # -> site/dist
npm run preview   # serve the built site
```

### Preview switches (staging and previews only)

When `PUBLIC_FIREBASE_ENV` isn't `production`, pages get
`<meta name="robots" content="noindex,nofollow">` and two URL switches that
set data attributes on `<body>`, the same way the mockup does:

- `?as=visitor|member|admin` → `data-auth` (default `visitor`)
- `?live=off|public|backstage` → `data-live` (default: `liveState` in `src/data/site.json`)

A small "Preview" chip in the bottom-left corner shows the current values
with links to flip them. Example: `/?as=member&live=public`.

## Content

| File | Holds |
| --- | --- |
| `src/data/site.json` | Site settings, shaped like the future `sites/{siteId}` document: name, tagline, next stream, live state, socials, contacts, enabled modules. Components read brand strings and links from here. |
| `src/data/hero-slides.json` | Hero slides (template shape: kicker, title, body, buttons, media, mood, startsAt/endsAt, audience). |
| `src/data/preview-*.json` | PREVIEW DATA for member tiles, to-dos, updates, the Boom Board and Warm Fuzzies. |

The logo is the mascot (`src/components/Mascot.astro`, inline SVG built from
`shared/assets/mascot.svg`) plus the split wordmark; see design-system.md §8e.

The footer is Tap the Splat (spec `docs/specs/tap-the-splat.md`): the idle footer
is plain HTML/CSS from `src/components/SiteFooter.astro`; `src/scripts/footer.js`
handles the sound toggle and the contact Show buttons (addresses are joined in the
browser, never in the HTML).

Open TODOs: the social profile URLs (all `#`) and follower counts (typed in until
the growth collector exists); the footer links show the vanity domains but go to
internal paths until the redirects exist in Cloudflare (`_todoDomains`), and
Horror Monthly (boomertang.com) isn't built yet;
the stream schedule's home timezone (times show in each viewer's own timezone;
`site.json` `timezone` is only the no-JavaScript fallback).

## Cloudflare Pages

Workers & Pages → Create → Pages → connect the GitHub repo, then:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `site` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable (Production) | `NODE_VERSION` = `22`, `PUBLIC_FIREBASE_ENV` = `production` |
| Environment variable (Preview) | `NODE_VERSION` = `22`, `PUBLIC_FIREBASE_ENV` = `staging` |

`dev` builds as a Preview deployment (staging.boomertanger.com is pointed at
the `dev` branch alias); every other branch gets its own preview URL. Per the
spec, staging and previews are locked to your email with Cloudflare Access.
