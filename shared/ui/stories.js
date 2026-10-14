// shared/ui/stories.js — .bt-stories: a small stories carousel (docs/design-system.md §5 "Stories"; the Game Vault's film strip spotlight,
// docs/design/mockups/game-vault-film-strip.html D3b / M1 and game-vault-tablet-phone-search.html T2). The caller passes the items and draws
// each one's poster (and, optionally, its details); this draws the frame and runs it:
//
//   <div class="bt-stories bt-stories--square|--row" role="region" aria-roledescription="carousel" aria-label="…">
//     <div class="bt-stories-stage">…render(item)…</div>                    the current item's poster (fades between items; swipe it)
//     <div class="bt-stories-picks">                                        one small cover per item, each with its progress ring:
//       <button class="bt-stories-pick [bt-stories-pick--green]" aria-label="Show …">…thumb(item)…<svg class="bt-stories-ring">…</svg></button>…
//     </div>
//     <div class="bt-stories-details">…details(item)…</div>                 optional: the badge, title, buttons (fades with the poster)
//     <span class="bt-sr-only" aria-live="polite"></span>                   announces manual changes only, never the auto ones
//   </div>
//
//   const s = initStories(host, { items, render, details, thumb, label, tone, name, layout, duration = 5000, reduced, paused, onShow })
//     items     the list (any shape)               render(item, i) -> HTML for the poster stage
//     details(item, i) -> HTML for the details     thumb(item, i) -> HTML for its small cover
//     label(item) -> its name ("Show <label>"; also what is announced)
//     tone(item) -> "green" for a green ring (the game Boomer is playing); gold otherwise
//     layout    "square" (the small covers in a 2 x 2 square; default) or "row" (one row)
//     name      the region's aria-label            onShow(item, i, { manual }) after an item is shown (wire its buttons here)
//     reduced   force reduced motion (the UI Kit)  paused  start paused (the UI Kit)
//   s.go(i, { manual })  s.pause(reason, on)  s.update(items)  s.destroy()   -> pause reasons stack ("touch", "search", …)
//
// Behaviour: a thin ring draws around the current small cover over 5 s, then the next item fades in (and round again); tapping a small cover
// jumps to it; swiping left or right on the poster changes it; it pauses while touched, hovered or focused, while the tab is hidden, and for
// any caller reason. One item: just the poster and its details (no small covers, no auto-advance). Reduced motion (or reduced: true): no
// auto-advance and no fade; the current small cover has the full ring; the small covers and swipe still work. The caller places the stage,
// the picks and the details (a grid on the host): the kit only sets the square or the row of small covers and the ring.

const reduceMq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
// The ring: a rounded rectangle just outside the small cover; pathLength 100, so the dash offset is the share still to draw (--bt-ring 0..1).
const RING = `<svg class="bt-stories-ring" viewBox="0 0 100 133" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect x="1" y="1" width="98" height="131" rx="9" pathLength="100" vector-effect="non-scaling-stroke"/></svg>`;

