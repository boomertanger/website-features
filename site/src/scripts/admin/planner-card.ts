// /admin: the Scream Planner card (docs/specs/scream-planner.md §2): the deadlines and defaults in a line, a "Week not published" to-do
// when the open week is past its publish-by time, and links to the planner pages. Reads planner/main, planWeeks and its to-dos (admins
// and staff read them); writes nothing. Preview (non-production, signed out, ?as=admin) uses src/data/preview-planner-plan.json.
import { whenReady } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";
import { loadSettings, loadWeeks, loadTodos, fmtDayTime, hhmm12, weekRange, DAY_SHORT, type Settings, type WeekDoc, type Todo } from "../planner/plan-data";

const card = document.querySelector<HTMLElement>("[data-planner-card]");
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function show(settings: Settings, weeks: WeekDoc[], todos: Todo[]) {
  if (!card) return;
  const d = settings.deadlines, f = settings.defaults;
  const at = (dow: number, t: string) => `${DAY_SHORT[dow - 1]} ${hhmm12(t)}`;
  card.querySelector<HTMLElement>("[data-pc-deadlines]")!.innerHTML = `Opens <b>${esc(at(d.openDow, d.openTime))}</b> · closes <b>${esc(at(d.closeDow, d.closeTime))}</b> · publish by <b>${esc(at(d.publishDow, d.publishTime))}</b> (Central)`;
  card.querySelector<HTMLElement>("[data-pc-defaults]")!.textContent = `New slots: ${f.gameCount} games, ${f.votesPerMember} votes a member, ${f.rooms.length} chats.`;
  const now = Date.now();
  const late = weeks.filter((w) => w.state !== "published" && !w.weekOff && w.publishBy != null && w.publishBy < now);
  const items = [
    ...late.map((w) => ({ text: `Week not published: ${weekRange(w.id)} was due ${fmtDayTime(w.publishBy)}.`, link: "/schedule/plan" })),
    ...todos.filter((t) => t.kind !== "weekNotPublished").map((t) => ({ text: t.text, link: t.link || "/schedule/plan" })),
  ];
  const box = card.querySelector<HTMLElement>("[data-pc-todos]")!;
  box.hidden = !items.length;
  box.innerHTML = items.map((i) => `<a class="bt-notice pc-todo" href="${esc(i.link)}">● ${esc(i.text)} <span aria-hidden="true">›</span></a>`).join("");
  const next = weeks.find((w) => w.state !== "published");
  card.querySelector<HTMLElement>("[data-pc-week]")!.textContent = next ? `${weekRange(next.id)}: ${next.state === "open" ? "taking votes" : "closed, not published"}` : weeks.length ? "Everything open is published." : "No week is open yet.";
  card.hidden = false;
}

whenReady().then(async (s) => {
  if (!card) return;
  if (!s.user) {
    if (!isProduction && new URLSearchParams(location.search).get("as") === "admin") {
      const m = await import("../planner/plan-preview");
      const st = m.pv();
      show(st.settings, st.weeks.map((w) => ({ ...w, publishBy: w.state === "published" ? w.publishBy : Date.now() - 3600000 })), []);
    }
    return;
  }
  if (!s.isAdmin && !s.roles.includes("admin")) return;
  try { const [a, b, c] = await Promise.all([loadSettings(), loadWeeks(), loadTodos().catch(() => [] as Todo[])]); show(a, b, c); }
  catch (err) { console.error(err); }
});
