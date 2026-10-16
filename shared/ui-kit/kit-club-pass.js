// shared/ui-kit/kit-club-pass.js — the "Club Pass pieces" section of the UI Kit page (/dev/ui-kit): .bt-pass, .bt-plan, .bt-spread and
// .bt-admit (docs/specs/club-pass.md §8; design-system.md §5 "Club Pass pieces" and §8ah) in every state. Silver is Fan Club, gold is
// Sub Club, purple stays the only clickable colour. Made-up demo copy. No reads, no writes. ui-kit.js appends clubPassKitHtml({ mascotUrl })
// and calls initClubPassKit(mount).
import { spreadHead, isLongHead, turnSpread } from "../ui/spread.js";
import { stampHtml } from "../ui/stamp.js";
import { bindAdmit } from "../ui/admit.js";

const PAGES = [
  { tone: "fan", kicker: "Watch", head: "Get *backstage.*", dek: "Some streams never go to Twitch or YouTube. These play right here, for members only.", facts: ["<b>Backstage streams</b>, members only", "<b>After-shows</b> when the main stream wraps", "<b>Studio time</b> (coming soon)"], pull: "The show after the show.", stamp: ["Fan Club", "included"], status: ["Yours with Fan Club", "Included, nothing extra to pay."] },
  { tone: "sub", kicker: "Watch", head: "One night a month, *just us.*", dek: "Once a month, a stream for Sub Club only: a smaller room.", facts: ["A <b>Sub Club-only</b> stream", "Plays on the site", "On the <b>schedule</b> ahead of time"], pull: "Small room. Big screams.", stamp: ["Sub Club", "gold pass"], status: ["Coming soon to Sub Club", "It's being built now."], soon: true },
  { tone: "fan", kicker: "Inside", head: "Watch the *extraordinarily* long climb.", dek: "A long word in the headline switches to the --long size so it never overflows.", facts: ["<b>One</b>", "<b>Two</b>", "<b>Three</b>"], pull: "Every follower counts.", stamp: ["Fan Club", "plus gold"], status: ["Join free to unlock", "This comes with the free Fan Club pass."] },
];

const pass = (m, { sub = false, plan = "FAN CLUB", name = "YOUR NAME HERE", price = "", mini = false, width = 150 } = {}) =>
  `<div style="width:${width}px"><div class="bt-pass${sub ? " bt-pass--sub" : ""}${mini ? " bt-pass--mini" : ""}"><span class="bt-pass-top">CLUB PASS</span>${m}<span class="bt-pass-plan">${plan}</span>${price ? `<span class="bt-pass-price">${price}</span>` : ""}<span class="bt-pass-name">${name}</span><span class="bt-pass-code"></span><span class="bt-pass-foot">ADMIT ONE</span></div></div>`;

const plan = (m, { sub = false, foot, current = false }) => `
  <article class="bt-plan${sub ? " bt-plan--sub" : ""}${current ? " is-current" : ""}">
    <div class="bt-plan-head">${pass(m, { sub, mini: true, width: 46 }).replace('style="width:46px"', 'style="width:46px;flex:none"')}<div><h3 class="bt-plan-name">${sub ? "Sub Club" : "Fan Club"}</h3><p class="bt-plan-price"><b>${sub ? "$5.99" : "Free"}</b><span>${sub ? "a month" : "forever"}</span></p></div></div>
    <ul class="bt-plan-list"><li>Backstage streams</li><li>Game votes</li><li class="is-soon">Boom Arcade (coming soon)</li></ul>
    <div class="bt-plan-foot">${foot}</div>
  </article>`;

