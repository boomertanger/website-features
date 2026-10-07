// Try it for module 6 "Tools": a mini Mod Deck. Clock in, step away, post a cue, copy the code; each step lights up
// when done. Local only (docs/specs/crew-academy.md §6).
import { mountShell, esc, copyText } from "../tryit-kit";
import { roomHtml } from "../../../../../../shared/ui/crew.js";
import { toast } from "../../../../../../shared/ui/toast.js";

const CODE = "BOOM-7K2";
const CUE = "The light in the hallway was never on. Who turned it on?";

export default function init(root: HTMLElement): void {
  const { body, done } = mountShell(root, "a mini Deck", "Clock in, step away, post a cue and copy the code. Each step lights up when you finish it.");
  const st = { in: false, away: 0, back: false, cue: false, code: false };
  let focusSel = "";

  const stage = () => (!st.in ? 0 : !st.back ? 1 : !st.cue ? 2 : !st.code ? 3 : 4);
  const doneAll = () => stage() === 4;

  function step(i: number, title: string, sub: string, inner: string) {
    const s = stage() > i ? "done" : stage() === i ? "now" : "wait";
    return `<li class="ta2-step" data-s="${s}"><div class="ta2-step-h"><span class="ta2-tick" aria-hidden="true">&#10003;</span><span>${i + 1}. ${esc(title)}</span>`
      + `<span class="bt-sr-only">${s === "done" ? " (done)" : s === "now" ? " (your turn)" : " (locked until the step before)"}</span></div>`
      + `<p class="ta2-step-sub">${esc(sub)}</p>${inner}</li>`;
  }

  function statusHtml() {
    if (st.in && st.away && !st.back) return `<div class="ta2-status" data-s="away"><b>Away for ${st.away} min</b>Your seat shows gold so the Captain can cover it. Press I'm back when you return.</div>`;
    if (st.in) return `<div class="ta2-status" data-s="on"><b>On the clock</b>You're covering Twitch.</div>`;
    return `<div class="ta2-status" data-s="off"><b>Off the clock</b>Press Clock in to start.</div>`;
  }

  function render() {
    const s = stage();
    const away = st.in && st.away && !st.back;
    const seatState = !st.in ? "off" : away ? "needed" : "covered";
    const seatText = !st.in ? "off the clock" : away ? "away" : "you're here";
    body.innerHTML = `<div class="ta2-deck"><div class="ta2-bar"><span class="ta2-bar-name">Mod Deck</span><span class="ta2-seat">${roomHtml({ chat: "twitch", name: "Your seat: Twitch", state: seatState, text: seatText })}</span></div>`
      + `<div class="ta2-deck-main"><ol class="ta2-steps">`
      + step(0, "Clock in", "Press this when you sit down for stream duty.", `<div class="ta2-row"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-act="in"${s === 0 ? "" : " disabled"}>Clock in</button></div>`)
      + step(1, "Step away", "Need a break? Say how long, so the Captain knows. Then come back.",
        `<div class="ta2-row" role="group" aria-label="Step away for">${[5, 15, 30].map((m) => `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="away" data-m="${m}"${s === 1 && !st.away ? "" : " disabled"}>${m} min</button>`).join("")}`
        + `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-act="back"${s === 1 && st.away ? "" : " disabled"}>I'm back</button></div>`)
      + step(2, "Post your cue", "When a Chat Game cue is due, post it exactly as written, then press Posted.",
        `<div class="ta2-cue"><span class="bt-meta">Dead Air, clue 2 for your chat</span><q>${esc(CUE)}</q></div><div class="ta2-row"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-act="cue"${s === 2 ? "" : " disabled"}>Posted</button></div>`)
      + step(3, "Copy the code", "Your chat's check-in code is in Quick lines. Copy it and drop it in chat.",
        `<div class="ta2-row"><span class="bt-code ta2-code">${esc(CODE)}</span><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-act="code"${s === 3 ? "" : " disabled"}>Copy the code</button></div>`)
      + `</ol><div class="ta2-side">${statusHtml()}<span class="bt-meta">The real Deck also has the chat wall, Quick lines and Flag the Captain.</span></div></div></div>`;
    done.hidden = !doneAll();
    if (doneAll()) {
      done.innerHTML = `<b>You're ready</b><p>That's the loop: clock in, step away when you need to, post your cues, share the code. The real Deck works the same way.</p><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="reset">Reset</button>`;
    }
    if (focusSel) { (root.querySelector<HTMLElement>(focusSel) ?? null)?.focus(); focusSel = ""; }
  }

  const act = async (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case "in": st.in = true; focusSel = '[data-act="away"]'; break;
      case "away": st.away = Number(b.dataset.m); focusSel = '[data-act="back"]'; break;
      case "back": st.back = true; focusSel = '[data-act="cue"]'; break;
      case "cue": st.cue = true; focusSel = '[data-act="code"]'; toast("Marked as posted. Now hype it in chat."); break;
      case "code": {
        st.code = true; focusSel = '[data-act="reset"]';
        const ok = await copyText(CODE);
        toast(ok ? `Copied ${CODE}` : `Couldn't copy here. Select ${CODE} and copy it yourself.`, { kind: ok ? "ok" : "info" });
        break;
      }
      case "reset": st.in = false; st.away = 0; st.back = false; st.cue = false; st.code = false; focusSel = '[data-act="in"]'; break;
    }
    render();
  };
  root.addEventListener("click", act);
  render();
}
