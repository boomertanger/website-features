# Tech Stack: spec

Oct 10, 2026 · Glenn Bowering · Confirmed (mockup approved: `docs/design/mockups/tech-stack.html`)

## 1. Purpose

`/tech-stack` covers the full streaming setup: dual-PC streaming, Boomer's setup, hardware, software and the internet backbone. The interactive diagram answers "what is he using and how is it wired?" Every piece of hardware is listed with details. After launch, each item can carry an Amazon referral link as a way for viewers to support the channel.

Honesty rule for all copy: describe the setup exactly as it is. The Streaming PC is Boomer's previous gaming PC; it streams Twitch and YouTube in Streamlabs and records every stream. It can't encode a third stream, so TikTok streams from the Gaming PC with TikTok LIVE Studio. The G7 is a 240 Hz monitor, but the page never claims the game runs at 240 fps. No invented specs or settings. US English throughout (fiber, analyze, color).

## 2. Who sees what

| Part | Visitors | Fan Club (signed-in members) |
|---|---|---|
| All chapters; the full diagram in every view; tap a device for its name, role and connections | ✓ | ✓ |
| Zoom, pan, signal layers, search, deep links, Trace from here | ✓ | ✓ |
| Hardware cards (photo, name, short line, referral link when on) | ✓ | ✓ |
| Software, internet, Ask BOOMBOT | ✓ | ✓ |
| Follow-the-signal tours with narration | Route lit, narration locked | ✓ |
| Ports per connection, full specs, "why I picked it / what I'd change" | Lock card | ✓ |
| Pull the plug | Lock card | ✓ |
| Inside the mixer (socket-by-socket routing) | Blurred preview + lock card | ✓ |
| Setup history | Blurred preview + lock card | ✓ |

Locked parts use `.bt-lock-card` and open the Join free dialog (E1); after signup the visitor returns to what they clicked. Signed in but signup unfinished: the lock card says "Finish signing up". Sub Club: nothing for now. Client checks only control what's shown; the members-only text loads from Firestore behind a rule (§6).

## 3. Placement

- Route `/tech-stack` (same URL as the old Squarespace page, which stays live until launch).
- Header nav: **Community** group, blurb "The rig behind every stream" (`site/src/lib/nav.js`). A nav regroup is planned once the remaining pages exist (ROADMAP).
- Story page, full frame: TocLayout rail, ghost-numbered chapters, hero with a scene, stage cards with scenes, journey line, placard, working example (the diagram), Ask BOOMBOT, real mascot and BOOMBOT art, closing call to action.

## 4. Page structure

Hero: kicker "Community · The rig", page title, lede ("Two PCs, five cameras, one mixer and a 2 Gbps line…"), stat pills, Explore the rig / Follow a signal, hero scene built from the real photos (G7, Link, both PCs, HD60X, SM7dB) with a pulse along the cables, and the mascot.

1. **Why two PCs.** Six stage cards with detailed animated scenes built from the photos (more power for the game; cleaner streams; audio you can mix live; upgrade one side at a time; a backup built in; room to get creative). Power-on moment: when the chapter scrolls into view the scenes flicker on one by one, then each plays its animation once. Ambient idle loops after that (screen shine, needle sway, health-line dots, meter flicker, GPU float, current in the cord, LIVE blink) and a pulsing "▶ Play" badge. Hover, focus or tap plays a card. Then the One PC / Two PCs compare cards with PC photos and load bars, including the honest catch (TikTok stays on the Gaming PC).
2. **Boomer's setup.** The diagram (§5), then **Inside the mixer** (§5.4).
3. **Hardware.** PC compare table (tower + GPU photos; Model, CPU, GPU, RAM, Storage, Job, History, Runs). Category filter chips (PCs, Displays, Cameras, Lights, Audio, Input, Mobile and smart, VR, Network, Studio). Cards: photo, category tag, quantity badge when a model repeats (same kind), model, short line, Show in diagram (devices only), Full specs (Fan Club), Check price on Amazon (only when referrals are on).
4. **Software.** Five-step journey: Go live → Run the show → Edit → Analyze → Community.
5. **Internet backbone.** Speed gauge (2 Gbps, same speed both ways) + "Why fiber" placard.
6. **Setup history (Fan Club).** Dated timeline.
7. **Ask BOOMBOT.** Includes "Why does TikTok stream from the Gaming PC?"

Closing call: See the schedule; Join free for visitors.

## 5. The diagram

