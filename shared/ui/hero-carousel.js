// shared/ui/hero-carousel.js — stories-style hero carousel (.bt-hero, variation 3B).
//
// Markup (see docs/design-system.md "Hero carousel"):
//   <section class="bt-hero" tabindex="0" aria-label="Highlights">
//     <span class="bt-hero-pin">Pinned while live</span>
//     <div class="bt-hero-viewport"><div class="bt-hero-track">
//       <div class="bt-hero-slide" data-title="Welcome" data-mood="poster">…</div>
//       <div class="bt-hero-slide" data-title="Stream" data-stream>…</div>
//     </div></div>
//   </section>
//
// Slide attributes:
//   data-title     segment label (desktop) and accessible name
//   data-stream    the Stream slide; pinned first while live (live-first)
//   data-starts / data-ends   ISO times; slides outside the window are dropped
//   data-audience  "all" (default) | "visitor" | "signed-in"
//
// Behavior: segment bars fill as each slide plays; pause on mouse hover, on
// keyboard focus inside and while the tab is hidden; swipe; tap the left
// third / right two thirds on narrow screens (never on links or buttons);
// arrow keys; no autoplay under prefers-reduced-motion. Live-first: while the
// state root's data-live isn't "off", it jumps to and pins the Stream slide;
// choosing another slide unpins it.

const INTERACTIVE = "a, button, input, select, textarea, label, [data-no-tap]";
const NARROW_PX = 640; // matches the kit's narrow container breakpoint

/**
 * initHeroCarousel(hero, { duration, stateRoot })
 * hero: the .bt-hero element. duration: ms per slide (default 7000).
 * stateRoot: element carrying data-live / data-auth (default document.body).
 * Returns { go(index), destroy() }.
 */
export function initHeroCarousel(hero, { duration = 7000, stateRoot = document.body } = {}) {
  const track = hero.querySelector(".bt-hero-track");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const signedIn = () => (stateRoot.dataset.auth || "visitor") !== "visitor";
  const now = Date.now();

  // Drop slides outside their time window or meant for another audience.
  [...track.querySelectorAll(".bt-hero-slide")].forEach((s) => {
    const starts = s.dataset.starts ? Date.parse(s.dataset.starts) : -Infinity;
    const ends = s.dataset.ends ? Date.parse(s.dataset.ends) : Infinity;
    const audience = s.dataset.audience || "all";
    const audienceOk = audience === "all" || (audience === "signed-in" ? signedIn() : !signedIn());
    if (now < starts || now > ends || !audienceOk) s.remove();
  });
  const slides = [...track.querySelectorAll(".bt-hero-slide")];
  if (!slides.length) return { go() {}, destroy() {} };

  const streamIdx = slides.findIndex((s) => s.hasAttribute("data-stream"));
  hero.style.setProperty("--bt-hero-dur", `${duration}ms`);
  hero.setAttribute("aria-roledescription", "carousel");
  slides.forEach((s, k) => {
    s.setAttribute("role", "group");
    s.setAttribute("aria-roledescription", "slide");
    s.setAttribute("aria-label", `${k + 1} of ${slides.length}: ${s.dataset.title || ""}`);
  });
  if (reduce) hero.classList.add("is-still");

  // Segment bars
  const bar = document.createElement("div");
  bar.className = "bt-hero-stories";
  const ctl = slides.map((s, k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<span class="bt-hero-bar"><span class="bt-hero-fill"></span></span><span class="bt-hero-lbl"></span>`;
    b.querySelector(".bt-hero-lbl").textContent = s.dataset.title || "";
    b.setAttribute("aria-label", `Show ${s.dataset.title || `slide ${k + 1}`}`);
    if (k === streamIdx) b.classList.add("is-live");
    b.addEventListener("click", () => go(k, true));
    bar.appendChild(b);
    return b;
  });
  if (slides.length > 1) hero.appendChild(bar);

  let i = 0;
  let timer = null;
  let startedAt = 0;
  let remaining = duration;
  let hover = false;
  let focusInside = false;
  let pinned = false;

  const paused = () => hover || focusInside || document.hidden;

  function render() {
    track.style.transform = `translateX(-${i * 100}%)`;
    slides.forEach((s, k) => {
      const on = k === i;
      s.toggleAttribute("inert", !on);
      s.setAttribute("aria-hidden", on ? "false" : "true");
    });
    ctl.forEach((b, k) => {
      b.classList.toggle("is-done", k < i);
      b.classList.remove("is-active");
      b.removeAttribute("aria-current");
    });
    const cur = ctl[i];
    if (cur) {
      void cur.offsetWidth; // restart the fill animation
      cur.classList.add("is-active");
      cur.setAttribute("aria-current", "true");
    }
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    stop();
    hero.classList.toggle("is-paused", paused());
    if (reduce || pinned || slides.length < 2 || paused()) return;
    startedAt = Date.now();
    timer = setTimeout(() => go(i + 1), remaining);
  }

  function pause() {
    if (timer) remaining = Math.max(0, remaining - (Date.now() - startedAt));
    schedule();
  }

  function go(k, user = false) {
    if (pinned && user) {
      pinned = false;
      hero.classList.remove("is-pinned");
    }
    i = (k + slides.length) % slides.length;
    remaining = duration;
    render();
    schedule();
  }

  // Pause: mouse hover, keyboard focus inside, hidden tab.
  const onEnter = (e) => { if (e.pointerType === "mouse") { hover = true; pause(); } };
  const onLeave = (e) => { if (e.pointerType === "mouse") { hover = false; schedule(); } };
  const onFocusIn = () => { focusInside = true; pause(); };
  const onFocusOut = (e) => { if (!hero.contains(e.relatedTarget)) { focusInside = false; schedule(); } };
  const onVisibility = () => (document.hidden ? pause() : schedule());

  // Swipe, and tap zones on narrow screens (left third back, rest forward).
  let startX = null;
  let swiped = false;
  const onDown = (e) => { startX = e.clientX; swiped = false; };
  const onUp = (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) {
      swiped = true;
      go(i + (dx < 0 ? 1 : -1), true);
    }
  };
  const onClick = (e) => {
    if (swiped) { swiped = false; return; }
    if (hero.clientWidth > NARROW_PX || e.target.closest(INTERACTIVE)) return;
    const r = hero.getBoundingClientRect();
    go(i + (e.clientX - r.left < r.width / 3 ? -1 : 1), true);
  };
  const onKey = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1, true); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1, true); }
  };

  hero.addEventListener("pointerenter", onEnter);
  hero.addEventListener("pointerleave", onLeave);
  hero.addEventListener("focusin", onFocusIn);
  hero.addEventListener("focusout", onFocusOut);
  hero.addEventListener("pointerdown", onDown);
  hero.addEventListener("pointerup", onUp);
  hero.querySelector(".bt-hero-viewport").addEventListener("click", onClick);
  hero.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);

  // Live-first: jump to and pin the Stream slide while live.
  function applyLive() {
    const live = (stateRoot.dataset.live || "off") !== "off";
    if (live && streamIdx >= 0) {
      pinned = true;
      hero.classList.add("is-pinned");
      i = streamIdx;
      remaining = duration;
      render();
      stop();
    } else if (!live && pinned) {
      pinned = false;
      hero.classList.remove("is-pinned");
      schedule();
    }
  }
  const observer = new MutationObserver(applyLive);
  observer.observe(stateRoot, { attributes: true, attributeFilter: ["data-live"] });

  render();
  applyLive();
  schedule();

  return {
    go: (k) => go(k, true),
    destroy() {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
