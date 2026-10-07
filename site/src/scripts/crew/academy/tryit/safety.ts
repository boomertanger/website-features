// Try it for module 9 "Safety": a "Flag or handle?" sorter. Eight chat moments, sorted into Handle with the ladder,
// Ban and flag, or Flag Boomer now. The right sort lives here: it's a local example, not the graded quiz
// (docs/specs/crew-academy.md §2 and §9).
import { mountShell, esc } from "../tryit-kit";

type Sort = "ladder" | "ban" | "boomer";
const SORTS: { id: Sort; label: string }[] = [
  { id: "ladder", label: "Handle with the ladder" },
  { id: "ban", label: "Ban and flag" },
  { id: "boomer", label: "Flag Boomer now" },
];

interface Moment { who: string; ctx: string; text: string; answer: Sort; why: string; say?: string }

const MOMENTS: Moment[] = [
  { who: "nightowl_77", ctx: "Chat while Boomer is mid-game", text: "wait is the ending where she turns around?? I read the whole thing on the wiki lol",
    answer: "ladder", why: "A spoiler is a rule break, but a small one. Start at the bottom: a light public reminder, then warn, then a timeout if it keeps happening. Most people just didn't know." },
  { who: "tiny_streamer", ctx: "A brand-new viewer's first message", text: "love this! come check out my channel twitch.tv/tiny_streamer, I play horror too",
    answer: "ladder", why: "Self-promo isn't allowed, but nearly everyone who does it hasn't read the rules. Remind them kindly. You only go further if it continues." },
  { who: "pixelpup15", ctx: "Chat, a viewer who's said they're in 9th grade", text: "can you DM me? I have a question about being a mod",
    answer: "ladder", why: "Never DM a viewer who's under 18 or might be. Stay friendly: kindly say crew don't DM viewers and keep it in chat. No ban needed, they've done nothing wrong." },
  { who: "xX_hate_Xx", ctx: "Aimed at another viewer", text: "[a slur] go away, nobody wants you here",
    answer: "ban", why: "Hate and slurs skip the ladder. Ban, then flag the Captain and Boomer. Don't argue with them." },
  { who: "free_gift_card_bot", ctx: "Posted in chat, three times", text: "FREE $500 GIFT CARD!!! claim at bit.ly/xxxxxxx before it's gone",
    answer: "ban", why: "Spam bots and scam links go straight to a ban. Flag it so the Captain can check whether more are coming." },
  { who: "angry_dave", ctx: "After someone laughed at his death", text: "I know where you live, I'm going to post your address and phone number here",
    answer: "ban", why: "Threats and doxxing are a ban, and flag it. If personal info does get posted, remove it at once. Never repeat or screenshot it, even to report it." },
  { who: "quiet_ghost", ctx: "A regular, out of the blue", text: "honestly i don't want to be here anymore. nothing matters",
    answer: "boomer",
    why: "Someone in crisis is never a moderation problem. Don't ban, don't argue, don't play therapist. Reply once, kindly, then flag Boomer right away.",
    say: "Hey, we see you and we're glad you're here. If you're in the US you can call or text 988 any time. Boomer's being told." },
  { who: "moth_light", ctx: "Chat, late in the stream", text: "my stepdad is really angry tonight and I don't feel safe at home",
    answer: "boomer",
    why: "Treat it as real, every time. Don't ban and don't question them. Reply once, kindly, then flag Boomer right away. Outside the US, the Captain posts the right local line.",
    say: "Hey, we see you and we're glad you're here. If you're in the US you can call or text 988 any time. Boomer's being told." },
];

export default function init(root: HTMLElement): void {
  const { body, done } = mountShell(root, "Flag or handle?", "Eight moments from chat. Sort each one: handle it with the ladder, ban and flag, or flag Boomer now.");
  let i = 0;
  let score = 0;
  let answered: Sort | null = null;
  const label = (s: Sort) => SORTS.find((x) => x.id === s)!.label;

  function render() {
    done.hidden = true;
    if (i >= MOMENTS.length) return finish();
    const m = MOMENTS[i];
    const fb = answered
      ? `<div class="ta2-fb" data-s="${answered === m.answer ? "right" : "wrong"}"><b>${answered === m.answer ? "Yes." : "Not quite."} ${esc(label(m.answer))}.</b><p>${esc(m.why)}</p>`
        + (m.say ? `<p class="ta2-say">${esc(m.say)}</p>` : "")
        + `<div class="ta2-row"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-next>${i === MOMENTS.length - 1 ? "See your score" : "Next moment"}</button></div></div>`
      : "";
    body.innerHTML = `<div class="ta2-prog"><span>Moment ${i + 1} of ${MOMENTS.length}</span><i><b style="--p:${(i / MOMENTS.length) * 100}%"></b></i></div>`
      + `<div class="ta2-msg"><span class="ta2-msg-av" aria-hidden="true">${esc(m.who.slice(0, 1).toUpperCase())}</span><div><p class="ta2-msg-ctx">${esc(m.ctx)}</p><span class="ta2-msg-who">${esc(m.who)}</span><p class="ta2-msg-t">${esc(m.text)}</p></div></div>`
      + `<div class="ta2-sorts" role="group" aria-label="Sort this moment">${SORTS.map((s) => {
        const cls = answered ? (s.id === m.answer ? " is-right" : s.id === answered ? " is-picked-wrong" : "") : "";
        return `<button type="button" class="ta2-opt${cls}" data-sort="${s.id}"${answered ? " disabled" : ""}>${esc(s.label)}</button>`;
      }).join("")}</div><div aria-live="polite">${fb}</div>`;
    if (answered) body.querySelector<HTMLElement>("[data-next]")?.focus();
  }

  function finish() {
    const msg = score === MOMENTS.length ? "A perfect sort. You know when to go up the ladder and when to skip it."
      : score >= 6 ? "Solid. Give the ones you missed another look in the chapters above."
        : "A good start. These are judgement calls, so re-read the chapters above and try again.";
    body.innerHTML = "";
    done.hidden = false;
    done.innerHTML = `<b>${score} of ${MOMENTS.length} sorted right</b><p>${esc(msg)} When in doubt, flag the Captain and Boomer.</p><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-again>Try again</button>`;
    done.querySelector<HTMLElement>("[data-again]")?.focus();
  }

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const sort = t.closest<HTMLButtonElement>("[data-sort]");
    if (sort && !answered && !sort.disabled) {
      answered = sort.dataset.sort as Sort;
      if (answered === MOMENTS[i].answer) score++;
      render();
    } else if (t.closest("[data-next]")) { i++; answered = null; render(); body.querySelector<HTMLElement>("[data-sort]")?.focus(); }
    else if (t.closest("[data-again]")) { i = 0; score = 0; answered = null; render(); body.querySelector<HTMLElement>("[data-sort]")?.focus(); }
  });
  render();
}
