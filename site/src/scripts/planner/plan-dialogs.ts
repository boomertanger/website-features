// The plan view's dialogs (docs/specs/scream-planner.md §6, mockup "Delay and cancel" and the publish dialog): add or edit a slot,
// publish (what is unfinished, then the marquee frame and the door style), delay, cancel, the crew's seats, open a week early and
// reopen voting. All through openModal / confirmAction; modal CSS targets .bt-portal[data-feature="planner"] (planner-plan.css).
// Every write is a callable; hiding a control here is only a courtesy, the server checks.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { escapeHtml as esc, initials } from "../../../../shared/ui/dom.js";
import { dualTimeHtml, platformsHtml, dayParts } from "../../../../shared/ui/scream-planner.js";
import { ticketHtml } from "../../../../shared/ui/ticket.js";
import { FRAMES, SEASONAL, miniMarqueeHtml, frameName } from "../../../../shared/ui/marquee.js";
import { DOOR_STYLES } from "../../../../shared/ui/doors.js";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import { gradeChipHtml } from "../../../../shared/ui/grade-chip.js";
import { seatBoxHtml, seatMapHtml } from "../../../../shared/ui/seats.js";
import { messageFor } from "../../lib/errors";
import {
  ROOMS, ROOM_NAME, ROOM_SHORT, GROUP_OF, DAY_SHORT, weekDates, weekRange, weekMonday, dateParts, localDate, localTime, zonedToUtc, addDays, fmtClock, fmtDayTime, hhmm12,
  type Stream, type WeekDoc, type Signup, type Room, type SeatReq, type PublishCheck,
} from "./plan-data";
import type { Io, Who, VGame } from "./plan-io";
import { coverOf } from "./plan-io";

