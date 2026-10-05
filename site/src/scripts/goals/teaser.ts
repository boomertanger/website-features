// The Goal Tracker's headline card, from public/goalTrackerTeaser: the members-only gate on /goals and the
// home tile both show it. Readiness (a gold meter) until a relaunch date is set, then a countdown to the
// next key date. No plan details: the teaser never carries any.
import { loadTeaser, pct, meterHtml, untilText, dateText, type Teaser } from "./data";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";

/** The card's inner markup. */
export function teaserHtml(t: Teaser, now = Date.now()): string {
  // Once a relaunch date is set, count down to the next date that hasn't passed: the relaunch, then the
  // teaser's next key date (nominees announced, the show).
  const next = t.relaunchAt && t.relaunchAt > now ? { label: "Relaunch", at: t.relaunchAt }
    : t.relaunchAt && t.nextKeyDate && t.nextKeyDate.at > now ? t.nextKeyDate : null;
  const { done, total } = t.readiness;
  const body = next
    ? `<div class="gt-tease-when"><b>${esc(next.label)} in ${untilText(next.at, now)}</b><small>${esc(dateText(next.at))}</small></div>`
    : total > 0
      ? `<div class="gt-tease-ready"><div class="gt-tease-row"><b>Relaunch readiness</b><span class="gt-pct">${pct(done, total)}<small>%</small></span></div>${meterHtml("gold", done, total, "Relaunch readiness")}<small>${done} of ${total} done</small></div>`
      : "";
  return `<span class="gt-tease-kicker">The goal</span><b class="gt-tease-title">${esc(t.northStar)}</b>${body}`;
}

/** Fills every [data-gt-teaser] under root; hides them when there is no teaser yet. */
export async function fillTeasers(root: ParentNode = document): Promise<Teaser | null> {
  const hosts = [...root.querySelectorAll<HTMLElement>("[data-gt-teaser]")];
  if (!hosts.length) return null;
  const t = await loadTeaser();
  for (const h of hosts) {
    if (t) { h.innerHTML = teaserHtml(t); h.hidden = false; h.removeAttribute("aria-busy"); } else h.hidden = true;
  }
  return t;
}
