// site/src/scripts/not-found/page.js — the 404 page's left column (docs/specs/not-found.md "Page content"): the path line,
// Did you mean, the live-state swap on the ways forward, the report button and the caption. Everything here is extra: the
// page's text and links work without it. The path shown is location.pathname only (never the query or hash: they can hold
// sign-in codes), set with textContent, never as markup. It then starts the scene (room.js).

const TRIM_WIDE = 56, TRIM_PHONE = 34;   // characters; phone = the bt container at 640 px or less

/** "/a/very/long/path" shortened in the middle to n characters. */
export function trimMiddle(s, n) {
  if (s.length <= n) return s;
  const head = Math.ceil((n - 1) / 2), tail = Math.floor((n - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}

/** Levenshtein distance (insert, delete, substitute; 1 each). */
export function distance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

const near = (a, b) => distance(a, b) <= Math.max(2, Math.floor(a.length * 0.25));
const clean = (p) => { let s = p.toLowerCase(); try { s = decodeURIComponent(s); } catch { /* keep it as typed */ } return s.length > 1 ? s.replace(/\/+$/, "") : s; };

/**
 * The best known page for a path that doesn't exist, or null. Close on the whole path (distance ≤ max(2, 25% of its
 * length)), or the same path with one segment a typo of the known one's (same rule on that segment). Best match only.
 */
export function didYouMean(path, routes) {
  const p = clean(path);
  if (p === "/" || !p.startsWith("/")) return null;
  let best = null, bestD = Infinity;
  for (const r of routes) {
    if (r === "/") continue;
    if (r === p) return path === r ? null : r;   // only the case or a trailing slash was off
    const d = distance(p, r);
    if (d < bestD && near(p, r)) { best = r; bestD = d; }
  }
  if (best) return best;
  const segs = p.split("/");
  for (const r of routes) {
    const rs = r.split("/");
    if (rs.length !== segs.length) continue;
    const diff = rs.map((s, i) => i).filter((i) => rs[i] !== segs[i]);
    if (diff.length === 1 && segs[diff[0]].length >= 3 && near(segs[diff[0]], rs[diff[0]])) {
      const d = distance(segs[diff[0]], rs[diff[0]]);
      if (d < bestD) { best = r; bestD = d; }
    }
  }
  return best;
}

export function initNotFound() {
  const root = document.querySelector("[data-nf]");
  if (!root) return;
  const path = location.pathname || "/";

  // The path line, shortened to fit (56 characters wide, 34 on phones; re-measured when the column resizes).
  const miss = root.querySelector("[data-nf-miss]"), code = root.querySelector("[data-nf-path]");
  if (path !== "/" && path !== "/404" && path !== "/404.html") {
    code.title = path;
    const fit = () => { code.textContent = trimMiddle(path, root.clientWidth <= 640 ? TRIM_PHONE : TRIM_WIDE); };
    fit(); new ResizeObserver(fit).observe(root);
    miss.hidden = false;
  }

  // Did you mean
  try {
    const routes = JSON.parse(document.querySelector("[data-nf-routes]")?.textContent || "[]");
    const hit = didYouMean(path, routes);
    if (hit) { const a = root.querySelector("[data-nf-dym-link]"); a.href = hit; a.textContent = hit; root.querySelector("[data-nf-dym]").hidden = false; }
  } catch { /* no suggestion */ }

  // While live (data-live public or backstage): "Watch Boomer live" leads, Take me home steps down to secondary
  // (the Watch and Live buttons swap with .bt-when-live / .bt-when-off in CSS).
  const home = root.querySelector("[data-home]");
  const syncLive = () => {
    const live = ["public", "backstage"].includes(document.body.dataset.live || "") && !!root.querySelector(".nf-watch");
    home.classList.toggle("bt-btn--primary", !live);
    home.classList.toggle("bt-btn--secondary", live);
  };
  syncLive();
  new MutationObserver(syncLive).observe(document.body, { attributes: true, attributeFilter: ["data-live"] });

  initReport(root, path);

  // The caption under the buttons says how the firefly moves here.
  const cap = root.querySelector("[data-nf-cap]");
  cap.querySelector("[data-cap]").textContent = reducedMotion() ? "The firefly's resting. Nothing moves."
    : inputKind() === "touch" ? "Tap the dark to send the firefly." : "The firefly follows your mouse. Leave it and it wanders.";
  cap.hidden = false;

  // The scene (its own chunk: the art and the engine load after the text is up).
  import("./room.js").then((m) => m.startRoom(root, { input: inputKind(), reduced: reducedMotion() })).catch(() => { /* the dark panel stays */ });
}

/** "touch" when the main pointer is coarse (phones, tablets), else "mouse". */
export const inputKind = () => (matchMedia("(pointer: coarse)").matches ? "touch" : "mouse");
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Report this broken link: ready → Reporting… → Reported. Thanks! (remembered for the session) / Couldn't send. ----
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';

function initReport(root, path) {
  const box = root.querySelector("[data-nf-report]"), btn = root.querySelector("[data-report]"), hint = root.querySelector("[data-report-hint]");
  if (!box || path === "/404" || path === "/404.html") return;
  const key = `nf:reported:${path}`;
  const ready = btn.innerHTML;
  const done = () => {
    btn.disabled = true; btn.classList.add("is-done"); btn.innerHTML = `${CHECK}<span>Reported. Thanks!</span>`;
    hint.textContent = "It's on the list to fix.";
  };
  let seen = false;
  try { seen = sessionStorage.getItem(key) === "1"; } catch { /* storage blocked */ }
  if (seen) done();
  box.hidden = false;
  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    btn.disabled = true; btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span><span>Reporting…</span>`;
    try {
      await sendReport(path);
      try { sessionStorage.setItem(key, "1"); } catch { /* storage blocked */ }
      done();
    } catch {
      btn.disabled = false; btn.innerHTML = ready;
      btn.querySelector("span").textContent = "Couldn't send. Try again.";
    } finally { btn.removeAttribute("aria-busy"); }
  });
}

/** Sends the path (and the referrer; the server keeps only its host). Wired to reportBrokenLink in part 5. */
async function sendReport(_path) {
  throw new Error("not wired yet");
}