### 5.1 Views
View switch (`.bt-view-switch`): **Photo** (default) · **Drawn** · **Blueprint** · **Flow** · **List**. Choice remembered per viewer in `localStorage` (`bt.techstack.view`, try/catch). List is the default under 420px.
- **Photo:** Boomer's own cut-outs in his own layout; live cables drawn between them; the two mice sit on the empty Powerplay.
- **Drawn:** drawn devices in the same desk arrangement; cables hang like the footer's power cables.
- **Blueprint:** line-art devices, square cable runs on a grid, labels always on.
- **Flow:** left to right (In, Hubs, Gaming PC, Capture, Streaming PC, Out); parallel or same-column runs get their own lane.
- **List:** devices grouped by category, each with its connections in words.

All views run on one engine; every feature works in each. Coordinates are in a 1600 × 1000 viewBox, stored per device in the data file.

### 5.2 Interactions
- Tap / hover a device: its cables light, the rest dim; the detail card below the diagram shows photo, name, model, tags (PC, category, "On camera or mic"), role, connections ("Sends audio to Mixer", each tappable). Fan Club: ports per connection, specs, notes.
- **Trace from here:** lights everything downstream along compatible signals (audio follows audio, video follows video, game capture carries both, the internet follows network, control stops at a PC).
- **Follow the signal tours** (narrated stop by stop, pulse down each cable; Back / Next stop / Finish): Gameplay to Twitch and YouTube; Gameplay to TikTok; Your voice; Face cams. Visitors see the route lit and a lock card.
- **Pull the plug (Fan Club):** switch off a device; a readout shows Live / Down per platform and what else goes dark. A stream to a platform needs its PC to have a live network path.
- Signal layer chips: Video, Audio, USB, Wireless (dashed), Network.
- Find a device (search by name, model, tags; Enter jumps and zooms).
- Deep links: `?device=<id>`, `?tour=<id>`, `?view=<view>`.
- **On air:** while live (existing public live status), devices with `onAir` glow (tally red, the kit's live colour).
- Zoom frame (new kit piece, §8): wheel zoom only after a click inside, drag, pinch, double-tap, + / − / FIT, minimap while zoomed, eases to a selected device.
- Keyboard: devices are buttons; arrow keys follow cables to connected devices; Enter selects; Escape clears; + − 0 zoom.
- Reduced motion: no pulses, no power-on flicker or idle loops, zoom jumps, tours step with Next only.

### 5.3 Confirmed wiring (Oct 10, 2026)
- Gaming PC → G7 (gameplay), G7 (apps and chat), HD60X (HDMI, OBS projector); Gaming PC → TikTok (TikTok LIVE Studio).
- HD60X → Streaming PC (USB). Streaming PC → AOC; → Twitch and YouTube (Streamlabs); records.
- Cams: Link, Brio, C920x → Streaming PC; Link 2, Link 2C → Gaming PC. Litra Glow ×2 and Key Light Neo on the Streaming PC (USB). Key Light ×2 on Wi-Fi.
- USB switch wired to both PCs; plugged in: K100, Powerplay receiver (G502 X), Stream Deck Pedal. G503 → Streaming PC (wireless).
- Quest 3 → Gaming PC (Link cable). Controllers → Quest.
- Audio: SM7dB → L-8 IN 2 (XLR). Quest → Sennheiser transmitter (3.5 mm) → wireless → receiver → L-8 IN 1 (XLR). Gaming PC → L-8 IN 3 + 4. Streaming PC → L-8 IN 5 + 6. L-8 master out splits to both PCs. Headphone out 1 → NDH 20. No USB link between the L-8 and either PC.
- Network: fiber box (Nokia ONT) → Nokia WiFi Beacon G6 → both PCs (Cat 6); Beacon Wi-Fi → iPads, iPhone, Echo, Key Lights.

### 5.4 Inside the mixer (Fan Club)
Under the diagram and from the L-8 card's "Inside the mixer" button. Left: Sound coming in (VR sound, Your voice, Gaming PC sound, Streaming PC sound, Sound pads); right: Sound going out (Twitch and YouTube via the Streaming PC, TikTok via the Gaming PC, Boomer's headphones). Each row: plain words first, socket underneath ("IN 2 · XLR"). Middle: a drawn back panel (IN 1–6, MASTER OUT L/R, PHONES 1, PADS) above the L-8 photo. Tap a row: its socket glows, a pink cable flows from the row, everything it reaches lights, and BOOMBOT explains the path in one sentence. Word chips: Input, Fader, Master out, Headphone out. Phones: panel and photo on top, rows below, no cables. No "who hears what" switch (all outputs carry the same master mix; revisit if separate headphone mixes are used).