export interface Ctx {
  io: Io; who: Who; vault: Map<string, VGame>; tz: string;
  week(): WeekDoc; streams(): Stream[]; weeks(): WeekDoc[];
  /** Reload the board from the server and redraw. */
  refresh(): Promise<void>;
}
const FEATURE = "planner";
const ICONS = ["🥽", "🤝", "👵", "🎬", "🩸", "☕", "🕯️", "🎃", "🔦", "🧟", "🎯", "🎮"];
const dayLabel = (date: string) => { const p = dateParts(date); return `${p.dow} ${p.month} ${p.num}`; };
const err = (m: HTMLElement, e: unknown) => { const el = m.querySelector<HTMLElement>(".bt-error"); if (el) { el.textContent = messageFor(e, "That didn't work. Try again."); el.hidden = false; } };
const busy = (b: HTMLButtonElement, text: string) => { b.disabled = true; b.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>${esc(text)}`; };
const chip = (attrs: string, text: string, on: boolean, extra = "") => `<button type="button" class="bt-chip bt-chip--small${extra}" ${attrs} aria-pressed="${on}">${text}</button>`;
const actions = (left: string, right: string) => `<p class="bt-error" role="alert" hidden></p><div class="bt-modal-actions pp-dlg-acts">${left}<span class="pp-dlg-spacer"></span>${right}</div>`;
const field = (label: string, body: string, id = "") => `<div class="bt-field"><${id ? `label for="${id}"` : "span"} class="bt-label">${label}</${id ? "label" : "span"}>${body}</div>`;

function press(group: HTMLElement, selector: string, single: boolean, onChange?: () => void) {
  group.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(selector);
    if (!b || b.disabled) return;
    if (single) group.querySelectorAll(selector).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    else b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    onChange?.();
  });
}

// ---------------------------------------------------------------------------------------------
// add or edit a slot (planSlot)
// ---------------------------------------------------------------------------------------------
export function slotDialog(ctx: Ctx, stream: Stream | null, presetDate?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const week = ctx.week(), dates = weekDates(week.id), tz = ctx.tz;
    const published = !!stream?.published;
    const f = {
      label: stream?.theme?.label ?? "", icon: stream?.theme?.icon ?? "", date: stream ? localDate(stream.start, tz) : presetDate || dates[0],
      start: stream ? localTime(stream.start, tz) : "20:00", end: stream ? localTime(stream.end, tz) : "22:00",
      type: stream?.type ?? "platform", rooms: new Set<Room>(stream ? stream.rooms : ROOMS), count: stream?.plannedGameCount ?? 2,
      cap: stream ? stream.minCrew.captain : true, yt: stream ? stream.minCrew.rooms.includes("youtube") : true,
    };
    let saved = false;
    const content = modalHeader(esc(stream ? "Edit slot" : "Add a slot"), esc(`${weekRange(week.id)}${published ? " · changes show on /schedule after Publish changes" : ""}`))
      + `<form class="pp-form" novalidate>`
      + field("Name and icon", `<input class="bt-input" id="ps-label" name="label" maxlength="60" value="${esc(f.label)}" placeholder="VR night" autocomplete="off"><div class="pp-icons" role="group" aria-label="Icon">${ICONS.map((i) => `<button type="button" class="pp-icon-b" data-icon="${i}" aria-pressed="${f.icon === i}" aria-label="Icon ${i}">${i}</button>`).join("")}</div>`, "ps-label")
      + `<div class="pp-row2">${field("Day", `<select class="bt-select" id="ps-date" name="date">${dates.map((d) => `<option value="${d}"${d === f.date ? " selected" : ""}>${esc(dayLabel(d))}</option>`).join("")}</select>`, "ps-date")}`
      + `${field("Starts (Central)", `<input class="bt-input" type="time" id="ps-start" name="start" step="900" value="${f.start}" required>`, "ps-start")}`
      + `${field("Ends", `<input class="bt-input" type="time" id="ps-end" name="end" step="900" value="${f.end}" required>`, "ps-end")}</div>`
      + `<p class="bt-hint pp-len" data-len aria-live="polite"></p>`
      + field("Type", `<div class="pp-chips" data-types>${chip('data-type="platform"', "📡 Live on platforms", f.type === "platform")}${chip('data-type="backstage"', "🔑 Backstage, members only", f.type === "backstage")}</div>`)
      + `<div data-when="platform"${f.type === "platform" ? "" : " hidden"}>${field("Chats", `<div class="pp-chips" data-rooms>${ROOMS.map((r) => chip(`data-room="${r}"`, `${platformIconHtml(r)}${esc(ROOM_NAME[r])}`, f.rooms.has(r), " pp-chip-ic")).join("")}</div>`)}`
      + `${field("Needs from the crew", `<div class="pp-chips" data-needs>${chip('data-need="cap"', "⚓ A Captain", f.cap)}${chip('data-need="yt"', "A YouTube lead", f.yt)}</div>`)}</div>`
      + `<div data-when="backstage"${f.type === "backstage" ? "" : " hidden"}>${field("Who can watch", `<div class="pp-chips">${chip("", "Fan Club (free)", true)}<button type="button" class="bt-chip bt-chip--small" disabled title="When billing exists">Sub Club · after billing</button></div>`)}</div>`
      + field("Games per stream", `<input class="bt-input pp-num" type="number" id="ps-count" name="count" min="${Math.max(1, stream?.plannedGames.length ?? 1)}" max="6" step="1" inputmode="numeric" value="${f.count}">`, "ps-count")
      + actions(stream && !published ? `<button type="button" class="bt-btn bt-btn--secondary" data-remove>Remove this slot</button>` : "", `<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--admin" data-save>${stream ? "Save slot" : "Add slot"}</button>`)
      + `</form>`;
    const { modal, close } = openModal({ content, title: stream ? "Edit slot" : "Add a slot", feature: FEATURE, onClose: () => { if (!saved) resolve(false); } });
    const form = modal.querySelector<HTMLFormElement>("form")!;
    const q = <T extends HTMLElement>(s: string) => form.querySelector<T>(s)!;
    const lenText = () => {
      const a = q<HTMLInputElement>("#ps-start").value, b = q<HTMLInputElement>("#ps-end").value;
      if (!a || !b) return "";
      const s = zonedToUtc("2026-01-05", a, "UTC"), e = zonedToUtc(b <= a ? "2026-01-06" : "2026-01-05", b, "UTC"), h = (e - s) / 3600000;
      return `${h % 1 ? h.toFixed(2).replace(/0+$/, "") : h} hours${b <= a ? ", ends the next day" : ""}${h > 12 ? ". A slot is at most 12 hours." : ""}`;
    };
    const showLen = () => { q("[data-len]").textContent = lenText(); };
    showLen();
    form.addEventListener("input", showLen);
    form.querySelector(".pp-icons")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-icon]"); if (!b) return;
      const on = b.getAttribute("aria-pressed") !== "true";
      form.querySelectorAll("[data-icon]").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", String(on));
    });
    press(q("[data-types]"), "[data-type]", true, () => {
      const t = q("[data-types] [aria-pressed=true]").dataset.type;
      q("[data-when=platform]").hidden = t !== "platform"; q("[data-when=backstage]").hidden = t !== "backstage";
    });
    press(q("[data-rooms]"), "[data-room]", false);
    press(q("[data-needs]"), "[data-need]", false);
    modal.querySelector<HTMLButtonElement>("[data-remove]")?.addEventListener("click", () => {
      close();
      void confirmAction({
        title: "Remove this slot?", message: `${stream!.theme?.label || "This slot"} on ${dayLabel(localDate(stream!.start, tz))} leaves the plan. Its planned games go back to the tray and crew sign-ups for it are cleared.`,
        confirmLabel: "Remove slot", busyLabel: "Removing…", danger: false, feature: FEATURE,
        onConfirm: async () => { try { await ctx.io.call("planSlot", { week: week.id, streamId: stream!.id, remove: true }); } catch (e) { throw new Error(messageFor(e)); } },
      }).then(async (ok) => { if (ok) { saved = true; await ctx.refresh(); resolve(true); } else resolve(false); });
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const label = q<HTMLInputElement>("#ps-label").value.trim(), date = q<HTMLSelectElement>("#ps-date").value, start = q<HTMLInputElement>("#ps-start").value, end = q<HTMLInputElement>("#ps-end").value;
      const type = q("[data-types] [aria-pressed=true]").dataset.type as "platform" | "backstage";
      const rooms = [...form.querySelectorAll<HTMLElement>("[data-room][aria-pressed=true]")].map((b) => b.dataset.room as Room);
      const count = Number(q<HTMLInputElement>("#ps-count").value), icon = form.querySelector<HTMLElement>("[data-icon][aria-pressed=true]")?.dataset.icon || null;
      const problem = !start || !end ? "Pick a start and an end time." : start === end ? "The end has to be different from the start." : type === "platform" && !rooms.length ? "Pick at least one chat." : !Number.isInteger(count) || count < 1 || count > 6 ? "Games per stream: 1 to 6." : stream && count < stream.plannedGames.length ? "Remove a planned game first." : "";
      if (problem) { err(modal, { code: "bt/msg", message: problem }); return; }
      const body: Record<string, unknown> = {
        week: week.id, date, start, end, type, plannedGameCount: count,
        theme: label ? { label, icon, patternId: stream?.theme?.patternId ?? null, tagHints: stream?.theme?.tagHints ?? [], gameHints: stream?.theme?.gameHints ?? [] } : stream ? null : undefined,
        minCrew: type === "backstage" ? { captain: false, rooms: [] } : { captain: !!form.querySelector("[data-need=cap][aria-pressed=true]"), rooms: form.querySelector("[data-need=yt][aria-pressed=true]") ? ["youtube"] : [] },
        ...(type === "platform" ? { rooms } : {}), ...(stream ? { streamId: stream.id } : {}),
      };
      const btn = q<HTMLButtonElement>("[data-save]"), was = btn.textContent!;
      busy(btn, "Saving…");
      try { await ctx.io.call("planSlot", body); saved = true; close(); toast(stream ? "Slot saved." : "Slot added."); await ctx.refresh(); resolve(true); }
      catch (e2) { err(modal, e2); btn.disabled = false; btn.textContent = was; }
    });
  });
}

