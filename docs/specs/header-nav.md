# Header nav, grouped — spec

Oct 7, 2026 · Glenn Bowering · Confirmed. Option 1 (grouped panels) approved.
Mockup: docs/design/mockups/header-nav.html (https://claude.ai/artifact/Ja9LAeR1m4HQ41yFmKQ58c).

## Problem
The header has 11 flat links (Home, Live, Schedule, Games, Arcade, Night Shift, Trophy Room, Goals, Streams, Shop, Club). At 1100 px the strip scrolls under the Live Beacon; Crew was moved out to the More sheet, account menu and footer. Bug Zapper, Feature Lab and Horror Monthly need a home.

## What it does
Three menus and one plain link replace the flat links:

| Header | Pages |
|---|---|
| Watch ▾ | Live, Schedule, Streams, Games ("What I'm playing") |
| Play ▾ | Arcade, Night Shift, Trophy Room |
| Community ▾ | Club, Crew, Goals; later Bug Zapper, Feature Lab, Horror Monthly |
| Shop | plain link |

Logo = Home. Live Beacon, account area and green Admin link unchanged.

## Who sees it
Everyone. Crew returns to Community (/crew is public). Admin stays green, admin-only.

## Panels
- Each page is a card: icon, name, one-line blurb, hover glow and a small icon lift (Live pulses).
- One featured tile per panel with live info:
  - Watch: live now (red, "Watch now") or the next stream with a countdown and "Add to calendar".
  - Play: today's Arcade game with the member's best, or a play call to action when signed out or no score.
  - Community: Mod of the Month (latest award), else "Help keep the chats fun" with "Join the crew" and the mascot.
- Feature tile states: loading (shimmer), live, offline, empty (call to action).
- The group containing the current page is highlighted (purple underline). Watch shows a red dot while live.

## Blurbs (approved in the mockup)
- Live: Watch the stream right now, on any platform.
- Schedule: When I'm on next, in your own time zone.
- Streams: Past streams, highlights and clips.
- Games: What I'm playing, and what's up next.
- Arcade: Quick horror games with leaderboards.
- Night Shift: Missions between streams. Keep your streak alive.
- Trophy Room: Every badge and trophy you've earned.
- Club: Fan Club is free. Sub Club adds the extras.
- Crew: Meet the mods who keep the chats fun, or join them.
- Goals: What we're working toward together.
- Shop (phone sheet): Merch and crew drops.
- Later (not in the live nav until their modules are enabled): Bug Zapper "Report something broken.", Feature Lab "Suggest ideas and vote on them.", Horror Monthly "The monthly horror roundup."

## Data
Read only. Groups defined in site/src/lib/nav.js, built from site.json modules (platform-ready): disabled module hidden, empty group hidden, a one-page group becomes a plain link. Feature tiles read existing data only (site.json nextStream and the live state already used by the Live Beacon, existing public crew and arcade docs). No writes, no new functions or rules.

## Behaviour
- Opens on hover after ~140 ms, or on click/tap; clicking the trigger again closes.
- Escape closes and returns focus to the trigger. Disclosure pattern (button + aria-expanded + aria-controls), not ARIA menus.
- One panel open at a time; outside click or scroll closes.
- Reduced motion: no slide, glow animation or icon motion.
- No JavaScript: each trigger is a link to its group's first page.
- Works on the overlay header (hero pages).

## Phone
Tab bar unchanged (Home, Schedule, raised Live, Games, More). The More sheet is regrouped under Watch / Play / Community / Shop headings, one line under each page, and a small live tile at the top. Pages already in the tab bar are left out of the sheet.

## bt-ui
New kit piece .bt-navgroup: trigger (.bt-navgroup-btn), panel (.bt-navgroup-panel), link cards (.bt-navgroup-link, -ic, -name, -blurb), feature tile (.bt-navgroup-feature). In bt-ui.css and on /dev/ui-kit/ in every state: closed, hover, open, current section, live dot; feature tile loading, live, offline, empty. Reuses the icon sprite, badges and buttons. Container queries only.

## Out of scope
Site search, notifications bell, vanity domain redirects.
