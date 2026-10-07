// /schedule/plan, the crew view (Active mods and admins on duty who aren't planning; docs/specs/scream-planner.md §2, §4d, §8): the week's
// slots (the draft is visible to crew), the availability tri-toggle per slot, seat buttons their grade allows, the seat map, "Ask for a
// game", their crew status chip and the month's time card, and a small celebration when they take a seat. Display only: eligibility here
// just hides what a grade can't take; dutySignUp, dutyDrop, dutyKeep, crewAvailability and modGameRequest check on the server.
import { cslotHtml, seatBoxHtml, seatMapHtml, crewBarHtml, myReqHtml } from "../../../../shared/ui/seats.js";
import { triHtml, initTri } from "../../../../shared/ui/tri.js";
import { fuseHtml } from "../../../../shared/ui/vote.js";
import { dualTimeHtml, dayParts, SP_ICON } from "../../../../shared/ui/scream-planner.js";
import { gradeChipHtml } from "../../../../shared/ui/grade-chip.js";
import { timecardHtml } from "../../../../shared/ui/crew.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { burst } from "../../../../shared/ui/burst.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { toast } from "../../../../shared/ui/toast.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { messageFor } from "../../lib/errors";
import {
  ROOMS, ROOM_SHORT, GROUP_OF, SITE_TZ, weekRange, nextWeekId, currentWeekId, fmtDayTime, fmtClock, leftText,
  type WeekDoc, type Stream, type Signup, type Room, type SeatReq,
} from "./plan-data";
import { coverOf, vaultOf, type Io, type Who, type VGame } from "./plan-io";

const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML || "";
const STATUS: Record<string, [string, string]> = { active: ["lime", "Active"], checkIn: ["gold", "Check-in"], goingDark: ["blue", "Going dark"], reserve: ["gray", "Reserve"], alumni: ["teal", "Alumni"], paused: ["pink", "Paused"] };
const GRADE_NEED = { captain: 3, lead: 2, deckhand: 1 } as const;
const GRADE_NAME = ["", "Initiate", "Watcher", "Warden", "Sentinel"];

