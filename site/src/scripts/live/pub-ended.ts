// Just ended on /live (docs/specs/control-room.md §7a): for 2 hours after a stream, the wrap-up from public/live (state ended) and the stream's own document:
// confetti (none under reduced motion), duration, peak, check-ins, the beats, the games timeline, and the next stream. Hot Seat champion and questions
// answered join when Chat Games exist (public/live does not carry them yet).
import { beatsHtml } from "../../../../shared/ui/beats.js";
import { burst } from "../../../../shared/ui/burst.js";
import { coverHtml } from "../../../../shared/ui/cover.js";
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { readoutsHtml } from "../../../../shared/ui/readout.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { timelineHtml } from "../../../../shared/ui/timeline.js";
import { BEATS, BEAT_LABEL } from "./model";
import { ticketMarkup } from "./pub-room";
import { clock, esc, fmtDuration, mascotHtml, reduced, type PubCtx, type ViewPart } from "./pub-ui";

let box: HTMLElement;
let key = "";
let celebrated = "";

function gamesHtml(c: PubCtx): string {
  const s = c.stream, p = c.pub;
  const segs = (s?.segments || []).filter((x) => x.kind === "game" && x.startedAt);
  if (!segs.length || !p.actualStart || !p.actualEnd) return "";
  const span = Math.max(1, p.actualEnd - p.actualStart);
  const points = segs.map((g) => {
    const a = g.startedAt!, b = g.endedAt || p.actualEnd!, mins = Math.round((b - a) / 60000);
    return { at: ((a + b) / 2 - p.actualStart!) / span, size: Math.max(14, Math.min(38, 12 + mins / 3)), title: g.title || "Game", lines: [fmtDuration(b - a)], aria: `${g.title || "Game"}, ${fmtDuration(b - a)}` };
  });
  const rows = segs.map((g) => {
    const b = g.endedAt || p.actualEnd!;
    return `<div class="lp-next-row">${coverHtml(g.gameId ? c.vault.get(g.gameId)?.cover ?? null : null, { alt: g.title || "", cls: "bt-cover--sm" })}<div><b>${esc(g.title || "Game")}</b><small>${esc(clock(g.startedAt!))} · ${esc(fmtDuration(b - g.startedAt!))}</small></div></div>`;
  }).join("");
  const tl = (timelineHtml as unknown as (o: Record<string, unknown>) => string)({ points, ends: [clock(p.actualStart), clock(p.actualEnd)], label: "Games played tonight" });
  return crPanelHtml({ id: "lp-games", title: "Games tonight", icon: "game", bodyHtml: `${tl}<div class="lp-next lp-games-list">${rows}</div>` });
}

function draw(c: PubCtx) {
  const p = c.pub, dur = (p.actualEnd || 0) - (p.actualStart || 0);
  const beats: Record<string, { state: string; time: string }> = {};
  for (const k of BEATS) { const st = p.beats[k]?.status, t = c.stream?.beats[k]?.startedAt; beats[k] = { state: st === "skipped" ? "skipped" : st === "done" || st === "now" ? "done" : "", time: t ? clock(t) : "" }; }
  const max = Math.max(1, ...BEATS.map((k) => p.counts.byBeat?.[k] || 0));
  const bars = BEATS.map((k) => `<div class="lp-wbar"><b>${(p.counts.byBeat?.[k] || 0).toLocaleString("en-US")}</b><i style="--h:${Math.round(((p.counts.byBeat?.[k] || 0) / max) * 100)}"></i>${esc(BEAT_LABEL[k])}</div>`).join("");
  box.innerHTML = `<div class="lp-wrap">
    <div class="lp-wrap-top">${mascotHtml()}<div class="lp-wrap-stamp">${stampHtml({ kicker: "Stream", label: "Done", sub: p.actualEnd ? clock(p.actualEnd) : "", tone: "lime" })}</div>
      <div><h2 class="bt-heading lp-wrap-h">That's a wrap</h2><p class="lp-note">${esc(p.title || "The stream")} ran ${esc(fmtDuration(dur))}. Thanks for watching, and for checking in.</p></div></div>
    ${readoutsHtml([{ key: "dur", value: fmtDuration(dur), label: "On air" }, { key: "peak", value: p.peak, label: "Peak watching" }, { key: "ci", value: p.counts.total, label: "Check-ins" }], { cols: 3 })}
    <div class="lp-wrap-grid">
      ${crPanelHtml({ title: "Check-ins by beat", icon: "stats", bodyHtml: `${(beatsHtml as unknown as (o: Record<string, unknown>) => string)({ beats, label: "Stream beats" })}<div class="lp-wbars">${bars}</div>` })}
      ${gamesHtml(c)}
    </div>
    <h2 class="bt-heading lp-next-h">Next stream</h2>
    <div data-lp-ticket>${ticketMarkup(c)}</div></div>`;
}

const part: ViewPart = {
  mount(c, el) {
    box = el; key = ""; part.update(c);
  },
  update(c) {
    const k = `${c.pub.streamId}|${c.pub.actualEnd}|${c.next?.id}|${c.stream?.segments.length}|${c.vault.size}|${c.member}`;
    if (k !== key) {
      key = k; draw(c);
      if (celebrated !== c.pub.streamId && !reduced()) {
        celebrated = c.pub.streamId || "";
        const st = box.querySelector<HTMLElement>(".lp-wrap-h");
        if (st) { setTimeout(() => { burst(st, { n: 40 }); burst(st, { n: 26 }); }, 350); }
      }
    }
  },
};
export default part;
