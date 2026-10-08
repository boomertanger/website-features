// /schedule/usual: Boomer's usual week from public/usualWeek (patterns as poster cards, backstage marked members-only,
// upcoming public exceptions). Sample data under ?as= / ?pv= (non-production).
import { onAccess } from "./layout";
import { esc, loadUsual, loadBallot, fillVoteCount, isSample, sampleUsual, sampleBallot, monthDay, rangeText, DOW_SHORT, DOW_LONG, ymd, addDays, zonedMs, DEFAULT_TZ, type Usual } from "./pub";
import { viewSwitchHtml, initViewSwitch } from "../../../../shared/ui/view-switch.js";
import { sectionHeadHtml } from "../../../../shared/ui/section-head.js";
import { posterHtml } from "../../../../shared/ui/poster.js";
import { platformsHtml, localZoneName, timeRangeText } from "../../../../shared/ui/scream-planner.js";

const root = document.querySelector<HTMLElement>("[data-pp-usual-page]")!;
const body = root.querySelector<HTMLElement>("[data-pp-body]")!;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const chats = (p: string[]) => platformsHtml(p.map((x) => (x === "youtube" ? "ytLandscape" : x)));
const range = (from: string, to: string) => (from === to ? monthDay(from) : `${monthDay(from)} to ${monthDay(to)}`);

// "Times in Central | My time" (the same per-viewer choice as /schedule): the posters show the next time each pattern happens in the viewer's zone.
const TIMES_KEY = "bt.schedule.timesIn";
let timesIn: "central" | "local" = (() => { try { return localStorage.getItem(TIMES_KEY) === "local" ? "local" : "central"; } catch { return "central"; } })();
let current: Usual | null = null;
function localRange(p: { dow: number; start: string; end: string }, tz: string) {
  const today = ymd(Date.now(), tz), dow = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const day = addDays(today, (p.dow - dow + 7) % 7), a = zonedMs(day, p.start, tz), b = zonedMs(p.end > p.start ? day : addDays(day, 1), p.end, tz);
  return timeRangeText(a, b, Intl.DateTimeFormat().resolvedOptions().timeZone);
}
function render(u: Usual | null) {
  current = u;
  const tz = u?.tz || DEFAULT_TZ, zone = localZoneName(tz), local = timesIn === "local" && !!zone;
  root.removeAttribute("aria-busy");
  if (!u || !u.patterns.length) {
    body.innerHTML = `<div class="bt-empty pp-empty"><span class="pp-empty-art" aria-hidden="true">${mascot()}</span><h2 class="bt-empty-title">The usual week isn't set yet</h2><span>See what's actually on in <a href="/schedule">this week's schedule</a>.</span></div>`;
    return;
  }
  const cols = DOW_SHORT.map((d, i) => {
    const ps = u.patterns.filter((p) => p.dow === i + 1);
    return `<div class="pp-day" role="group" aria-label="${DOW_LONG[i]}">${ps.length ? ps.map((p) => posterHtml({ day: d, icon: p.icon || "🎬", label: p.label, timeText: local ? localRange(p, tz) : rangeText(p.start, p.end), platformsHtml: chats(p.platforms), backstage: p.membersOnly } as any)).join("") : posterHtml({ day: d, off: true })}</div>`;
  }).join("");
  const KIND: Record<string, string> = { weekOff: "week off", dayOff: "day off", skipPattern: "skipped" };
  const exc = u.exceptions.length
    ? `<div class="pp-exc"><span class="bt-label">Coming up</span>${u.exceptions.map((e) => `<span class="bt-badge bt-badge--gray">${esc(range(e.from, e.to))} · ${esc(KIND[e.kind] || "off")}${e.label ? `, ${esc(e.label)}` : ""}</span>`).join("")}</div>`
    : `<div class="pp-exc"><span class="bt-label">Coming up</span><span>No days off planned that Boomer has shared.</span></div>`;
  body.innerHTML = `<section class="pp-usual">${sectionHeadHtml({ icon: "🕯️", title: "Usual week", sub: "Backstage streams are for Fan Club members, and Fan Club is free.", tools: `${zone ? `<span class="pp-timesin"><span class="bt-meta">Times in</span>${viewSwitchHtml({ key: "timesIn", label: "Times in", value: timesIn, options: [{ value: "central", label: "Central" }, { value: "local", label: `My time · ${zone}` }] } as any)}</span>` : ""}<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/schedule">This week's schedule</a>` } as any)}<div class="bt-posters pp-posters">${cols}</div>${exc}</section>`;
  initViewSwitch(body as unknown as Document, { onChange: (v: any) => { timesIn = v === "local" ? "local" : "central"; try { localStorage.setItem(TIMES_KEY, timesIn); } catch { /* fine */ } render(current); body.querySelector<HTMLElement>('[data-key="timesIn"] [aria-checked="true"]')?.focus(); } });
}

let done = false;
onAccess(async (s) => {
  if (done) return;
  done = true;
  const sample = isSample(s);
  try {
    const [u, b] = sample ? [sampleUsual(), sampleBallot()] : await Promise.all([loadUsual(), loadBallot().catch(() => null)]);
    fillVoteCount(b);
    render(u);
  } catch (err) { console.error(err); root.removeAttribute("aria-busy"); body.innerHTML = `<div class="bt-notice bt-notice--error">The usual week didn't load. Refresh the page to try again.</div>`; }
});
