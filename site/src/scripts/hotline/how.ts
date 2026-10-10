// /contact/how-it-works (docs/specs/hotline-boom.md §9 "H1"). The shared How it works behaviour (the journey, BOOMBOT's chat, the flip medals), plus Hotline Boom's own:
//   the dial      hover or focus a hole: its line on the LCD; click, Enter or Space: the disc turns to the finger stop and back, the LCD says "Connected" with a link to
//                 /contact?line=N, and that line's card in chapter 1 lights up. Reduced motion: no turn, it just connects.
//   the flow      the Team / Gold / Safety switch chips light one route through "Who reads what" (again to clear).
//   the finder    keyword match from what's typed to a line (or to Bug Zapper / Feature Lab). Nothing is sent or stored.
// hotline/main (public) gives the reply time and which lines are switched off (their holes and cards are hidden).
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { HOLE_A, DIAL_STOP, icon } from "./art";

type Lane = "team" | "owner";
const LINES: { id: string; n: number; title: string; lane: Lane; text: string }[] = [
  { id: "hi", n: 1, title: "Say hi", lane: "team", text: "Fan mail, a favourite moment, or just hello." },
  { id: "feedback", n: 2, title: "Feedback", lane: "team", text: "Streams, the website, games, anything. Pick a stream from the list so we know which night." },
  { id: "help", n: 3, title: "Account help", lane: "team", text: "Signing in, your handle, your data. Quick answers show first, so you may not need to send at all." },
  { id: "business", n: 4, title: "Business & collabs", lane: "owner", text: "Sponsorships, collabs, game keys, press. A few short fields help Boomertanger reply fast." },
  { id: "private", n: 5, title: "Private matter", lane: "owner", text: "Anything only Boomertanger should see. Not the crew, not the admins." },
  { id: "report", n: 6, title: "Report a person", lane: "owner", text: "A member, a mod or an admin. Reports about the crew never reach the crew." },
];
// Keyword groups, checked in this order (the first group with a hit wins). Short keys (3 letters or fewer) must be whole words.
const FIND: { line: number | "bug" | "idea"; k: string[] }[] = [
  { line: 3, k: ["log in", "login", "sign in", "signin", "password", "account", "handle", "username", "verify", "my data", "delete my", "email change"] },
  { line: 6, k: ["harass", "report", "rude", "timed me out", "timeout", "timed out", "banned", "ban", "creep", "threat", "abuse", "keeps messaging", "dm", "dms", "mod was", "admin was", "bully"] },
  { line: 4, k: ["sponsor", "brand", "collab", "partnership", "press", "interview", "rates", "media kit", "business", "company", "promo", "game key", "keys", "paid", "agency"] },
  { line: 5, k: ["private", "personal", "secret", "only you", "confidential", "between us"] },
  { line: "bug", k: ["bug", "broken", "error", "crash", "glitch", "not loading", "doesn't load", "doesnt load", "slow"] },
  { line: "idea", k: ["idea", "feature", "suggest", "would be cool", "you should add", "please add", "wish the site"] },
  { line: 2, k: ["stream", "audio", "mic", "sound", "quiet", "loud", "website", "game", "feedback", "quality", "schedule", "overlay", "too", "better if"] },
  { line: 1, k: ["hi", "hello", "hey", "love", "fan", "thanks", "thank you", "shoutout", "made my", "awesome", "favourite", "favorite"] },
];

const root = document.querySelector<HTMLElement>("[data-hw]");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const off = new Set<string>();
const laneTag = (lane: Lane) => (lane === "owner" ? `<span class="bt-tag hb-lane hb-lane--owner">${icon("private")}Only Boomertanger</span>` : `<span class="bt-tag hb-lane">${icon("team")}Boomertanger + inbox team</span>`);

