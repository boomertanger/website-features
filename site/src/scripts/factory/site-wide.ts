// Night Shift pieces on every page (docs/specs/fun-factory.md §8, §13a), for signed-up members only:
//   - the account menu's Clock in item: today's state and the streak, calling factoryCheckIn. Shown only
//     while a season is live or the streak is above 0.
//   - factoryVisit: once a day per site-tour section (functions/lib/factory/logic.js VISIT_SECTIONS),
//     remembered in localStorage, and only while a season is live.
//   - hidden medals: when the public summary's huntPaths lists this page, factoryHuntMedals returns its
//     medals; each unclaimed one is a small .bt-hunt-medal in a corner of <main>, absolutely placed so it
//     never moves the layout. A claim calls factoryClaimMedal and toasts "Medal 3 of 5 found".
// Visitors and members still signing up load nothing beyond this file. The summary is cached for a
// minute and the streak for five, so most pages add no reads.
import { onAuth, type AuthState } from "../../lib/auth";

const VISIT_SECTIONS = ["/", "/live", "/schedule", "/games", "/arcade", "/trophies", "/factory", "/streams", "/shop", "/club"];
const STREAK_MS = 5 * 60000;
let started = "";

onAuth((s) => {
  if (!s.user || (s.status !== "verified" && s.status !== "unverified")) return;
  if (started === s.user.uid) return;
  started = s.user.uid;
  void start(s);
});

async function start(s: AuthState) {
  const uid = s.user!.uid;
  const { loadSummary } = await import("./member-data");
  const summary = await loadSummary().catch(() => null);
  const live = !!(summary?.live && summary.liveSeasonId);
  void clockItem(uid, live);
  if (!live) return;
  void visit(uid);
  const path = internal(norm(location.pathname));
  if ((summary!.huntPaths || []).some((p) => norm(p) === path)) void hunt(path);
}

const norm = (p: string) => (p.split(/[?#]/)[0].replace(/\/+$/, "") || "/").toLowerCase();
/** Night Shift lives at /shift, but the site tour and the medal hunts keep their stored key, /factory (internal name). */
const internal = (p: string) => p.replace(/^\/shift(?=\/|$)/, "/factory");
const dayKey = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(t));
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* no storage */ } },
};

// ---------- account menu: Clock in ----------
interface StreakLite { current: number; lastCheckIn: string | null; at: number }
async function streakOf(uid: string, fresh = false): Promise<StreakLite> {
  const k = `ff-streak-${uid}`;
  if (!fresh) { try { const c = JSON.parse(sessionStorage.getItem(k) || "null"); if (c && Date.now() - c.at < STREAK_MS) return c; } catch { /* read it */ } }
  const { loadStreak } = await import("./member-data");
  const st = await loadStreak(uid);
  const v = { current: st.current, lastCheckIn: st.lastCheckIn ?? st.lastDay ?? null, at: Date.now() };
  try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* not cached */ }
  return v;
}

async function clockItem(uid: string, live: boolean) {
  const items = [...document.querySelectorAll<HTMLButtonElement>("[data-ff-clock]")];
  if (!items.length) return;
  let st: StreakLite;
  try { st = await streakOf(uid); } catch { return; }
  if (!live && !(st.current > 0)) return;
  const paint = () => {
    const done = st.lastCheckIn === dayKey();
    for (const b of items) {
      b.hidden = false;
      b.setAttribute("aria-disabled", String(done));
      b.querySelector("[data-ff-clock-label]")!.textContent = done ? "Clocked in today" : "Clock in";
      b.querySelector("[data-ff-clock-icon]")!.textContent = done ? "✅" : "⏱";
      const meta = b.querySelector<HTMLElement>("[data-ff-clock-meta]")!;
      meta.hidden = !(st.current > 0);
      meta.textContent = `🔥 ${st.current}`;
      meta.setAttribute("aria-label", `${st.current}-day streak`);
    }
  };
  paint();
  for (const b of items) b.addEventListener("click", async () => {
    if (b.getAttribute("aria-disabled") === "true") return;
    items.forEach((x) => x.setAttribute("aria-disabled", "true"));
    const [{ call }, { toast }, { messageFor }] = await Promise.all([import("../../lib/call"), import("../../../../shared/ui/toast.js"), import("../../lib/errors")]);
    try {
      const r = await call<{ day: string; streak: { current: number; already: boolean; spent: number; earnedSaver: boolean; badges: string[] } }>("factoryCheckIn", {});
      st = { current: r.streak.current, lastCheckIn: r.day, at: Date.now() };
      try { sessionStorage.setItem(`ff-streak-${uid}`, JSON.stringify(st)); } catch { /* not cached */ }
      if (r.streak.badges.length) {
        const { loadCatalog } = await import("../trophies/data");
        const names = await loadCatalog().then((c) => new Map(c.badges.map((x) => [x.id, x.name]))).catch(() => new Map<string, string>());
        for (const id of r.streak.badges) toast(`New badge: ${names.get(id) || "a streak badge"}`);
      }
      if (r.streak.spent) toast(`A streak saver covered ${r.streak.spent === 1 ? "a missed day" : `${r.streak.spent} missed days`}. Your streak lives on.`, { kind: "info" });
      if (r.streak.earnedSaver) toast("7 days in a row: you earned a streak saver.");
      toast(r.streak.already ? "You already clocked in today." : `Clocked in. ${r.streak.current} ${r.streak.current === 1 ? "day" : "days"} in a row.`);
    } catch (err) {
      toast(messageFor(err, "Clock in didn't go through. Try again."), { kind: "error" });
    }
    paint();
  });
}

