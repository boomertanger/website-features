// /schedule/usual: Boomer's usual week from public/usualWeek (patterns as poster cards, backstage marked members-only,
// upcoming public exceptions). Sample data under ?as= / ?pv= (non-production).
import { onAccess } from "./layout";
import { esc, loadUsual, loadBallot, fillVoteCount, isSample, sampleUsual, sampleBallot, monthDay, rangeText, DOW_SHORT, DOW_LONG, type Usual } from "./pub";
import { sectionHeadHtml } from "../../../../shared/ui/section-head.js";
import { posterHtml } from "../../../../shared/ui/poster.js";
import { platformsHtml } from "../../../../shared/ui/scream-planner.js";

const root = document.querySelector<HTMLElement>("[data-pp-usual-page]")!;
const body = root.querySelector<HTMLElement>("[data-pp-body]")!;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const chats = (p: string[]) => platformsHtml(p.map((x) => (x === "youtube" ? "ytLandscape" : x)));
const range = (from: string, to: string) => (from === to ? monthDay(from) : `${monthDay(from)} to ${monthDay(to)}`);

function render(u: Usual | null) {
  root.removeAttribute("aria-busy");
  if (!u || !u.patterns.length) {
    body.innerHTML = `<div class="bt-empty pp-empty"><span class="pp-empty-art" aria-hidden="true">${mascot()}</span><h2 class="bt-empty-title">The usual week isn't set yet</h2><span>See what's actually on in <a href="/schedule">this week's schedule</a>.</span></div>`;
    return;
  }
  const cols = DOW_SHORT.map((d, i) => {
    const ps = u.patterns.filter((p) => p.dow === i + 1);
    return `<div class="pp-day" role="group" aria-label="${DOW_LONG[i]}">${ps.length ? ps.map((p) => posterHtml({ day: d, icon: p.icon || "🎬", label: p.label, timeText: rangeText(p.start, p.end), platformsHtml: chats(p.platforms), backstage: p.membersOnly })).join("") : posterHtml({ day: d, off: true })}</div>`;
  }).join("");
  const KIND: Record<string, string> = { weekOff: "week off", dayOff: "day off", skipPattern: "skipped" };
  const exc = u.exceptions.length
    ? `<div class="pp-exc"><span class="bt-label">Coming up</span>${u.exceptions.map((e) => `<span class="bt-badge bt-badge--gray">${esc(range(e.from, e.to))} · ${esc(KIND[e.kind] || "off")}${e.label ? `, ${esc(e.label)}` : ""}</span>`).join("")}</div>`
    : `<div class="pp-exc"><span class="bt-label">Coming up</span><span>No days off planned that Boomer has shared.</span></div>`;
  body.innerHTML = `<section class="pp-usual">${sectionHeadHtml({ icon: "🕯️", title: "Usual week", sub: "Backstage streams are for Fan Club members, and Fan Club is free.", tools: `<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/schedule">This week's schedule</a>` })}<div class="bt-posters pp-posters">${cols}</div>${exc}</section>`;
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