export async function mountCrew(root: HTMLElement, io: Io, who: Who) {
  const vault = await vaultOf(io);
  const st = { weeks: [] as WeekDoc[], wid: "", streams: [] as Stream[], mine: new Map<string, Signup | null>(), busy: false };
  const week = () => st.weeks.find((w) => w.id === st.wid)!;
  const curWeek = currentWeekId(SITE_TZ);
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const active = who.status === "active" || who.status === "checkIn" || who.admin;

  async function loadWeek(id: string) {
    st.wid = id; st.streams = id ? await io.streams(id) : [];
    const lists = await Promise.all(st.streams.map((s) => io.signups(s.id).catch(() => [] as Signup[])));
    st.mine = new Map(st.streams.map((s, i) => [s.id, lists[i].find((x) => x.uid === who.uid) || null]));
  }
  async function loadAll() {
    st.weeks = await io.weeks();
    const id = st.weeks.some((w) => w.id === st.wid) ? st.wid : (st.weeks.find((w) => w.state !== "published") || st.weeks[0])?.id || "";
    await loadWeek(id);
  }
  const rel = (id: string) => (id === curWeek ? "This week" : id === nextWeekId(curWeek) ? "Next week" : weekRange(id));
  const tz = () => week()?.tz || SITE_TZ;

  // ---- what this person may do, display only ----
  const requestsOpen = () => { const w = week(); return !w.weekOff && w.state === "open" && (w.closesAt ?? 0) > Date.now(); };
  const live = (s: Stream) => ["planned", "scheduled"].includes(s.state) && s.start > Date.now();
  const grade = who.grade || 1;
  const activeSeats = (sg: Signup | null) => (sg?.seats || []).filter((x) => x.status === "requested" || x.status === "confirmed");
  const seatKey = (x: { room: string; role: string }) => (x.role === "captain" ? "captain" : `${x.room}:${x.role}`);

  // ---- header ----
  function fuse() {
    const w = week(), f = (t: number | null) => fmtDayTime(t, tz());
    if (w.weekOff) return "";
    const open = w.state === "open" && (w.closesAt ?? 0) > Date.now();
    return fuseHtml({ short: true, steps: [{ label: "Opened", when: f(w.opensAt), state: "done" }, open ? { label: "Availability and requests close", when: f(w.closesAt), state: "next", n: 2 } : { label: "Availability closed", when: f(w.closesAt), state: "done" }], progress: [open && w.opensAt && w.closesAt ? Math.max(0, Math.min(100, Math.round(((Date.now() - w.opensAt) / (w.closesAt - w.opensAt)) * 100))) : 100], left: open ? leftText(w.closesAt || 0) : "" });
  }
  function bar() {
    const [tone, text] = STATUS[who.status] || ["gray", who.status || "Crew"];
    const early = week().state === "published" && (week().earlySignupUntil ?? 0) > Date.now();
    return crewBarHtml({
      gradeHtml: who.track ? gradeChipHtml({ track: who.track, grade: who.grade }) : "", statusHtml: `<span class="bt-badge bt-badge--${tone}">${esc(text)}</span>`,
      notes: [early ? `Seats taken until ${esc(fmtDayTime(week().earlySignupUntil, tz()))} earn <b>+3 Gears</b>` : `Seats taken within 48 h of publishing earn <b>+3 Gears</b>`, `YouTube seats earn <b>×1.5</b>`, who.activityRules ? `Your duties are on <a href="/crew/hq">Crew HQ</a>` : ""].filter(Boolean),
    }) + (who.activityRules ? "" : `<div class="pp-timecard">${timecardHtml({ month: new Date().toLocaleDateString("en-US", { month: "long", timeZone: SITE_TZ }), need: 2, total: 4, state: "idle" })}</div>`);
  }
  function weeksHtml() {
    if (st.weeks.length < 2) return "";
    return `<div class="pp-weeks" role="group" aria-label="Week">${st.weeks.slice(0, 4).map((w) => `<button type="button" class="bt-chip bt-chip--small" data-week="${w.id}" aria-pressed="${w.id === st.wid}">${esc(rel(w.id))} <span class="bt-chip-n">${w.state === "published" ? "Published" : w.state === "closed" ? "Closed" : "Open"}</span></button>`).join("")}</div>`;
  }

  // ---- one slot ----
  function seatMap(s: Stream, mine: Signup | null) {
    const myReq = (mine?.seats || []).filter((x) => x.status === "requested");
    const can = live(s) && active && mine?.availability !== "no";
    const reason = !active ? "Your crew status isn't Active or Check-in" : mine?.availability === "no" ? "You said you can't make it" : "";
    const mineBox = (seat: string, role: string, confirmed: boolean) => seatBoxHtml({ kind: "mine", role, name: who.handle || "You", note: confirmed ? "confirmed" : "waiting for the Captain", seat: confirmed && s.state === "scheduled" ? seat : seat });
    const open = (seat: string, role: "captain" | "lead" | "deckhand", label: string) => {
      const need = GRADE_NEED[role];
      if (grade < need - (role === "captain" ? 1 : 0)) return seatBoxHtml({ kind: "locked", label: role === "captain" ? "⚓ Captain · Warden+" : `${label} · ${GRADE_NAME[need]}+`, title: `${role === "captain" ? "Captain" : label} is ${GRADE_NAME[need]} and up` });
      if (!can) return seatBoxHtml({ kind: "locked", label: `+ ${label}`, title: reason || "This slot has started" });
      return seatBoxHtml({ kind: "open", seat, role, label, title: role === "captain" && grade < need ? "A Watcher as Captain needs the owner's OK" : `Ask for the ${label.toLowerCase()} seat` });
    };
    const mineIn = (key: string) => myReq.find((x) => seatKey(x) === key);
    const iHold = (p: { uid?: string } | null | undefined) => !!p?.uid && p.uid === who.uid;
    const cap = s.crew.captain
      ? (iHold(s.crew.captain) ? mineBox("captain", "captain", true) : seatBoxHtml({ kind: "taken", name: s.crew.captain.handle || "", role: "captain" }))
      : mineIn("captain") ? mineBox("captain", "captain", false) : open("captain", "captain", "Captain");
    const rooms = ROOMS.filter((r) => s.rooms.includes(r)).map((r) => {
      const c = s.crew.chats[r] || { lead: null, deckhands: [] }, caps = s.crew.caps?.deckhands ?? 2;
      const lead = c.lead ? (iHold(c.lead) ? mineBox(`${r}:lead`, "lead", true) : seatBoxHtml({ kind: "taken", name: c.lead.handle || "", role: "lead" })) : mineIn(`${r}:lead`) ? mineBox(`${r}:lead`, "lead", false) : open(`${r}:lead`, "lead", "Lead");
      const dh = c.deckhands.map((d) => (iHold(d) ? mineBox(`${r}:deckhand`, "deckhand", true) : seatBoxHtml({ kind: "taken", name: d.handle || "", role: "deckhand" })));
      const myPending = mineIn(`${r}:deckhand`) && !c.deckhands.some(iHold) ? [mineBox(`${r}:deckhand`, "deckhand", false)] : [];
      const free = Math.max(0, caps - dh.length - myPending.length);
      return { chat: r, name: ROOM_SHORT[r], boost: GROUP_OF[r] === "youtube" ? "×1.5" : "", boxesHtml: lead + dh.join("") + myPending.join("") + (free ? open(`${r}:deckhand`, "deckhand", "Deckhand") : "") };
    });
    return seatMapHtml({ captainHtml: cap, rooms });
  }
  function slotCard(s: Stream) {
    const t = dayParts(s.start, s.tz), mine = st.mine.get(s.id) || null, ava = mine?.availability || "";
    const seats = activeSeats(mine), canAsk = requestsOpen() && live(s) && ava === "yes" && seats.length > 0;
    const left = s.plannedGameCount - s.plannedGames.length;
    const meta = s.state === "cancelled" ? esc(s.cancel?.reason ? `Cancelled: ${s.cancel.reason}` : "Cancelled") : `${s.plannedGames.length ? `So far: ${esc(s.plannedGames.map((g) => g.title).join(", "))}.` : "No games picked yet."}${left > 0 ? ` ${left} spot${left === 1 ? "" : "s"} still open.` : ""}${s.delay ? ` <b class="pp-moved-t">Moved from ${esc(fmtClock(s.delay.originalStart, s.tz))}.</b>` : ""}`;
    if (s.state === "cancelled") return `<div class="pp-sl" data-state="cancelled">${cslotHtml({ id: s.id, day: t.dow, num: t.num, icon: s.theme?.icon || "", label: s.theme?.label || s.title, timeHtml: dualTimeHtml({ start: s.start, end: s.end, tz: s.tz }), count: s.plannedGameCount, games: [], metaHtml: meta, sideHtml: `<span class="bt-badge bt-badge--gray">Cancelled</span>` })}</div>`;
    const req = mine?.gameRequest;
    const ask = req ? myReqHtml({ coverHtml: coverOf(vault, req.gameSlug), title: vault.get(req.gameSlug)?.title || req.gameSlug, status: req.status, extra: req.status === "open" && requestsOpen() ? `closes ${fmtDayTime(week().closesAt, tz())}` : "" })
      + (requestsOpen() && req.status === "open" ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-ask="${s.id}">Change</button>` : "")
      : `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-ask="${s.id}"${canAsk ? "" : " disabled"}>✋ Ask for a game</button>${canAsk ? "" : `<span class="bt-meta">${!requestsOpen() ? "Requests closed with the voting." : ava !== "yes" ? "Mark yourself Available and ask for a seat first." : "Ask for a seat first, you ask for a game on a slot you'll crew."}</span>`}`;
    const re = mine?.reconfirm?.needed ? `<div class="pp-reconfirm" role="status"><span>This slot moved${s.delay ? ` to <b>${esc(fmtClock(s.start, s.tz))}</b>` : ""}. Still on?</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-keep="${s.id}">Yes, keep my seat</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-dropall="${s.id}">Drop it</button></div>` : "";
    return `<div class="pp-sl">${cslotHtml({
      id: s.id, day: t.dow, num: t.num, icon: s.theme?.icon || "", label: s.theme?.label || s.title, timeHtml: dualTimeHtml({ start: s.start, end: s.end, tz: s.tz, was: s.delay ? s.delay.originalStart : undefined }), count: s.plannedGameCount, backstage: s.type === "backstage", state: ava === "yes" ? "yes" : "",
      games: s.plannedGames.map((g) => ({ coverHtml: coverOf(vault, g.gameId, g.title) })), metaHtml: meta,
      sideHtml: `${re}<div class="bt-cslot-row">${triHtml({ value: ava, name: s.id, label: `Can you make ${s.theme?.label || "it"}?`, disabled: !requestsOpen() || !live(s) || !active })}${mine?.prefilled && ava ? `<span class="bt-tri-hint">Pre-filled from your usual times</span>` : ""}${!requestsOpen() ? `<span class="bt-tri-hint">Closed ${esc(fmtDayTime(week().closesAt, tz()))}. Seats stay open.</span>` : ""}</div>${seatMap(s, mine)}<div class="bt-cslot-row">${ask}</div>`,
    })}</div>`;
  }
  function slotsHtml() {
    const w = week();
    if (w.weekOff) return `<div class="bt-notice">🌴 <b>Week off: ${esc(w.weekOff.label)}.</b> No streams this week, nothing to sign up for.</div>`;
    if (!st.streams.length) return empty("No slots this week yet", "When Boomer adds slots they appear here, and you can say when you're free.");
    return `<div class="bt-slots pp-slots pp-slots--crew">${st.streams.map(slotCard).join("")}</div>`;
  }
  const empty = (title: string, text: string) => `<div class="pp-empty"><span class="pp-empty-m" aria-hidden="true">${mascot()}</span><h2 class="bt-heading">${esc(title)}</h2><p class="pp-lead">${esc(text)}</p></div>`;

  // ---- drawing ----
  function head() {
    const w = week(), pubd = w.state === "published";
    return `<div class="pp-head-l"><span class="pp-kick">${esc(rel(w.id))} · ${esc(weekRange(w.id))} · ${pubd ? "published, seats open" : "crew sign-ups"}</span><h1 class="bt-title">Crew ${esc(rel(w.id).toLowerCase())}</h1>`
      + `<p class="pp-lead">Say when you can make it, take a seat, and ask for a game on a slot you'll crew.${pubd ? "" : " These slots are drafts until Boomer publishes."}</p></div>`
      + `<div class="pp-scene" aria-hidden="true"><span class="pp-scene-cal">${SP_ICON}</span><span class="pp-scene-m">${mascot()}</span></div><div class="pp-pubbar">${fuse()}</div>`;
  }
  function renderAll() {
    q("[data-pp-head]").innerHTML = head(); q("[data-pp-weeks]").innerHTML = weeksHtml(); q("[data-pp-bar]").innerHTML = bar(); renderSlots();
  }
  function renderSlots() { q("[data-pp-slots]").innerHTML = slotsHtml(); initTri(q("[data-pp-slots]")); }
  function renderOne(id: string) {
    const s = st.streams.find((x) => x.id === id); const el = root.querySelector<HTMLElement>(`[data-slot="${id}"]`)?.closest<HTMLElement>(".pp-sl"); if (!s || !el) return renderSlots();
    const tmp = document.createElement("div"); tmp.innerHTML = slotCard(s); el.replaceWith(tmp.firstElementChild!); initTri(root);
  }
  async function reloadOne(id: string) {
    const [streams, sg] = await Promise.all([io.streams(st.wid), io.signups(id).catch(() => [] as Signup[])]);
    const i = st.streams.findIndex((x) => x.id === id), n = streams.find((x) => x.id === id);
    if (i >= 0 && n) st.streams[i] = n;
    st.mine.set(id, sg.find((x) => x.uid === who.uid) || null); renderOne(id);
  }

  // ---- actions ----
  async function run<T>(fn: () => Promise<T>, id: string): Promise<T | null> {
    if (st.busy) return null; st.busy = true;
    try { return await fn(); }
    catch (e) { toast(messageFor(e, "That didn't work. Try again."), { kind: "error" }); await reloadOne(id).catch(() => {}); return null; }
    finally { st.busy = false; }
  }
  async function setAvailability(id: string, value: string) {
    const r = await run(() => io.call("crewAvailability", { streamId: id, availability: value }), id);
    if (!r) return;
    const prev = st.mine.get(id);
    st.mine.set(id, { uid: who.uid, availability: value as any, prefilled: false, seats: r.seats || prev?.seats || [], gameRequest: r.gameRequest ?? null, handle: who.handle, grade: who.grade, track: who.track || "mod" });
    if (value === "no") toast("Got it. Your pending seat requests are cleared.", { kind: "info" });
    renderOne(id);
  }
  async function takeSeat(id: string, key: string) {
    const s = st.streams.find((x) => x.id === id)!, mine = st.mine.get(id) || null;
    const [room, role] = key === "captain" ? ["captain", "captain"] : key.split(":");
    const seats = [...(mine?.seats || []).filter((x) => x.status === "requested").map((x) => (x.role === "captain" ? { role: x.role } : { room: x.room, role: x.role })), role === "captain" ? { role } : { room, role }];
    const r = await run(() => io.call<{ seats: SeatReq[]; earlyGears?: boolean }>("dutySignUp", { streamId: id, seats }), id);
    if (!r) return;
    st.mine.set(id, { ...(mine || { uid: who.uid, availability: "yes", prefilled: false, gameRequest: null, handle: who.handle, grade: who.grade, track: who.track || "mod" }), availability: (mine?.availability || "yes") as any, prefilled: false, seats: r.seats } as Signup);
    renderOne(id);
    const el = root.querySelector<HTMLElement>(`[data-slot="${id}"]`);
    const box = el?.querySelector<HTMLElement>(`[data-drop="${key}"]`);
    burst(box || el!, { n: 14 });
    if (el && !el.querySelector(".bt-onair")) {
      el.insertAdjacentHTML("beforeend", `<span class="bt-onair pp-seat-stamp">${stampHtml({ kicker: "Seat", label: "asked", tone: "lime", size: "sm" })}</span>`);
      setTimeout(() => el.querySelector(".pp-seat-stamp")?.remove(), 2600);
    }
    toast(r.earlyGears ? "Seat requested. +3 Gears for signing up early!" : role === "captain" && grade < 3 ? "Asked for Captain. The owner has to say yes." : "Seat requested. The Captain will confirm.");
    void s;
  }
  async function dropSeat(id: string, key: string) {
    const seat = key === "captain" ? { role: "captain" } : { room: key.split(":")[0], role: key.split(":")[1] };
    const r = await run(() => io.call("dutyDrop", { streamId: id, seat }), id);
    if (r) { toast("Seat dropped. No harm done."); await reloadOne(id); }
  }

  // ---- ask for a game ----
  function askDialog(id: string) {
    const s = st.streams.find((x) => x.id === id)!, mine = st.mine.get(id) || null, hints = s.theme?.tagHints || [], gh = s.theme?.gameHints || [];
    const games = [...vault.values()].filter((g) => g.status !== undefined);
    const fits = (g: VGame) => gh.includes(g.slug) || (g.tags || []).some((t) => hints.includes(t));
    const ordered = [...games].sort((a, b) => Number(fits(b)) - Number(fits(a)) || (a.status === "playing" ? -1 : 0) - (b.status === "playing" ? -1 : 0) || a.title.localeCompare(b.title));
    const f = { pick: mine?.gameRequest?.gameSlug || "", note: mine?.gameRequest?.note || "", q: "" };
    const grid = () => {
      const needle = f.q.trim().toLowerCase(), list = ordered.filter((g) => !needle || g.title.toLowerCase().includes(needle) || (g.altNames || []).some((a) => a.toLowerCase().includes(needle))).slice(0, needle ? 24 : 12);
      return list.length ? list.map((g) => `<button type="button" class="pp-lcard" data-pick="${esc(g.slug)}" aria-pressed="${f.pick === g.slug}">${coverOf(vault, g.slug, g.title)}<small>${fits(g) ? `<span class="fit">Fits ${esc(s.theme?.label || "this slot")}</span>` : esc(g.title)}</small></button>`).join("") : `<p class="bt-meta">No games match.</p>`;
    };
    const t = dayParts(s.start, s.tz);
    const { modal, close } = openModal({
      title: "Ask for a game", feature: "planner",
      content: modalHeader("Ask for a game", `${esc(t.dow)} ${t.num} · ${esc(s.theme?.label || s.title)}. Boomer looks at mod requests first. One request per stream.`)
        + `<label class="bt-tray-search pp-asksearch"><span aria-hidden="true">🔍</span><input type="search" placeholder="Search the Vault" aria-label="Search the Vault" data-q></label>`
        + `<div class="pp-rgrid" data-grid>${grid()}</div>`
        + `<div class="bt-field"><label class="bt-label" for="pp-note">A note for Boomer (optional)</label><input class="bt-input" id="pp-note" maxlength="140" placeholder="Why this one?" autocomplete="off" value="${esc(f.note)}"></div>`
        + `<p class="bt-error" role="alert" hidden></p><div class="bt-modal-actions pp-dlg-acts">${mine?.gameRequest ? `<button type="button" class="bt-btn bt-btn--secondary" data-remove>Remove my request</button>` : ""}<span class="pp-dlg-spacer"></span><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Not now</button><button type="button" class="bt-btn bt-btn--primary" data-send disabled>Pick a game</button></div>`,
    });
    const sync = () => { const b = modal.querySelector<HTMLButtonElement>("[data-send]")!; b.disabled = !f.pick; b.textContent = f.pick ? `Ask for ${vault.get(f.pick)?.title || "this game"}` : "Pick a game"; modal.querySelector("[data-grid]")!.innerHTML = grid(); };
    sync();
    modal.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pick]"); if (b) { f.pick = b.dataset.pick!; sync(); } });
    modal.querySelector("[data-q]")!.addEventListener("input", (e) => { f.q = (e.target as HTMLInputElement).value; sync(); });
    modal.querySelector("#pp-note")!.addEventListener("input", (e) => { f.note = (e.target as HTMLInputElement).value; });
    const fail = (e: unknown) => { const el = modal.querySelector<HTMLElement>(".bt-error")!; el.textContent = messageFor(e, "That didn't work."); el.hidden = false; };
    modal.querySelector<HTMLButtonElement>("[data-send]")!.addEventListener("click", async (e) => {
      const b = e.currentTarget as HTMLButtonElement; b.disabled = true; b.textContent = "Asking…";
      try { await io.call("modGameRequest", { streamId: id, gameSlug: f.pick, note: f.note.trim() }); close(); toast("Asked. Boomer will see it first."); await reloadOne(id); burst(root.querySelector<HTMLElement>(`[data-slot="${id}"] .bt-myreq`) || root, { n: 12 }); }
      catch (err) { fail(err); sync(); }
    });
    modal.querySelector<HTMLButtonElement>("[data-remove]")?.addEventListener("click", async () => {
      try { await io.call("modGameRequest", { streamId: id, remove: true }); close(); toast("Request removed."); await reloadOne(id); } catch (err) { fail(err); }
    });
  }

  // ---- go ----
  await loadAll();
  if (!st.weeks.length) {
    root.innerHTML = `<div class="pp-page">${empty("Next week's slots land on Monday", "Each week opens on its own, filled in from Boomer's usual week. Then you can say when you're free and take a seat.")}<div class="pp-acts"><a class="bt-btn bt-btn--secondary" href="/schedule">See the schedule</a><a class="bt-btn bt-btn--secondary" href="/crew/hq">Crew HQ</a></div></div>`;
    return;
  }
  root.innerHTML = `<div class="pp-page"><header class="pp-head pp-head--crew" data-pp-head></header><div data-pp-weeks></div><div data-pp-bar></div><div data-pp-slots></div></div>`;
  renderAll();
  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const seat = t.closest<HTMLElement>("[data-seat]"), drop = t.closest<HTMLElement>("[data-drop]"), ask = t.closest<HTMLButtonElement>("[data-ask]"), keep = t.closest<HTMLElement>("[data-keep]"), all = t.closest<HTMLElement>("[data-dropall]"), wk = t.closest<HTMLElement>("[data-week]");
    const slotOf = (el: HTMLElement) => el.closest<HTMLElement>("[data-slot]")!.dataset.slot!;
    if (seat) void takeSeat(slotOf(seat), seat.dataset.seat!);
    else if (drop) void dropSeat(slotOf(drop), drop.dataset.drop!);
    else if (ask && !ask.disabled) askDialog(ask.dataset.ask!);
    else if (keep) void run(() => io.call("dutyKeep", { streamId: keep.dataset.keep }), keep.dataset.keep!).then((r) => { if (r) { toast("Great, you're still on."); void reloadOne(keep.dataset.keep!); } });
    else if (all) void run(() => io.call("dutyDrop", { streamId: all.dataset.dropall }), all.dataset.dropall!).then((r) => { if (r) { toast("Seats dropped. No harm done."); void reloadOne(all.dataset.dropall!); } });
    else if (wk) void (async () => { await loadWeek(wk.dataset.week!); renderAll(); })();
  });
  root.addEventListener("bt-tri-change", (e) => {
    const d = (e as CustomEvent<{ value: string; name: string }>).detail;
    void setAvailability(d.name, d.value);
  });
  window.setInterval(() => { if (!document.hidden && !document.querySelector(".bt-portal")) q("[data-pp-head]").innerHTML = head(); }, 60000);
}
