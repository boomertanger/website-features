// site/src/scripts/base-camp/newfoundland.ts — /base-camp/newfoundland (docs/specs/base-camp.md "Page 2"). Wires the built page: the live clocks (real
// America/St_Johns time, the offset from the viewer, the world clocks; every 15 seconds), the word of the day and the iceberg season's "Now" month
// (both set here, so a page built yesterday is still right today), pins and legend lighting each other, the rock layers, Split the continents,
// the iceberg / dog / pony scenes (hover, focus or a tap), the war bar and the Gander counters when they're seen, the arrivals cards playing on
// touch screens while in view, the flip cards, and BOOMBOT's chat. Reduced motion: no counting, no play-on-scroll (the CSS stills the scenes).
// Chapter 06 (Kind words, [data-kind-words="newfoundland"]) is mounted by the Kind Words engine, not here.
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { RM } from "./ui";
import { TZ, fmtTime, tzAbbr, offsetMin, fmtOff, diffText, wordOfDay, seasonLine } from "./newfoundland-data";

const page = document.querySelector<HTMLElement>("[data-nl-page]");
if (page) init(page);

function init(root: HTMLElement) {
  initHowItWorks(root as unknown as Document);
  initFlipCards(root);

  // ---- clocks ----
  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tick = () => {
    const now = new Date(), home = offsetMin(TZ, now);
    root.querySelectorAll<HTMLElement>("[data-nl-time]").forEach((e) => (e.textContent = fmtTime(TZ, now)));
    root.querySelectorAll<HTMLElement>("[data-nl-abbr]").forEach((e) => (e.textContent = tzAbbr(TZ, now)));
    root.querySelectorAll<HTMLElement>("[data-nl-off]").forEach((e) => (e.textContent = fmtOff(home)));
    root.querySelectorAll<HTMLElement>("[data-nl-diff]").forEach((e) => (e.textContent = diffText(home - offsetMin(viewerTz, now))));
    root.querySelectorAll<HTMLElement>("[data-z]").forEach((e) => (e.textContent = fmtTime(e.dataset.z!, now)));
    root.querySelectorAll<HTMLElement>("[data-zd]").forEach((e) => {
      const d = home - offsetMin(e.dataset.zd!, now), h = Math.floor(d / 60), m = d % 60;
      e.textContent = `${h ? `${h} h ` : ""}${m ? `${m} min ` : ""}behind the Rock`;
    });
  };
  tick();
  setInterval(tick, 15000);

  // ---- the word of the day and the season's "Now" ----
  const wotd = wordOfDay();
  const ww = root.querySelector<HTMLElement>("[data-nl-wotd-w]"), wm = root.querySelector<HTMLElement>("[data-nl-wotd-m]"), wx = root.querySelector<HTMLElement>("[data-nl-wotd-x]");
  if (ww && wm) { ww.textContent = wotd.word; wm.textContent = wotd.meaning; }
  if (wx) wx.textContent = wotd.example;
  const mo = new Date().getMonth();
  root.querySelectorAll<HTMLElement>(".nl-mo").forEach((e, i) => e.classList.toggle("is-now", i === mo));
  const sl = root.querySelector<HTMLElement>("[data-nl-season]");
  if (sl) sl.innerHTML = seasonLine(mo);

  // ---- pins and legend light each other ----
  root.querySelectorAll<HTMLElement>(".nl-chartwrap").forEach((wrap) => {
    const on = (n: string, v: boolean) => wrap.querySelectorAll(`[data-pin="${n}"], [data-leg="${n}"]`).forEach((e) => e.classList.toggle("is-on", v));
    wrap.querySelectorAll<HTMLElement>("[data-pin], [data-leg]").forEach((e) => {
      const n = e.dataset.pin || e.dataset.leg!;
      e.addEventListener("pointerenter", () => on(n, true)); e.addEventListener("pointerleave", () => on(n, false));
      e.addEventListener("focus", () => on(n, true)); e.addEventListener("blur", () => on(n, false));
    });
  });

  // ---- the rock layers, Pangaea, the tap scenes ----
  root.querySelectorAll<HTMLElement>(".nl-layer").forEach((l) => {
    const open = () => { l.parentElement!.querySelectorAll(".nl-layer").forEach((o) => o !== l && o.classList.remove("is-open")); l.classList.toggle("is-open"); };
    l.addEventListener("click", open);
    l.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-split]").forEach((b) => b.addEventListener("click", () => {
    const p = b.closest<HTMLElement>("[data-pangaea]")!;
    const split = p.classList.toggle("is-split");
    b.textContent = split ? "Put them back" : "Split the continents";
    b.setAttribute("aria-pressed", String(split));
  }));
  root.querySelectorAll<HTMLElement>("[data-tap]").forEach((b) => {
    b.addEventListener("click", () => b.classList.toggle("is-on"));
    b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); b.classList.toggle("is-on"); } });
  });

  // ---- moments when they're seen ----
  const once = (sel: string, fn: (el: HTMLElement) => void, th = 0.45) => root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); fn(el); } }, { threshold: th });
    io.observe(el);
  });
  once("[data-gap]", (el) => el.classList.add("is-run"));
  once("[data-gander]", (el) => {
    el.classList.add("is-run");
    el.querySelectorAll<HTMLElement>("[data-to]").forEach((b) => {
      const to = +b.dataset.to!, pre = b.dataset.pre || "";
      if (RM()) { b.textContent = pre + to.toLocaleString("en-US"); return; }
      const t0 = performance.now();
      const st = (now: number) => { const k = Math.min(1, (now - t0) / 1600), e = 1 - Math.pow(1 - k, 3); b.textContent = pre + Math.round(to * e).toLocaleString("en-US"); if (k < 1) requestAnimationFrame(st); };
      requestAnimationFrame(st);
    });
  });
  if (matchMedia("(hover: none)").matches && !RM()) {
    const io = new IntersectionObserver((es) => es.forEach((x) => (x.target as HTMLElement).classList.toggle("is-play", x.isIntersecting)), { threshold: 0.6 });
    root.querySelectorAll(".nl-ex").forEach((el) => io.observe(el));
  }
}
