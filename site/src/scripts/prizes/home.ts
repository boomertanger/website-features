// /prizes (docs/specs/prize-box.md §5; mockup prize-box-pages.html, hero H2a): the story page's moving parts. The hero is the prize stand (the F2 wheel on the
// Prize Box): a click spins a demo with the viewer (or "@you") on the yellow blade, and the box bursts for the winner; nothing is saved. Chapter 01 lists
// the open and upcoming contests and 05 the past winners, from public/prizeBox (one read). 04 is the real wheel to try. The journey, the stage-card
// spotlight and Ask BOOMBOT are the shared How it works behaviour; the flow lights a path on hover or tap. Sound starts muted, with a sound button.
// Preview (non-production): ?sample=1 fills 01 and 05 with sample contests and winners.
import { onAuth, type AuthState } from "../../lib/auth";
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { prizeStandHtml, standBurst, standReset } from "../../../../shared/ui/prizestand.js";
import { prizeWheelHtml, wheelSpin, wheelReset } from "../../../../shared/ui/wheel.js";
import { wheelSound, soundButtonHtml, bindSoundButton } from "../../../../shared/ui/wheel-sound.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { PRIZE_TICK_SRC } from "../../lib/prize-sound";
import { loadSummary, STATUS, TYPE_WORD, BEAT_WORD, miniCd, contestHref, dateWord, placeWord, type Contest, type Summary } from "./data";


const SAMPLE = ["@cryptkeeper", "@ghostlight", "@hexqueen", "@mothman", "@screamteam", "@you", "@gravedigger", "@lanternjack", "@pumpkinrot", "@staticghost"];
const YOU = 5;   // the yellow blade (--bt-wheel-6)
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const plan = () => ({ pickIndex: Math.floor(Math.random() * 10), offset: 0.2 + Math.random() * 0.6, spins: 5 + Math.round(Math.random()), durationMs: 7200 + Math.round(Math.random() * 1200), startAt: Date.now() + 60 });

