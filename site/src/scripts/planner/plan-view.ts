// /schedule/plan, the plan view (owner and admins; docs/specs/scream-planner.md §2, §5, §6, §8): the deadline fuse, the open week as day
// groups of slot cards, the T1 side tray (four groups from planTray, search the Vault, tap or drag to add, reorder, remove), the slot
// dialog, Publish week with its celebration, Delay and Cancel, the crew's seats. Display only: controls a grade can't use are hidden or
// disabled here, and every callable checks on the server. Writes are callables only (plan-io.ts).
import { slotHtml, slotOffHtml, roomsMiniHtml, trayHtml, initTray } from "../../../../shared/ui/slot.js";
import { dualTimeHtml, avatarsHtml, dayParts, SP_ICON } from "../../../../shared/ui/scream-planner.js";
import { fuseHtml } from "../../../../shared/ui/vote.js";
import { celebrate, burst, flyTo, reducedMotion } from "../../../../shared/ui/burst.js";
import { dayPickerHtml } from "../../../../shared/ui/day-picker.js";
import { sectionHeadHtml } from "../../../../shared/ui/section-head.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { toast } from "../../../../shared/ui/toast.js";
import { gradeInfo } from "../../../../shared/ui/grade-chip.js";
import { messageFor } from "../../lib/errors";
import {
  DAY_SHORT, ROOMS, ROOM_SHORT, GROUP_OF, SITE_TZ, weekDates, weekRange, nextWeekId, currentWeekId, localDate, dowOf, dateParts, fmtDayTime, fmtClock, hhmm12, leftText, crewGlance, roomState, movable,
  type WeekDoc, type Stream, type Signup, type TrayGroup, type TrayItem, type Settings,
} from "./plan-data";
import { coverOf, vaultOf, type Io, type Who, type VGame } from "./plan-io";
import { slotDialog, publishDialog, delayDialog, cancelDialog, crewDialog, openWeekDialog, reopenDialog, type Ctx } from "./plan-dialogs";

const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML || "";
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const SRC: Record<string, "mod" | "vote" | "you"> = { modRequest: "mod", ballot: "vote", owner: "you", wishlist: "you", suggestion: "you" };

