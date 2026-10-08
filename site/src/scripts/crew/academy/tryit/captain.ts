// Try it for module 10 "Captain's course": a coverage drill. Four chat tiles; on a timer a lead steps away and a tile
// turns gold (needed, never red). Cover it within 20 s: tap the tile, then move a seat or ask a Deckhand. 60 s round,
// then time kept all-green and a score. Nothing runs until Start; the clock pauses when the tab is hidden.
// Reduced motion only removes decoration (the gold glow); the timing logic is unchanged. Local only.
import { mountShell, esc } from "../tryit-kit";
import { roomHtml } from "../../../../../../shared/ui/crew.js";

const CHATS = [
  { chat: "twitch", name: "Twitch" },
  { chat: "ytLandscape", name: "YouTube landscape" },
  { chat: "ytVertical", name: "YouTube vertical" },
  { chat: "tiktok", name: "TikTok" },
];
const ROUND_MS = 60_000;
const DEADLINE_MS = 20_000;
const DECKHAND_DELAY_MS = 2_000;
const TICK_MS = 200;
const gap = () => 6_000 + Math.random() * 4_000;

interface Tile { needed: boolean; left: number; helping: boolean }

export default function init(root: HTMLElement): void {
  const { body, done } = mountShell(root, "a coverage drill", "Keep all four chats green for 60 seconds. When a lead steps away a tile turns gold: tap it, then cover it.");
  const tiles: Tile[] = CHATS.map(() => ({ needed: false, left: 0, helping: false }));
  let running = false, elapsed = 0, green = 0, covered = 0, missed = 0, nextAt = 0, sel = -1;
  let timer = 0, last = 0;
  let live = "";

  body.innerHTML = `<div class="ta2-hud"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-start>Start the drill</button>`
    + `<div class="ta2-stat"><b data-t>1:00</b><span>Time left</span></div><div class="ta2-stat"><b data-g>0s</b><span>All green</span></div><div class="ta2-stat"><b data-c>0</b><span>Covered</span></div></div>`
    + `<div class="ta2-tiles">${CHATS.map((c, i) => `<button type="button" class="ta2-tile" data-i="${i}" aria-expanded="false" disabled><span data-room></span><span class="ta2-tile-lead"></span><span class="ta2-bar-t" hidden><b></b></span></button>`).join("")}</div>`
    + `<div class="ta2-choice" data-choice hidden></div><p class="ta2-live" role="status" aria-live="polite"></p>`;
  const $ = <T extends HTMLElement>(s: string) => body.querySelector<T>(s)!;
  const tileEls = [...body.querySelectorAll<HTMLButtonElement>(".ta2-tile")];
  const startBtn = $<HTMLButtonElement>("[data-start]");

  function say(t: string) { live = t; $(".ta2-live").textContent = live; }
  const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  function paint() {
    $("[data-t]").textContent = clock(ROUND_MS - elapsed);
    $("[data-g]").textContent = `${Math.floor(green / 1000)}s`;
    $("[data-c]").textContent = String(covered);
    tileEls.forEach((el, i) => {
      const t = tiles[i];
      const state = t.needed ? "needed" : "covered";
      el.dataset.state = state;
      el.disabled = !running;
      const secs = Math.ceil(t.left / 1000);
      el.querySelector("[data-room]")!.innerHTML = roomHtml({ chat: CHATS[i].chat, name: CHATS[i].name, state, text: t.needed ? (t.helping ? "help is coming" : "needs help") : "covered" } as any);
      el.querySelector(".ta2-tile-lead")!.textContent = t.needed ? `A lead stepped away. ${secs}s left.` : running ? "All good here." : "Ready.";
      const bar = el.querySelector<HTMLElement>(".ta2-bar-t")!;
      bar.hidden = !t.needed;
      if (t.needed) bar.style.setProperty("--p", `${(t.left / DEADLINE_MS) * 100}%`);
      el.setAttribute("aria-label", `${CHATS[i].name}: ${t.needed ? `needs help, ${secs} seconds left` : "covered"}`);
    });
    if (sel >= 0 && $("[data-choice]").dataset.n !== String(tiles[sel].needed)) openChoice(sel);
  }

  function openChoice(i: number) {
    sel = i;
    tileEls.forEach((el, k) => el.setAttribute("aria-expanded", String(k === i)));
    const box = $("[data-choice]");
    box.hidden = false;
    const t = tiles[i];
    box.dataset.n = String(t.needed);
    if (!t.needed) {
      box.innerHTML = `<p>${esc(CHATS[i].name)} is covered. Nothing to do here. Keep an eye on the other tiles.</p>`;
      return;
    }
    box.innerHTML = `<p><b>Cover ${esc(CHATS[i].name)}:</b> move a seat to this chat right away, or ask a Deckhand to step up (they take a couple of seconds).</p>`
      + `<div class="ta2-row"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-cover="move">Move a seat</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-cover="ask"${t.helping ? " disabled" : ""}>Ask a Deckhand</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-cover="cancel">Close</button></div>`;
  }
  function closeChoice() {
    sel = -1;
    tileEls.forEach((el) => el.setAttribute("aria-expanded", "false"));
    $("[data-choice]").hidden = true;
  }

  function cover(i: number) {
    const t = tiles[i];
    if (!t.needed) return;
    t.needed = false; t.helping = false; t.left = 0; covered++;
    say(`${CHATS[i].name} is covered again.`);
  }

  function stepAway() {
    const free = tiles.map((t, i) => (t.needed ? -1 : i)).filter((i) => i >= 0);
    if (!free.length) return;
    const i = free[Math.floor(Math.random() * free.length)];
    tiles[i].needed = true; tiles[i].left = DEADLINE_MS; tiles[i].helping = false;
    say(`${CHATS[i].name} needs help. A lead stepped away.`);
  }

  function tick() {
    const now = performance.now();
    const dt = Math.min(now - last, 1000);
    last = now;
    elapsed += dt;
    if (!tiles.some((t) => t.needed)) green += dt;
    tiles.forEach((t, i) => {
      if (!t.needed) return;
      t.left -= dt;
      if (t.left <= 0) {
        t.needed = false; t.helping = false; missed++;
        say(`${CHATS[i].name} sat gold too long. Boomer had to fill in.`);
        if (sel === i) openChoice(i);
      }
    });
    if (elapsed >= nextAt && elapsed < ROUND_MS - 4000) { stepAway(); nextAt = elapsed + gap(); }
    if (elapsed >= ROUND_MS) { elapsed = ROUND_MS; return finish(); }
    paint();
  }

  function begin() {
    tiles.forEach((t) => { t.needed = false; t.left = 0; t.helping = false; });
    running = true; elapsed = 0; green = 0; covered = 0; missed = 0; nextAt = 3000; last = performance.now();
    done.hidden = true; closeChoice();
    startBtn.hidden = true;
    say("The drill has started.");
    paint();
    window.clearInterval(timer);
    timer = window.setInterval(() => { if (!document.hidden) tick(); else last = performance.now(); }, TICK_MS);
  }

  function finish() {
    window.clearInterval(timer);
    running = false;
    tiles.forEach((t) => { t.needed = false; t.helping = false; t.left = 0; });
    paint(); closeChoice();
    const pct = Math.round((green / ROUND_MS) * 100);
    const note = missed === 0 && pct >= 80 ? "Beautiful coverage. Nobody was left hanging."
      : pct >= 60 ? "Good work. A little faster on the gold tiles and it's green all night."
        : "Gold tiles are your job. Act on them as soon as they appear, and ask a Deckhand early.";
    done.hidden = false;
    done.innerHTML = `<b>All green for ${Math.floor(green / 1000)} of 60 seconds (${pct}%)</b><p>${covered} covered, ${missed} missed. ${esc(note)}</p><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-again>Play again</button>`;
    say("Time. The drill is over.");
    done.querySelector<HTMLElement>("[data-again]")?.focus();
  }

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-start]")) { begin(); return; }
    if (t.closest("[data-again]")) { begin(); return; }
    const tile = t.closest<HTMLButtonElement>(".ta2-tile");
    if (tile && running) { openChoice(Number(tile.dataset.i)); return; }
    const c = t.closest<HTMLButtonElement>("[data-cover]");
    if (!c || sel < 0) return;
    const i = sel;
    if (c.dataset.cover === "cancel") { closeChoice(); tileEls[i].focus(); return; }
    if (c.dataset.cover === "move") { cover(i); closeChoice(); paint(); tileEls[i].focus(); return; }
    if (c.dataset.cover === "ask") {
      tiles[i].helping = true;
      say(`You asked a Deckhand to cover ${CHATS[i].name}.`);
      openChoice(i); paint();
      window.setTimeout(() => { if (running && tiles[i].needed && tiles[i].helping) { cover(i); paint(); } }, DECKHAND_DELAY_MS);
    }
  });
  paint();
}
