// The feature bars' Playwright check (docs/design-system.md §5 "Feature bars"). Run against a preview build:
//   npm run build && npx astro preview --port 4329      then      npm run test:bars      (BASE=http://127.0.0.1:4329 by default)
// Chromium: Playwright's own install (npx playwright-core install chromium), or CHROMIUM=path/to/chrome.
// Roles use the ?as= previews (BaseLayout sets the role flags before first paint, as a real sign-in does from its saved copy).
//   1. Every /live page shows the CONTROLROOM bar and every /crew page (and /admin/crew) the MODMACHINA bar, with the right links in the
//      right order for visitor, member, crew (a Warden), A2 and owner, at 1280 and 390 px.
//   2. (bug a) No two links in the bar go to the same page, at 390 and 1280, on every /live page for every role.
//   3. (bug b) From the Mod Deck, every bar link (Controls included) lands on a page with the CONTROLROOM bar and its links, never the old
//      Mod Deck ones; the same after browser back and forward.
//   4. Phones: the current link is in view in the link row on first paint (never scrolled from the start later).
import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:4329";
const ROLES = { visitor: "", member: "member", crew: "crew", a2: "a2", owner: "owner" };
const CR = { visitor: ["Live", "Questions", "How it works"], member: ["Live", "Questions", "How it works"], crew: ["Live", "Questions", "How it works", "Mod Deck"],
  a2: ["Live", "Questions", "How it works", "Mod Deck", "Controls"], owner: ["Live", "Questions", "How it works", "Mod Deck", "Controls", "Checklist"] };
const MM_ALL = ["The crew", "How it works", "Board", "Join"], MM_STAFF = [...MM_ALL, "HQ", "Academy", "Queue", "Games", "Mod Deck"];
const MM = { visitor: MM_ALL, member: MM_ALL, crew: MM_STAFF, a2: MM_STAFF, owner: MM_STAFF };
const LIVE = ["/live", "/live/how-it-works", "/live/questions", "/live/chat-games", "/live/control", "/live/control/checklist", "/live/deck"];
const CREW = ["/crew", "/crew/how-it-works", "/crew/board", "/crew/join", "/crew/vote", "/crew/hq", "/crew/academy", "/crew/queue", "/crew/games", "/crew/profile", "/crew/tasks", "/admin/crew"];

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const url = (path, role) => BASE + path + (role ? `${path.includes("?") ? "&" : "?"}as=${role}` : "");

/** What the bar shows: wordmark, the visible links (text, href without the preview role, current) and the row's scroll. */
const readBar = (page) => page.evaluate(() => {
  const bar = document.querySelector(".bt-sticky-bar .bt-topbar");
  if (!bar) return null;
  const navs = bar.querySelectorAll("nav");
  const all = [...bar.querySelectorAll("a[href]")].filter((a) => a.getClientRects().length);
  const norm = (h) => { const u = new URL(h, location.href); u.searchParams.delete("as"); return u.pathname.replace(/\/+$/, "") + (u.search || ""); };
  const nav = navs[0], cur = nav?.querySelector('a[aria-current="page"]');
  const r = cur?.getBoundingClientRect(), nr = nav?.getBoundingClientRect();
  return {
    wordmark: bar.querySelector(".bt-wordmark")?.getAttribute("aria-label"),
    navs: navs.length,
    links: [...(nav?.querySelectorAll("a") || [])].filter((a) => a.getClientRects().length).map((a) => a.textContent.trim()),
    hrefs: all.map((a) => norm(a.getAttribute("href"))),
    current: cur && cur.getClientRects().length ? cur.textContent.trim() : null,
    inView: !cur || !cur.getClientRects().length || (r.left >= nr.left - 1 && r.right <= nr.right + 1),
  };
});

/** CHROMIUM, else Playwright's default, else any Chromium already in Playwright's browser folder. */
async function launch() {
  if (process.env.CHROMIUM) return chromium.launch({ executablePath: process.env.CHROMIUM });
  try { return await chromium.launch(); } catch (err) {
    const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || join(process.env.LOCALAPPDATA || join(process.env.HOME || "", ".cache"), "ms-playwright");
    const exe = existsSync(dir) && readdirSync(dir).filter((d) => d.startsWith("chromium-")).sort().reverse()
      .map((d) => [join(dir, d, "chrome-win64", "chrome.exe"), join(dir, d, "chrome-linux", "chrome"), join(dir, d, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium")]).flat().find(existsSync);
    if (!exe) throw err;
    return chromium.launch({ executablePath: exe });
  }
}
const browser = await launch();
for (const w of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: w < 640, hasTouch: w < 640 });
  const page = await ctx.newPage();
  // 1, 2 and 4: every page, every role
  for (const [role, as] of Object.entries(ROLES)) {
    for (const path of [...LIVE, ...CREW]) {
      await page.goto(url(path, as), { waitUntil: "load" });
      const first = await readBar(page);   // right after load: the first-paint state
      const at = `${w}px ${path} as ${role}`;
      if (!first) { ok(false, `${at}: no feature bar`); continue; }
      const live = path.startsWith("/live");
      ok(first.wordmark === (live ? "Control Room" : "Mod Machina"), `${at}: wordmark is "${first.wordmark}"`);
      ok(first.navs === 1, `${at}: ${first.navs} navs in the bar (one link row)`);
      ok(JSON.stringify(first.links) === JSON.stringify((live ? CR : MM)[role]), `${at}: links ${first.links.join(" · ")}`);
      const dup = first.hrefs.filter((h, i) => first.hrefs.indexOf(h) !== i);
      if (live) ok(!dup.length, `${at}: two links go to ${dup.join(", ")} (bug a)`);
      ok(first.inView, `${at}: the current link (${first.current}) is not in view in the row`);
      await page.waitForTimeout(250);
      const later = await readBar(page);
      ok(JSON.stringify(later.links) === JSON.stringify(first.links), `${at}: links changed after load: ${later.links.join(" · ")}`);
    }
  }
  // 3 (bug b): from the Mod Deck, through each bar link, then back and forward
  for (const role of ["owner", "a2", "crew"]) {
    await page.goto(url("/live/deck", role), { waitUntil: "load" });
    const deck = await readBar(page);
    for (const label of deck.links) {
      await page.goto(url("/live/deck", role), { waitUntil: "load" });
      await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.locator(".bt-sticky-bar nav a", { hasText: label }).first().click()]);
      const at = `${w}px Mod Deck → ${label} as ${role}`;
      for (const [step, bar] of [["click", await readBar(page)], ["back", (await page.goBack({ waitUntil: "load" }), await readBar(page))], ["forward", (await page.goForward({ waitUntil: "load" }), await readBar(page))]]) {
        ok(bar?.wordmark === "Control Room", `${at} (${step}): wordmark "${bar?.wordmark}"`);
        ok(JSON.stringify(bar?.links) === JSON.stringify(CR[role]), `${at} (${step}): links ${bar?.links.join(" · ")}`);
        ok(!bar?.links.some((l) => ["Live page", "Crew HQ", "How duty works", "Checklist templates"].includes(l)), `${at} (${step}): old Mod Deck links`);
      }
    }
  }
  await ctx.close();
}
await browser.close();
if (fails.length) { console.error(`bars: ${fails.length} problem(s)\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("bars: all checks passed (CONTROLROOM and MODMACHINA bars, 5 roles, 19 pages, 1280 and 390 px, Mod Deck back and forward)");