// ---------------------------------------------------------------------------------------------
// publish week / publish changes (publishWeek)
// ---------------------------------------------------------------------------------------------
const WARN_ICON: Record<string, string> = { noGames: "🎮", minCrew: "⚓", overlap: "⚠" };
export async function publishDialog(ctx: Ctx): Promise<{ published: boolean }> {
  const week = ctx.week(), again = week.state === "published";
  let check: PublishCheck;
  try { check = await ctx.io.call<PublishCheck>("publishWeek", { week: week.id, check: true }); }
  catch (e) { toast(messageFor(e, "Couldn't check the week."), { kind: "error" }); return { published: false }; }
  return new Promise((resolve) => {
    const month = Number(weekMonday(week.id).slice(5, 7)), live = ctx.streams().filter((s) => s.state !== "cancelled");
    const f = { frame: check.hero.frame, doors: check.hero.doors };
    const pool = FRAMES.filter(([id]) => check.poolFrames.includes(id)), seas = (season: string) => SEASONAL.filter((x) => check.seasonalFrames.includes(x[0]) && x[3] === season);
    const fchip = (id: string, name: string) => `<button type="button" class="bt-chip bt-chip--small" data-frame="${id}" aria-pressed="${f.frame === id}">${esc(name)}${check.recentFrames.includes(id) ? ` <small class="pp-recent" title="Used in the last three weeks">recent</small>` : ""}</button>`;
    const season = (name: string, label: string) => `<span class="pp-plab">🗓️ ${label}</span><div class="pp-chips">${seas(name).map(([id, n]) => fchip(id, n)).join("")}</div>`;
    const poolHtml = `<span class="pp-plab">🎲 The pool</span><div class="pp-chips">${pool.map(([id, n]) => fchip(id, n)).join("")}<button type="button" class="bt-chip bt-chip--small" data-frame="surprise" aria-pressed="${f.frame === "surprise"}">🎲 Surprise me</button></div>`;
    const frames = month === 10 ? season("Halloween", "Seasonal · October") + poolHtml + season("Christmas", "Seasonal · December")
      : month === 12 ? season("Christmas", "Seasonal · December") + poolHtml + season("Halloween", "Seasonal · October")
      : poolHtml + season("Halloween", "Seasonal · picked by hand") + season("Christmas", "Seasonal · picked by hand");
    const first = live[0], themeOf = (s?: Stream) => s?.theme?.label || s?.title || "Tonight's stream";
    const doors = `<div class="pp-chips" data-doors>${(DOOR_STYLES as string[][]).filter(([id]) => check.doorStyles.includes(id)).map(([id, n], i) => chip(`data-door="${id}"`, `D${i + 1} · ${esc(n)}`, f.doors === id)).join("")}${chip('data-door="surprise"', "🎲 Surprise me", f.doors === "surprise")}</div>`;
    const warn = check.warnings.length
      ? `<div class="pp-tell"><b>Still open</b><ul>${check.warnings.map((w) => `<li><span aria-hidden="true">${WARN_ICON[w.kind] || "⚠"}</span> ${esc(w.text)}.</li>`).join("")}</ul><span class="bt-meta">You can publish anyway and fill these in later with Publish changes.</span></div>`
      : `<div class="pp-tell pp-tell--ok"><span aria-hidden="true">✓</span> Every slot has games and its minimum crew. Ready to go.</div>`;
    const preview = () => miniMarqueeHtml({ frame: f.frame === "surprise" ? "bulbs" : f.frame, kicker: first ? `${DAY_SHORT[(new Date(first.start).getDay() + 6) % 7]} · ${fmtClock(first.start, ctx.tz)}` : "Tonight", icon: first?.theme?.icon || "", title: themeOf(first), metaHtml: f.frame === "surprise" ? "Rolled when you publish" : esc(frameName(f.frame)) });
    let done = false;
    const content = modalHeader(esc(again ? "Publish changes" : "Publish next week"), esc(`${weekRange(week.id)} · ${live.length} stream${live.length === 1 ? "" : "s"}`))
      + warn
      + field(`Marquee frame · <span data-fname>${esc(f.frame === "surprise" ? "Surprise me" : frameName(f.frame))}</span>`, `${frames}<div class="pp-fprev" data-fprev>${preview()}</div>`)
      + field(`Doors for the week at a glance · <span data-dname>${esc(f.doors === "surprise" ? "Surprise me" : ((DOOR_STYLES as string[][]).find((d) => d[0] === f.doors) || [])[1] || "")}</span>`, doors)
      + actions("", `<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Not yet</button><button type="button" class="bt-btn bt-btn--primary bt-btn--shine" data-publish>${again ? "Publish changes" : "Publish week"}</button>`);
    const { modal, close } = openModal({ content, title: again ? "Publish changes" : "Publish next week", wide: true, feature: FEATURE, onClose: () => { if (!done) resolve({ published: false }); } });
    const sync = () => {
      modal.querySelectorAll<HTMLElement>("[data-frame]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.frame === f.frame)));
      modal.querySelectorAll<HTMLElement>("[data-door]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.door === f.doors)));
      modal.querySelector("[data-fname]")!.textContent = f.frame === "surprise" ? "Surprise me" : frameName(f.frame);
      modal.querySelector("[data-dname]")!.textContent = f.doors === "surprise" ? "Surprise me" : ((DOOR_STYLES as string[][]).find((d) => d[0] === f.doors) || [])[1] || "";
      modal.querySelector("[data-fprev]")!.innerHTML = preview();
    };
    modal.addEventListener("click", (e) => {
      const t = e.target as HTMLElement, fr = t.closest<HTMLElement>("[data-frame]"), dr = t.closest<HTMLElement>("[data-door]");
      if (fr) { f.frame = fr.dataset.frame!; sync(); } else if (dr) { f.doors = dr.dataset.door!; sync(); }
    });
    modal.querySelector<HTMLButtonElement>("[data-publish]")!.addEventListener("click", async (e) => {
      const btn = e.currentTarget as HTMLButtonElement; busy(btn, "Publishing…");
      try { await ctx.io.call("publishWeek", { week: week.id, hero: { frame: f.frame, doors: f.doors } }); done = true; close(); resolve({ published: true }); }
      catch (e2) { err(modal, e2); btn.disabled = false; btn.textContent = again ? "Publish changes" : "Publish week"; }
    });
  });
}

// ---------------------------------------------------------------------------------------------
// delay (delayStream) and cancel (cancelStream)
// ---------------------------------------------------------------------------------------------
function previewTicket(ctx: Ctx, s: Stream, o: { start: number; end: number; was?: string; state: "scheduled" | "cancelled"; reason: string; stamp?: string }) {
  const dp = dayParts(o.start, ctx.tz);
  const covers = s.plannedGames.slice(0, 3).map((g) => coverOf(ctx.vault, g.gameId, g.title)).join("");
  return `<div class="pp-preview-t">${ticketHtml({
    day: dp.dow, num: dp.num, month: dp.month, state: o.state, title: s.theme?.label || s.title, icon: s.theme?.icon || "", timeHtml: dualTimeHtml({ start: o.start, end: o.end, tz: ctx.tz, was: o.was }),
    was: o.state === "scheduled" ? o.was : undefined, reason: o.reason, coversHtml: covers, backstage: s.type === "backstage", ...(s.type === "backstage" ? {} : { platformsHtml: platformsHtml(s.rooms) }),
  })}${o.stamp || ""}</div>`;
}
const crewCount = (s: Stream) => { const ids = new Set<string>(); if (s.crew.captain?.uid) ids.add(s.crew.captain.uid); for (const c of Object.values(s.crew.chats)) { if (c?.lead?.uid) ids.add(c.lead.uid); (c?.deckhands || []).forEach((d) => d.uid && ids.add(d.uid)); } return ids.size; };

export function delayDialog(ctx: Ctx, s: Stream): Promise<boolean> {
  return new Promise((resolve) => {
    const tz = ctx.tz, len = s.end - s.start, dates = weekDates(s.week);
    const NUDGES: [number, string][] = [[15, "+15 min"], [30, "+30 min"], [60, "+1 hour"], [120, "+2 hours"]];
    const f = { nudge: 60 as number | "custom", keep: true, date: localDate(s.start, tz), start: localTime(s.start, tz), end: localTime(s.end, tz), reason: "" };
    let done = false;
    const compute = () => {
      let a: number, b: number;
      if (f.nudge === "custom") { a = zonedToUtc(f.date, f.start, tz); b = f.keep ? a + len : zonedToUtc(f.end <= f.start ? addDays(f.date, 1) : f.date, f.end, tz); }
      else { a = s.start + f.nudge * 60000; b = f.keep ? a + len : s.end; }
      return { a, b };
    };
    const was = fmtClock(s.delay?.originalStart ?? s.start, tz);
    const content = modalHeader(esc(`Delay ${s.theme?.icon || ""} ${s.theme?.label || s.title}`.replace("  ", " ")), esc(`${fmtDayTime(s.start, tz)} to ${fmtClock(s.end, tz)} Central`))
      + field("Push it back by", `<div class="pp-nudges" data-nudges>${NUDGES.map(([m, t]) => `<button type="button" class="pp-nudge" data-nudge="${m}" aria-pressed="${f.nudge === m}">${t}</button>`).join("")}<button type="button" class="pp-nudge" data-nudge="custom" aria-pressed="false">Pick a time…</button></div>`)
      + `<div class="pp-row2" data-custom hidden>${field("Day", `<select class="bt-select" data-cdate>${dates.map((d) => `<option value="${d}"${d === f.date ? " selected" : ""}>${esc(dayLabel(d))}</option>`).join("")}</select>`)}${field("Starts", `<input class="bt-input" type="time" step="900" data-cstart value="${f.start}">`)}<span data-cend-wrap hidden>${field("Ends", `<input class="bt-input" type="time" step="900" data-cend value="${f.end}">`)}</span></div>`
      + `<div class="pp-newtime"><span class="from" data-from>${esc(fmtClock(s.start, tz))}</span><span class="arrow" aria-hidden="true">→</span><span class="to" data-to></span><span class="pp-keep"><button type="button" class="bt-switch" role="switch" aria-checked="true" aria-labelledby="pp-keep-l" data-keep></button><span id="pp-keep-l">Keep it ${Math.round(len / 360000) / 10} hours</span></span></div>`
      + field("Reason (shown on the schedule, optional)", `<input class="bt-input" id="pd-reason" maxlength="120" autocomplete="off" data-reason>`, "pd-reason")
      + `<div class="pp-preview"><span class="bt-label">What everyone sees</span><div data-ticket></div></div>`
      + `<div class="pp-tell"><ul><li><span aria-hidden="true">📅</span> /schedule shows the new time right away.</li>${crewCount(s) ? `<li><span aria-hidden="true">⚓</span> ${crewCount(s)} crew get asked "Still on for <span data-ask-time></span>?" Dropping costs them nothing.</li>` : ""}<li><span aria-hidden="true">🔔</span> Members get an email, text or push once the Notifications service is built. Until then, the site only.</li></ul></div>`
      + actions("", `<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Keep ${esc(fmtClock(s.start, tz))}</button><button type="button" class="bt-btn bt-btn--primary" data-do></button>`);
    const { modal, close } = openModal({ content, title: "Delay stream", wide: true, feature: FEATURE, onClose: () => { if (!done) resolve(false); } });
    const q = <T extends HTMLElement>(sel: string) => modal.querySelector<T>(sel)!;
    let stamped = "";
    const draw = () => {
      const { a, b } = compute(), bad = b <= a;
      q("[data-to]").textContent = bad ? "" : `${fmtClock(a, tz)}–${fmtClock(b, tz)}`;
      q("[data-do]").textContent = `Delay to ${fmtClock(a, tz)}`; (q("[data-do]") as HTMLButtonElement).disabled = bad || a === s.start && b === s.end;
      const ask = modal.querySelector("[data-ask-time]"); if (ask) ask.textContent = fmtClock(a, tz);
      q("[data-ticket]").innerHTML = previewTicket(ctx, s, { start: a, end: Math.max(b, a + 60000), was, state: "scheduled", reason: f.reason || "No reason given", stamp: stamped });
      q("[data-cend-wrap]").hidden = f.nudge !== "custom" || f.keep;
    };
    draw();
    press(q("[data-nudges]"), "[data-nudge]", true, () => {
      const v = q("[data-nudges] [aria-pressed=true]").dataset.nudge!; f.nudge = v === "custom" ? "custom" : Number(v);
      q("[data-custom]").hidden = f.nudge !== "custom"; draw();
    });
    q("[data-keep]").addEventListener("click", (e) => { f.keep = !f.keep; (e.currentTarget as HTMLElement).setAttribute("aria-checked", String(f.keep)); draw(); });
    modal.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.matches("[data-reason]")) f.reason = t.value; else if (t.matches("[data-cdate]")) f.date = t.value; else if (t.matches("[data-cstart]")) f.start = t.value; else if (t.matches("[data-cend]")) f.end = t.value;
      draw();
    });
    q<HTMLButtonElement>("[data-do]").addEventListener("click", async (e) => {
      const btn = e.currentTarget as HTMLButtonElement, { a, b } = compute(); busy(btn, "Delaying…");
      try {
        await ctx.io.call("delayStream", { streamId: s.id, startMs: a, endMs: b, ...(f.reason.trim() ? { reason: f.reason.trim() } : {}) });
        done = true; stamped = `<span class="pp-moved"><span class="bt-stamp bt-stamp--sm" role="img" aria-label="Moved to ${esc(fmtClock(a, tz))}"><span aria-hidden="true"><b>Moved</b><small>${esc(fmtClock(a, tz))}</small></span></span></span>`; draw();
        btn.textContent = "Delayed ✓"; toast("Delayed. /schedule shows the new time.");
        await ctx.refresh(); setTimeout(close, 1100); resolve(true);
      } catch (e2) { err(modal, e2); btn.disabled = false; draw(); }
    });
  });
}

