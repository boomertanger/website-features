// Try it for module 5 "Engagement playbook": Revive this chat. A quiet example chat with three suggested prompts;
// pick one and the example chat answers. Local only (docs/specs/crew-academy.md §5).
import { mountShell, esc, msgHtml } from "../tryit1-kit";

interface Prompt { label: string; line: string; replies: [string, string, number][]; tip: string }
const QUIET: [string, string, number][] = [["Moss", "this hallway is giving me anxiety", 2], ["viewer31", "lol", 4]];
const PROMPTS: Prompt[] = [
  { label: "Make a prediction", line: "Door or vent? Where's the doctor hiding?", replies: [["Ivy", "vent. he always does the vent", 3], ["viewer31", "DOOR. calling it now", 4], ["Moss", "door, but I'm scared of being right", 2], ["nightowl", "vent gang", 1]], tip: "A two-way question is easy to answer in one word. Now let it breathe for 10 to 15 minutes before the next prompt." },
  { label: "Run an emoji poll", line: "Poll time: scared or fine? Drop a 😱 or a 😎", replies: [["Ivy", "😱😱😱", 3], ["viewer31", "😎 (lying)", 4], ["nightowl", "😱", 1], ["Moss", "😎 until the jump scare", 2]], tip: "Polls by emoji cost chat nothing to answer. One poll, then back to the game." },
  { label: "Ask the first-timers", line: "First time watching this game? Say hi, newcomers!", replies: [["viewer31", "first time! hi!!", 4], ["nightowl", "hi, lurker for 2 streams", 1], ["Ivy", "welcome in! stay for the curtain scene", 3]], tip: "New names get a real hello back. Greet each by name, with a bit of context from the stream." },
];

export default function init(root: HTMLElement): void {
  const { body, done } = mountShell(root, "Revive this chat", "Chat's gone quiet. Pick one prompt and see how it answers.");
  let pick = -1;
  const tried = new Set<number>();

  function render() {
    const p = pick >= 0 ? PROMPTS[pick] : null;
    body.innerHTML = `<div class="ta1-chat ta1-chat--tall" role="log" aria-label="Example chat">${QUIET.map(([n, t, c]) => msgHtml(n, t, c)).join("")}<p class="ta1-gap">${p ? "" : "Quiet for 12 minutes"}</p>`
      + (p ? msgHtml("You", p.line, 3, true).replace("ta1-msg", "ta1-msg ta1-msg--you") + p.replies.map(([n, t, c], i) => msgHtml(n, t, c).replace("ta1-msg", `ta1-msg ta1-msg--in" style="--i:${i}`)).join("") : "")
      + `</div>`
      + `<div class="ta1-opts ta1-opts--prompts" role="group" aria-label="Suggested prompts">${PROMPTS.map((q, i) => `<button type="button" class="ta1-opt${pick === i ? " is-right" : ""}" data-p="${i}"><span class="ta1-opt-n" aria-hidden="true">${i + 1}</span><span>${esc(q.label)}<small>${esc(q.line)}</small></span></button>`).join("")}</div>`
      + `<p class="ta1-fb" role="status" data-s="${p ? "ok" : ""}"${p ? "" : " hidden"}>${p ? `<b>Chat's awake.</b> ${esc(p.tip)}` : ""}</p>`
      + (p ? `<div class="ta1-row"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-reset>Back to the quiet chat</button></div>` : "");
    done.hidden = tried.size < 1;
    if (!done.hidden) done.innerHTML = `<b>${tried.size === PROMPTS.length ? "All three tried" : "Chat revived"}</b><p>A single good prompt does more than a pile of them. Ask something chat can answer in a word, then let the stream breathe.${tried.size < PROMPTS.length ? ` Try the other ${PROMPTS.length - tried.size} to compare.` : ""}</p>`;
  }

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLButtonElement>("[data-p]");
    if (b) { pick = Number(b.dataset.p); tried.add(pick); render(); root.querySelector<HTMLElement>(`[data-p="${pick}"]`)?.focus(); }
    else if (t.closest("[data-reset]")) { pick = -1; render(); root.querySelector<HTMLElement>("[data-p]")?.focus(); }
  });
  render();
}
