// shared/ui-kit/kit-qcard.js — the ".bt-qcard" section of the UI Kit page (/dev/ui-kit): the question card (docs/specs/chat-games.md §4, §14) in every
// state: held, Tonight, Standing, on stream, answered, hidden, merged, asker is here, voted, pinned, with mod tools, and the big on-air size.
// ui-kit.js appends qcardKitHtml() to the page and calls initQcardKit(mount) (the vote buttons flip; nothing is saved).
import { qcardHtml, initQcards } from "../ui/qcard.js";

const T = "If you could delete one horror trope forever, which one and why?";
const tools = '<button type="button" class="bt-btn bt-btn--admin bt-btn--sm">Approve</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm">Hide</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm">To Standing</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm">Merge</button>';

export function qcardKitHtml() {
  const rows = [
    ["Tonight, voted", { id: "k1", text: T, handle: "cryptkeeper", ago: "8 min", votes: 41, voted: true, state: "tonight" }],
    ["Standing, asker is here", { id: "k2", text: "Best jump scare that was earned, not cheap?", handle: "lanternjaw", ago: "4 days", votes: 19, here: true, state: "standing" }],
    ["On stream", { id: "k3", text: "What game made you actually quit for the night?", handle: "gbo", ago: "22 min", votes: 27, here: true, state: "onair" }],
    ["Pinned next, yours", { id: "k4", text: "Would you play Alien: Isolation again on the hardest mode?", handle: "gbo", ago: "5 min", votes: 14, pinned: true, mine: true, canVote: false, state: "tonight" }],
    ["Held for a mod, with mod tools", { id: "k5", text: "does the tracker beeping ever stop being stressful", handle: "newbie_77", ago: "just now", votes: 0, canVote: false, state: "held", toolsHtml: tools }],
    ["Answered", { id: "k6", text: "What got you into horror games in the first place?", handle: "fogbank", ago: "last stream", votes: 31, canVote: false, state: "answered" }],
    ["Hidden by a mod", { id: "k7", text: "A question a mod hid", handle: "someone", ago: "1 h", votes: 2, canVote: false, state: "hidden" }],
    ["Merged", { id: "k8", text: "Which horror game has the best ending?", handle: "gbo", ago: "6 days", votes: 8, canVote: false, state: "merged", note: "Merged into a similar question" }],
  ];
  return `
  <section class="kit-section" id="kit-qcard">
    <h2 class="kit-h">Question card (.bt-qcard)</h2>
    <p class="kit-p">One question in a lane, a session, "Your questions" and the mod queue (<span class="kit-code">shared/ui/qcard.js</span>: qcardHtml, initQcards). Status chips use the site's status colours: held teal, Tonight blue, Standing gold, answered lime, hidden and merged gray; "On stream" is the live colour. Votes flip at once and are put back if the write fails.</p>
    <div class="bt-qcard-list" data-kit-qcards>
      ${rows.map(([label, o]) => `<p class="kit-sub">${label}</p>${qcardHtml(o)}`).join("")}
    </div>
    <p class="kit-sub">The big on-air size (.bt-qcard--big): the Play panel's current card and the run controls</p>
    ${qcardHtml({ id: "k9", text: T, handle: "cryptkeeper", ago: "on stream now", votes: 41, here: true, state: "onair", big: true })}
  </section>`;
}

export function initQcardKit(mount) {
  const box = mount.querySelector("#kit-qcard");
  if (box) initQcards(box, { onVote: () => {} });
}
