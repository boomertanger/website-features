// shared/ui/chat.js — .bt-chat, Ask BOOMBOT (docs/design-system.md §5 "Chat"): one answer open at a
// time (whichever has aria-expanded="true" in the HTML starts open). Opening one shows 650 ms of
// "typing" (visual only: the answer is in the HTML and only visually hidden while the dots show),
// with BOOMBOT's eyes scanning and antenna blinking (.is-thinking). Skipped under reduced motion.
//
//   initChat(root)   wires every button.bt-chat-q (aria-controls -> its .bt-chat-a)

const THINK_MS = 650;

export function initChat(root = document) {
  const questions = [...root.querySelectorAll(".bt-chat-q:not([data-chat-ready])")];
  if (!questions.length) return;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let typing = 0;
  questions.forEach((q) => {
    q.dataset.chatReady = "";
    q.addEventListener("click", () => {
      const opening = q.getAttribute("aria-expanded") !== "true";
      clearTimeout(typing);
      questions.forEach((other) => {
        const on = opening && other === q;
        other.setAttribute("aria-expanded", String(on));
        const a = document.getElementById(other.getAttribute("aria-controls"));
        if (!a) return;
        a.hidden = !on;
        a.classList.remove("is-thinking");
        if (!on) return;
        const text = a.querySelector(".bt-chat-text");
        text?.classList.remove("bt-chat-in");
        if (reduced()) return;
        a.classList.add("is-thinking");
        typing = window.setTimeout(() => { a.classList.remove("is-thinking"); text?.classList.add("bt-chat-in"); }, THINK_MS);
      });
    });
  });
}