/* ---------- the dial ---------- */
function lcd(top: string, main: string, subHtml: string) {
  const el = root?.querySelector<HTMLElement>("[data-hw-lcd]");
  if (el) el.innerHTML = `<span class="hb-hw-lcd-top"><span>Hotline Boom</span><span>${esc(top)}</span></span><span class="hb-hw-lcd-main">${esc(main)}</span><span class="hb-hw-lcd-sub">${subHtml}</span>`;
}
const who = (l: (typeof LINES)[number]) => (l.lane === "owner" ? "Only Boomertanger reads it." : "Boomertanger + inbox team.");
let busy = false;
function preview(i: number) { if (busy) return; const l = LINES[i]; lcd("Ready", `${l.n} ${l.title}`, esc(who(l))); }
function dial(i: number) {
  if (busy || !root) return;
  busy = true;
  const l = LINES[i], disc = root.querySelector<SVGGElement>("[data-disc]");
  root.querySelectorAll(".hb-hw-dial .hole").forEach((h) => h.classList.toggle("is-on", Number((h as HTMLElement).dataset.hole) === i));
  lcd("Dialing", `${l.n} ${l.title}`, "…");
  const still = reduced();
  if (disc && !still) disc.style.transform = `rotate(${DIAL_STOP - HOLE_A[i]}deg)`;
  const back = still ? 0 : 900, settle = still ? 0 : 1000;
  setTimeout(() => { if (disc) disc.style.transform = ""; }, back + 150);
  setTimeout(() => {
    busy = false;
    lcd("Connected", l.title, `${esc(who(l))} <a href="/contact?line=${l.n}">Open line ${l.n}</a>`);
    root.querySelectorAll<HTMLElement>(".hb-hw-stage").forEach((s) => s.classList.toggle("is-on", s.dataset.s === l.id));
  }, back + settle);
}

