// site/src/scripts/base-camp/story.ts — /base-camp (docs/specs/base-camp.md "Page 1"). Wires the built page: the How it works behaviour (the
// journey's line, BOOMBOT's chat), the playing cards (tap turns one over; a holo sheen follows the pointer), the five stops (hover lights the line,
// a click or Enter picks the stop the story panel tells; at 900px and narrower the row scrolls sideways and the picked stop is scrolled into
// view; stage 5 "The build" fills its line and its Fan Club panel from public/climb's all-10000 milestone, and its tag turns from "Under
// construction" to "Back on air" once Creator Climb's Back on air era has started: climb.ts), The rise, replayed (replay.ts, from public/climb only),
// the E1 stage cards (stage.ts), and the Fan Club parts from memberContent/base-camp (member.ts): card backs, the full stop stories and chapter
// 5's paragraph for members, lock cards for everyone else. Member text is escaped and never written into the page HTML at build time.
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { onMemberDoc, type StoryDoc, type MemberState } from "./member";
import { initStageCards } from "./stage";
import { esc, lockCard, RM } from "./ui";
import { suitSvg } from "./story-art";
import { loadClimb, fill, dropUnfilled, backOnAir, type Climb } from "./climb";
import { initReplay } from "./replay";
import data from "../../data/base-camp.json";

const page = document.querySelector<HTMLElement>("[data-bc-story]");
if (page) init(page);

function init(root: HTMLElement) {
  initHowItWorks(root as unknown as Document);   // the helper takes any root; its JS default (document) types it as Document
  initFlipCards(root);
  initStageCards(root);

  // ---- playing cards: the holo sheen follows the pointer ----
  root.querySelectorAll<HTMLElement>(".bc-pcard").forEach((c) => c.addEventListener("pointermove", (ev) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty("--fx", `${((ev.clientX - r.left) / r.width) * 100}%`);
  }));

  // ---- chapter 3: pick a stop ----
  const jr = root.querySelector<HTMLElement>(".bc-jr");
  const stops = jr ? [...jr.querySelectorAll<HTMLElement>("li")] : [];
  let sel = 0;
  let member: MemberState<StoryDoc> = { status: "loading", doc: null, preview: false };
  let climb: Climb | null = null;
  const wrap = root.querySelector<HTMLElement>("[data-bc-jrwrap]");
  /** At 900px and narrower the row scrolls sideways: bring the picked stop into view (only when the row actually scrolls). */
  const reveal = (li: HTMLElement) => {
    if (!wrap || wrap.scrollWidth <= wrap.clientWidth + 1) return;
    const left = li.offsetLeft - parseFloat(getComputedStyle(wrap).paddingLeft || "0");
    wrap.scrollTo({ left: Math.max(0, left), behavior: RM() ? "auto" : "smooth" });
  };
  const showStop = () => {
    stops.forEach((li, i) => li.classList.toggle("is-sel", i === sel));
    const panel = root.querySelector<HTMLElement>("[data-bc-stop]");
    if (!panel) return;
    const st = data.stops[sel];
    if (member.status !== "member") { panel.innerHTML = lockCard(member, data.stopsLock.title, data.stopsLock.text, "#bc-ch3"); return; }
    const raw = member.doc?.stops?.[st.key];
    // stage 5's numbers and date come from public/climb; a sentence it can't fill is left out, never shown with a gap or a guess
    const text = raw ? dropUnfilled(raw, climb) : raw;
    panel.innerHTML = `<div class="bc-story"><div><h3>${esc(st.title)}</h3><p>${text ? esc(text) : "Boomer's telling of this stop is on the way."}</p></div><div class="bc-story-side"><span class="bt-badge bt-badge--gold">${esc(st.yr)}</span>${st.link ? `<a class="bt-btn bt-btn--secondary bt-btn--sm" href="${esc(st.link.href)}">${esc(st.link.label)}</a>` : ""}${member.preview ? `<span class="bt-badge bt-badge--gray">Sample text</span>` : ""}</div></div>`;
  };
  stops.forEach((li, i) => {
    const pick = () => { sel = i; showStop(); reveal(li); };
    li.addEventListener("click", pick);
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });

  // ---- the Fan Club parts ----
  onMemberDoc<StoryDoc>("base-camp", (m) => {
    member = m;
    const isMember = m.status === "member";
    // chapter 2: the card backs
    root.querySelectorAll<HTMLElement>(".bc-pcard").forEach((card) => {
      const key = card.dataset.side!, side = data.sides.find((s) => s.key === key)!;
      const back = card.querySelector<HTMLElement>(".bt-flip-face--back")!;
      const text = m.doc?.sides?.[key];
      if (isMember) {
        back.className = "bt-flip-face bt-flip-face--back pc-face pc-face--read";
        back.innerHTML = `<span class="pc-frame"></span><span class="pc-read-top">${suitSvg(side.suit)}<b>${esc(side.name)}</b></span><span class="pc-text">${text ? esc(text) : "Boomer's words for this card are on the way."}</span>`;
        card.setAttribute("aria-label", `${side.name}. ${side.sub} ${text || ""}`.trim());
      } else if (back.classList.contains("pc-face--read")) {
        back.className = "bt-flip-face bt-flip-face--back pc-face pc-face--back";
        back.innerHTML = card.querySelector<HTMLTemplateElement>("template[data-back]")!.innerHTML;
        card.setAttribute("aria-label", `${side.name}. ${side.sub} Full story in the Fan Club.`);
      }
    });
    const sidesLock = root.querySelector<HTMLElement>("[data-bc-sides-lock]");
    if (sidesLock) sidesLock.innerHTML = isMember ? "" : lockCard(m, data.sidesLock.title, data.sidesLock.text, "#bc-ch2");
    // chapter 3: the story panel
    showStop();
    // chapter 5: the full paragraph, or the opener and a lock card
    const beyond = root.querySelector<HTMLElement>("[data-bc-beyond]");
    if (beyond) {
      beyond.innerHTML = isMember
        ? `<p>${m.doc?.beyond ? esc(m.doc.beyond) : esc(data.beyond.opener)}</p>${m.preview ? `<span class="bt-badge bt-badge--gray">Sample text</span>` : ""}`
        : `<p>${esc(data.beyond.opener)}</p>${lockCard(m, data.beyond.lock.title, data.beyond.lock.text, "#bc-ch5")}`;
    }
  });

  // ---- stage 5: its line and its tag from public/climb ----
  void loadClimb().then((c) => {
    climb = c;
    const st = data.stops.find((x) => x.key === "build") as (typeof data.stops)[number] & { tag?: { building: string; back: string } };
    const li = root.querySelector<HTMLElement>('[data-stop="build"]');
    if (!st || !li) return;
    const line = c ? fill(st.tease, c) : null;
    if (line) { li.querySelector<HTMLElement>("[data-bc-tease]")!.textContent = line; li.setAttribute("aria-label", `${st.title}, ${st.yr}. ${line}`); }
    const tag = li.querySelector<HTMLElement>("[data-bc-s5-tag]");
    if (tag && st.tag && backOnAir(c)) { tag.className = "bt-badge bt-badge--lime bc-s5-tag"; tag.textContent = st.tag.back; }
    if (sel === stops.indexOf(li)) showStop();
  });

  // ---- The rise, replayed (public/climb only) ----
  initReplay(root);
}