function pageHtml(p, i) {
  return `<div class="bt-spread-mast"><b>Club Pass</b><span>The perks · Issue 01</span><span>p.${String(i + 1).padStart(2, "0")} of ${PAGES.length}</span></div>
    <div class="bt-spread-body">
      <div class="bt-spread-copy"><p class="bt-spread-kicker">${p.kicker}</p><h3 class="bt-spread-head${isLongHead(p.head) ? " bt-spread-head--long" : ""}">${spreadHead(p.head)}</h3><p class="bt-spread-dek">${p.dek}</p><ul class="bt-spread-facts">${p.facts.map((f, k) => `<li style="--i:${k}"><span>${f}</span></li>`).join("")}</ul></div>
      <div class="bt-spread-art"><div class="bt-spread-art-in"></div>${p.soon ? '<span class="bt-badge bt-badge--gold bt-spread-soon">Coming soon</span>' : ""}${stampHtml({ label: p.stamp[0], sub: p.stamp[1], size: "sm" }).replace('class="bt-stamp', `class="${p.tone === "fan" ? "is-fan " : ""}bt-stamp`)}</div>
    </div>
    <p class="bt-spread-pull">${p.pull}</p>
    <div class="bt-spread-foot"><div class="bt-spread-status"><b>${p.status[0]}</b><span>${p.status[1]}</span></div>
      <div class="bt-spread-nav"><button class="bt-btn bt-btn--secondary" type="button" data-kit-pg="-1" aria-label="Previous page">←</button><button class="bt-btn bt-btn--secondary" type="button" data-kit-play>▶ Flip through</button><button class="bt-btn bt-btn--secondary" type="button" data-kit-pg="1" aria-label="Next page">→</button></div></div>`;
}

export function clubPassKitHtml({ mascotUrl }) {
  const m = `<img class="bt-mascot" src="${mascotUrl}" alt="" width="54" height="60">`;
  return `
  <section class="kit-section" id="kit-club-pass">
    <h2 class="kit-h">Club Pass pieces (.bt-pass, .bt-plan, .bt-spread, .bt-admit)</h2>
    <p class="kit-p">The membership pieces (<span class="kit-code">docs/specs/club-pass.md</span> §8). Silver means Fan Club (<span class="kit-code">--bt-pass-fan</span>) and gold means Sub Club (<span class="kit-code">--bt-pass-sub</span>) on passes, plan cards, the perk board and stamps; purple stays the only clickable colour. Reduced motion keeps the colours and drops the movement.</p>
    <h3 class="kit-sub">.bt-pass: Fan Club (signed out), Fan Club (a member), Sub Club (gold, with its sheen), with a price, and --mini</h3>
    <div style="display:flex;flex-wrap:wrap;gap:22px;align-items:flex-end;padding:8px">${pass(m, {})}${pass(m, { name: "@member" })}${pass(m, { sub: true, plan: "SUB CLUB", name: "@member" })}${pass(m, { sub: true, plan: "SUB CLUB", price: "$5.99 / MONTH", width: 110 })}${pass(m, { mini: true, width: 46 })}${pass(m, { sub: true, mini: true, width: 46 })}</div>
    <h3 class="kit-sub">.bt-plan: Join free; You're in (.is-current); Opening soon (payments off); Get Sub Club (payments on)</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
      ${plan(m, { foot: '<button class="bt-btn bt-btn--primary" type="button">Join free</button>' })}
      ${plan(m, { current: true, foot: '<div class="bt-plan-state">✓ You\'re in</div><p class="bt-plan-note">Manage my pass on your account page.</p>' })}
      ${plan(m, { sub: true, foot: '<button class="bt-btn bt-btn--secondary" type="button" disabled>Opening soon</button><p class="bt-plan-note">Sub Club opens soon.</p>' })}
      ${plan(m, { sub: true, foot: '<button class="bt-btn bt-btn--primary" type="button">Get Sub Club</button>' })}
    </div>
    <h3 class="kit-sub">.bt-spread: a Fan Club page, a Sub Club page (Coming soon), a long headline. ← → or Flip through turn the page; the arrow keys work when it has focus.</h3>
    <div class="bt-spread" data-kit-spread data-tone="fan" tabindex="0" aria-label="Demo magazine spread"><span class="bt-spread-sweep" aria-hidden="true"></span><span class="bt-spread-progress" aria-hidden="true"></span><div class="bt-spread-page" aria-live="polite">${pageHtml(PAGES[0], 0)}</div></div>
    <h3 class="kit-sub">.bt-admit: the gold tear-off ticket. Join free tears off the stub (it grows back after a moment).</h3>
    <div class="bt-admit" data-kit-admit>
      <span class="bt-admit-scissors" aria-hidden="true">✂</span>
      <div class="bt-admit-main"><small>Admit one</small><b>Your pass is waiting.</b><span>Fan Club is free. Sub Club is $5.99 a month.</span><div class="bt-admit-acts"><button class="bt-btn bt-btn--primary" type="button" data-admit-tear>Join free</button><button class="bt-btn bt-btn--secondary" type="button">Pick your pass</button></div></div>
      <div class="bt-admit-stub" aria-hidden="true">${m}<b>ADMIT</b><small>NO. 0001</small></div>
    </div>
  </section>`;
}

export function initClubPassKit(mount) {
  const sec = mount.querySelector("#kit-club-pass");
  if (!sec) return;
  bindAdmit(sec);
  const spread = sec.querySelector("[data-kit-spread]"), page = spread.querySelector(".bt-spread-page");
  let cur = 0, timer = null;
  const go = (i, animate = true) => {
    cur = (i + PAGES.length) % PAGES.length;
    spread.dataset.tone = PAGES[cur].tone;
    turnSpread(spread, page, pageHtml(PAGES[cur], cur), { animate });
  };
  const stop = () => { clearInterval(timer); timer = null; spread.classList.remove("is-playing"); };
  const tick = () => { spread.classList.remove("is-playing"); void spread.offsetWidth; spread.classList.add("is-playing"); };
  page.addEventListener("click", (e) => {
    const pg = e.target.closest("[data-kit-pg]");
    if (pg) { stop(); go(cur + Number(pg.dataset.kitPg)); return; }
    if (e.target.closest("[data-kit-play]")) { if (timer) { stop(); return; } timer = setInterval(() => { if (!spread.isConnected) return stop(); go(cur + 1); tick(); }, 6000); tick(); e.target.closest("[data-kit-play]").textContent = "❚❚ Pause"; }
  });
  spread.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { stop(); go(cur + 1); } if (e.key === "ArrowLeft") { stop(); go(cur - 1); } });
}
