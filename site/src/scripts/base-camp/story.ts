// site/src/scripts/base-camp/story.ts — /base-camp (docs/specs/base-camp.md "Page 1"). Wires the built page: the How it works behaviour (the
// journey's line, BOOMBOT's chat), the playing cards (tap turns one over; a holo sheen follows the pointer), the four stops (hover lights the line,
// a click or Enter picks the stop the story panel tells), Then and now (September 30, 2025 rolls up to today's live total from
// sites/boomertanger/public/socials when it's seen; a platform with no count is hidden; none at all leaves the 2025 total alone, with its date),
// the E1 stage cards (stage.ts), and the Fan Club parts from memberContent/base-camp (member.ts): card backs, the full stop stories and chapter
// 5's paragraph for members, lock cards for everyone else. Member text is escaped and never written into the page HTML at build time.
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { onMemberDoc, type StoryDoc, type MemberState } from "./member";
import { initStageCards } from "./stage";
import { esc, lockCard, RM } from "./ui";
import { suitSvg } from "./story-art";
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
  const showStop = () => {
    stops.forEach((li, i) => li.classList.toggle("is-sel", i === sel));
    const panel = root.querySelector<HTMLElement>("[data-bc-stop]");
    if (!panel) return;
    const st = data.stops[sel];
    if (member.status !== "member") { panel.innerHTML = lockCard(member, data.stopsLock.title, data.stopsLock.text, "#bc-ch3"); return; }
    const text = member.doc?.stops?.[st.key];
    panel.innerHTML = `<div class="bc-story"><div><h3>${esc(st.title)}</h3><p>${text ? esc(text) : "Boomer's telling of this stop is on the way."}</p></div><div class="bc-story-side"><span class="bt-badge bt-badge--gold">${esc(st.yr)}</span>${st.link ? `<a class="bt-btn bt-btn--secondary bt-btn--sm" href="${esc(st.link.href)}">${esc(st.link.label)}</a>` : ""}${member.preview ? `<span class="bt-badge bt-badge--gray">Sample text</span>` : ""}</div></div>`;
  };
  stops.forEach((li, i) => {
    const pick = () => { sel = i; showStop(); };
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

  // ---- Then and now ----
  void thenAndNow(root);
}

const fmt = (n: number) => n.toLocaleString("en-US");
type Plat = "twitch" | "tiktok" | "youtube";
async function thenAndNow(root: HTMLElement) {
  const box = root.querySelector<HTMLElement>("[data-bc-then]");
  if (!box) return;
  let now: Partial<Record<Plat, number>> = {};
  try {
    const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
    const s = await getDoc(doc(db, "sites", SITE_ID, "public", "socials"));
    const d = s.exists() ? s.data() : {};
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
    now = { twitch: num(d?.twitch?.followers), tiktok: num(d?.tiktok?.followers), youtube: num(d?.youtube?.subscribers) };
  } catch (err) { console.warn("base camp: couldn't read the follower counts", err); }
  const plats = (["twitch", "tiktok", "youtube"] as Plat[]).filter((k) => now[k] !== undefined);
  if (!plats.length) return;   // all missing: the 2025 total stays on its own, labelled with its date
  const total = plats.reduce((s, k) => s + (now[k] as number), 0);
  const max = Math.max(...plats.map((k) => now[k] as number), data.then.tiktok, data.then.twitch, data.then.youtube);
  box.querySelectorAll<HTMLElement>(".is-now [data-plat]").forEach((li) => {
    const k = li.dataset.plat as Plat, v = now[k];
    li.hidden = v === undefined;
    if (v !== undefined) { li.querySelector("b")!.textContent = fmt(v); li.querySelector<HTMLElement>("i")!.dataset.w = `${((v / max) * 100).toFixed(1)}%`; }
  });
  box.querySelectorAll<HTMLElement>(".bc-then-col:not(.is-now) [data-plat] i").forEach((i) => {
    const k = (i.closest("[data-plat]") as HTMLElement).dataset.plat as Plat;
    i.style.setProperty("--w", `${((data.then[k] / max) * 100).toFixed(1)}%`);
  });
  const big = box.querySelector<HTMLElement>("[data-bc-now]")!;
  big.dataset.count = String(total);
  big.textContent = fmt(total);
  box.classList.add("has-now");
  const roll = () => {
    const bars = [...box.querySelectorAll<HTMLElement>(".is-now [data-plat] i")];
    if (RM()) { bars.forEach((b) => b.style.setProperty("--w", b.dataset.w || "0%")); big.textContent = fmt(total); return; }
    bars.forEach((b) => { b.style.setProperty("--w", "0%"); requestAnimationFrame(() => requestAnimationFrame(() => b.style.setProperty("--w", b.dataset.w || "0%"))); });
    const from = data.then.total, t0 = performance.now(), dur = 1400;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); big.textContent = fmt(Math.round(from + (total - from) * e)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  box.querySelector("[data-bc-replay]")?.addEventListener("click", roll);
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); roll(); } }, { threshold: 0.4 });
  io.observe(box);
}
