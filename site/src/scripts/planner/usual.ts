// /schedule/plan/usual (owner and admins; docs/specs/scream-planner.md §2, §4a, §8, mockup "Editing my usual week"): the usual week as a
// 7-day strip of poster cards, add, edit or delete a pattern in a dialog, the exceptions list and editor, and (owner only) the deadlines and
// defaults card. Writes only through patternSave, patternDelete, exceptionSave, exceptionDelete and plannerSaveSettings. Preview
// (?as=admin, non-production, signed out) edits a local copy and says nothing is saved.
import { onAccess } from "./layout";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { posterHtml } from "../../../../shared/ui/poster.js";
import { platformsHtml } from "../../../../shared/ui/scream-planner.js";
import { sectionHeadHtml } from "../../../../shared/ui/section-head.js";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import { SP_ICON } from "../../../../shared/ui/scream-planner.js";
import { messageFor } from "../../lib/errors";
import { makeIo, whoAmI, vaultOf, type Io, type Who } from "./plan-io";
import { ROOMS, ROOM_NAME, DAY_SHORT, DAY_LONG, GROUP_OF, hhmm12, dateParts, type Pattern, type Exception, type Settings, type Room } from "./plan-data";

const root = document.querySelector<HTMLElement>("[data-pu]")!;
const body = root.querySelector<HTMLElement>("[data-pu-body]")!;
const ICONS = ["🥽", "🤝", "👵", "🎬", "🩸", "☕", "🕯️", "🎃", "🔦", "🧟", "🎯", "🎮"];
const FEATURE = "planner";
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML || "";