const WHY = ["I'm sick", "Tech trouble", "Life happened", "Other"];
export function cancelDialog(ctx: Ctx, s: Stream): Promise<boolean> {
  const tz = ctx.tz, f = { why: "", note: "" };
  const seatsN = crewCount(s), games = s.plannedGames.map((g) => g.title);
  const body = () => `<p class="bt-meta pp-kick-s">${esc(fmtDayTime(s.start, tz))} to ${esc(fmtClock(s.end, tz))} Central</p>`
    + field("Why", `<div class="pp-chips" data-why>${WHY.map((w) => chip(`data-why="${esc(w)}"`, esc(w), false)).join("")}</div>`)
    + field("Message on the schedule (optional)", `<input class="bt-input" maxlength="140" autocomplete="off" data-note>`)
    + `<div class="pp-preview"><span class="bt-label">What everyone sees</span><div data-ticket></div></div>`
    + `<div class="pp-tell"><ul><li><span aria-hidden="true">🗂️</span> It stays on /schedule as a gray record, so nobody wonders where it went.</li>${seatsN ? `<li><span aria-hidden="true">⚓</span> ${seatsN} crew seat${seatsN === 1 ? " is" : "s are"} released. No reliability hit for anyone.</li>` : ""}${games.length ? `<li><span aria-hidden="true">🎮</span> ${esc(games.join(" and "))} go${games.length === 1 ? "es" : ""} back to the tray for a later week.</li>` : ""}<li><span aria-hidden="true">🔔</span> Members are told on the site now, and by email, text or push once Notifications is built.</li></ul></div>`;
  const reason = () => [f.why && f.why !== "Other" ? f.why : "", f.note.trim()].filter(Boolean).join(" · ");
  return confirmAction({
    title: `Cancel ${s.theme?.icon || ""} ${s.theme?.label || s.title}?`.replace("  ", " "), bodyHtml: body(), cancelLabel: "Keep it", confirmLabel: "Cancel the stream", busyLabel: "Cancelling…", danger: false, feature: FEATURE,
    onOpen: (modal: HTMLElement) => {
      const draw = () => { modal.querySelector("[data-ticket]")!.innerHTML = previewTicket(ctx, s, { start: s.start, end: s.end, state: "cancelled", reason: reason() }); };
      draw();
      press(modal.querySelector<HTMLElement>("[data-why]")!, "[data-why]", true, () => { f.why = modal.querySelector<HTMLElement>("[data-why] [aria-pressed=true]")?.dataset.why || ""; draw(); });
      modal.querySelector("[data-note]")!.addEventListener("input", (e) => { f.note = (e.target as HTMLInputElement).value; draw(); });
    },
    onConfirm: async () => {
      try { await ctx.io.call("cancelStream", { streamId: s.id, ...(reason() ? { reason: reason() } : {}) }); } catch (e) { throw new Error(messageFor(e)); }
      toast("Cancelled. It stays on /schedule as a record.");
      await ctx.refresh();
    },
  });
}

