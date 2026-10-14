// shared/ui-kit/kit-talkback.js — the "Talk Back dialog" section of the UI Kit page (/dev/ui-kit): the kit pieces the Talk Back dialog is built from
// (docs/specs/talk-back.md §4, §5; design-system.md §5): the three-way pill (.bt-pills[data-n="3"], live), BOOMBOT's answer as the kit chat
// (.bt-chat-a with the typing dots), the Too many notice and the Hotline Sent stamp, plus a button that opens a sample in openModal({ variant: "sheet" })
// (a bottom sheet in a narrow frame). The dialog's own layout (hb-tb-*) is Hotline Boom feature CSS (site/src/styles/talkback.css), so the sample
// shows the kit pieces only. Static sample data, no reads, no writes. ui-kit.js appends talkbackKitHtml() and calls initTalkbackKit(mount).
import { boombotIcon } from "../ui/arcade.js";
import { stampHtml } from "../ui/stamp.js";
import { openModal } from "../ui/modal.js";
import { toast } from "../ui/toast.js";

const IC = {
  q: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H10l-6 4z"/></svg>`,
  bug: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9h8v6a4 4 0 0 1-8 0zM9.5 9a2.5 2.5 0 0 1 5 0M4 13h4M16 13h4"/></svg>`,
};
const MODES = [["question", IC.q, "Question"], ["feedback", IC.chat, "Feedback"], ["broken", IC.bug, "Something's broken"]];
const pills = (on = "question") => `<div class="bt-pills bt-pills--mode" data-n="3" role="group" aria-label="What kind of message">${MODES.map(([k, ic, l]) => `<button type="button" class="${k === on ? "is-on" : ""}" aria-pressed="${k === on}" data-kit-tb-mode="${k}">${ic}${l}</button>`).join("")}</div>`;
const bubble = (q, a, i, typing = false) => `<div class="bt-chat-a${typing ? " is-thinking" : ""}"><span class="bt-chat-av">${boombotIcon(`kit-tb-bb${i}`)}</span><div class="bt-chat-bub"><small>BOOMBOT${i === 0 ? ": this might answer it" : ""}</small><span class="bt-chat-typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="bt-chat-text"><b style="display:block">${q}</b>${a}</span></div></div>`;
const ANSWER = ["Does the leaderboard reset?", "Sample answer: season ranks reset on the 1st of each month; your all-time best never does."];

export function talkbackKitHtml() {
  return `
  <section class="kit-section" id="kit-talkback">
    <h2 class="kit-h">Talk Back dialog (.bt-pills[data-n="3"], .bt-chat-a, .bt-modal--sheet)</h2>
    <p class="kit-p">The pieces of the Talk Back dialog (<span class="kit-code">docs/specs/talk-back.md</span> §4, §5), opened from the page strip's Talk back half or an Ask pin. Its layout is Hotline Boom feature CSS (<span class="kit-code">site/src/styles/talkback.css</span>); everything inside is kit.</p>
    <h3 class="kit-sub">Three-way pill (.bt-pills[data-n="3"])</h3>
    <p class="kit-p">Three columns, rounder-square, smaller text; one pressed (<span class="kit-code">aria-pressed</span>, <span class="kit-code">.is-on</span>). Switching modes keeps the typed text.</p>
    <div style="max-width:540px" data-kit-tb-pills>${pills()}</div>
    <h3 class="kit-sub">BOOMBOT answers (the kit chat, sized for a dialog)</h3>
    <p class="kit-p">Question mode only: from 6 typed characters, up to 2 help entries whose keys appear. A moment of typing dots before each (none under reduced motion), then That answers it.</p>
    <div style="max-width:460px;display:grid;gap:10px" data-kit-tb-chat>${bubble(ANSWER[0], ANSWER[1], 0)}<div class="kit-row"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kit-tb-replay>Replay the typing</button><span class="bt-meta">Not quite? Just send it.</span></div></div>
    <h3 class="kit-sub">Too many, and Sent</h3>
    <div class="kit-row" style="align-items:center;gap:20px;flex-wrap:wrap">
      <div class="bt-notice bt-notice--warn" role="note" style="max-width:420px">You've sent a lot of messages today. You can send another after <b>9:14 AM</b>. Your message is still here.</div>
      ${stampHtml({ kicker: "Hotline", label: "Sent", sub: "BT-4823", tone: "primary" })}
    </div>
    <h3 class="kit-sub">The sheet</h3>
    <div class="kit-row"><button type="button" class="bt-btn bt-btn--primary" data-kit-tb-open>Open a sample sheet</button></div>
  </section>`;
}

export function initTalkbackKit(mount) {
  const sec = mount.querySelector("#kit-talkback");
  if (!sec) return;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wirePills = (root) => root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-kit-tb-mode]"); if (!b) return;
    b.parentElement.querySelectorAll("button").forEach((x) => { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", String(on)); });
  });
  wirePills(sec.querySelector("[data-kit-tb-pills]"));
  const type = (host) => {
    const old = host.querySelector(".bt-chat-a");
    const t = document.createElement("template");
    t.innerHTML = bubble(ANSWER[0], ANSWER[1], 0, !reduced());
    const el = t.content.firstElementChild;
    old.replaceWith(el);
    if (!reduced()) setTimeout(() => { el.classList.remove("is-thinking"); el.querySelector(".bt-chat-text").classList.add("bt-chat-in"); }, 700);
  };
  sec.querySelector("[data-kit-tb-replay]").addEventListener("click", () => type(sec.querySelector("[data-kit-tb-chat]")));
  sec.querySelector("[data-kit-tb-open]").addEventListener("click", () => {
    const m = openModal({ variant: "sheet", feature: "kit-talkback", content: `
      <div style="display:grid;gap:14px">
        <h2 class="bt-modal-title">Ask about Tap the Splat</h2>
        <span class="bt-tag" style="justify-self:start">Boom Arcade › Tap the Splat › Leaderboard</span>
        ${pills()}
        <textarea class="bt-textarea" aria-label="Your question" maxlength="5000">Does the leaderboard reset every season?</textarea>
        <div style="display:grid;gap:10px" data-chat>${bubble(ANSWER[0], ANSWER[1], 0)}<div class="kit-row"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-solved>That answers it</button><span class="bt-meta">Not quite? Just send it.</span></div></div>
        <label class="bt-check"><input type="checkbox">Only Boomertanger should read this</label>
        <div class="kit-row" style="justify-content:flex-end"><button type="button" class="bt-btn bt-btn--ghost" data-bt-close>Close</button><button type="button" class="bt-btn bt-btn--primary" data-send>Send</button></div>
      </div>` });
    wirePills(m.modal);
    type(m.modal.querySelector("[data-chat]"));
    m.modal.querySelector("[data-solved]").addEventListener("click", () => { toast("Glad BOOMBOT could help. Nothing was sent."); m.close(); });
    m.modal.querySelector("[data-send]").addEventListener("click", () => { m.modal.innerHTML = `<div style="display:grid;justify-items:center;gap:12px;text-align:center">${stampHtml({ kicker: "Hotline", label: "Sent", sub: "BT-4823", tone: "primary" })}<h2 class="bt-modal-title">Got it, thanks!</h2><p class="bt-meta">The reply will land in your alerts, usually within 3 days. Filed under Tap the Splat › Leaderboard.</p><button type="button" class="bt-btn bt-btn--primary" data-bt-close>Back to the page</button></div>`; });
  });
}
