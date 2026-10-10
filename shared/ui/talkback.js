// shared/ui/talkback.js — .bt-talkback, the page strip (S1), and .bt-ask-pin (docs/specs/service-hub.md §8a, §12; design-system.md §5 "Service Hub pieces").
// One strip at the end of an included feature page: Rate it (Service Hub) on the left, Talk back (Hotline Boom: Ask a question, Give feedback) on the right.
//
//   talkbackHtml({ service, name, state, rating, talk, rate, mascotHtml })
//       service: the manifest id (data-service, for the page's wiring); name: "Tap the Splat"
//       state: "new" (a member who hasn't rated) · "rated" · "visitor"; rating: { value: nope|like|love, version, date } for "rated"
//       rate / talk: false hides that half (data-rate="off" / data-talk="off": talkBack "rate", or the services / talkBack kill switches)
//       mascotHtml: the real mascot (the page passes it, as chatFeedEmptyHtml does)
//     Buttons carry data attributes for the page: [data-rate-v] (one tap: Like it and Love it save; Not for me opens the rating dialog),
//     [data-rate-change], [data-signin="join"] (visitors), [data-talk="question"] / [data-talk="feedback"] (window.btTalkBack.open, spec §8b).
//   askPinHtml({ section, label })   the dashed Ask chip for a .bt-section-head-tools slot ([data-ask-section]); icon-only at 420 with its aria-label
import { escapeHtml as esc } from "./dom.js";
import { RATE_VALUES, RATE_LABEL, RATE_ICON } from "./rate.js";

const MINE = { love: "You love it", like: "You like it", nope: "Not for you" };

export function talkbackHtml({ service = "", name = "this page", state = "new", rating = null, talk = true, rate = true, mascotHtml = "" } = {}) {
  const visitor = state === "visitor";
  let rateHalf;
  if (visitor) {
    rateHalf = `<span class="bt-label">Rate it</span><div class="bt-talkback-btns"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="join" data-signin-title="Join free to rate">Join free to rate</button></div><small>Members rate every service and earn badges for it.</small>`;
  } else if (state === "rated" && rating && RATE_VALUES.includes(rating.value)) {
    const when = [rating.version ? `Rated v${esc(rating.version)}` : "Rated", rating.date ? ` on ${esc(rating.date)}` : ""].join("");
    rateHalf = `<span class="bt-label">Your rating</span><div class="bt-talkback-mine"><span class="bt-talkback-myrate" data-v="${rating.value}">${RATE_ICON[rating.value]}${MINE[rating.value]}</span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-rate-change>Change</button></div><small>${when}. Only you, Boomer and the admins see it.</small>`;
  } else {
    rateHalf = `<span class="bt-label">Rate it</span><div class="bt-talkback-btns">${RATE_VALUES.map((v) => `<button type="button" class="bt-talkback-rb" data-v="${v}" data-rate-v="${v}" aria-pressed="false">${RATE_ICON[v]}${RATE_LABEL[v]}</button>`).join("")}</div><small>Private: only Boomer and the admins see ratings.</small>`;
  }
  const talkHalf = `<span class="bt-label">Talk back</span><div class="bt-talkback-btns"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-talk="question">Ask a question</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-talk="feedback">Give feedback</button></div><small>${visitor ? "Replies come by email. No account needed." : "Replies land in your alerts."}</small>`;
  const sub = rate && talk ? "Rate it in one tap, or talk to Boomer." : rate ? "Rate it in one tap." : "Ask a question or tell Boomer what you think.";
  const foot = rate && talk ? "Ratings are a quick verdict with no reply. Questions and feedback go to Hotline Boom with this page attached, and get a reply."
    : rate ? "Ratings are a quick, private verdict: only Boomer and the admins see them." : "Questions and feedback go to Hotline Boom with this page attached, and get a reply.";
  return `<section class="bt-talkback" role="region" aria-label="${esc(`Rate or talk about ${name}`)}" data-service="${esc(service)}"${rate ? "" : ' data-rate="off"'}${talk ? "" : ' data-talk="off"'}>`
    + `<div class="bt-talkback-head">${mascotHtml}<div><b>How's ${esc(name)}?</b><span>${sub}</span></div></div>`
    + `<div class="bt-talkback-body"><div class="bt-talkback-rate">${rateHalf}</div><span class="bt-talkback-div" aria-hidden="true"></span><div class="bt-talkback-talk">${talkHalf}</div></div>`
    + `<p class="bt-talkback-foot">${foot}</p></section>`;
}

export function askPinHtml({ section, label }) {
  return `<button type="button" class="bt-ask-pin" data-ask-section="${esc(section)}" aria-label="${esc(`Ask about ${label}`)}">${RATE_ICON.ask}<span>Ask</span></button>`;
}