// ---------------------------------------------------------------------------------------------
// the crew's seats on a slot: confirm, decline, release (dutyConfirm, dutyDrop)
// ---------------------------------------------------------------------------------------------
const AV = { yes: ["lime", "Available"], maybe: ["gold", "Maybe"], no: ["gray", "Can't"], "": ["gray", "No answer"] } as const;
const seatText = (q: SeatReq) => (q.role === "captain" ? "⚓ Captain" : `${ROOM_SHORT[q.room as Room] || q.room} ${q.role === "lead" ? "lead" : "deckhand"}`);
export async function crewDialog(ctx: Ctx, s: Stream): Promise<void> {
  let list: Signup[] = [];
  try { list = await ctx.io.signups(s.id); } catch (e) { toast(messageFor(e, "Couldn't load the crew."), { kind: "error" }); return; }
  const tz = ctx.tz;
  const draw = (cur: Stream, sg: Signup[], modal: HTMLElement) => {
    const box = (room: Room, role: "lead" | "deckhand", p: { handle: string | null } | null | undefined, label: string) => p ? seatBoxHtml({ kind: "taken", name: p.handle || "Deleted member", role }) : seatBoxHtml({ kind: "locked", label: `+ ${label}` });
    const rooms = ROOMS.filter((r) => cur.rooms.includes(r)).map((r) => {
      const c = cur.crew.chats[r] || { lead: null, deckhands: [] }, caps = cur.crew.caps?.deckhands ?? 2;
      return { chat: r, name: ROOM_SHORT[r], boost: GROUP_OF[r] === "youtube" ? "×1.5" : "", boxesHtml: box(r, "lead", c.lead, "Lead") + Array.from({ length: Math.min(caps, 3) }, (_, i) => box(r, "deckhand", c.deckhands[i], "Deckhand")).join("") };
    });
    const sorted = [...sg].sort((a, b) => Number(b.seats.some((q) => q.status === "requested")) - Number(a.seats.some((q) => q.status === "requested")) || (a.handle || "").localeCompare(b.handle || ""));
    const rows = sorted.map((p) => {
      const [tone, text] = AV[p.availability || ""], active = p.seats.filter((q) => q.status !== "dropped" && q.status !== "declined");
      const seats = active.map((q) => {
        const key = `${q.room}:${q.role}`;
        const ownerOnly = q.needsOwnerOk && !ctx.who.owner;
        const btns = q.status === "requested"
          ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-confirm="${esc(p.uid)}|${esc(key)}"${ownerOnly ? ' disabled title="A Watcher as Captain needs the owner\'s OK"' : ""}>Confirm</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-decline="${esc(p.uid)}|${esc(key)}">Decline</button>`
          : `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-release="${esc(p.uid)}|${esc(key)}">Release</button>`;
        return `<div class="pp-seatrow"><span class="pp-seatname">${esc(seatText(q))}</span><span class="bt-badge bt-badge--${q.status === "confirmed" ? "lime" : "gold"}">${q.status === "confirmed" ? "Confirmed ✓" : "Requested"}</span>${q.needsOwnerOk ? `<span class="bt-badge bt-badge--gray" title="Only the owner can confirm this">Needs owner's OK</span>` : ""}<span class="pp-seatbtns">${btns}</span></div>`;
      }).join("");
      const req = p.gameRequest ? `<div class="pp-req">✋ Asked for <b>${esc(ctx.vault.get(p.gameRequest.gameSlug)?.title || p.gameRequest.gameSlug)}</b>${p.gameRequest.note ? ` <q>${esc(p.gameRequest.note)}</q>` : ""} <span class="bt-badge bt-badge--${p.gameRequest.status === "planned" ? "lime" : "pink"}">${p.gameRequest.status === "planned" ? "Planned" : p.gameRequest.status === "notPlanned" ? "Not planned" : "Open"}</span></div>` : "";
      return `<li class="pp-person"><div class="pp-person-h"><span class="bt-av" aria-hidden="true">${esc(initials(p.handle || "?"))}</span><b>@${esc(p.handle || "unknown")}</b>${p.grade ? gradeChipHtml({ track: p.track === "admin" ? "admin" : "mod", grade: p.grade }) : ""}<span class="bt-badge bt-badge--${tone}">${text}</span>${p.prefilled ? `<span class="bt-meta">pre-filled</span>` : ""}${p.reconfirm?.needed ? `<span class="bt-badge bt-badge--gold">Hasn't confirmed the new time</span>` : ""}</div>${seats}${req}</li>`;
    }).join("");
    modal.querySelector("[data-body]")!.innerHTML = (cur.type === "backstage" ? `<p class="bt-meta">Backstage streams have no chats to crew.</p>` : seatMapHtml({ captainHtml: cur.crew.captain ? seatBoxHtml({ kind: "taken", name: cur.crew.captain.handle || "", role: "captain" }) : seatBoxHtml({ kind: "locked", label: cur.minCrew.captain ? "⚓ Captain needed" : "⚓ No Captain yet" }), rooms }))
      + `<h3 class="pp-h3">Who signed up <span class="bt-section-head-n">${sg.length}</span></h3>${rows ? `<ul class="pp-people">${rows}</ul>` : `<p class="bt-meta">Nobody has answered for this slot yet.</p>`}`;
  };
  let cur = s;
  const { modal } = openModal({
    content: modalHeader(esc(`Crew · ${s.theme?.icon || ""} ${s.theme?.label || s.title}`), esc(`${fmtDayTime(s.start, tz)} to ${fmtClock(s.end, tz)} Central`)) + `<div data-body class="pp-crewbody"></div><p class="bt-error" role="alert" hidden></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Done</button></div>`,
    title: "Crew for a slot", wide: true, feature: FEATURE, onClose: () => void ctx.refresh(),
  });
  draw(cur, list, modal);
  modal.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-confirm],[data-decline],[data-release]");
    if (!b || b.disabled) return;
    const [uid, key] = (b.dataset.confirm || b.dataset.decline || b.dataset.release)!.split("|"), [room, role] = key.split(":");
    const seat = role === "captain" ? { role } : { room, role };
    b.disabled = true; modal.querySelector<HTMLElement>(".bt-error")!.hidden = true;
    try {
      if (b.dataset.release) await ctx.io.call("dutyDrop", { streamId: cur.id, uid, seat });
      else await ctx.io.call("dutyConfirm", { streamId: cur.id, uid, seat, ...(b.dataset.decline ? { decline: true } : {}) });
      const [streams, sg] = await Promise.all([ctx.io.streams(cur.week), ctx.io.signups(cur.id)]);
      cur = streams.find((x) => x.id === cur.id) || cur; list = sg; draw(cur, list, modal);
      if (b.dataset.confirm) toast("Seat confirmed.");
    } catch (e2) { err(modal, e2); b.disabled = false; }
  });
}

// ---------------------------------------------------------------------------------------------
// owner: open a week early (weekOpen), reopen voting (weekReopen)
// ---------------------------------------------------------------------------------------------
export function openWeekDialog(ctx: Ctx, weekId: string): Promise<boolean> {
  return confirmAction({
    title: `Open ${weekRange(weekId)} now?`, message: "The week opens from your usual week now instead of on its day. The crew view and the ballot open straight away, and the ballot closes 24 hours from now if the usual close time has passed.",
    confirmLabel: "Open week", busyLabel: "Opening…", danger: false, feature: FEATURE,
    onConfirm: async () => { try { await ctx.io.call("weekOpen", { week: weekId }); } catch (e) { throw new Error(messageFor(e)); } toast("Week opened."); await ctx.refresh(); },
  });
}
export function reopenDialog(ctx: Ctx, w: WeekDoc): Promise<boolean> {
  let hours = 24;
  return confirmAction({
    title: "Reopen voting?", message: "Votes, game requests and availability open again until the new close time. Nothing is published or changed.",
    bodyHtml: `<div class="bt-field"><span class="bt-label">Closes again in</span><div class="pp-chips" data-hours>${[[24, "24 hours"], [48, "48 hours"], [72, "3 days"]].map(([h, t]) => chip(`data-h="${h}"`, String(t), h === 24)).join("")}</div></div>`,
    confirmLabel: "Reopen voting", busyLabel: "Reopening…", danger: false, feature: FEATURE,
    onOpen: (modal: HTMLElement) => press(modal.querySelector<HTMLElement>("[data-hours]")!, "[data-h]", true, () => { hours = Number(modal.querySelector<HTMLElement>("[data-hours] [aria-pressed=true]")!.dataset.h); }),
    onConfirm: async () => { try { await ctx.io.call("weekReopen", { week: w.id, closesAt: Date.now() + hours * 3600000 }); } catch (e) { throw new Error(messageFor(e)); } toast("Voting reopened."); await ctx.refresh(); },
  });
}
void hhmm12;
