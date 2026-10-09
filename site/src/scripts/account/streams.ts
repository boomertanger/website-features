// /account#streams, the Streams tab (docs/specs/control-room.md §6): "What we recorded" for the member's last streams (the beats they checked in to and
// the room, whether they counted as present and why, the XP earned there) and their stream streak, plus what is never recorded.
// Reads only what the rules already allow: the published ended streams of the last four weeks (equality filters only, no index), then the member's OWN
// presence doc for the newest ten (streams/{id}/presence/{uid}: the member reads their own). Nothing here needs an index or a rules change.
// "Counted present" mirrors the server's rule (functions/lib/live/logic.js streakPresence): crew on duty, a check-in to at least one beat, 15 minutes
// in Twitch chat (3 buckets of 5), or a live drop. The streak is how many of the latest streams in a row counted (from the last ten, shown as 10+).
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { stampsHtml as _stampsHtml } from "../../../../shared/ui/checkin.js";
import { db, doc, getDoc, getDocs, collection, query, where, SITE_ID } from "../../lib/db";
import { onMember } from "../trophies/data";
import { addDays, weekIdOf, ymd } from "../planner/pub";

const stampsHtml = _stampsHtml as unknown as (stamps: Record<string, boolean>, label?: string) => string;
const pane = document.querySelector<HTMLElement>("[data-st]");
const BEATS = ["start", "break1", "break2", "end"] as const;
const ROOM: Record<string, string> = { twitch: "Twitch", ytLandscape: "YouTube", ytVertical: "YouTube vertical", tiktok: "TikTok", site: "On the site" };
const SHOWN = 10;
const BUCKET_MIN = 5, NEED_BUCKETS = 3;

export interface StreamRow {
  id: string; title: string; at: number;
  beats: Partial<Record<(typeof BEATS)[number], { room: string }>>;
  chatMinutes: number; drops: number; crew: boolean; xp: number; recorded: boolean;
}

const countOf = (v: unknown): number => (Array.isArray(v) ? v.length : typeof v === "number" ? v : v && typeof v === "object" ? Object.keys(v).length : 0);
const ms = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);

/** Why a stream counted for the member (empty: it did not). */
export function presentWhy(r: StreamRow): string[] {
  const why: string[] = [];
  if (r.crew) why.push("you were on crew duty");
  if (Object.keys(r.beats).length) why.push("you checked in");
  if (r.chatMinutes >= NEED_BUCKETS * BUCKET_MIN) why.push(`you were in Twitch chat for about ${r.chatMinutes} minutes`);
  if (r.drops) why.push("you claimed a live drop");
  return why;
}
/** Streams in a row (newest first) that counted, and whether every stream looked at counted. */
export function streak(rows: StreamRow[]): { n: number; all: boolean } {
  let n = 0;
  for (const r of rows) { if (presentWhy(r).length) n++; else break; }
  return { n, all: n === rows.length && rows.length >= SHOWN };
}

const day = (t: number) => new Date(t).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export function streamsHtml(rows: StreamRow[]): string {
  const sk = streak(rows);
  const head = `<div class="ac-st-streak"><span class="ac-st-flame" aria-hidden="true">🔥</span><div><b>${sk.n}${sk.all ? "+" : ""} ${sk.n === 1 ? "stream" : "streams"} in a row</b><small>${sk.n ? "Your stream streak: each of these counted as you being there." : "Check in at a beat, or spend 15 minutes in Twitch chat, to start a stream streak."}</small></div></div>`;
  if (!rows.length) return `${head}<p class="bt-section-text">No finished streams in the last few weeks yet. They show up here after each stream.</p>`;
  const items = rows.map((r) => {
    const why = presentWhy(r);
    const got = Object.fromEntries(BEATS.map((k) => [k, !!r.beats[k]]));
    const rooms = BEATS.filter((k) => r.beats[k]).map((k) => esc(ROOM[r.beats[k]!.room] || r.beats[k]!.room));
    const bits = [
      rooms.length ? `Checked in from ${[...new Set(rooms)].join(", ")}` : "",
      r.chatMinutes ? `In Twitch chat about ${r.chatMinutes} min` : "",
      r.drops ? `${r.drops} live ${r.drops === 1 ? "drop" : "drops"} claimed` : "",
      r.crew ? "On crew duty" : "",
    ].filter(Boolean);
    const verdict = why.length
      ? `<span class="bt-badge bt-badge--green">Counted</span> because ${esc(why.join(" and "))}.`
      : `<span class="bt-badge bt-badge--gray">Not counted</span> ${r.recorded ? "We have nothing recorded for you here." : "You weren't recorded at this one."}`;
    return `<li class="ac-st-row${why.length ? " is-present" : ""}"><div class="ac-st-main"><b>${esc(r.title)}</b><time>${esc(day(r.at))}</time><span class="ac-st-why">${verdict}</span>${bits.length ? `<small>${bits.join(" · ")}</small>` : ""}</div><div class="ac-st-side">${stampsHtml(got, "Beats")}${r.xp ? `<b class="ac-st-xp">+${r.xp.toLocaleString("en-US")} XP</b>` : ""}</div></li>`;
  }).join("");
  return `${head}<ul class="ac-st-list">${items}</ul>`;
}

async function load(uid: string): Promise<StreamRow[]> {
  const today = ymd(Date.now());
  const weeks = [0, 1, 2, 3].map((i) => weekIdOf(addDays(today, -7 * i)));
  const snap = await getDocs(query(collection(db, "sites", SITE_ID, "streams"), where("published", "==", true), where("state", "==", "ended"), where("week", "in", weeks)));
  const streams = snap.docs.map((d) => ({ id: d.id, d: d.data() as any })).filter((s) => s.d.hidden !== true)
    .map((s) => ({ id: s.id, title: String(s.d.title || s.d.theme?.label || "Stream"), at: ms(s.d.actualStart) ?? ms(s.d.plannedStart) ?? 0 }))
    .sort((a, b) => b.at - a.at).slice(0, SHOWN);
  return Promise.all(streams.map(async (s): Promise<StreamRow> => {
    let p: any = null;
    try { const x = await getDoc(doc(db, "sites", SITE_ID, "streams", s.id, "presence", uid)); p = x.exists() ? x.data() : null; } catch { /* nothing readable: shown as not recorded */ }
    const beats: StreamRow["beats"] = {};
    for (const k of BEATS) if (p?.beats?.[k]) beats[k] = { room: String(p.beats[k].room || "") };
    return { id: s.id, title: s.title, at: s.at, beats, chatMinutes: countOf(p?.twitchBuckets) * BUCKET_MIN, drops: countOf(p?.drops), crew: p?.crew === true, xp: Number(p?.xpEarned) || 0, recorded: !!p };
  }));
}

/** Draws rows into the pane (also used by the preview and the checks). */
export function paint(rows: StreamRow[]) {
  if (!pane) return;
  pane.querySelector<HTMLElement>("[data-st-loading]")!.hidden = true;
  const box = pane.querySelector<HTMLElement>("[data-st-body]")!;
  box.innerHTML = streamsHtml(rows);
  box.hidden = false;
}

if (pane) {
  let started = false;
  onMember((s) => {
    const go = () => {
      if (started || pane.hidden) return;
      started = true;
      load(s.user!.uid).then(paint, () => { pane.querySelector<HTMLElement>("[data-st-loading]")!.hidden = true; pane.querySelector<HTMLElement>("[data-st-err]")!.hidden = false; });
    };
    new MutationObserver(go).observe(pane, { attributes: true, attributeFilter: ["hidden"] });
    go();
  });
}
