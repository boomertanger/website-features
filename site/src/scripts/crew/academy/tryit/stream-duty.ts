// Try it for module 4 "Stream duty": Pass the lantern, the working handoff example. You lead Twitch and step away
// for 5, 15 or 30 minutes, or for the night. Deckhands are asked; the first to accept carries the lead; Gears follow
// the minutes. If nobody is free the Captain is pinged. Local only: nothing is saved or sent (docs/specs/crew-academy.md §4).
// Built standalone here; the How it works page has its own copy of the idea.
import { mountShell, esc } from "../tryit1-kit";
import { roomHtml } from "../../../../../../shared/ui/crew.js";

const HANDS = ["Moss", "Ivy", "Rex"];
const AWAY: [number, string][] = [[5, "5 minutes"], [15, "15 minutes"], [30, "30 minutes"], [0, "Done for the night"]];
type Phase = "lead" | "asking" | "covered" | "pinged" | "back";

export default function init(root: HTMLElement): void {
  const { body, done } = mountShell(root, "Pass the lantern", "You lead Twitch. Step away and watch who picks the lantern up.");
  let phase: Phase = "lead";
  let mins = 0;
  let night = false;
  let nobody = false;
  let taker = "";
  let timer = 0;
  let ticker = 0;
  let elapsed = 0;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stop = () => { clearTimeout(timer); clearInterval(ticker); };

  function seat() {
    const state = phase === "lead" || phase === "back" ? "covered" : phase === "asking" || phase === "pinged" ? "needed" : "covered";
    const text = phase === "lead" ? "you're leading" : phase === "back" ? "you're leading" : phase === "asking" ? "asking Deckhands" : phase === "pinged" ? "Captain pinged" : `${taker} leads`;
    return roomHtml({ chat: "twitch", name: "Twitch", state, text } as any);
  }

  function render() {
    const gears = phase === "covered" && !night ? Math.min(mins, elapsed) : 0;
    const lantern = phase === "covered" ? taker : phase === "pinged" ? "Captain" : phase === "asking" ? "in the air" : "you";
    let main = "";
    if (phase === "lead" || phase === "back") {
      main = `<div class="ta1-ctl"><p class="ta1-h" id="ta1-away">Step away for</p><div class="ta1-seg" role="group" aria-labelledby="ta1-away">${AWAY.map(([m, n]) => `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-away="${m}">${esc(n)}</button>`).join("")}</div>`
        + `<label class="ta1-check"><input type="checkbox" data-nobody${nobody ? " checked" : ""}> Pretend no Deckhand is free</label></div>`;
    } else if (phase === "asking") {
      main = `<p class="ta1-h">Asking the Deckhands</p><ul class="ta1-list">${HANDS.map((h) => `<li class="ta1-ask" data-s="wait"><span class="ta1-av" aria-hidden="true">${esc(h[0])}</span><b>${esc(h)}</b><span class="ta1-st">Asked</span></li>`).join("")}</ul>`;
    } else if (phase === "covered") {
      main = `<div class="ta1-handoff"><span class="ta1-lantern" aria-hidden="true">&#128294;</span><div><b>${esc(taker)} has the lantern</b><p>${night ? `${esc(taker)} leads Twitch for the rest of the night.` : `${esc(taker)} leads Twitch until you're back. Their Gears follow the minutes they lead: ${gears} so far in this example.`}</p></div></div>`
        + `<div class="ta1-row">${night ? `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-reset>Start over</button>` : `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-back>I'm back</button>`}</div>`;
    } else if (phase === "pinged") {
      main = `<div class="ta1-handoff"><span class="ta1-lantern" aria-hidden="true">&#128294;</span><div><b>The Captain was pinged</b><p>No Deckhand was free, so Captain Sol gets a ping and covers Twitch until someone can. Every chat always has someone watching.</p></div></div><div class="ta1-row"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-back>I'm back</button></div>`;
    }
    body.innerHTML = `<div class="ta1-seat">${seat()}<span class="ta1-lt" data-p="${phase}">Lantern: ${esc(lantern)}</span></div>${main}`;
    const fin = phase === "back" || (phase === "covered" && night);
    done.hidden = !fin;
    if (fin) done.innerHTML = `<b>${night ? "Lantern handed on" : "Handed back"}</b><p>That's the loop: step away, someone picks up the lantern, you return and take it back. In the Mod Deck it's the Step away button.</p><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-reset>Try another</button>`;
  }

  function go(m: number) {
    stop();
    mins = m; night = m === 0; elapsed = 0; phase = "asking"; taker = "";
    render();
    const wait = reduced() ? 300 : 1400;
    timer = window.setTimeout(() => {
      if (nobody) { phase = "pinged"; render(); body.querySelector<HTMLElement>("[data-back]")?.focus(); return; }
      // first to accept wins: Ivy answers first in this example
      taker = "Ivy"; phase = "covered";
      render();
      body.querySelector<HTMLElement>("[data-back], [data-reset]")?.focus();
      if (!night) ticker = window.setInterval(() => { elapsed = Math.min(mins, elapsed + 1); const p = body.querySelector<HTMLElement>(".ta1-handoff p"); if (p) p.textContent = `${taker} leads Twitch until you're back. Their Gears follow the minutes they lead: ${elapsed} so far in this example.`; if (elapsed >= mins) clearInterval(ticker); }, reduced() ? 200 : 600);
    }, wait);
    // the asked Deckhands answer one by one
    if (!nobody) {
      const asks = () => body.querySelectorAll<HTMLElement>(".ta1-ask");
      window.setTimeout(() => { const a = asks()[0]; if (a && phase === "asking") { a.dataset.s = "no"; a.querySelector(".ta1-st")!.textContent = "Busy"; } }, wait * 0.4);
      window.setTimeout(() => { const a = asks()[1]; if (a && phase === "asking") { a.dataset.s = "yes"; a.querySelector(".ta1-st")!.textContent = "Accepted"; } }, wait * 0.75);
    }
  }

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const away = t.closest<HTMLButtonElement>("[data-away]");
    if (away) { go(Number(away.dataset.away)); return; }
    if (t.closest("[data-back]")) { stop(); phase = "back"; render(); done.querySelector<HTMLElement>("[data-reset]")?.focus(); return; }
    if (t.closest("[data-reset]")) { stop(); phase = "lead"; render(); body.querySelector<HTMLElement>("[data-away]")?.focus(); }
  });
  root.addEventListener("change", (e) => {
    const c = (e.target as HTMLElement).closest<HTMLInputElement>("[data-nobody]");
    if (c) nobody = c.checked;
  });
  render();
}
