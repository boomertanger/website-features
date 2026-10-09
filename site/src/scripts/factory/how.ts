// Night Shift How it works (docs/design/mockups/fun-factory-how-it-works.html). Ask BOOMBOT, the example
// time card's Punch the clock and the example hidden medal (both local: nothing is saved), and the hero's season
// card. The one Firestore read is the public summary (sites/{siteId}/public/factory): a live season, or the
// next scheduled one, replaces the example card; with neither, the example stays, marked Example.
import { initChat } from "../../../../shared/ui/chat.js";
import { timerHtml, initTimers } from "../../../../shared/ui/countdown.js";
import { escapeHtml } from "../../../../shared/ui/dom.js";
import { loadSummary, type Summary } from "./member-data";

const esc = (v: unknown) => escapeHtml(String(v ?? ""));
const sn = (n: number | null | undefined) => String(n ?? 0).padStart(2, "0");
const DAY = 86400000;

initChat(document);

// The example time card: Punch the clock fills today's punch and adds a day. The hero's example clock does the same.
document.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".ff-hw [data-clock-btn]");
  if (!btn || btn.getAttribute("aria-disabled") === "true") return;
  document.querySelectorAll<HTMLButtonElement>(".ff-hw [data-clock-btn]").forEach((b) => {
    b.textContent = "Punched in ✓";
    b.classList.add("is-done");
    b.setAttribute("aria-disabled", "true");
    b.closest(".bt-clock")?.classList.add("is-done");
  });
  document.querySelectorAll<HTMLElement>(".ff-hw [data-streak]").forEach((s) => (s.textContent = String(Number(s.textContent) + 1)));
  const today = document.querySelector<HTMLElement>(".ff-hw-punch .is-today");
  if (today) { today.classList.add("is-on"); const sr = today.querySelector(".bt-sr-only"); if (sr) sr.textContent = ": today, punched in"; }
});

// The example hidden medal.
const medal = document.querySelector<HTMLButtonElement>("[data-hw-medal]");
medal?.addEventListener("click", () => {
  const found = document.querySelector<HTMLElement>("[data-hw-found]");
  if (found) found.textContent = "🏅 Medal 3 of 5 found";
  medal.classList.add("is-claimed");
  medal.setAttribute("aria-label", "Medal claimed");
  medal.setAttribute("aria-disabled", "true");
});

// The hero's season card, from the public summary.
const card = document.querySelector<HTMLElement>("[data-hw-pass]");
if (card) loadSummary().then((s) => { if (s) render(card, s); }).catch(() => { /* keep the example */ });

function render(el: HTMLElement, s: Summary) {
  const now = Date.now();
  if (s.live && s.liveSeasonId && s.name) {
    const total = Math.max(1, s.chapters || 1), cur = s.chapter?.number || 1;
    const span = (s.endsAt ?? now) - (s.startsAt ?? now);
    const v = span > 0 ? Math.max(0.05, Math.min(1, ((now - (s.startsAt ?? now)) / span) * total - (cur - 1))) : 0.5;
    const days = Math.max(0, Math.ceil(((s.endsAt ?? now) - now) / DAY));
    el.setAttribute("aria-label", "This season");
    el.innerHTML = `${s.art ? `<img class="ff-hw-pass-art" src="${esc(s.art)}" alt="" loading="lazy">` : ""}
      <div class="ff-hw-pass-top"><div><b>Season ${sn(s.number)} · ${esc(s.name)}</b><span>Chapter ${cur} of ${total}${s.chapter?.name ? ` · ${esc(s.chapter.name)}` : ""}</span></div><span class="bt-badge bt-badge--green"><span class="bt-badge-dot"></span>Live</span></div>
      <div class="ff-chaps" aria-hidden="true">${Array.from({ length: total }, (_, i) => i + 1 < cur ? `<i class="is-done"></i>` : i + 1 === cur ? `<i class="is-now" style="--v:${Math.round(v * 100)}%"></i>` : "<i></i>").join("")}</div>
      ${s.pitch ? `<p class="ff-hw-pass-pitch">${esc(s.pitch)}</p>` : ""}
      <div class="ff-hw-pass-stats"><span><b>${days}</b> ${days === 1 ? "day" : "days"} left</span>${s.nextUnlockAt && s.nextUnlockAt > now ? timerHtml({ until: s.nextUnlockAt, label: `Chapter ${s.nextChapterNumber ?? cur + 1} in`, done: "Unlocking now" }) : ""}</div>
      ${s.badge ? `<p class="ff-hw-pass-badge"><span aria-hidden="true">${esc(s.badge.emoji || "🏅")}</span><span>Finish the story for the <b>${esc(s.badge.name)}</b> season badge.</span></p>` : ""}`;
  } else if (s.next) {
    el.setAttribute("aria-label", "Next season");
    el.innerHTML = `<div class="ff-hw-pass-top"><div><b>Season ${sn(s.next.number)}${s.next.name ? ` · ${esc(s.next.name)}` : ""}</b><span>The next season</span></div><span class="bt-badge bt-badge--gold">Coming</span></div>
      <div class="ff-hw-pass-stats">${timerHtml({ until: s.next.startsAt, label: "Starts in", done: "Starting now" })}</div>
      <p class="ff-hw-pass-pitch">A new season, new missions and a fresh race. Join now and your streak is already going when it opens.</p>`;
  } else return;
  initTimers(el);
}
