// /admin/inbox/how-it-works, the staff guide (docs/specs/talk-back.md §10). Display only: the rules decide what anyone can read.
//   the gate     the owner (sites/{id}.ownerUid) or a crewGrade claim in hotline/main.inboxGrades sees the page; signed out: the sign-in gate; anyone else:
//                "Staff only". Preview (non-production, signed out, ?as=admin): the page with sample counts.
//   the values   every [data-v] number from crew/main.inbox (staff read it), the defaults in the page until then or if it can't be read; the reply time
//                from hotline/main.replyTime. A "valuesChanged" event lets the pretend desk (chapter 09) use them too.
//   the counts   the hero's two .bt-tag counts from hotline/main/inboxStats (the team's first replies this Chicago month, the Clear desk streak);
//                hidden when unreadable
//   the journey  the shared .ai-jr behaviour, plus an envelope that travels the line once when it scrolls into view, lighting each stop
//                (reduced motion: no travel; hover, focus or a tap still lights a stop)
//   the rest     initHowItWorks (stage spotlights, BOOMBOT's chat), the flip medals, the flow (action → check → Gears)
import { initHowItWorks, initFlow } from "../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { onAuth, type AuthState } from "../../lib/auth";
import { auth } from "../../lib/firebase";
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { isProduction } from "../../lib/env.js";

export const DEFAULTS = { reply: 4, fast: 2, fastHours: 24, oldest: 1, spam: 1, spamHoldDays: 7, spamDailyCap: 5, desk: 5, deskMinHandled: 3, deskStaleHours: 48, dailyCap: 30, operatorMin: 5, operatorAccuracy: 0.9 };
export type Values = typeof DEFAULTS;
const host = document.querySelector<HTMLElement>("[data-hb-access]");
const root = document.querySelector<HTMLElement>("[data-sh]");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const qs = () => new URLSearchParams(location.search);
const base = () => ["sites", SITE_ID, "hotline", "main"] as const;
const chicagoYm = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(t)).slice(0, 7);
const prevYm = (ym: string) => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
let preview = false;
const setAccess = (a: "loading" | "join" | "denied" | "page") => { if (host) host.dataset.hbAccess = a; };

/* ---------- the values ---------- */
function applyValues(v: Values) {
  root?.querySelectorAll<HTMLElement>("[data-v]").forEach((el) => {
    const k = el.dataset.v!;
    el.textContent = k === "operatorAccuracyPct" ? String(Math.round(v.operatorAccuracy * 100)) : String((v as any)[k] ?? el.textContent);
  });
  // the flip medals' accessible names carry the same numbers
  root?.querySelectorAll<HTMLElement>(".bt-flip").forEach((f) => { const back = f.querySelector(".bt-flip-face--back"); const front = f.querySelector(".bt-flip-face > b"); if (back && front) f.setAttribute("aria-label", `${front.textContent}. ${[...back.querySelectorAll(".bt-flip-k")].map((k) => `${k.textContent}: ${k.nextElementSibling?.textContent || ""}`).join(" ")}`); });
  (window as any).btInboxValues = v;
  document.dispatchEvent(new CustomEvent("hb:values", { detail: v }));
}
async function loadValues() {
  if (preview) { applyValues(DEFAULTS); return; }
  try {
    const c = await getDoc(doc(db, "sites", SITE_ID, "crew", "main"));
    applyValues({ ...DEFAULTS, ...((c.exists() && (c.get("inbox") as Partial<Values>)) || {}) });
  } catch { applyValues(DEFAULTS); }
}

