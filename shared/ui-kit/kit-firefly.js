// shared/ui-kit/kit-firefly.js — the ".bt-firefly" section of the UI Kit page (/dev/ui-kit): the firefly (shared/ui/firefly.js FIREFLY_SVG), shared by
// the Tap the Splat footer game and the 404 page's workshop. A dark stage where it drifts on its own (still under reduced motion), and the drawing
// at a larger size so the parts read. ui-kit.js appends fireflyKitHtml() and calls initFireflyKit(mount).
import { FIREFLY_SVG } from "../ui/firefly.js";

export function fireflyKitHtml() {
  return `
  <section class="kit-section" id="kit-firefly">
    <h2 class="kit-h">Firefly (.bt-firefly)</h2>
    <p class="kit-p">One drawing (<span class="kit-code">shared/ui/firefly.js</span>: FIREFLY_SVG) for the footer game's round 2 and the 404 workshop, where it is the only light. Colours are tokens: <span class="kit-code">--bt-firefly</span> (the lamp), <span class="kit-code">--bt-firefly-shell</span>, <span class="kit-code">--bt-firefly-head</span>, <span class="kit-code">--bt-firefly-wing</span>. The lamp's yellow-green is a lamp, never admin green or a status. <span class="kit-code">.bt-firefly</span> adds the glow, the wing flap and the lamp pulse; reduced motion keeps it still.</p>
    <div class="kit-ff-row">
      <div class="kit-ff-stage" data-kit-ff aria-label="The firefly drifting in the dark" role="img"><span class="bt-firefly">${FIREFLY_SVG}</span></div>
      <div class="kit-ff-big" aria-hidden="true">${FIREFLY_SVG}</div>
    </div>
  </section>`;
}

export function initFireflyKit(mount) {
  const stage = mount.querySelector("[data-kit-ff]"), ff = stage && stage.querySelector(".bt-firefly");
  if (!stage || !ff) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { ff.style.transform = "translate(120px, 50px)"; return; }
  let t0 = performance.now();
  const step = (t) => {
    if (!stage.isConnected) return;
    const w = stage.clientWidth - 30, h = stage.clientHeight - 30, s = (t - t0) / 1000;
    const x = w / 2 + Math.sin(s * 0.7) * w * 0.38 + Math.sin(s * 1.9) * 12, y = h / 2 + Math.sin(s * 1.1) * h * 0.32 + Math.cos(s * 2.3) * 8;
    ff.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