## 6. Data

**Public:** `site/src/data/tech-stack.json` (read at build time; delivered as a ready file). Holds devices (id, labels, model, category, art, pc, role, onAir, tags, per-view positions, photo public ids, `referral: null`), gear (hardware-list only), cables (id, from, to, signal, carries), tours (routes only), software, pcCompare, internet, Ask BOOMBOT, mixer word definitions. No ports, notes, narration or mixer routing.

**Fan Club:** `sites/boomertanger/memberContent/tech-stack` (one doc): `devices.{id}` (specs, whyPicked, wouldChange), `cables.{id}.port`, `tours.{id}` (narration per stop), `mixer` (inputs, outputs, sockets), `history[]`, `updatedAt`.
- Rule: read if signed in and `sites/boomertanger/members/{uid}` exists; no client writes. When billing exists, switch to the Fan Club plan check.
- Source: `functions/scripts/data/tech-stack-member.json` (gitignored while the repo is public; committed after it goes private), loaded by `functions/scripts/seed-tech-stack.js` (dry run unless `--apply`; staging first). Shipped with `tech-stack-member.sample.json` (sample notes and history marked `sample`).

**Photos:** Cloudinary, folder `tech-stack/desk/<id>` (Photo view cut-outs) and `tech-stack/card/<id>` (cards, panel, compare, scenes). Uploaded once by `functions/scripts/upload-tech-stack-photos.js` (public ids fixed, no overwrite), each recorded with `recordAssetCreated()` (feature key `techStack`). Never deleted outside the approved delete functions.

**Referrals:** `site.json` modules `techStack: { enabled: true, referrals: false }`. When on: per-item links (`rel="sponsored noopener"`, new tab) and the disclosure "As an Amazon Associate I earn from qualifying purchases…" above the hardware cards.

**Check:** `scripts/check-tech-stack.js` runs in the build: every cable and tour step points at real devices and cables; every device has a position for each view; photo ids are present.

**Writes:** none from the browser. No new callables.

## 7. Edge cases
- Member doc fails to load: locked areas show "Couldn't load the member details" + Try again; the public page works.
- Device without a photo: the drawing is used.
- Locked deep link while signed out: route lit, lock card.
- Not live / live status unreadable: no glow, no error.
- Gear change: edit the JSON (and the member file if notes change), push; new photos go through the upload script.

## 8. bt-ui
**New kit piece:** `.bt-zoomframe` (+ `shared/ui/zoomframe.js`): viewport, + / − / FIT, minimap (shown while zoomed), hint until first click, states `.is-active`, `.is-panning`, `.is-zoomed`; `flyTo()`; keyboard. On `/dev/ui-kit/` in every state; design-system.md §5 and §6.

**Reused:** `.bt-site-header`, TocLayout + `.bt-toc`, `.bt-chapter--ghost`, `.ai-hero`, `.ai-stage` / `.ai-part` / `.ai-scene` with `.bt-spotlight`, `.ai-jr` journey, `.bt-placard`, `.bt-lock-card`, `.bt-chat` + `boombotIcon()`, `.bt-view-switch`, `.bt-chip`, `.bt-search`, `.bt-card`, `.bt-tag`, `.bt-badge`, the beacon, `.bt-toast`, the mascot, E1.

**Feature CSS** (`site/src/styles/tech-stack.css`, prefix `ts-`): device drawings, cables, pulse, tally glow, the five views, detail card, list, chapter 1 scenes and their power-on / idle / play states, mixer close-up, speed gauge. Five signal colours declared once from tokens: video `--bt-cycle-2`, audio `--bt-pink`, USB `--bt-cycle-7`, wireless `--bt-lamp`, network `--bt-teal`. No raw colours (the mockup's few `rgba(0,0,0,…)` shadows become kit shadow tokens). Container queries only; reduced motion everywhere.

## 9. Later (not in this build)
Referral click counts (Cloud Function); an /admin editor for the data; Sub Club downloads (OBS scene collection, Stream Deck profiles).

## 10. Docs updates
- ROADMAP: Tech Stack workstream; "Nav redesign once the remaining pages are built"; launch checklist "Make the repo private" right after the Squarespace Code Blocks are switched off; "Turn on Tech Stack referral links".
- design-system.md §8: new "Tech Stack" entry (picks: Photo default view + Drawn / Blueprint / Flow / List; chapter 1 power-on pattern; mixer close-up; kit `.bt-zoomframe`).
