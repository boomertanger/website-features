// The live UI kit (/dev/ui-kit, non-production only): the width switcher, the section
// menu (with the shared kit's own sections added), the token tables read from the real
// CSS variables, and the buttons that drive the page's real footer game, Contact +
// Follow and sign-in dialog. Nothing here records a run: the game is loaded without
// starting one.
import "../../../../shared/ui-kit/ui-kit.js";   // mounts itself on #bt-ui-kit

const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const stage = $("[data-kit-stage]")!;
const nav = $("[data-kit-nav]")!;

// ---- width switcher: the stage is its own "bt" container ----
const readout = $("[data-kit-width-readout]")!;
$("[data-kit-width]")!.addEventListener("click", (ev) => {
  const b = (ev.target as Element).closest<HTMLButtonElement>("[data-w]");
  if (!b) return;
  stage.dataset.w = b.dataset.w;
  b.parentElement!.querySelectorAll<HTMLButtonElement>("[data-w]").forEach((x) => { const on = x === b; x.classList.toggle("is-active", on); x.setAttribute("aria-pressed", String(on)); });
});
new ResizeObserver(() => { readout.textContent = `Preview width: ${Math.round(stage.getBoundingClientRect().width)}px`; }).observe(stage);

// ---- section menu: this page's sections, then the shared kit's ----
function addSharedSections() {
  const heads = [...document.querySelectorAll<HTMLElement>("#bt-ui-kit .kit-section > .kit-h")];
  heads.forEach((h) => {
    const sec = h.parentElement!;
    sec.id ||= `kit-${(h.textContent || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const a = document.createElement("a");
    a.href = `#${sec.id}`;
    a.textContent = h.textContent;
    nav.append(a);
  });
}
function watchSections() {
  const links = [...nav.querySelectorAll<HTMLAnchorElement>("a")];
  const secs = links.map((a) => document.getElementById(a.hash.slice(1))).filter((s): s is HTMLElement => !!s);
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    links.forEach((a) => a.classList.toggle("is-on", a.hash === `#${e.target.id}`));
    const on = links.find((a) => a.hash === `#${e.target.id}`);
    if (on && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: on.offsetLeft - 16, behavior: "smooth" });
  }), { rootMargin: "-35% 0px -60% 0px" });
  secs.forEach((s) => io.observe(s));
}
requestAnimationFrame(() => { addSharedSections(); watchSections(); });

// ---- tokens, from the real CSS variables ----
function declaredTokens(): string[] {
  const names = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSStyleRule && r.selectorText.includes(".bt-root")) {
        for (let i = 0; i < r.style.length; i++) { const p = r.style[i]; if (p.startsWith("--bt-")) names.add(p); }
      } else if ("cssRules" in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) { try { walk(sheet.cssRules); } catch { /* another origin (fonts) */ } }
  return [...names].sort();
}
function renderTokens() {
  const cs = getComputedStyle(document.body);
  const all = declaredTokens().map((name) => ({ name, value: cs.getPropertyValue(name).trim() })).filter((t) => t.value);
  const isColor = (t: { name: string; value: string }) => !/-rgb$/.test(t.name) && CSS.supports("color", t.value);
  const colors = all.filter(isColor);
  const type = all.filter((t) => /^--bt-text-(\d?x?s|sm|md|base|lg|x+l|\dxl)$/.test(t.name) || t.name === "--bt-font" || t.name === "--bt-leading-body");
  const other = all.filter((t) => !colors.includes(t) && !type.includes(t));
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  $("[data-kit-colors]")!.innerHTML = colors.map((t) => `<div class="lk-token"><span class="lk-swatch" style="background:var(${t.name})"></span><code>${t.name}</code><small>${esc(t.value)}</small></div>`).join("");
  $("[data-kit-type]")!.innerHTML = type.map((t) => /^--bt-text-/.test(t.name)
    ? `<div class="lk-type-row"><span style="font-size:var(${t.name})">The quick brown fox</span><code>${t.name}</code><small>${esc(t.value)}</small></div>`
    : `<div class="lk-type-row"><code>${t.name}</code><small>${esc(t.value)}</small></div>`).join("");
  $("[data-kit-other]")!.innerHTML = other.map((t) => `<div class="lk-token lk-token--plain"><code>${t.name}</code><small>${esc(t.value)}</small></div>`).join("");
}
renderTokens();

// ---- the real footer: game, end screens, toast, leaderboard, Contact + Follow ----
const tts = $("[data-tts]");
async function game() {
  const { loadGame } = await import("../tap-the-splat/index.js");
  return loadGame(tts!);
}
const toFooter = () => tts?.closest("footer")?.scrollIntoView({ block: "end", behavior: "smooth" });
const END_AT = { win: [100, 48.37, 0], missed: [92, 71.1, 2], wrong: [88, 64.02, 1], boom: [73, 56.6, 3] } as const;
document.addEventListener("click", async (ev) => {
  const t = ev.target as Element;
  if (!tts) return;
  const end = t.closest<HTMLElement>("[data-kit-end]")?.dataset.kitEnd as keyof typeof END_AT | undefined;
  if (end) {
    const G: any = await game();
    G.reset();
    const [prog, secs, pen] = END_AT[end];
    // A preview end card: no run behind it, so it shows "This run wasn't recorded."
    Object.assign(G.S, { run: null, prog, pen, device: G.isPhone() ? "mobile" : "desktop", endAt: secs, splits: [] });
    G.setA("links", "1");
    G.end(end);
    toFooter();
  } else if (t.closest("[data-kit-toast]")) {
    const G: any = await game();
    G.toast("Tapped out at 42%");
    toFooter();
  } else if (t.closest("[data-kit-bar]")) {
    const G: any = await game();
    G.reset();
    G.S.pen = 3; G.phase("post-chain"); G.progress(45);
    G.$("[data-tm]").textContent = "0:42.17";
    toFooter();
  } else if (t.closest("[data-kit-lb]")) {
    const { toggle } = await import("../tap-the-splat/leaderboard.js");
    toggle(tts.querySelector("[data-lb-wrap]")!, true);
    toFooter();
  } else if (t.closest("[data-kit-power]")) {
    await game();
    tts.dataset.cf = "1";
    (tts as any)._power?.powerUp();
    tts.querySelector("[data-power]")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
});

// ---- the real sign-in dialog ----
document.addEventListener("click", async (ev) => {
  const b = (ev.target as Element).closest<HTMLElement>("[data-kit-dialog]");
  if (!b) return;
  const { openSignIn } = await import("../account/dialog");
  const k = b.dataset.kitDialog as string;
  const opts = k === "join" || k === "signin" ? { mode: k as "join" | "signin" } : { screen: k as "forgot" | "birthday" | "handle" | "terms" };
  openSignIn({ ...opts, title: b.dataset.kitTitle, previewError: b.dataset.kitError });
});