/* ---------- the flow ---------- */
function light(k: string | null) {
  const flow = root?.querySelector<HTMLElement>("[data-hw-flow]");
  if (!flow) return;
  if (k) flow.dataset.lit = k; else delete flow.dataset.lit;
  flow.querySelectorAll<HTMLElement>("[data-on]").forEach((el) => el.classList.toggle("is-lit", !!k && el.dataset.on!.split(" ").includes(k)));
  flow.querySelector(".hb-hw-node--you")?.classList.toggle("is-lit", !!k);
  root!.querySelectorAll<HTMLElement>("[data-lit]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lit === k)));
}

/* ---------- the line finder ---------- */
function finder(text: string) {
  const out = root?.querySelector<HTMLElement>("[data-hw-result]");
  if (!out) return;
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, " ")} `;
  if (!text.trim()) { out.className = "hb-hw-result"; out.innerHTML = `<div class="hb-hw-empty">${mascot()}<span>Your line shows up here as you type.</span></div>`; return; }
  const hit = FIND.find((f) => (typeof f.line !== "number" || !off.has(LINES[f.line - 1].id)) && f.k.some((k) => t.includes(k.length <= 3 ? ` ${k} ` : k)));
  if (hit && (hit.line === "bug" || hit.line === "idea")) {
    const bug = hit.line === "bug";
    out.className = "hb-hw-result is-hit is-else";
    out.innerHTML = `<div class="hb-hw-res-top"><span class="hb-hw-res-key">${icon(bug ? "bug" : "bulb")}</span><div><small>Faster somewhere else</small><b>${bug ? "Bug Zapper" : "Feature Lab"}</b></div></div><p>${bug ? "Sounds like something on the site is broken. Bug Zapper tracks it until it's fixed, and you can follow along." : "Sounds like an idea for the site. On Feature Lab, members vote, so good ideas rise."}</p><div class="ai-acts"><a class="bt-btn bt-btn--primary bt-btn--sm" href="${bug ? "/bug-zapper" : "/feature-lab"}">Open ${bug ? "Bug Zapper" : "Feature Lab"}</a>${off.has("feedback") ? "" : '<a class="bt-btn bt-btn--ghost bt-btn--sm" href="/contact?line=2">Send it as Feedback anyway</a>'}</div>`;
    return;
  }
  const guess = LINES.find((l) => !off.has(l.id) && l.id === "feedback") || LINES.find((l) => !off.has(l.id));
  const l = hit && typeof hit.line === "number" ? LINES[hit.line - 1] : guess;
  if (!l) { out.className = "hb-hw-result"; out.innerHTML = `<div class="hb-hw-empty">${mascot()}<span>The lines are closed right now. The email addresses on the contact page still work.</span></div>`; return; }
  out.className = `hb-hw-result is-hit${l.lane === "owner" ? " is-owner" : ""}`;
  out.innerHTML = `<div class="hb-hw-res-top"><span class="hb-hw-res-key">${l.n}</span><div><small>${hit ? "Your line" : "Best guess"}</small><b>${esc(l.title)}</b></div></div>${laneTag(l.lane)}<p>${esc(l.text)}</p><div class="ai-acts"><a class="bt-btn bt-btn--primary bt-btn--sm" href="/contact?line=${l.n}">Open line ${l.n}</a></div>`;
}

/* ---------- wiring ---------- */
if (root) {
  initHowItWorks(root as unknown as Document);
  initFlipCards(root as unknown as Document);
  root.addEventListener("click", (e) => {
    const t = e.target as Element;
    const h = t.closest<HTMLElement>("[data-hole]"); if (h) { dial(Number(h.dataset.hole)); return; }
    const lb = t.closest<HTMLElement>("[data-lit]"); if (lb) { const flow = root.querySelector<HTMLElement>("[data-hw-flow]"); light(flow?.dataset.lit === lb.dataset.lit ? null : lb.dataset.lit!); return; }
    const sm = t.closest<HTMLElement>("[data-sample]"); if (sm) { const ta = root.querySelector<HTMLTextAreaElement>("#hw-finder")!; ta.value = sm.dataset.sample!; finder(ta.value); }
  });
  root.addEventListener("keydown", (e) => { const h = (e.target as Element).closest?.<HTMLElement>("[data-hole]"); if (h && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); dial(Number(h.dataset.hole)); } });
  root.addEventListener("mouseover", (e) => { const h = (e.target as Element).closest?.<HTMLElement>("[data-hole]"); if (h) preview(Number(h.dataset.hole)); });
  root.addEventListener("focusin", (e) => { const h = (e.target as Element).closest?.<HTMLElement>("[data-hole]"); if (h) preview(Number(h.dataset.hole)); });
  root.addEventListener("input", (e) => { const t = e.target as HTMLTextAreaElement; if (t.id === "hw-finder") finder(t.value); });

  // the reply-time promise and the lines switched off (hotline/main is public)
  getDoc(doc(db, "sites", SITE_ID, "hotline", "main")).then((s) => {
    if (!s.exists()) return;
    const d = s.data() as { replyTime?: string; lines?: Record<string, boolean> };
    const rt = typeof d.replyTime === "string" && d.replyTime.trim() ? d.replyTime.trim() : "";
    if (rt) {
      root.querySelectorAll<HTMLElement>("[data-hw-reply]").forEach((el) => { el.textContent = `~${rt}`; });
      root.querySelectorAll<HTMLElement>("[data-hw-reply-text]").forEach((el) => { el.textContent = rt; });
      root.querySelectorAll<HTMLElement>("[data-hw-reply-faq]").forEach((el) => { el.textContent = `Usually within ${rt}, often sooner. Keep your BT reference number in case you want to follow up.`; });
    }
    for (const [id, on] of Object.entries(d.lines || {})) if (on === false) off.add(id);
    LINES.forEach((l, i) => {
      if (!off.has(l.id)) return;
      root.querySelector(`.hb-hw-dial [data-hole="${i}"]`)?.classList.add("is-off");
      root.querySelector<HTMLElement>(`.hb-hw-stage[data-s="${l.id}"]`)?.setAttribute("hidden", "");
    });
  }).catch(() => { /* the defaults are already on the page */ });
}
