// /crew/hq's time card (Mod Machina phase 3 part 7; docs/specs/mod-machina.md §3f "On the site", §17a "Activity rules on"). crewMe.month says where the rules stand:
//   off      as before: "Starts with stream duty"
//   before   "Activity rules start <Month>."
//   grace/on "2 of 3 duties · Nov" (with the "led" requirement for Warden and Sentinel), a stamp per duty, streams left with open seats (link to /schedule/plan),
//            and in the grace month a small teal line "Practice month: nothing changes status yet."
// Preview (?as=admin, non-production): ?rules=off|before|grace|on draws a sample month.
import { timecardHtml } from "../../../../shared/ui/crew.js";
import { esc } from "./data";
import type { MonthCard } from "./api";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] || "";
const ROLE: Record<string, string> = { captain: "Captain", lead: "Lead", deckhand: "Deckhand" };
const ROOM: Record<string, string> = { twitch: "Twitch", ytLandscape: "YouTube", ytVertical: "YT Vertical", tiktok: "TikTok", site: "Site" };
const hrs = (m: number) => (m >= 60 ? `${Math.round(m / 6) / 10} h` : `${m} min`);

/** The sample months for ?rules= (preview only). */
export function previewMonth(rules: string | null, grade: number): MonthCard | null {
  if (!rules) return null;
  const now = new Date(), ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const next = now.getMonth() === 11 ? `${now.getFullYear() + 1}-01` : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, "0")}`;
  if (rules === "off") return { ym, rules: "off", rulesSince: null, graceMonth: null };
  if (rules === "before") return { ym, rules: "before", rulesSince: next, graceMonth: next };
  const day = (d: number) => new Date(now.getFullYear(), now.getMonth(), d, 20).getTime();
  const led = grade >= 3;
  return {
    ym, rules: rules === "grace" ? "grace" : "on", rulesSince: ym, graceMonth: rules === "grace" ? ym : null, light: false,
    need: led ? 3 : 2, ledRequired: led, counted: 2, led: led ? 0 : 1, adminWork: 0, met: !led, line: led ? "2 of 3 duties, at least 1 as Room Lead or Captain" : "2 of 2 duties",
    duties: [{ at: day(3), minutes: 150, led: false, role: { role: "deckhand", room: "twitch" } }, { at: day(9), minutes: 95, led: !led, role: { role: led ? "deckhand" : "lead", room: "ytVertical" } }],
    streamsLeftOpen: 4, excused: false, joinedThisMonth: false,
  };
}

export function monthCardHtml(m: MonthCard | null): string {
  const now = new Date();
  const month = now.toLocaleDateString("en-US", { month: "long", timeZone: "America/Chicago" });
  if (!m || m.rules === "off") return timecardHtml({ month, need: 2, total: 4, state: "idle" } as any);
  if (m.rules === "before") return timecardHtml({ month, need: 2, total: 4, state: "idle", badge: "Not started", foot: `Activity rules start ${monthName(m.rulesSince || "")}.` } as any);
  const short = monthName(m.ym).slice(0, 3);
  const need = m.need ?? 2, counted = m.counted ?? 0;
  const slots = (m.duties || []).slice(0, 4).map((d) => ({ stamp: new Date(d.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }), text: `${d.role ? `${ROLE[d.role.role] || ""}${d.role.room ? ` · ${ROOM[d.role.room] || d.role.room}` : ""} · ` : ""}${hrs(d.minutes)}` }));
  const state = counted >= 4 ? "done" : m.met ? "normal" : "behind";
  const ledLine = m.ledRequired ? `<span class="hq-tc-led${(m.led ?? 0) >= 1 ? " is-ok" : ""}">${(m.led ?? 0) >= 1 ? "✓" : "○"} at least 1 as Room Lead or Captain</span>` : "";
  const notes = [
    m.light ? `<span class="hq-tc-note">Light month: 1 duty is enough.</span>` : "",
    m.excused ? `<span class="hq-tc-note">You're excused this month.</span>` : "",
    m.joinedThisMonth ? `<span class="hq-tc-note">Your first month: it doesn't count as missed.</span>` : "",
    m.rules === "grace" ? `<span class="hq-tc-grace">Practice month: nothing changes status yet.</span>` : "",
  ].join("");
  const left = m.streamsLeftOpen ?? 0;
  const foot = `<span><b>${counted} of ${need}</b> dut${need === 1 ? "y" : "ies"} · ${esc(short)}</span>${ledLine}`
    + `<a class="hq-tc-left" href="/schedule/plan">${left} stream${left === 1 ? "" : "s"} left with open seats</a>${notes}`;
  return timecardHtml({ month, need, total: 4, slots, state, foot, badge: state === "done" ? undefined : m.met ? "On track" : "Behind" } as any);
}