// ---------- site tour visits ----------
async function visit(uid: string) {
  const seg = location.pathname.split("/").filter(Boolean)[0];
  const section = internal(seg ? `/${seg.toLowerCase()}` : "/");
  if (!VISIT_SECTIONS.includes(section)) return;
  const k = `ff-visit-${uid}-${section}`, today = dayKey();
  if (store.get(k) === today) return;
  store.set(k, today);
  try {
    const { call } = await import("../../lib/call");
    await call("factoryVisit", { path: section });
  } catch { /* a missed visit just counts tomorrow */ }
}

// ---------- hidden medals ----------
interface HuntMedal { medalId: string; position: string | null; hint: string | null; art: string | null; found: boolean; token?: string; have?: number; of?: number; activityId?: string }
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];

async function hunt(path: string) {
  const main = document.querySelector<HTMLElement>("#main");
  if (!main) return;
  const [{ call }, { medalHtml }] = await Promise.all([import("../../lib/call"), import("../../../../shared/ui/medal.js")]);
  let medals: HuntMedal[];
  try { medals = (await call<{ medals: HuntMedal[] }>("factoryHuntMedals", { path })).medals || []; } catch { return; }
  const open = medals.filter((m) => !m.found && m.token);
  if (!open.length) return;
  main.classList.add("bt-hunt-host");
  // Medals of the same hunt share have / of; each claim moves it on.
  const tally = new Map<string, { have: number; of: number }>();
  for (const m of medals) if (m.activityId && !tally.has(m.activityId)) tally.set(m.activityId, { have: m.have ?? 0, of: m.of ?? 0 });
  open.forEach((m, i) => {
    const corner = CORNERS.includes(m.position || "") ? m.position! : CORNERS[(i + 3) % 4];
    const b = document.createElement("button");
    b.type = "button";
    b.className = `bt-hunt-medal bt-hunt-medal--${corner}`;
    b.setAttribute("aria-label", "A hidden medal. Claim it.");
    if (m.hint) b.title = m.hint;
    b.innerHTML = medalHtml({ emoji: m.art ? "" : "🏅", art: m.art || "", rarity: 3, size: 28 });
    b.addEventListener("click", () => claim(b, m, tally));
    main.appendChild(b);
  });
}

async function claim(b: HTMLButtonElement, m: HuntMedal, tally: Map<string, { have: number; of: number }>) {
  if (b.getAttribute("aria-disabled") === "true") return;
  b.setAttribute("aria-disabled", "true");
  const [{ call }, { toast }, { messageFor }] = await Promise.all([import("../../lib/call"), import("../../../../shared/ui/toast.js"), import("../../lib/errors")]);
  try {
    const r = await call<{ claimed: boolean; already?: boolean; completed?: string[] }>("factoryClaimMedal", { medalId: m.medalId, token: m.token });
    const t = m.activityId ? tally.get(m.activityId) : null;
    if (r.claimed && t) t.have = Math.min(t.of || t.have + 1, t.have + 1);
    const done = !!(m.activityId && r.completed?.includes(m.activityId));
    toast(r.already ? "You already found this medal." : t && t.of ? `Medal ${t.have} of ${t.of} found${done ? ". Hunt complete!" : ""}` : "Medal found");
    b.classList.add("is-claimed");
    const gone = () => b.remove();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) gone(); else b.addEventListener("animationend", gone, { once: true });
  } catch (err) {
    b.removeAttribute("aria-disabled");
    toast(messageFor(err, "That medal slipped away. Refresh the page and try again."), { kind: "error" });
  }
}
