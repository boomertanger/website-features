// shared/ui/wordmark.js — behavior for .bt-wordmark--power (docs/design-system.md §5): on
// touch screens there's no hover, so each power wordmark plays its lit state (.is-lit) once,
// the first time it scrolls into view, then settles back. Mouse and keyboard users get it
// from :hover / :focus-visible in the CSS. Reduced motion: the CSS already drops the sheen
// and the wiggle, so the word just lights up briefly.
//
//   initPowerWordmarks(root)

const LIT_MS = 1800;   // long enough for the sheen to cross once

export function initPowerWordmarks(root = document) {
  if (!matchMedia("(hover: none)").matches) return;
  const marks = [...root.querySelectorAll(".bt-wordmark--power")];
  if (!marks.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      e.target.classList.add("is-lit");
      setTimeout(() => e.target.classList.remove("is-lit"), LIT_MS);
    });
  }, { threshold: 0.6 });
  marks.forEach((m) => io.observe(m));
}
