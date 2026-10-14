// shared/ui-kit/kit-stories.js — the UI Kit page's .bt-stories section (shared/ui/stories.js): the square of small covers (several, a playing
// game's green ring, few votes yet), the row, one item, reduced motion and paused, each with a sample poster and details (the caller draws
// both; here a cover, a badge, a title and a line). The Game Vault's film strip spotlight is the real use (game-vault-film-strip.html).
import { initStories } from "../ui/stories.js";
import { coverHtml } from "../ui/cover.js";

const SAMPLE = [
  { title: "Rewind or Die", badge: "Up next", line: "42 votes" },
  { title: "The Sushi House", badge: "Most wanted #1", line: "31 votes" },
  { title: "Amanda the Adventurer 2", badge: "Most wanted #2", line: "27 votes" },
  { title: "Christmas Massacre", badge: "Most wanted #3", line: "19 votes" },
];
// Boomer is playing a game: it leads, green badge and ring, no votes
const PLAYING = [{ title: "Granny 3", badge: "Now playing", line: "Watch live", green: true }, ...SAMPLE.slice(0, 3)];
// Few votes yet (the Vault before anyone votes): the newest To play games fill the spots, "No votes yet" (never "0 votes")
const FILL = [
  { title: "Rewind or Die", badge: "Up next", line: "No votes yet" },
  { title: "The Skin Stapler", badge: "To play", line: "No votes yet" },
  { title: "Silent Nights", badge: "To play", line: "No votes yet" },
  { title: "Kiosk", badge: "To play", line: "No votes yet" },
];
const poster = () => `<div style="width:150px">${coverHtml(null, { alt: "" })}</div>`;
const details = (it) => `<span class="bt-badge bt-badge--${it.green ? "green" : "gold"}">${it.green ? '<span class="bt-badge-dot"></span>' : ""}${it.badge}</span><b style="display:block;margin:6px 0 2px">${it.title}</b><span class="bt-meta">${it.line}</span>`;
const thumb = () => coverHtml(null, { alt: "" });
// the poster beside the square, the details under both (the Vault's desktop and phone layout, D3b / M1)
const GRID = "display:grid;grid-template-columns:150px auto;column-gap:28px;row-gap:14px;align-items:center";
const STATES = [
  ["square", "Square of four (auto-advances): the ring draws around the current small cover over 5 s, then the next one shows", SAMPLE, {}],
  ["playing", "A playing game leads: green badge and a green ring", PLAYING, {}],
  ["fill", "Few votes yet: the newest To play games fill the spots (gold \"To play\", \"No votes yet\")", FILL, {}],
  ["row", "Row: the small covers in one row under the poster", SAMPLE, { layout: "row" }],
  ["one", "One item: just the poster and its details (no small covers)", SAMPLE.slice(0, 1), {}],
  ["reduced", "Reduced motion: no auto-advance or fade; the current small cover has the full ring", SAMPLE, { reduced: true }],
  ["paused", "Paused (.is-paused, e.g. while the page searches): the ring holds where it was", SAMPLE, { paused: true }],
];

export const storiesKitHtml = () => `
  <section class="kit-section" id="kit-stories">
    <h2 class="kit-h">Stories</h2>
    <p class="kit-p"><span class="kit-code">.bt-stories</span> with <span class="kit-code">shared/ui/stories.js</span>: the current item\'s poster on the stage, a small cover per item, and a thin ring (gold; <span class="kit-code">.bt-stories-pick--green</span> for the game Boomer is playing) that draws around the current small cover over 5 s, then the next item fades in. <span class="kit-code">layout: "square"</span> (default) puts the small covers in a 2 × 2 square, <span class="kit-code">"row"</span> in one row; <span class="kit-code">--bt-stories-pick</span> sets their width. Tap a small cover to jump (buttons labelled "Show &lt;title&gt;"); swipe the poster on touch screens. It pauses while touched, hovered or focused, while the tab is hidden, and for the caller\'s reasons (<span class="kit-code">s.pause("search", true)</span>). The caller draws the poster (<span class="kit-code">render</span>) and the details (<span class="kit-code">details</span>) and places them with its own grid. Region with <span class="kit-code">aria-roledescription="carousel"</span>; only manual changes are announced. Used by the Game Vault\'s film strip spotlight.</p>
    <div class="kit-row" style="align-items:flex-start;gap:32px;flex-wrap:wrap">
      ${STATES.map(([k, cap, , o]) => `<figure style="width:${o.layout === "row" ? 300 : 320}px;margin:0"><div data-kit-stories="${k}" style="${o.layout === "row" ? "" : GRID}"></div><figcaption class="kit-sub" style="margin-top:12px">${cap}</figcaption></figure>`).join("")}
    </div>
  </section>`;

export function initStoriesKit(mount) {
  mount.querySelectorAll("[data-kit-stories]").forEach((host) => {
    const [k, , items, o] = STATES.find((s) => s[0] === host.dataset.kitStories);
    const s = initStories(host, { items, render: poster, details, thumb, label: (it) => it.title, tone: (it) => (it.green ? "green" : ""), name: `Stories (${k})`, layout: o.layout, reduced: o.reduced, paused: o.paused });
    if (k === "reduced") s?.go(1);
    if (k === "paused") { s?.go(2); setTimeout(() => host.querySelectorAll(".bt-stories-pick")[2]?.style.setProperty("--bt-ring", "0.45"), 400); }   // part way, held
    if (o.layout === "row") host.querySelector(".bt-stories-details")?.setAttribute("style", "margin-top:12px");
  });
}