/* ---------- the hero's counts ---------- */
function showCounts(replies: number | null, streak: number | null) {
  const set = (tag: string, val: string, n: number | null, text: string) => { const t = root?.querySelector<HTMLElement>(tag); const b = root?.querySelector<HTMLElement>(val); if (!t || !b) return; t.hidden = n == null; if (n != null) b.textContent = text; };
  set("[data-sh-replies-tag]", "[data-sh-replies]", replies, String(replies));
  set("[data-sh-streak-tag]", "[data-sh-streak]", streak, `${streak} day${streak === 1 ? "" : "s"}`);
  const box = root?.querySelector<HTMLElement>("[data-sh-stats]"); if (box) box.hidden = replies == null && streak == null;
}
async function loadCounts() {
  if (preview) { showCounts(25, 4); return; }
  try {
    const ym = chicagoYm(Date.now());
    const [cur, prev] = await Promise.all([getDoc(doc(db, ...base(), "inboxStats", ym)), getDoc(doc(db, ...base(), "inboxStats", prevYm(ym)))]);
    const per = (cur.exists() && (cur.get("perStaff") as Record<string, { replies?: number }>)) || {};
    const replies = Object.values(per).reduce((t, s) => t + (Number(s?.replies) || 0), 0);
    const desk = (cur.exists() && cur.get("desk")) || (prev.exists() && prev.get("desk")) || null;
    showCounts(replies, desk ? Number(desk.streak) || 0 : 0);
  } catch { showCounts(null, null); }
}
async function loadReplyTime() {
  if (preview) return;
  try { const m = await getDoc(doc(db, ...base())); const rt = m.exists() ? String(m.get("replyTime") || "") : ""; if (rt) root?.querySelectorAll<HTMLElement>("[data-sh-replytime]").forEach((e) => (e.textContent = rt)); } catch { /* the page's "3 days" */ }
}

/* ---------- the journey's envelope ---------- */
function journeyTravel() {
  const wrap = root?.querySelector<HTMLElement>("[data-sh-jrwrap]");
  const list = wrap?.querySelector<HTMLElement>("[data-sh-journey]");
  if (!wrap || !list || reduced() || !("IntersectionObserver" in window)) return;
  const items = [...list.children] as HTMLElement[];
  const step = (i: number) => {
    list.dataset.active = String(i); list.style.setProperty("--p", String(i)); wrap.style.setProperty("--p", String(i));
    items.forEach((li, j) => { li.classList.toggle("is-on", j === i); li.classList.toggle("is-past", j < i); });
  };
  const io = new IntersectionObserver((ents) => {
    if (!ents.some((e) => e.isIntersecting)) return;
    io.disconnect();
    wrap.classList.add("is-travel");
    let i = 0; step(0);
    const t = setInterval(() => {
      if (list.matches(":hover") || list.contains(document.activeElement)) { clearInterval(t); wrap.classList.remove("is-travel"); return; }   // the visitor took over
      i++;
      if (i < items.length) { step(i); return; }
      clearInterval(t);
      setTimeout(() => { wrap.classList.remove("is-travel"); list.removeAttribute("data-active"); list.style.setProperty("--p", "0"); items.forEach((li) => li.classList.remove("is-on", "is-past")); }, 1400);
    }, 1100);
  }, { threshold: 0.6 });
  io.observe(list);
}

function wire() {
  if (!root) return;
  initHowItWorks(root as unknown as Document);
  initFlipCards(root as unknown as Document);
  const flow = root.querySelector<HTMLElement>("[data-sh-flow]"); if (flow) initFlow(flow);
  journeyTravel();
  root.querySelectorAll<HTMLElement>("[data-sh-try]").forEach((a) => { a.hidden = !document.getElementById("s-try"); });
}

/* ---------- access and start ---------- */
let started = false;
async function start() { setAccess("page"); wire(); await Promise.all([loadValues(), loadCounts(), loadReplyTime()]); }
onAuth(async (s: AuthState) => {
  if (s.status === "loading" || started) return;
  if (!s.user && !isProduction && qs().get("as") === "admin") { started = true; preview = true; await start(); return; }
  if (!s.user || s.status === "needsSignup") { setAccess("join"); return; }
  started = true;
  let ok = false;
  try {
    const [site, mainSnap, tok] = await Promise.all([getDoc(doc(db, "sites", SITE_ID)), getDoc(doc(db, ...base())), auth.currentUser!.getIdTokenResult()]);
    const owner = String(site.get("ownerUid") || "") === s.user.uid;
    const grades = (mainSnap.exists() && Array.isArray(mainSnap.get("inboxGrades")) ? mainSnap.get("inboxGrades") : ["A2", "A3"]) as string[];
    const grade = tok.claims.crewGrade;
    ok = owner || (typeof grade === "string" && grades.includes(grade));
  } catch { ok = false; }
  if (!ok) { setAccess("denied"); started = false; return; }
  await start();
});