const rangeText = (a: string, b: string) => {
  const p = (t: string) => { const [h, m] = t.split(":").map(Number); return { t: `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}`, ap: h >= 12 ? "PM" : "AM" }; };
  const x = p(a), y = p(b);
  return x.ap === y.ap ? `${x.t}–${y.t} ${y.ap}` : `${x.t} ${x.ap}–${y.t} ${y.ap}`;
};
const dateText = (d: string) => { const p = dateParts(d); return `${p.month} ${p.num}`; };
const rangeDates = (e: Exception) => (e.to && e.to !== e.from ? `${dateText(e.from)} to ${dateText(e.to)}` : dateText(e.from));
const chip = (attrs: string, text: string, on: boolean, extra = "") => `<button type="button" class="bt-chip bt-chip--small${extra}" ${attrs} aria-pressed="${on}">${text}</button>`;
const field = (label: string, bodyHtml: string, id = "") => `<div class="bt-field"><${id ? `label for="${id}"` : "span"} class="bt-label">${label}</${id ? "label" : "span"}>${bodyHtml}</div>`;
const showErr = (m: HTMLElement, e: unknown) => { const el = m.querySelector<HTMLElement>(".bt-error"); if (el) { el.textContent = messageFor(e, "That didn't work. Try again."); el.hidden = false; } };
const busy = (b: HTMLButtonElement, t: string) => { b.disabled = true; b.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>${esc(t)}`; };
function press(group: Element | null, selector: string, single: boolean, onChange?: () => void) {
  group?.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(selector); if (!b || b.disabled) return;
    if (single) group.querySelectorAll(selector).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    else b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    onChange?.();
  });
}
const sw = (name: string, on: boolean, label: string, dis = false) => `<button type="button" class="bt-switch" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-sw="${name}"${dis ? " disabled" : ""}></button>`;

onAccess(async (s) => {
  try {
    const [io, who] = await Promise.all([makeIo(), whoAmI(s)]);
    if (who.preview) body.insertAdjacentHTML("beforebegin", `<p class="bt-notice pp-previewnote">Preview data for checking the layout. Nothing here is saved.${who.owner ? " Add ?owner=0 to see the admin view without the settings card." : ""}</p>`);
    await mount(io, who);
    root.querySelector<HTMLElement>("[data-pu-load]")!.hidden = true; body.hidden = false;
  } catch (err) {
    console.error(err);
    root.querySelector<HTMLElement>("[data-pu-load]")!.hidden = true;
    const e = root.querySelector<HTMLElement>("[data-pu-error]")!; e.hidden = false; e.querySelector("[data-pu-error-text]")!.textContent = messageFor(err, "Check your connection and try again.");
  }
});
root.querySelector("[data-pu-retry]")?.addEventListener("click", () => location.reload());

async function mount(io: Io, who: Who) {
  const vault = await vaultOf(io);
  let data = await io.usual();
  let selected = "";
  const reload = async () => { data = await io.usual(); draw(); };

  // ---- the strip ----
  const posterOf = (p: Pattern) => posterHtml({
    id: p.id, day: DAY_SHORT[p.dow - 1], icon: p.icon || "", label: p.label + (p.active ? "" : " · paused"), timeText: rangeText(p.start, p.end), backstage: p.type === "backstage",
    platformsHtml: platformsHtml((p.rooms || (p.platforms || ["twitch", "youtube", "tiktok"]).flatMap((x) => (x === "youtube" ? ["ytLandscape", "ytVertical"] : [x]))) as string[]),
    selected: p.id === selected, editable: true,
  });
  function strip() {
    return `<div class="bt-posters pu-strip">${DAY_SHORT.map((d, i) => {
      const list = data.patterns.filter((p) => p.dow === i + 1);
      return `<div class="pu-col${list.some((p) => !p.active) ? " has-paused" : ""}" data-dow="${i + 1}">${list.length ? list.map(posterOf).join("") + `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm pu-addday" data-add-slot="${d}" data-dow="${i + 1}">+ Another</button>` : posterHtml({ off: true, day: d, editable: true })}</div>`;
    }).join("")}</div>`;
  }

  // ---- exceptions ----
  const KIND: Record<string, [string, string]> = { weekOff: ["pink", "Week off"], dayOff: ["gold", "Day off"], skipPattern: ["blue", "Skip a slot"] };
  function exceptions() {
    const list = data.exceptions;
    const rows = list.length ? list.map((x) => {
      const [tone, text] = KIND[x.kind] || ["gray", x.kind];
      const names = x.kind === "skipPattern" ? (x.patternIds || []).map((id) => data.patterns.find((p) => p.id === id)?.label || "a slot").join(", ") : "";
      return `<div class="pu-exc"><span class="bt-badge bt-badge--${tone}">${text}</span><span class="pu-exc-t"><b>${esc(x.label)}</b><small>${esc(rangeDates(x))}${names ? ` · ${esc(names)}` : ""}</small></span><span class="pu-pub">${sw(`pub:${x.id}`, x.public, `Show ${x.label} on /schedule`)}<span>On /schedule</span></span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-exc="${x.id}">Edit</button></div>`;
    }).join("") : `<div class="bt-empty bt-empty--compact"><div class="bt-empty-title">No exceptions</div><p>Add a week off, a day off or skip one slot once. They show on /schedule if you let them.</p></div>`;
    return sectionHeadHtml({ icon: "🗓️", title: "Exceptions", count: list.length, sub: "Weeks off, days off, or skipping one slot once.", tools: `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-exc="new">+ Add exception</button>` }) + `<div class="pu-exc-list">${rows}</div>`;
  }

  // ---- settings (owner) ----
  const DOW = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const slotsOfDay = (hhmm: string) => hhmm;
  const minOfWeek = (dow: number, hhmm: string) => (dow - 1) * 1440 + Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  const dlOk = (d: Settings["deadlines"]) => minOfWeek(d.openDow, d.openTime) < minOfWeek(d.closeDow, d.closeTime) && minOfWeek(d.closeDow, d.closeTime) < minOfWeek(d.publishDow, d.publishTime);
  function settingsCard() {
    const d = data.settings.deadlines, f = data.settings.defaults, dis = !who.owner, ok = dlOk(d);
    const row = (k: "open" | "close" | "publish", ic: string, label: string) => `<div class="pu-dl"><span class="pu-dl-ic" aria-hidden="true">${ic}</span><b>${label}</b><select class="bt-select" data-dl-day="${k}" aria-label="${label}, day"${dis ? " disabled" : ""}>${DAY_LONG.map((n, i) => `<option value="${i + 1}"${(d as any)[`${k}Dow`] === i + 1 ? " selected" : ""}>${n}</option>`).join("")}</select><input class="bt-input" type="time" step="900" data-dl-time="${k}" aria-label="${label}, time" value="${(d as any)[`${k}Time`]}"${dis ? " disabled" : ""}></div>`;
    const week = DAY_SHORT.map((n, i) => `<span>${n.toUpperCase()}<i>${[d.openDow === i + 1 ? "🔓" : "", d.closeDow === i + 1 ? "🔒" : "", d.publishDow === i + 1 ? "📣" : ""].join("")}</i></span>`).join("");
    const num = (k: string, label: string, v: number, min: number, max: number, hint = "") => `<div class="bt-field"><label class="bt-label" for="st-${k}">${label}</label><input class="bt-input pu-num" id="st-${k}" type="number" min="${min}" max="${max}" step="1" inputmode="numeric" data-def="${k}" value="${v}"${dis ? " disabled" : ""}>${hint ? `<span class="bt-hint">${hint}</span>` : ""}</div>`;
    return `<form class="bt-card pu-settings" data-settings novalidate><div class="bt-card-head"><h2 class="bt-card-title"><span class="pu-ic" aria-hidden="true">${SP_ICON}</span>Deadlines and defaults</h2><span class="bt-admin-tag">${who.owner ? "Owner" : "Owner only"}</span></div>`
      + `<p class="bt-section-text">For the week after this one. Central time. ${who.owner ? "" : "Only the owner can change these. You can see the current values."}</p>`
      + row("open", "🔓", "Week opens") + row("close", "🔒", "Votes and requests close") + row("publish", "📣", "Publish by")
      + `<div class="pu-weekline" aria-hidden="true">${week}</div><p class="pu-valid ${ok ? "is-ok" : "is-bad"}" role="status" data-valid>${ok ? "✓ In order: opens, closes, then publish, all before Monday." : "Close has to come after open, and publish after close."}</p>`
      + `<h3 class="pu-h3">New slot defaults</h3>`
      + field("Chats", `<div class="pp-chips" data-def-rooms>${ROOMS.map((r) => chip(`data-room="${r}"`, `${platformIconHtml(r)}${esc(ROOM_NAME[r])}`, f.rooms.includes(r), " pp-chip-ic").replace("<button", dis ? "<button disabled" : "<button")).join("")}</div>`)
      + field("Crew a slot needs", `<div class="pp-chips" data-def-need>${chip('data-need="cap"', "⚓ A Captain", f.minCrew.captain).replace("<button", dis ? "<button disabled" : "<button")}${chip('data-need="yt"', "A YouTube lead", f.minCrew.rooms.includes("youtube")).replace("<button", dis ? "<button disabled" : "<button")}</div>`)
      + `<div class="pu-nums">${num("gameCount", "Games per stream", f.gameCount, 1, 6)}${num("deckhands", "Deckhands per chat", f.caps.deckhands, 0, 5)}${num("votesPerMember", "Votes per member", f.votesPerMember, 1, 10)}${num("ballotAddsPerMember", "Ballot adds per member", f.ballotAddsPerMember, 0, 10)}${num("ballotSeed", "Ballot seed (most wanted)", f.ballotSeed, 0, 20)}</div>`
      + `<p class="bt-error" role="alert" hidden></p>${who.owner ? `<div class="bt-form-actions"><button type="submit" class="bt-btn bt-btn--admin" data-save-settings${ok ? "" : " disabled"}>Save settings</button></div>` : ""}</form>`;
  }

  function draw() {
    body.innerHTML = `<div class="pp-page"><header class="pp-head"><div class="pp-head-l"><span class="pp-kick">/schedule/plan/usual · only you and admins</span><h1 class="bt-title">My usual week</h1>`
      + `<p class="pp-lead">Each new week opens from these. Changes start with the next week that opens; weeks already open stay as they are.</p></div>`
      + `<div class="pp-scene" aria-hidden="true"><span class="pp-scene-cal">${SP_ICON}</span><span class="pp-scene-m">${mascot()}</span></div>`
      + `<div class="pp-pubbar"><a class="bt-btn bt-btn--secondary" href="/schedule/usual">See it as members do</a><a class="bt-btn bt-btn--secondary" href="/schedule/plan">Back to the plan</a></div></header>`
      + `<section aria-label="The usual week" data-strip>${strip()}</section>`
      + `<section aria-label="Exceptions" class="pu-sec" data-exceptions>${exceptions()}</section>`
      + `<section aria-label="Deadlines and defaults" class="pu-sec">${settingsCard()}</section></div>`;
    wireSettings();
  }

  // ---- pattern dialog ----
  function patternDialog(p: Pattern | null, dow?: number) {
    const f = {
      label: p?.label ?? "", icon: p?.icon ?? "", dow: p?.dow ?? dow ?? 1, start: p?.start ?? "20:00", end: p?.end ?? "22:00", type: p?.type ?? "platform",
      rooms: new Set<Room>((p?.rooms || (p?.platforms ? p.platforms.flatMap((x) => (x === "youtube" ? ["ytLandscape", "ytVertical"] : [x])) : data.settings.defaults.rooms)) as Room[]),
      count: p?.gameCount ?? data.settings.defaults.gameCount, tags: [...(p?.tagHints || [])], games: [...(p?.gameHints || [])], active: p?.active ?? true,
      cap: p?.minCrew ? p.minCrew.captain : data.settings.defaults.minCrew.captain, yt: p?.minCrew ? p.minCrew.rooms.includes("youtube") : data.settings.defaults.minCrew.rooms.includes("youtube"),
    };
    const content = modalHeader(esc(p ? `Edit ${p.label}` : "Add a slot to the usual week"), `<span class="bt-meta">Every ${DAY_LONG[f.dow - 1]}. Changes start with the next week that opens.</span>`)
      + `<form class="pp-form" novalidate>`
      + `<div class="pu-prev"><div data-prev></div><p class="bt-meta" data-prev-t></p></div>`
      + field("Name and icon", `<input class="bt-input" id="pt-label" maxlength="60" value="${esc(f.label)}" placeholder="VR night" autocomplete="off"><div class="pp-icons" role="group" aria-label="Icon">${ICONS.map((i) => `<button type="button" class="pp-icon-b" data-icon="${i}" aria-pressed="${f.icon === i}" aria-label="Icon ${i}">${i}</button>`).join("")}</div>`, "pt-label")
      + field("Day", `<div class="pp-chips" data-days>${DAY_SHORT.map((d, i) => chip(`data-dow="${i + 1}"`, d, f.dow === i + 1)).join("")}</div>`)
      + `<div class="pp-row2 pu-row2">${field("Starts (Central)", `<input class="bt-input" type="time" step="900" id="pt-start" value="${f.start}">`, "pt-start")}${field("Ends", `<input class="bt-input" type="time" step="900" id="pt-end" value="${f.end}">`, "pt-end")}${field("Games per stream", `<input class="bt-input pp-num" type="number" id="pt-count" min="1" max="6" step="1" inputmode="numeric" value="${f.count}">`, "pt-count")}</div>`
      + field("Type", `<div class="pp-chips" data-types>${chip('data-type="platform"', "📡 Live on platforms", f.type === "platform")}${chip('data-type="backstage"', "🔑 Backstage, members only", f.type === "backstage")}</div>`)
      + `<div data-when="platform"${f.type === "platform" ? "" : " hidden"}>${field("Chats", `<div class="pp-chips" data-rooms>${ROOMS.map((r) => chip(`data-room="${r}"`, `${platformIconHtml(r)}${esc(ROOM_NAME[r])}`, f.rooms.has(r), " pp-chip-ic")).join("")}</div>`)}${field("Needs from the crew", `<div class="pp-chips" data-needs>${chip('data-need="cap"', "⚓ A Captain", f.cap)}${chip('data-need="yt"', "A YouTube lead", f.yt)}</div>`)}</div>`
      + `<div data-when="backstage"${f.type === "backstage" ? "" : " hidden"}>${field("Who can watch", `<div class="pp-chips">${chip("", "Fan Club (free)", true)}<button type="button" class="bt-chip bt-chip--small" disabled title="When billing exists">Sub Club · after billing</button></div>`)}</div>`
      + field("Suggest first in the tray (tags)", `<div class="pu-tokens" data-tags></div><input class="bt-input" id="pt-tag" placeholder="Type a Vault tag, press Enter (vr, co-op…)" autocomplete="off" list="pt-tags">`, "pt-tag")
      + field("Suggest first in the tray (games)", `<div class="pu-tokens" data-games></div><input class="bt-input" id="pt-game" placeholder="Search the Vault, press Enter" autocomplete="off" list="pt-games">`, "pt-game")
      + `<datalist id="pt-games">${[...vault.values()].slice(0, 400).map((g) => `<option value="${esc(g.title)}"></option>`).join("")}</datalist>`
      + `<datalist id="pt-tags">${[...new Set([...vault.values()].flatMap((g) => g.tags || []))].slice(0, 80).map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist>`
      + `<div class="pu-pubrow"><span>${sw("active", f.active, "Active")}<span>Active (opens with each new week)</span></span></div>`
      + `<p class="bt-error" role="alert" hidden></p><div class="bt-modal-actions pp-dlg-acts">${p ? `<button type="button" class="bt-btn bt-btn--secondary" data-remove>Delete this slot</button>` : ""}<span class="pp-dlg-spacer"></span><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--admin" data-save>${p ? "Save" : "Add slot"}</button></div></form>`;
    const { modal, close } = openModal({ content, title: p ? "Edit usual slot" : "Add to the usual week", wide: true, feature: FEATURE });
    const form = modal.querySelector<HTMLFormElement>("form")!, q = <T extends HTMLElement>(s: string) => form.querySelector<T>(s)!;
    const tokens = () => {
      q("[data-tags]").innerHTML = f.tags.map((t) => `<span class="pu-tok">#${esc(t)}<button type="button" data-rm-tag="${esc(t)}" aria-label="Remove ${esc(t)}">✕</button></span>`).join("");
      q("[data-games]").innerHTML = f.games.map((g) => `<span class="pu-tok is-game">${esc(vault.get(g)?.title || g)}<button type="button" data-rm-game="${esc(g)}" aria-label="Remove ${esc(vault.get(g)?.title || g)}">✕</button></span>`).join("");
    };
    // live preview of the poster as it will sit in the strip, with what it means for the tray
    const renderPrev = () => {
      const val = (s: string) => (form.querySelector(s) as HTMLInputElement | null)?.value || "";
      const type = form.querySelector<HTMLElement>("[data-types] [aria-pressed=true]")?.dataset.type || f.type, dowN = Number(form.querySelector<HTMLElement>("[data-days] [aria-pressed=true]")?.dataset.dow || f.dow);
      const rooms = [...form.querySelectorAll<HTMLElement>("[data-room][aria-pressed=true]")].map((x) => x.dataset.room as string), n = Math.max(1, Number(val("#pt-count")) || f.count);
      q("[data-prev]").innerHTML = posterHtml({ day: DAY_SHORT[dowN - 1], icon: form.querySelector<HTMLElement>("[data-icon][aria-pressed=true]")?.dataset.icon || "", label: val("#pt-label").trim() || "Your slot", timeText: rangeText(val("#pt-start") || f.start, val("#pt-end") || f.end), backstage: type === "backstage", platformsHtml: platformsHtml(rooms) });
      q("[data-prev-t]").textContent = `Next week this opens as a ${type === "backstage" ? "backstage" : "live"} slot with ${n} game spot${n === 1 ? "" : "s"}${f.tags.length ? `, and #${f.tags[0]} games at the top of the tray` : ""}.`;
    };
    tokens(); renderPrev();
    form.addEventListener("input", renderPrev); form.addEventListener("click", () => queueMicrotask(renderPrev));
    form.addEventListener("click", (e) => {
      const t = e.target as HTMLElement, a = t.closest<HTMLElement>("[data-rm-tag]"), b = t.closest<HTMLElement>("[data-rm-game]");
      if (a) { f.tags = f.tags.filter((x) => x !== a.dataset.rmTag); tokens(); } else if (b) { f.games = f.games.filter((x) => x !== b.dataset.rmGame); tokens(); }
      const ic = t.closest<HTMLButtonElement>("[data-icon]");
      if (ic) { const on = ic.getAttribute("aria-pressed") !== "true"; form.querySelectorAll("[data-icon]").forEach((x) => x.setAttribute("aria-pressed", "false")); ic.setAttribute("aria-pressed", String(on)); }
      const swb = t.closest<HTMLElement>("[data-sw=active]"); if (swb) { f.active = !f.active; swb.setAttribute("aria-checked", String(f.active)); }
    });
    form.addEventListener("keydown", (e) => {
      const t = e.target as HTMLInputElement;
      if (e.key !== "Enter" || !t.matches("#pt-tag, #pt-game")) return;
      e.preventDefault(); const v = t.value.trim(); if (!v) return;
      if (t.id === "pt-tag") { const tag = v.replace(/^#/, "").toLowerCase(); if (!f.tags.includes(tag)) f.tags.push(tag); }
      else { const g = [...vault.values()].find((x) => x.title.toLowerCase() === v.toLowerCase()); if (!g) { showErr(modal, { code: "bt/msg", message: "That game isn't in the Vault. Pick one from the list." }); return; } if (!f.games.includes(g.slug)) f.games.push(g.slug); }
      t.value = ""; tokens(); modal.querySelector<HTMLElement>(".bt-error")!.hidden = true;
    });
    press(q("[data-days]"), "[data-dow]", true);
    press(q("[data-types]"), "[data-type]", true, () => { const ty = q("[data-types] [aria-pressed=true]").dataset.type; q("[data-when=platform]").hidden = ty !== "platform"; q("[data-when=backstage]").hidden = ty !== "backstage"; });
    press(q("[data-rooms]"), "[data-room]", false); press(q("[data-needs]"), "[data-need]", false);
    modal.querySelector<HTMLButtonElement>("[data-remove]")?.addEventListener("click", () => {
      close();
      void confirmAction({ title: `Delete ${p!.label}?`, message: "It leaves the usual week. Weeks already open keep their slot; the next week to open won't have it.", confirmLabel: "Delete slot", busyLabel: "Deleting…", danger: false, feature: FEATURE,
        onConfirm: async () => { try { await io.call("patternDelete", { id: p!.id }); } catch (e) { throw new Error(messageFor(e)); } } }).then(async (ok) => { if (ok) { toast("Removed from the usual week."); selected = ""; await reload(); } });
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const label = q<HTMLInputElement>("#pt-label").value.trim(), start = q<HTMLInputElement>("#pt-start").value, end = q<HTMLInputElement>("#pt-end").value, count = Number(q<HTMLInputElement>("#pt-count").value);
      const type = q("[data-types] [aria-pressed=true]").dataset.type as "platform" | "backstage", rooms = [...form.querySelectorAll<HTMLElement>("[data-room][aria-pressed=true]")].map((b) => b.dataset.room as Room);
      const problem = !label ? "Give it a name." : !start || !end || start === end ? "Pick a start and an end time." : type === "platform" && !rooms.length ? "Pick at least one chat." : !Number.isInteger(count) || count < 1 || count > 6 ? "Games per stream: 1 to 6." : "";
      if (problem) { showErr(modal, { code: "bt/msg", message: problem }); return; }
      const dow = Number(q("[data-days] [aria-pressed=true]").dataset.dow), icon = form.querySelector<HTMLElement>("[data-icon][aria-pressed=true]")?.dataset.icon || null;
      const platforms = [...new Set(rooms.map((r) => GROUP_OF[r]))];
      const payload: Record<string, unknown> = { ...(p ? { id: p.id } : {}), label, icon, dow, start, end, type, gameCount: count, tagHints: f.tags, gameHints: f.games, active: f.active, order: p?.order ?? Math.max(0, ...data.patterns.map((x) => x.order || 0)) + 1,
        ...(type === "platform" ? { platforms, rooms, minCrew: { captain: !!form.querySelector("[data-need=cap][aria-pressed=true]"), rooms: form.querySelector("[data-need=yt][aria-pressed=true]") ? ["youtube"] : [] } } : {}) };
      const btn = q<HTMLButtonElement>("[data-save]"), was = btn.textContent!; busy(btn, "Saving…");
      try { const r = await io.call<{ id: string }>("patternSave", payload); selected = r.id; close(); toast("Saved. The next week to open uses it."); await reload(); }
      catch (e2) { showErr(modal, e2); btn.disabled = false; btn.textContent = was; }
    });
  }

  // ---- exception dialog ----
  function exceptionDialog(x: Exception | null) {
    const today = new Date().toISOString().slice(0, 10);
    const f = { kind: x?.kind ?? "dayOff", from: x?.from ?? today, to: x?.to ?? x?.from ?? today, label: x?.label ?? "", pub: x?.public ?? true, ids: new Set(x?.patternIds || []) };
    const content = modalHeader(esc(x ? "Edit exception" : "Add an exception"), `<span class="bt-meta">Nothing opens in the days it covers.</span>`)
      + `<form class="pp-form" novalidate>`
      + field("What", `<div class="pp-chips" data-kinds>${chip('data-kind="weekOff"', "🌴 A whole week off", f.kind === "weekOff")}${chip('data-kind="dayOff"', "😴 Days off", f.kind === "dayOff")}${chip('data-kind="skipPattern"', "⏭ Skip one slot", f.kind === "skipPattern")}</div>`)
      + `<div class="pp-row2 pu-row2b">${field("From", `<input class="bt-input" type="date" id="ex-from" value="${f.from}">`, "ex-from")}${field("To (optional)", `<input class="bt-input" type="date" id="ex-to" value="${f.to}">`, "ex-to")}</div>`
      + field("Label", `<input class="bt-input" id="ex-label" maxlength="60" value="${esc(f.label)}" placeholder="Holidays" autocomplete="off">`, "ex-label")
      + `<div data-skip${f.kind === "skipPattern" ? "" : " hidden"}>${field("Which slots", `<div class="pp-chips" data-pats>${data.patterns.map((p) => chip(`data-pid="${esc(p.id)}"`, `${esc(p.icon || "")} ${esc(p.label)} · ${DAY_SHORT[p.dow - 1]}`, f.ids.has(p.id))).join("") || "<span class='bt-meta'>No slots in the usual week yet.</span>"}</div>`)}</div>`
      + `<div class="pu-pubrow"><span>${sw("pub", f.pub, "Show the label on /schedule")}<span>Show the label on /schedule</span></span></div>`
      + `<p class="bt-error" role="alert" hidden></p><div class="bt-modal-actions pp-dlg-acts">${x ? `<button type="button" class="bt-btn bt-btn--secondary" data-remove>Delete</button>` : ""}<span class="pp-dlg-spacer"></span><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--admin" data-save>${x ? "Save" : "Add exception"}</button></div></form>`;
    const { modal, close } = openModal({ content, title: x ? "Edit exception" : "Add an exception", feature: FEATURE });
    const form = modal.querySelector<HTMLFormElement>("form")!, q = <T extends HTMLElement>(s: string) => form.querySelector<T>(s)!;
    press(q("[data-kinds]"), "[data-kind]", true, () => { f.kind = q("[data-kinds] [aria-pressed=true]").dataset.kind as any; q("[data-skip]").hidden = f.kind !== "skipPattern"; });
    press(q("[data-pats]"), "[data-pid]", false);
    form.querySelector("[data-sw=pub]")!.addEventListener("click", (e) => { f.pub = !f.pub; (e.currentTarget as HTMLElement).setAttribute("aria-checked", String(f.pub)); });
    modal.querySelector<HTMLButtonElement>("[data-remove]")?.addEventListener("click", () => {
      close();
      void confirmAction({ title: `Delete ${x!.label}?`, message: "Slots it covered will open again in weeks that haven't opened yet.", confirmLabel: "Delete", busyLabel: "Deleting…", danger: false, feature: FEATURE,
        onConfirm: async () => { try { await io.call("exceptionDelete", { id: x!.id }); } catch (e) { throw new Error(messageFor(e)); } } }).then(async (ok) => { if (ok) { toast("Exception removed."); await reload(); } });
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const from = q<HTMLInputElement>("#ex-from").value, to = q<HTMLInputElement>("#ex-to").value || from, label = q<HTMLInputElement>("#ex-label").value.trim();
      const ids = [...form.querySelectorAll<HTMLElement>("[data-pid][aria-pressed=true]")].map((b) => b.dataset.pid!);
      const problem = !from ? "Pick the first day." : to < from ? "The last day can't be before the first." : !label ? "Give it a label." : f.kind === "skipPattern" && !ids.length ? "Pick the slot to skip." : "";
      if (problem) { showErr(modal, { code: "bt/msg", message: problem }); return; }
      const btn = q<HTMLButtonElement>("[data-save]"), was = btn.textContent!; busy(btn, "Saving…");
      try { await io.call("exceptionSave", { ...(x ? { id: x.id } : {}), kind: f.kind, from, to, label, public: f.pub, ...(f.kind === "skipPattern" ? { patternIds: ids } : {}) }); close(); toast("Saved."); await reload(); }
      catch (e2) { showErr(modal, e2); btn.disabled = false; btn.textContent = was; }
    });
  }

  // ---- settings wiring ----
  const readDeadlines = (form: HTMLElement): Settings["deadlines"] => {
    const g = (k: string) => ({ day: Number(form.querySelector<HTMLSelectElement>(`[data-dl-day=${k}]`)!.value), time: form.querySelector<HTMLInputElement>(`[data-dl-time=${k}]`)!.value || "00:00" });
    const o = g("open"), c = g("close"), p = g("publish");
    return { openDow: o.day, openTime: o.time, closeDow: c.day, closeTime: c.time, publishDow: p.day, publishTime: p.time };
  };
  function wireSettings() {
    const form = body.querySelector<HTMLFormElement>("[data-settings]")!;
    const valid = () => {
      const d = readDeadlines(form), ok = dlOk(d), v = form.querySelector<HTMLElement>("[data-valid]")!;
      v.className = `pu-valid ${ok ? "is-ok" : "is-bad"}`; v.textContent = ok ? "✓ In order: opens, closes, then publish, all before Monday." : "Close has to come after open, and publish after close.";
      const b = form.querySelector<HTMLButtonElement>("[data-save-settings]"); if (b) b.disabled = !ok;
      form.querySelector(".pu-weekline")!.innerHTML = DAY_SHORT.map((n, i) => `<span>${n.toUpperCase()}<i>${[d.openDow === i + 1 ? "🔓" : "", d.closeDow === i + 1 ? "🔒" : "", d.publishDow === i + 1 ? "📣" : ""].join("")}</i></span>`).join("");
    };
    form.addEventListener("input", valid); form.addEventListener("change", valid);
    if (!who.owner) return;
    press(form.querySelector("[data-def-rooms]"), "[data-room]", false); press(form.querySelector("[data-def-need]"), "[data-need]", false);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const n = (k: string) => Number(form.querySelector<HTMLInputElement>(`[data-def=${k}]`)!.value);
      const rooms = [...form.querySelectorAll<HTMLElement>("[data-def-rooms] [aria-pressed=true]")].map((b) => b.dataset.room as Room);
      if (!rooms.length) { showErr(form, { code: "bt/msg", message: "Pick at least one chat." }); return; }
      const payload = { deadlines: readDeadlines(form), defaults: { rooms, gameCount: n("gameCount"), caps: { deckhands: n("deckhands") }, votesPerMember: n("votesPerMember"), ballotAddsPerMember: n("ballotAddsPerMember"), ballotSeed: n("ballotSeed"),
        minCrew: { captain: !!form.querySelector("[data-def-need] [data-need=cap][aria-pressed=true]"), rooms: form.querySelector("[data-def-need] [data-need=yt][aria-pressed=true]") ? ["youtube"] : [] } } };
      const btn = form.querySelector<HTMLButtonElement>("[data-save-settings]")!; busy(btn, "Saving…");
      try { await io.call("plannerSaveSettings", payload); toast("Settings saved."); await reload(); }
      catch (e2) { showErr(form, e2); btn.disabled = false; btn.textContent = "Save settings"; }
    });
  }

  // ---- events ----
  body.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const ed = t.closest<HTMLElement>("[data-ed]");
    if (ed) { const p = data.patterns.find((x) => x.id === ed.dataset.ed); if (p) { selected = p.id; patternDialog(p); } return; }
    const add = t.closest<HTMLElement>("[data-add-slot]");
    if (add) { const dow = add.dataset.dow ? Number(add.dataset.dow) : DAY_SHORT.indexOf(add.dataset.addSlot!) + 1; patternDialog(null, dow); return; }
    const ex = t.closest<HTMLElement>("[data-exc]");
    if (ex) { exceptionDialog(ex.dataset.exc === "new" ? null : data.exceptions.find((x) => x.id === ex.dataset.exc) || null); return; }
    const pub = t.closest<HTMLElement>("[data-sw^='pub:']");
    if (pub) {
      const x = data.exceptions.find((y) => y.id === pub.dataset.sw!.slice(4)); if (!x) return;
      try { await io.call("exceptionSave", { id: x.id, kind: x.kind, from: x.from, to: x.to, label: x.label, public: !x.public, ...(x.patternIds ? { patternIds: x.patternIds } : {}) }); await reload(); }
      catch (err) { toast(messageFor(err), { kind: "error" }); }
    }
  });
  body.addEventListener("keydown", (e) => { const t = e.target as HTMLElement; if ((e.key === "Enter" || e.key === " ") && t.matches(".bt-poster[data-ed]")) { e.preventDefault(); t.click(); } });
  void slotsOfDay; void hhmm12;
  draw();
}
