// shared/ui-kit/kit-stories.js — the UI Kit page's .bt-stories section (shared/ui/stories.js): several items, one item, reduced motion and
// paused, each with a sample card (the caller draws the card; here a cover, a title and a line).
import { initStories } from "../ui/stories.js";
import { coverHtml } from "../ui/cover.js";

const SAMPLE = [
  { title: "Rewind or Die", badge: "Up next", line: "42 votes" },
  { title: "The Sushi House", badge: "Most wanted #1", line: "31 votes" },
  { title: "Amanda the Adventurer 2", badge: "Most wanted #2", line: "27 votes" },
  { title: "Christmas Massacre", badge: "Most wanted #3", line: "19 votes" },
];
const card = (it) => `<div class="bt-card" style="display:flex;flex-direction:row;gap:14px;align-items:center;padding:12px"><div style="width:80px;flex:none">${coverHtml(null, { alt: "" })}</div><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start;min-width:0"><span class="bt-badge bt-badge--gold">${it.badge}</span><b>${it.title}</b><span class="bt-meta">${it.line}</span></div></div>`;
const thumb = () => coverHtml(null, { alt: "" });

export const storiesKitHtml = () => `
  <section class="kit-section" id="kit-stories">
    <h2 class="kit-h">Stories</h2>
    <p class="kit-p"><span class="kit-code">.bt-stories</span> with <span class="kit-code">shared/ui/stories.js</span>: story bars that fill over 5 s (gold), the current item fading in on the stage (the caller draws its card), and a row of small covers to jump between them (the current one raised with a gold ring; buttons labelled "Show &lt;title&gt;"). Swipe left or right on the stage. It pauses while touched, hovered or focused, while the tab is hidden, and for the caller's reasons (<span class="kit-code">s.pause("search", true)</span>). Region with <span class="kit-code">aria-roledescription="carousel"</span>; only manual changes are announced. First used by the Game Vault's phone hero (1C).</p>
    <div class="kit-row" style="align-items:flex-start;gap:28px;flex-wrap:wrap">
      <figure style="width:320px;margin:0"><div data-kit-stories="four"></div><figcaption class="kit-sub">Several items (auto-advances)</figcaption></figure>
      <figure style="width:320px;margin:0"><div data-kit-stories="one"></div><figcaption class="kit-sub">One item: just the card (no bars, no small covers)</figcaption></figure>
      <figure style="width:320px;margin:0"><div data-kit-stories="reduced"></div><figcaption class="kit-sub">Reduced motion: no auto-advance or fade; the bars show the position</figcaption></figure>
      <figure style="width:320px;margin:0"><div data-kit-stories="paused"></div><figcaption class="kit-sub">Paused (.is-paused, e.g. while the page searches)</figcaption></figure>
    </div>
  </section>`;

export function initStoriesKit(mount) {
  mount.querySelectorAll("[data-kit-stories]").forEach((host) => {
    const kind = host.dataset.kitStories;
    const items = kind === "one" ? SAMPLE.slice(0, 1) : SAMPLE;
    const s = initStories(host, { items, render: card, thumb, label: (it) => it.title, name: `Stories (${kind})`, reduced: kind === "reduced" ? true : undefined, paused: kind === "paused" });
    if (kind === "reduced") s?.go(1);
    if (kind === "paused") { s?.go(2); setTimeout(() => host.querySelectorAll(".bt-stories-bars i")[2]?.style.setProperty("--p", 0.45), 400); }   // part way, held
  });
}