function init(root: HTMLElement) {
  initHowItWorks(root);
  const snd = wheelSound({ muted: true, src: PRIZE_TICK_SRC });
  root.querySelectorAll<HTMLElement>("[data-pz-sound]").forEach((slot) => { slot.innerHTML = soundButtonHtml({ muted: true }); bindSoundButton(slot.querySelector("button"), snd); });
  let names = [...SAMPLE];
  const setMe = (s: AuthState) => { const h = s.profile && (s.profile as any).handle; names = [...SAMPLE]; if (h) names[YOU] = `@${h}`; drawWheels(); };

  // ---- the hero: the prize stand ----
  const hero = root.querySelector<HTMLElement>("[data-pz-hero]")!;
  const tryHost = root.querySelector<HTMLElement>("[data-pz-try]")!;
  let heroBusy = false, tryBusy = false;
  function drawWheels() {
    if (!heroBusy) hero.innerHTML = prizeStandHtml({ labels: names, label: "The Prize Wheel on the Prize Box. Click to spin a demo." });
    if (!tryBusy) tryHost.innerHTML = prizeWheelHtml({ labels: names, label: "The Prize Wheel" });
  }
  drawWheels();
  const heroSpin = () => {
    if (heroBusy) return;
    heroBusy = true;
    snd.unlock();
    standReset(hero); wheelReset(hero);
    const p = plan();
    wheelSpin(hero, { ...p, onTick: () => snd.tick(), onDone: (k: number) => {
      const me = k === YOU;
      void standBurst(hero, me ? { title: "It's you!", line: `${names[YOU]} wins the draw`, note: "On stream: tap I'm here within 60 seconds", me: true }
        : { title: names[k], line: "wins this spin", note: "Not you this time. Every spin is a fresh pick." }).then(() => { heroBusy = false; });
    } });
  };
  hero.addEventListener("click", heroSpin);
  hero.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); heroSpin(); } });

  // ---- 04 Spin the wheel ----
  const res = root.querySelector<HTMLElement>("[data-pz-tryres]")!;
  root.querySelector<HTMLButtonElement>("[data-pz-tryspin]")!.addEventListener("click", (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    if (tryBusy) return;
    tryBusy = true; b.disabled = true; res.textContent = "Spinning…";
    snd.unlock();
    wheelSpin(tryHost, { ...plan(), onTick: () => snd.tick(), onDone: (k: number) => {
      res.innerHTML = k === YOU ? `<b>${esc(names[YOU])}!</b> It's you. On stream you'd now have 60 seconds to tap I'm here.` : `<b>${esc(names[k])}</b>. Not you this time. On stream every spin is a fresh pick.`;
      tryBusy = false; b.disabled = false; b.textContent = "Spin again";
    } });
  });

  // ---- 03 the flow: hover or tap a box to follow its path ----
  const flow = root.querySelector<HTMLElement>("[data-pz-flow]");
  if (flow) {
    const boxes = [...flow.querySelectorAll<HTMLElement>(".pz-fbox")];
    const light = (b: HTMLElement | null) => {
      const p = b ? (b.dataset.p || "").split(" ")[0] : "";
      flow.dataset.hl = p;
      boxes.forEach((x) => x.classList.toggle("is-hl", !!p && ((x.dataset.p || "").split(" ").includes(p) || x === b)));
    };
    boxes.forEach((b) => { b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") light(b); }); b.addEventListener("focus", () => light(b)); b.addEventListener("click", () => light(b)); });
    flow.addEventListener("pointerleave", () => light(null));
  }

  // ---- 01 Open now and 05 Past winners, from public/prizeBox ----
  void loadSummary().then(fill, () => fill({ contests: [], winners: [], counts: { open: 0, upcoming: 0, winners: 0 } }));
  onAuth((s) => { if (s.status !== "loading") setMe(s); });
}

const SCENE = {
  live: () => `<div class="pz-cscene pz-cscene--wheel">${prizeWheelHtml({ text: false, label: "The Prize Wheel" })}</div>`,
  online: () => `<svg class="pz-cscene" viewBox="0 0 320 180" aria-hidden="true"><rect class="pz-paper" x="96" y="28" width="128" height="128" rx="4" transform="rotate(-4 160 92)"/><path class="pz-scrib" d="M120 132 Q118 72 160 60 Q202 72 200 132 L188 122 L176 132 L164 122 L152 132 L140 122 L128 132" transform="rotate(-4 160 92)"/><g class="pz-pencil"><rect class="pz-pencil-body" x="216" y="100" width="64" height="12" rx="3" transform="rotate(-35 216 106)"/><path class="pz-pencil-tip" d="M216 106 l-12 8 l4 -14 z" transform="rotate(-35 216 106)"/></g></svg>`,
  mail: () => `<svg class="pz-cscene" viewBox="0 0 320 180" aria-hidden="true"><g class="pz-letter"><rect class="pz-paper" x="116" y="56" width="88" height="70" rx="3"/><text class="pz-letter-code" x="160" y="90" text-anchor="middle">PB-7K4M</text><path class="pz-letter-line" d="M134 104 h52"/></g><rect class="pz-env" x="96" y="80" width="128" height="76" rx="5"/><path class="pz-env-fold" d="M96 156 L160 112 L224 156"/><path class="pz-flapm" d="M96 80 L160 122 L224 80 Z"/><rect class="pz-stampbox" x="190" y="88" width="24" height="28" rx="2"/></svg>`,
};
function cardHtml(c: Contest) {
  const [tone, word] = STATUS[c.status] || ["gray", c.status];
  const prize = c.prizes[0] ? `Prize: <b>${esc(c.prizes[0].title)}</b>${c.prizes.length > 1 ? ` and ${c.prizes.length - 1} more` : ""}.` : "";
  const when = c.type === "live" ? `<p class="pz-when">At ${esc(BEAT_WORD[c.beat || ""] || "a break")} on a stream. Check in and you're on the wheel.</p>`
    : c.status === "open" ? `<div class="bt-mini-cd">${miniCd(c.closesAt)}</div>` : c.status === "scheduled" ? `<p class="pz-when">Opens ${esc(dateWord(c.opensAt))}.</p>` : "";
  const btn = c.type === "live" ? `<a class="bt-btn bt-btn--primary bt-btn--sm" href="/schedule" data-pulse="pb-schedule">See the schedule</a>`
    : c.status === "open" ? `<a class="bt-btn bt-btn--primary bt-btn--sm" href="${contestHref(c)}" data-pulse="pb-open-contest">${c.type === "mail" ? "Get my code" : "Enter"}</a>`
    : `<a class="bt-btn bt-btn--secondary bt-btn--sm" href="${contestHref(c)}">See the contest</a>`;
  return `<article class="bt-card pz-card" tabindex="-1">${SCENE[c.type]()}<div class="pz-tags"><span class="bt-badge bt-badge--${tone}"><span class="bt-badge-dot"></span>${esc(word)}</span><span class="bt-badge">${esc(TYPE_WORD[c.type])}</span></div>`
    + `<h3><a href="${contestHref(c)}">${esc(c.title)}</a></h3><p>${esc(c.blurb)} ${prize}</p>${when}${btn}</article>`;
}
function fill(s: Summary) {
  const root = document.getElementById("prize-box-root")!;
  const open = s.contests.filter((c) => ["open", "scheduled", "drawing", "closed", "judging"].includes(c.status));
  const lede = root.querySelector<HTMLElement>("[data-pz-open-lede]");
  const n = open.length;
  if (lede) lede.textContent = n ? `${n === 1 ? "One contest is" : `${n} contests are`} open or coming up. Pick one and get in.` : "Nothing is open right now. New contests show up here first.";
  const facts = root.querySelector<HTMLElement>("[data-pz-facts]");
  if (facts) {
    const live = s.contests.find((c) => c.type === "live" && c.status === "scheduled");
    facts.innerHTML = `<span class="bt-badge bt-badge--green"><span class="bt-badge-dot"></span>${s.counts.open} open now</span>${live ? `<span class="bt-badge">Next wheel: ${esc(BEAT_WORD[live.beat || ""] || "on stream")}</span>` : ""}`;
  }
  const grid = root.querySelector<HTMLElement>("[data-pz-open]")!;
  grid.innerHTML = n ? open.map(cardHtml).join("") : `<div class="pz-empty">${mascot()}<div><b>No contests open right now</b><p>Live draws happen on stream and new contests show up here. Turn on Boom Alerts to hear about the next one.</p></div></div>`;
  grid.classList.toggle("is-empty", !n);
  const wall = root.querySelector<HTMLElement>("[data-pz-winners]")!;
  wall.innerHTML = s.winners.length ? s.winners.slice(0, 12).map((w) => `<div class="pz-wrow"><span class="pz-wthumb" aria-hidden="true">${prizeWheelHtml({ text: false })}</span><div><b>@${esc(w.handle)}</b><small>${esc(w.contestTitle)}${w.place > 1 ? `, ${placeWord(w.place)} place` : ""}: ${esc(w.prizeTitle)}</small></div><time>${esc(dateWord(w.at))}</time></div>`).join("")
    : `<div class="pz-empty">${mascot()}<div><b>No winners yet</b><p>The first winners show up here, once they say yes to being shown.</p></div></div>`;
}

// started last: every helper above is defined by now
const root = document.getElementById("prize-box-root");
if (root) init(root);
