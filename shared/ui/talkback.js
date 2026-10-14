// shared/ui/talkback.js — .bt-talkback, the page strip, and .bt-ask-pin (docs/specs/service-hub.md §8a, §12; design-system.md §5 "Service Hub pieces", §8aa).
// The compact strip (V5 "Talk word pill" + S1 symbol, docs/design/mockups/page-strip-compact.html, Oct 14, 2026): one row at the end of an included
// feature page: "Rate it", three icon-only rating buttons (Not for me, Like it, Love it) in a role="group" named "Rate {name}", and on the right the
// purple "Talk" pill (speech bubble with dots) that opens Talk Back in Question mode (Feedback is a switch inside the dialog).
//
//   talkbackHtml({ service, name, state, rating, talk, rate })
//       service: the manifest id (data-service, for the page's wiring and Talk Back's loader); name: "Tap the Splat" (the group's aria-label)
//       state: "new" (a member who hasn't rated) · "rated" (rating.value pressed) · "visitor" (the buttons open the sign-in dialog on Join free)
//       rating: { value: nope|like|love, version, date } for "rated"
//       rate / talk: false leaves out the buttons (data-rate="off": the services kill switch) or the Talk pill (talkBack "rate", the talkBack switch)
//     Buttons carry data attributes for the page: [data-rate-v] (members: Like it and Love it save in one tap, Not for me opens the rating dialog),
//     [data-signin="join"] (visitors), [data-talk="question"] on the Talk pill (window.btTalkBack.open, spec §8b).
//   askPinHtml({ section, label })   the dashed Ask chip for a .bt-section-head-tools slot ([data-ask-section]); icon-only at 420 with its aria-label
import { escapeHtml as esc } from "./dom.js";
import { RATE_VALUES, RATE_LABEL, RATE_ICON } from "./rate.js";

/** S1, the speech bubble with three dots (the Talk pill). */
export const TALK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 5h16v11H10l-6 4z"/><circle cx="8.5" cy="10.5" r=".6" fill="currentColor"/><circle cx="12" cy="10.5" r=".6" fill="currentColor"/><circle cx="15.5" cy="10.5" r=".6" fill="currentColor"/></svg>';

export function talkbackHtml({ service = "", name = "this page", state = "new", rating = null, talk = true, rate = true } = {}) {
  const visitor = state === "visitor";
  const mine = state === "rated" && rating && RATE_VALUES.includes(rating.value) ? rating.value : "";
  const btn = (v) => {
    const label = RATE_LABEL[v];
    const tip = mine === v && rating?.version ? `${label} (your rating, v${rating.version}${rating.date ? `, ${rating.date}` : ""})` : label;
    const act = visitor ? 'data-signin="join" data-signin-title="Join free to rate"' : `data-rate-v="${v}" aria-pressed="${mine === v}"`;
    return `<button type="button" class="bt-talkback-rb" data-v="${v}" ${act} aria-label="${esc(label)}" title="${esc(tip)}">${RATE_ICON[v]}</button>`;
  };
  const rateRow = rate ? `<span class="bt-talkback-q">Rate it</span><span class="bt-talkback-rates" role="group" aria-label="${esc(`Rate ${name}`)}">${RATE_VALUES.map(btn).join("")}</span>` : `<span class="bt-talkback-q">Questions or feedback?</span>`;
  const pill = talk ? `<button type="button" class="bt-talkback-talk" data-talk="question" aria-label="Talk back: ask a question or give feedback" title="Talk back">${TALK_ICON}Talk</button>` : "";
  return `<section class="bt-talkback" role="region" aria-label="${esc(`Rate or talk about ${name}`)}" data-service="${esc(service)}"${rate ? "" : ' data-rate="off"'}>${rateRow}${pill}</section>`;
}

export function askPinHtml({ section, label }) {
  return `<button type="button" class="bt-ask-pin" data-ask-section="${esc(section)}" aria-label="${esc(`Ask about ${label}`)}">${RATE_ICON.ask}<span>Ask</span></button>`;
}