export function initStories(host, { items = [], render, details, thumb, label = (x) => String(x), tone, name = "Stories", layout = "square", duration = 5000, reduced, paused = false, onShow } = {}) {
  if (!host) return null;
  host._stories?.destroy();
  let list = [...items];
  let cur = 0, elapsed = 0, last = 0, raf = 0, destroyed = false, swipeX = null;
  const reasons = new Set(paused ? ["kit"] : []);
  if (paused) host.classList.add("is-paused");
  const isReduced = () => reduced ?? !!reduceMq?.matches;

  host.classList.add("bt-stories", layout === "row" ? "bt-stories--row" : "bt-stories--square");
  host.setAttribute("role", "region");
  host.setAttribute("aria-roledescription", "carousel");
  host.setAttribute("aria-label", name);

  const draw = () => {
    const many = list.length > 1;
    host.classList.toggle("bt-stories--single", !many);
    const picks = many ? `<div class="bt-stories-picks">${list.map((it, i) => `<button type="button" class="bt-stories-pick${tone?.(it) === "green" ? " bt-stories-pick--green" : ""}" data-pick="${i}" aria-label="Show ${escAttr(label(it))}">${thumb ? thumb(it, i) : ""}${RING}</button>`).join("")}</div>` : "";
    host.innerHTML = `<div class="bt-stories-stage"></div>${picks}${details ? `<div class="bt-stories-details"></div>` : ""}<span class="bt-sr-only" aria-live="polite" data-stories-say></span>`;
  };
  const stage = () => host.querySelector(".bt-stories-stage");
  const info = () => host.querySelector(".bt-stories-details");
  const picks = () => [...host.querySelectorAll(".bt-stories-pick")];
  // the current cover's ring at p (0..1), the others empty; reduced motion: the current one full
  const paint = (p = 0) => picks().forEach((b, j) => b.style.setProperty("--bt-ring", String(j === cur ? (isReduced() ? 1 : p) : 0)));

  const show = (i, { manual = false } = {}) => {
    if (!list.length) return;
    cur = ((i % list.length) + list.length) % list.length;
    elapsed = 0;
    const st = stage(), dt = info();
    const put = () => {
      st.innerHTML = render(list[cur], cur);
      if (dt) dt.innerHTML = details(list[cur], cur);
      st.classList.remove("is-out"); dt?.classList.remove("is-out");
      picks().forEach((b, j) => { b.classList.toggle("is-on", j === cur); b.setAttribute("aria-current", j === cur ? "true" : "false"); });
      paint(0);
      if (manual) host.querySelector("[data-stories-say]").textContent = `${label(list[cur])}, ${cur + 1} of ${list.length}`;
      onShow?.(list[cur], cur, { manual });
    };
    if (isReduced() || !st.innerHTML) put();
    else { st.classList.add("is-out"); dt?.classList.add("is-out"); setTimeout(() => { if (!destroyed) put(); }, 300); }
  };

  const tick = (now) => {
    if (destroyed) return;
    const dt = last ? now - last : 0;
    last = now;
    if (list.length > 1 && !isReduced() && !reasons.size && !document.hidden) {
      elapsed += dt;
      const p = Math.min(1, elapsed / duration);
      paint(p);
      if (p >= 1) show(cur + 1);
    }
    raf = requestAnimationFrame(tick);
  };

  // pauses: touched, hovered or focused (the frame's own), hidden tab (checked in tick), and the caller's reasons
  const on = (r) => () => { reasons.add(r); };
  const off = (r) => () => { reasons.delete(r); };
  const enter = on("hover"), leave = off("hover"), fin = on("focus");
  const fout = (e) => { if (!host.contains(e.relatedTarget)) reasons.delete("focus"); };
  const down = (e) => { reasons.add("touch"); if (e.target.closest(".bt-stories-stage")) swipeX = e.clientX; };
  const up = (e) => {
    reasons.delete("touch");
    if (swipeX != null && list.length > 1) { const dx = e.clientX - swipeX; if (Math.abs(dx) > 30) show(cur + (dx < 0 ? 1 : -1), { manual: true }); }
    swipeX = null;
  };
  const cancel = () => { reasons.delete("touch"); swipeX = null; };
  const click = (e) => { const b = e.target.closest(".bt-stories-pick"); if (b && host.contains(b)) show(+b.dataset.pick, { manual: true }); };
  host.addEventListener("pointerenter", enter);
  host.addEventListener("pointerleave", leave);
  host.addEventListener("focusin", fin);
  host.addEventListener("focusout", fout);
  host.addEventListener("pointerdown", down);
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", cancel);
  host.addEventListener("click", click);

  draw();
  show(0);
  raf = requestAnimationFrame(tick);

  const api = {
    go: (i, o) => show(i, o),
    pause: (reason, flag = true) => {
      if (flag) reasons.add(reason); else reasons.delete(reason);
      host.classList.toggle("is-paused", [...reasons].some((r) => !["hover", "focus", "touch"].includes(r)));   // the caller's reasons (search, the kit)
    },
    update: (next) => { const keep = list[cur]; list = [...next]; draw(); const at = list.indexOf(keep); show(at >= 0 ? at : 0); },
    get index() { return cur; },
    destroy: () => {
      destroyed = true; cancelAnimationFrame(raf);
      for (const [t, f] of [["pointerenter", enter], ["pointerleave", leave], ["focusin", fin], ["focusout", fout], ["pointerdown", down], ["pointerup", up], ["pointercancel", cancel], ["click", click]]) host.removeEventListener(t, f);
      host.classList.remove("bt-stories", "bt-stories--square", "bt-stories--row", "bt-stories--single", "is-paused");
      host.innerHTML = "";
      host._stories = null;
    },
  };
  host._stories = api;
  return api;
}

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