export async function mountPlan(root: HTMLElement, io: Io, who: Who) {
  const vault = await vaultOf(io);
  const st = {
    weeks: [] as WeekDoc[], wid: "", streams: [] as Stream[], signups: new Map<string, Signup[]>(), sel: "", tray: null as TrayGroup[] | null, trayMore: 0, trayErr: "", q: "",
    day: "", sheet: false, fresh: "", settings: null as Settings | null, busy: false,
  };
  const week = () => st.weeks.find((w) => w.id === st.wid)!;
  const cur = () => st.streams.find((s) => s.id === st.sel) || null;
  const tz = () => week()?.tz || SITE_TZ;
  const curWeek = currentWeekId(SITE_TZ);
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const phone = () => root.clientWidth <= 640;

  // ---- loading ----
  const pickWeek = (weeks: WeekDoc[]) => (weeks.find((w) => w.state !== "published") || weeks[0])?.id || "";
  async function loadWeek(id: string) {
    st.wid = id;
    st.streams = id ? await io.streams(id) : [];
    const lists = await Promise.all(st.streams.map((s) => io.signups(s.id).catch(() => [] as Signup[])));
    st.signups = new Map(st.streams.map((s, i) => [s.id, lists[i]]));
  }
  async function loadAll(keep = true) {
    st.weeks = await io.weeks();
    const id = keep && st.weeks.some((w) => w.id === st.wid) ? st.wid : pickWeek(st.weeks);
    await loadWeek(id);
    if (!st.streams.some((s) => s.id === st.sel)) st.sel = "";
  }
  const ctx: Ctx = { io, who, vault, tz: SITE_TZ, week, streams: () => st.streams, weeks: () => st.weeks, refresh: async () => { if (!root.querySelector("[data-pp-board]")) { location.reload(); return; } await loadAll(); renderAll(); void loadTray(); } };
  Object.defineProperty(ctx, "tz", { get: () => tz() });

  // ---- header, week chips, fuse ----
  const rel = (id: string) => (id === curWeek ? "This week" : id === nextWeekId(curWeek) ? "Next week" : weekRange(id));
  function headHtml() {
    const w = week(), live = st.streams.filter((s) => s.state !== "cancelled"), pub = w.state === "published";
    const changes = st.streams.filter((s) => s.hasUnpublishedChanges || (!s.published && pub)).length || (w.hasUnpublishedChanges ? 1 : 0);
    const overdue = !pub && w.publishBy != null && Date.now() > w.publishBy;
    let bar = "";
    if (!pub) bar = `<span class="bt-unpub">● ${overdue ? "Not published · past the publish-by time" : "Not published yet"}</span>${who.owner ? `<button type="button" class="bt-btn bt-btn--primary bt-btn--shine" data-act="publish">Publish week</button>` : `<span class="bt-meta">Only the owner publishes.</span>`}`;
    else if (w.hasUnpublishedChanges || changes) bar = `<span class="bt-unpub">● ${plural(changes || 1, "slot")} with unpublished changes</span>${who.owner ? `<button type="button" class="bt-btn bt-btn--primary bt-btn--shine" data-act="publish">Publish changes</button>` : `<span class="bt-meta">Only the owner publishes.</span>`}`;
    else bar = `<span class="bt-published">✓ Published ${esc(fmtDayTime(w.publishedAt, tz()))} · on /schedule</span><a class="bt-btn bt-btn--secondary bt-btn--sm" href="/schedule">See it</a>`;
    if (who.owner && w.state === "closed") bar += `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="reopen">Reopen voting</button>`;
    return `<div class="pp-head-l"><span class="pp-kick">${esc(rel(w.id))} · ${esc(weekRange(w.id))} · ${esc(plural(live.length, "stream"))}</span>`
      + `<h1 class="bt-title">${w.id === curWeek ? "Plan this week" : w.id === nextWeekId(curWeek) ? "Plan next week" : `Plan ${esc(weekRange(w.id))}`}</h1>`
      + `<p class="pp-lead">Fill each slot from the tray. Mods' requests come first, then the community's votes, the theme, then your own picks.</p></div>`
      + `<div class="pp-scene" aria-hidden="true"><span class="pp-scene-cal">${SP_ICON}</span><span class="pp-scene-m">${mascot()}</span></div>`
      + `<div class="pp-pubbar" data-pubbar>${bar}</div>`;
  }
  function weeksHtml() {
    const next = nextWeekId(currentWeekId(SITE_TZ));
    const missing = !st.weeks.some((w) => w.id === next) && who.owner;
    if (st.weeks.length < 2 && !missing) return "";
    return `<div class="pp-weeks" role="group" aria-label="Week">${st.weeks.slice(0, 4).map((w) => `<button type="button" class="bt-chip bt-chip--small" data-week="${w.id}" aria-pressed="${w.id === st.wid}">${esc(rel(w.id))} <span class="bt-chip-n">${w.state === "published" ? "Published" : w.state === "closed" ? "Closed" : "Open"}</span></button>`).join("")}`
      + `${missing ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="open-early" data-week="${next}">Open ${esc(weekRange(next))} early</button>` : ""}</div>`;
  }
  function fuseBlock() {
    const w = week(), now = Date.now(), pct = (a: number | null, b: number | null) => (a == null || b == null || b <= a ? 0 : Math.max(0, Math.min(100, Math.round(((now - a) / (b - a)) * 100))));
    if (w.weekOff) return "";
    const f = (t: number | null) => fmtDayTime(t, tz());
    if (w.state === "published") return fuseHtml({ steps: [{ label: "Opened", when: f(w.opensAt), state: "done" }, { label: "Closed", when: f(w.closesAt), state: "done" }, { label: "Published", when: f(w.publishedAt), state: "done" }], progress: [100, 100] });
    if (w.state === "closed") return fuseHtml({ steps: [{ label: "Opened", when: f(w.opensAt), state: "done" }, { label: "Closed", when: f(w.closesAt), state: "done" }, { label: "Publish by", when: f(w.publishBy), state: "next", n: 3 }], progress: [100, pct(w.closesAt, w.publishBy)], left: w.publishBy && now > w.publishBy ? "Overdue" : leftText(w.publishBy || now) });
    return fuseHtml({ steps: [{ label: "Opened", when: f(w.opensAt), state: "done" }, { label: "Votes and requests close", when: f(w.closesAt), state: "next", n: 2 }, { label: "Publish by", when: f(w.publishBy), n: 3 }], progress: [pct(w.opensAt, w.closesAt), 0], left: leftText(w.closesAt || now) });
  }

  // ---- slots ----
  const dayOfStream = (s: Stream) => localDate(s.start, s.tz || SITE_TZ);
  function seatText(s: Stream) {
    const g = crewGlance(s), part = (ok: string, name: string, extra = "") => (ok === "ok" ? `${name} ✓` : ok === "needed" ? `<span class="pp-need">${name} needed${extra}</span>` : `${name} <span aria-label="nobody">—</span>`);
    const parts = [part(g.captain, "Captain"), ...g.groups.map((x) => part(x.state, x.group === "twitch" ? "Twitch" : x.group === "youtube" ? "YouTube" : "TikTok", x.group === "youtube" && x.state === "needed" ? " ×1.5" : ""))];
    return `<span class="pp-crew" aria-label="Crew so far">${parts.join(" · ")}</span>`;
  }
  function slotCard(s: Stream) {
    const t = dayParts(s.start, s.tz || SITE_TZ), sg = st.signups.get(s.id) || [], yes = sg.filter((x) => x.availability === "yes"), maybe = sg.filter((x) => x.availability === "maybe");
    const cancelled = s.state === "cancelled", pub = s.published, canEdit = ["planned", "scheduled"].includes(s.state);
    const open = sg.filter((x) => x.gameRequest?.status === "open" && !s.plannedGames.some((g) => g.gameId === x.gameRequest!.gameSlug)).length;
    const pending = sg.reduce((n, x) => n + x.seats.filter((z) => z.status === "requested").length, 0);
    const badge = cancelled ? `<span class="bt-badge bt-badge--gray">Cancelled</span>` : s.delay ? `<span class="bt-badge bt-badge--gold">Delayed</span>` : "";
    const unpub = !cancelled && s.hasUnpublishedChanges ? `<span class="bt-unpub bt-unpub--sm" title="Edited since you published">● Unpublished changes</span>` : "";
    const slotRooms: Record<string, "covered" | "needed" | "off"> = {};
    for (const r of s.rooms) slotRooms[r] = roomState(s, r);
    const acts = canEdit ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="edit" data-id="${s.id}">Edit</button>`
      + (s.type === "platform" || sg.length ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="crew" data-id="${s.id}">Crew${pending ? ` <span class="bt-chip-n">${pending} to confirm</span>` : ""}</button>` : "")
      + (pub && who.a2 && movable(s) ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="delay" data-id="${s.id}">Delay</button><button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="cancel" data-id="${s.id}">Cancel</button>` : "") : "";
    const fewer = s.plannedGames.length && s.plannedGames.length < s.plannedGameCount ? ` · +${s.plannedGameCount - s.plannedGames.length} picked on stream` : "";
    return `<div class="pp-sl" data-state="${s.state}">${slotHtml({
      id: s.id, day: t.dow, num: t.num, icon: s.theme?.icon || "", label: s.theme?.label || s.title, count: s.plannedGameCount, backstage: s.type === "backstage", selected: s.id === st.sel, published: pub && !cancelled,
      timeHtml: dualTimeHtml({ start: s.start, end: s.end, tz: s.tz, was: s.delay ? s.delay.originalStart : undefined }), badgeHtml: badge ? badge + unpub : undefined, reorder: canEdit,
      metaHtml: cancelled ? esc(s.cancel?.reason || "Cancelled") : `${s.plannedGames.length} of ${s.plannedGameCount} games${esc(fewer)}${!badge && unpub ? ` ${unpub}` : ""}`,
      games: s.plannedGames.map((g) => ({ slug: g.gameId, title: g.title, coverHtml: coverOf(vault, g.gameId, g.title), src: SRC[g.source.kind] || "you", srcExtra: g.source.kind === "modRequest" && g.source.byHandle ? ` · @${g.source.byHandle}` : g.source.kind === "ballot" && g.source.votes ? ` · ${g.source.votes}` : "", fresh: g.gameId === st.fresh })),
      roomsHtml: s.type === "backstage" ? "" : roomsMiniHtml(slotRooms) + seatText(s),
      availHtml: s.type === "backstage" ? "" : `${avatarsHtml(yes.map((x) => x.handle || "?"))}<b>${yes.length}</b> available${maybe.length ? ` · ${maybe.length} maybe` : ""}`,
      requests: open, actionsHtml: acts,
    })}</div>`;
  }
  function slotsHtml() {
    const w = week();
    if (w.weekOff) return `<div class="bt-notice pp-weekoff">🌴 <b>Week off: ${esc(w.weekOff.label)}.</b> This week opened empty and /schedule says so.${st.streams.length ? "" : " You can still add a slot if plans change."}</div>`;
    return weekDates(w.id).map((date) => {
      const list = st.streams.filter((s) => dayOfStream(s) === date), p = dateParts(date);
      const body = list.length ? list.map(slotCard).join("") : slotOffHtml({ day: p.dow, num: p.num, actionHtml: `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="add" data-date="${date}">+ Open a slot</button>` });
      return `<div class="pp-day${date === st.day ? " is-day" : ""}" data-date="${date}">${body}</div>`;
    }).join("");
  }
  function daybarHtml() {
    const w = week();
    return dayPickerHtml({ label: "Day", selected: [st.day], days: weekDates(w.id).map((d, i) => ({ key: d, label: DAY_SHORT[i], num: dateParts(d).num })) });
  }
  const sechead = () => sectionHeadHtml({ icon: "🗓️", title: "Slots", count: st.streams.filter((s) => s.state !== "cancelled").length, tools: `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="add">+ Add a slot</button>` });

  // ---- tray ----
  const gradeName = (g: number | null | undefined) => (g ? (gradeInfo("mod", g) as any).name : "");
  function trayLine(it: TrayItem, kind: string, s: Stream) {
    if (kind === "modRequests") return `<b class="pp-by">@${esc(it.byHandle || "?")}</b>${it.grade ? ` · ${esc(gradeName(it.grade))}` : ""}${it.seat ? ` · ${esc(it.seat)}` : ""}${it.fitsTheme ? ` · <span class="fit">fits ${esc(s.theme?.label || "the theme")}</span>` : ""}${it.note ? `<q>${esc(it.note)}</q>` : ""}`;
    if (kind === "votes") return `<b class="pp-votes">${esc(it.votes ?? 0)} votes</b>${it.fitsTheme ? ` · <span class="fit">fits ${esc(s.theme?.label || "the theme")}</span>` : ""}`;
    if (kind === "theme") { const hit = (s.theme?.gameHints || []).includes(it.slug); const tags = (it.tags || []).filter((t) => (s.theme?.tagHints || []).includes(t)); return `<span class="fit">${hit ? `Suggested for ${esc(s.theme?.label || "this slot")}` : `Tagged ${esc(tags.map((t) => (t.length <= 3 ? t.toUpperCase() : t[0].toUpperCase() + t.slice(1))).join(", "))}`}</span>`; }
    return it.status === "playing" ? "Playing now" : it.status ? esc(it.status[0].toUpperCase() + it.status.slice(1)) : "";
  }
  const KIND: Record<string, "mod" | "vote" | "theme" | "pick"> = { modRequests: "mod", votes: "vote", theme: "theme", picks: "pick" };
  const elsewhere = (slug: string, s: Stream) => st.streams.filter((x) => x.id !== s.id && x.state !== "cancelled" && x.plannedGames.some((g) => g.gameId === slug)).map((x) => DAY_SHORT[dowOf(dayOfStream(x)) - 1]);
  function trayView() {
    const s = cur();
    if (!s || s.state === "cancelled" || !["planned", "scheduled"].includes(s.state)) return trayHtml({ disabled: true });
    const t = dayParts(s.start, s.tz), full = s.plannedGames.length >= s.plannedGameCount, needle = st.q.trim().toLowerCase();
    const inSlot = new Set(s.plannedGames.map((g) => g.gameId)), match = (title: string, alt: string[] = []) => !needle || title.toLowerCase().includes(needle) || alt.some((a) => a.toLowerCase().includes(needle));
    let groups: TrayGroup[] = st.tray || [];
    if (needle && st.tray) {
      const used = new Set<string>(); groups = st.tray.filter((g) => g.id !== "picks").map((g) => ({ ...g, items: g.items.filter((i) => match(i.title)) })); groups.forEach((g) => g.items.forEach((i) => used.add(i.slug)));
      const hits: TrayItem[] = [...vault.values()].filter((g) => !used.has(g.slug) && !inSlot.has(g.slug) && match(g.title, g.altNames)).slice(0, 40).map((g) => ({ slug: g.slug, title: g.title, status: g.status, tags: g.tags || [], fitsTheme: false, alsoOn: elsewhere(g.slug, s) }));
      groups.push({ id: "picks", title: "Your picks", items: hits });
    }
    const order = ["modRequests", "votes", "theme", "picks"];
    const list = order.map((id) => groups.find((g) => g.id === id) || { id, title: "", items: [] }) as TrayGroup[];
    const html = trayHtml({
      forHtml: `${esc(s.theme?.icon || "")} ${esc(t.dow)} ${t.num} · ${esc(s.theme?.label || s.title)}`, filled: s.plannedGames.length, count: s.plannedGameCount, searchValue: st.q,
      groups: list.map((g) => ({
        kind: KIND[g.id], empty: !st.tray && !st.trayErr ? "Loading…" : st.trayErr ? "Couldn't load the tray." : g.id === "modRequests" ? "No mod has asked for a game on this slot yet." : g.id === "theme" ? (s.theme?.tagHints?.length || s.theme?.gameHints?.length ? "No other games fit this theme." : "This slot has no theme hints. Add some in your usual week.") : needle ? "No games match." : "Nothing here yet.",
        items: g.items.map((it) => ({ slug: it.slug, title: it.title, coverHtml: coverOf(vault, it.slug, it.title), lineHtml: trayLine(it, g.id, s), kind: g.id === "picks" ? "you" : KIND[g.id], inSlot: inSlot.has(it.slug), also: (it.alsoOn || []).join(", "), full })),
      })),
    });
    const more = st.trayMore && !needle ? `<p class="bt-meta pp-more">${st.trayMore} more in the Vault. Search to find the rest.</p>` : "";
    return html.replace(/<\/div><\/aside>$/, `${more}</div></aside>`);
  }
  let trayTok = 0;
  async function loadTray() {
    const s = cur();
    if (!s || s.state === "cancelled" || !["planned", "scheduled"].includes(s.state)) { st.tray = null; renderTray(); return; }
    const tok = ++trayTok; st.trayErr = "";
    try {
      const r = await io.call<{ groups: TrayGroup[] }>("planTray", { streamId: s.id });
      if (tok !== trayTok) return;
      st.tray = r.groups; st.trayMore = r.groups.find((g) => g.id === "picks")?.more || 0;
    } catch (e) { if (tok !== trayTok) return; st.tray = null; st.trayErr = messageFor(e); }
    renderTray();
  }

  // ---- drawing ----
  function renderTray() {
    const host = q("[data-pp-tray]"), focus = document.activeElement?.matches?.(".bt-tray-search input") ? (document.activeElement as HTMLInputElement) : null, pos = focus?.selectionStart ?? null;
    host.innerHTML = `<button type="button" class="pp-sheet-h" data-act="sheet" aria-expanded="${st.sheet}"><span class="pp-sheet-grip" aria-hidden="true"></span><span data-pp-sheet-t>${esc(sheetTitle())}</span></button>${trayView()}`;
    if (focus) { const i = host.querySelector<HTMLInputElement>(".bt-tray-search input"); i?.focus(); if (pos != null) i?.setSelectionRange(pos, pos); }
    q("[data-pp-board]").dataset.sheet = st.sheet ? "open" : "closed";
  }
  function sheetTitle() { const s = cur(); if (!s) return "Pick a slot to fill"; const t = dayParts(s.start, s.tz); return `Games for ${t.dow} ${t.num}${s.theme?.label ? ` · ${s.theme.label}` : ""}`; }
  function renderSlots() { q("[data-pp-slots]").innerHTML = slotsHtml(); q("[data-pp-sechead]").innerHTML = sechead(); q("[data-pp-daybar]").innerHTML = daybarHtml(); }
  function renderHead() { q("[data-pp-head]").innerHTML = headHtml(); q("[data-pp-weeks]").innerHTML = weeksHtml(); q("[data-pp-fuse]").innerHTML = fuseBlock(); }
  function ensureDay() {
    const ds = weekDates(st.wid);
    if (st.day && ds.includes(st.day)) return;
    const s = cur() || st.streams.find((x) => x.plannedGames.length < x.plannedGameCount && x.state !== "cancelled") || st.streams[0];
    st.day = s ? dayOfStream(s) : ds.includes(localDate(Date.now(), SITE_TZ)) ? localDate(Date.now(), SITE_TZ) : ds[0];
  }
  function renderAll() {
    if (!st.sel) { const s = st.streams.find((x) => x.state !== "cancelled" && x.plannedGames.length < x.plannedGameCount) || st.streams.find((x) => x.state !== "cancelled"); st.sel = s?.id || ""; }
    ensureDay(); renderHead(); renderSlots(); renderTray();
  }
  function select(id: string, openSheet = true) {
    if (id === st.sel) { if (phone() && openSheet) { st.sheet = true; renderTray(); } return; }
    st.sel = id; st.q = ""; st.tray = null; st.sheet = phone() && openSheet;
    root.querySelectorAll<HTMLElement>(".bt-slot").forEach((el) => { const on = el.dataset.slot === id; el.classList.toggle("is-sel", on); on ? el.setAttribute("aria-current", "true") : el.removeAttribute("aria-current"); });
    renderTray(); void loadTray();
  }

  // ---- changing a slot's games ----
  async function setGames(s: Stream, slugs: string[], fresh = ""): Promise<boolean> {
    if (st.busy) return false; st.busy = true;
    try {
      const r = await io.call<{ plannedGames: { gameId: string; order: number; source: any; title?: string }[] }>("planGames", { streamId: s.id, slugs });
      s.plannedGames = r.plannedGames.slice().sort((a, b) => a.order - b.order).map((g) => ({ gameId: g.gameId, order: g.order, source: g.source, title: g.title || vault.get(g.gameId)?.title || s.plannedGames.find((x) => x.gameId === g.gameId)?.title || g.gameId }));
      if (s.published) { s.hasUnpublishedChanges = true; week().hasUnpublishedChanges = true; }
      st.fresh = fresh; renderSlots(); renderHead(); st.fresh = "";
      if (fresh) { const socks = root.querySelectorAll<HTMLElement>(`[data-slot="${s.id}"] .bt-sock`); const idx = s.plannedGames.findIndex((g) => g.gameId === fresh); burst(socks[idx], { n: 10 }); }
      void loadTray(); return true;
    } catch (e) { toast(messageFor(e, "Couldn't change the games."), { kind: "error" }); return false; }
    finally { st.busy = false; }
  }
  function addGame(slug: string, _kind: string, item: HTMLElement | null, sock: HTMLElement | null) {
    const s = cur(); if (!s || s.plannedGames.some((g) => g.gameId === slug)) return;
    if (s.plannedGames.length >= s.plannedGameCount) { toast("This slot is full. Remove a game first or raise the count.", { kind: "info" }); return; }
    const target = sock || root.querySelector<HTMLElement>(`[data-slot="${s.id}"] .bt-sock-empty`)?.closest<HTMLElement>(".bt-sock") || null;
    const slugs = [...s.plannedGames.map((g) => g.gameId), slug];
    if (reducedMotion() || !item || !target) { void setGames(s, slugs, slug); return; }
    void Promise.all([setGames(s, slugs, slug)]);
    flyTo(item.querySelector(".bt-cover") as HTMLElement, target.querySelector(".bt-sock-empty") as HTMLElement || target);
  }

  // ---- events ----
  const initial = async () => {
    root.innerHTML = `<div class="pp-page"><header class="pp-head" data-pp-head></header><div data-pp-weeks></div><div class="pp-fuse" data-pp-fuse></div>`
      + `<div class="pp-plan" data-pp-board data-sheet="closed"><div class="pp-main"><div class="pp-daybar" data-pp-daybar></div><div data-pp-sechead></div><div class="bt-slots pp-slots" data-pp-slots></div></div><div class="pp-traywrap" data-pp-tray></div></div></div>`;
  };
  async function act(btn: HTMLElement) {
    const a = btn.dataset.act!, s = st.streams.find((x) => x.id === btn.dataset.id) || null;
    switch (a) {
      case "add": await slotDialog(ctx, null, btn.dataset.date); break;
      case "edit": if (s) await slotDialog(ctx, s); break;
      case "crew": if (s) await crewDialog(ctx, s); break;
      case "delay": if (s) await delayDialog(ctx, s); break;
      case "cancel": if (s) await cancelDialog(ctx, s); break;
      case "reopen": await reopenDialog(ctx, week()); break;
      case "open-early": await openWeekDialog(ctx, btn.dataset.week!); break;
      case "sheet": st.sheet = !st.sheet; q("[data-pp-board]").dataset.sheet = st.sheet ? "open" : "closed"; (btn as HTMLElement).setAttribute("aria-expanded", String(st.sheet)); break;
      case "publish": {
        const again = week().state === "published", r = await publishDialog(ctx);
        if (!r.published) break;
        const bar = q("[data-pubbar]"); burst(bar, { n: 24 });
        await loadAll(); renderAll();
        const slots = q("[data-pp-slots]");
        root.dataset.celebrating = "1"; setTimeout(() => delete root.dataset.celebrating, 3200);
        celebrate(slots, { selector: ".bt-slot" });
        toast(again ? "Changes published. /schedule is up to date." : "Published. /schedule is live and the crew can sign up for seats.");
        void loadTray();
        break;
      }
    }
  }
  function wire() {
    root.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLElement>("[data-act]"); if (b && root.contains(b)) { void act(b); return; }
      const wk = t.closest<HTMLElement>("[data-week]"); if (wk && !wk.dataset.act) { void (async () => { st.sel = ""; st.day = ""; st.tray = null; await loadWeek(wk.dataset.week!); renderAll(); void loadTray(); })(); return; }
      const dy = t.closest<HTMLElement>("[data-day]"); if (dy) { st.day = dy.dataset.day!; renderSlots(); return; }
      const mv = t.closest<HTMLElement>("[data-mv]");
      if (mv) {
        const [id, i, d] = mv.dataset.mv!.split(":"), s = st.streams.find((x) => x.id === id); if (!s) return;
        const slugs = s.plannedGames.map((g) => g.gameId), a = Number(i), b = a + Number(d); [slugs[a], slugs[b]] = [slugs[b], slugs[a]];
        e.stopPropagation(); void setGames(s, slugs); return;
      }
      const slot = t.closest<HTMLElement>(".bt-slot");
      if (slot && !t.closest("button, a, input, select")) select(slot.dataset.slot!);
    });
    root.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement;
      if ((e.key === "Enter" || e.key === " ") && t.matches(".bt-slot")) { e.preventDefault(); select(t.dataset.slot!); t.focus(); }
    });
    initTray(q("[data-pp-board]"), {
      onAdd: (slug: string, kind: string, item: HTMLElement, sock: HTMLElement) => addGame(slug, kind, item, sock),
      onRemove: (id: string, i: number) => { const s = st.streams.find((x) => x.id === id); if (s) void setGames(s, s.plannedGames.map((g) => g.gameId).filter((_, k) => k !== i)); },
      onSearch: (v: string) => { st.q = v; window.clearTimeout(searchT); searchT = window.setTimeout(renderTray, 120); },
    });
    let searchT = 0;
  }

  // ---- go ----
  await loadAll(false);
  if (!st.weeks.length) { renderEmpty(); return; }
  await initial(); wire(); renderAll(); void loadTray();
  // a quiet reminder tick for the countdowns
  window.setInterval(() => { if (document.hidden) return; q("[data-pp-fuse]").innerHTML = fuseBlock(); }, 60000);

  async function renderEmpty() {
    let settings: Settings | null = null; try { settings = await io.settings(); } catch { /* the line below is generic */ }
    const d = settings?.deadlines;
    const when = d ? `${["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][d.openDow]} at ${hhmm12(d.openTime)}` : "Monday morning";
    root.innerHTML = `<div class="pp-page"><div class="pp-empty"><span class="pp-empty-m" aria-hidden="true">${mascot()}</span><h1 class="bt-title">No week is open yet</h1>`
      + `<p class="pp-lead">Each week opens on its own ${esc(when)} (Central), filled in from your usual week. ${who.owner ? "Or open the next one now." : "Check back then."}</p>`
      + `<div class="pp-acts">${who.owner ? `<button type="button" class="bt-btn bt-btn--admin" data-act="open-early" data-week="${nextWeekId(curWeek)}">Open week</button>` : ""}<a class="bt-btn bt-btn--secondary" href="/schedule/plan/usual">Your usual week</a></div></div></div>`;
    root.querySelector<HTMLElement>("[data-act=open-early]")?.addEventListener("click", async (e) => { const ok = await openWeekDialog(ctx, (e.currentTarget as HTMLElement).dataset.week!); if (ok) location.reload(); });
  }
  void ROOMS; void ROOM_SHORT; void GROUP_OF; void fmtClock;
}
