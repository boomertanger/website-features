// /admin: the Traffic Pulse card (docs/specs/traffic-pulse.md §2): a tiny monitor of the last 12 hours, today's visits against a usual day like
// today, the newest open alert and the goal that most needs attention; opens /admin/pulse. Site admins (the rules let admins read pulse/main).
// Preview (non-production, signed out, ?as=admin): the page's sample data.
import { whenReady } from "../../lib/auth";
import { isAdmin, isPreview } from "../stash/gate";
import { monitorData, previewData, today, type Alert, type Goal, type Day } from "../pulse/data";

const card = document.querySelector<HTMLElement>("[data-pulse-card]");
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const GOAL_NAME: Record<string, string> = { visitors: "Monthly visitors", members: "New members", fanClub: "Fan Club joins", returnRate: "Member return rate", serviceViews: "Views on a service" };

async function readRest(): Promise<{ alerts: Alert[]; goals: Goal[]; month: Day[] }> {
  if (isPreview()) { const p = previewData(); return { alerts: p.alerts, goals: p.goals, month: p.days.filter((d) => d.day.startsWith(today().slice(0, 7))) }; }
  const { db, collection, getDocs, query, where, orderBy, limit, SITE_ID } = await import("../../lib/db");
  const { documentId } = await import("firebase/firestore/lite");
  const base = ["sites", SITE_ID, "pulse", "main"] as const;
  const m = today().slice(0, 7);
  const [a, g, d] = await Promise.all([
    getDocs(query(collection(db, ...base, "alerts"), orderBy("firstAt", "desc"), limit(20))),
    getDocs(query(collection(db, ...base, "goals"), where("month", "==", m))),
    getDocs(query(collection(db, ...base, "days"), where(documentId(), ">=", `${m}-01`), where(documentId(), "<=", today()))),
  ]);
  return { alerts: a.docs.map((x) => ({ id: x.id, ...x.data() }) as Alert), goals: g.docs.map((x) => ({ id: x.id, ...x.data() }) as Goal), month: d.docs.map((x) => ({ day: x.id, ...x.data() }) as Day) };
}

whenReady().then(async (s) => {
  if (!card || !isAdmin(s)) return;
  card.hidden = false;
  const body = card.querySelector<HTMLElement>("[data-pulse-body]")!;
  try {
    const [m, rest] = await Promise.all([monitorData(), readRest()]);
    if (!m) { body.innerHTML = `<p class="bt-meta">No pulse yet. Counting starts with the first visit on boomertanger.com.</p>`; return; }
    const v = m.hours.slice(-12), mx = Math.max(1, ...v);
    const path = v.map((x, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * 100).toFixed(1)} ${(46 - (x / mx) * 38).toFixed(1)}`).join("");
    const nowH = Number(m.nowHour), soFar = m.hours.slice(-(nowH + 1)).reduce((a, b) => a + b, 0), usual = Math.round(m.usual.slice(-(nowH + 1)).reduce((a, b) => a + b, 0));
    const diff = usual ? Math.round(((soFar - usual) / usual) * 100) : 0;
    const open = rest.alerts.find((a) => a.state === "new");
    const [y, mo] = today().slice(0, 7).split("-").map(Number), dim = new Date(Date.UTC(y, mo, 0)).getUTCDate(), at = Number(today().slice(8, 10)) / dim;
    const progress = (g: Goal) => { const days = rest.month, n = g.kind === "visitors" ? days.reduce((a, x) => a + (x.uniques || 0), 0) : g.kind === "returnRate" ? 0 : days.reduce((a, x) => a + (x.newMembers || 0), 0); return n / Math.max(1, g.target) - at; };
    const worst = rest.goals.filter((g) => g.kind !== "returnRate" && g.kind !== "serviceViews").sort((a, b) => progress(a) - progress(b))[0];
    body.innerHTML = `<div class="tp-acard-top"><div class="tp-acard-mon" aria-hidden="true"><svg viewBox="0 0 100 50" preserveAspectRatio="none"><path d="${path}"/></svg></div><div class="tp-acard-big"><b>${fmt(soFar)}</b>visits today, ${usual ? `${Math.abs(diff)}% ${diff >= 0 ? "above" : "below"} a usual ${esc(m.weekday)}` : "no usual day yet"}</div></div>
      ${open ? `<div class="tp-acard-row"><span class="bt-badge bt-badge--${open.severity === "urgent" ? "red" : open.severity === "good" ? "lime" : "gold"}">${open.severity === "urgent" ? "Urgent" : open.severity === "good" ? "Good news" : "Watch"}</span><b>${esc(open.title)}</b></div>` : `<div class="tp-acard-row">No open alerts.</div>`}
      ${worst ? `<div class="tp-acard-row">Needs attention: <b>${esc(GOAL_NAME[worst.kind] || worst.kind)}</b> ${progress(worst) < -0.05 ? "is behind" : "is on pace"}</div>` : ""}`;
  } catch (err) {
    console.warn("pulse card: couldn't read", err);
    body.innerHTML = `<p class="bt-meta">Couldn't read Traffic Pulse. Reload to try again.</p>`;
  }
});
