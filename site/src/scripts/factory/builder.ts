// /shift/builder (docs/specs/fun-factory.md §7; fun-factory-screens.html screen 2, tracker A).
// Without ?season= it lists every season; with it, the editor: the header (save state, status, the
// flow buttons), the .bt-stepper of eight stages, the open stage's panel and checks, and the .bt-drawer
// of matching ideas. Every change autosaves through factorySave; the checks are worked out here with
// the same function the server runs on submit and publish (lib/factory-checks.js), so they update as
// you type. Drafts are only readable through the callables.
import { onAccess } from "./layout";
import * as A from "./api";
import type { Activity, Campaign, Chapter, Idea, SeasonView, Stage, Tree, Cadence } from "./api";
import { STAGE_ICONS } from "./art";
import { stageChecks, chapterWindows, campaignWindow, xpBudget } from "../../lib/factory-checks.js";
import { stepperHtml, keepOpenInView } from "../../../../shared/ui/stepper.js";
import { lanesHtml } from "../../../../shared/ui/lanes.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { medalHtml, RARITY } from "../../../../shared/ui/medal.js";
import { escapeHtml } from "../../../../shared/ui/dom.js";
import { messageFor } from "../../lib/errors";
import type { AuthState } from "../../lib/auth";

const esc = (v: unknown) => escapeHtml(String(v ?? ""));
const root = document.querySelector<HTMLElement>("[data-builder]")!;
const W = 7 * 86400000;
const EDITABLE = ["draft", "review"];
const LIVE_FIELDS: Record<string, string[]> = { season: ["name", "pitch", "tags"], chapter: ["name", "blurb"], campaign: ["name"], activity: ["title", "instructions", "link"], medal: ["hint"] };
const CADENCES: Cadence[] = ["daily", "weekly", "story", "milestone", "event"];

let me: AuthState;
let isAdmin = false;
let view: SeasonView;
let tree: Tree;
let typeList: Awaited<ReturnType<typeof A.loadTypes>> = [];
let ideas: Idea[] = [];
let open = "theme";
const focus = { ch: 0, chapterId: "", campaignId: "", cad: "daily" as Cadence, waiting: false, inspire: [] as string[], pvAs: "fan", pvDate: "" };

onAccess(async (s) => {
  me = s;
  isAdmin = s.isAdmin;
  const id = new URLSearchParams(location.search).get("season");
  root.removeAttribute("aria-busy");
  if (id) await openEditor(id); else await showList();
});

// =====================================================================================
// Season list
// =====================================================================================
async function showList() {
  root.innerHTML = `<div class="ff-head"><div><h1 class="bt-title">Seasons</h1><p class="bt-subtitle">Plan a season, submit it for review, and it runs on its own once an admin schedules it.</p></div><button type="button" class="bt-btn bt-btn--primary" data-new>+ New season</button></div><div class="ff-seasons" data-list aria-busy="true"><span class="bt-skeleton ff-skel-card"></span></div>`;
  try {
    const { seasons } = await A.listSeasons();
    const list = root.querySelector<HTMLElement>("[data-list]")!;
    list.removeAttribute("aria-busy");
    list.innerHTML = seasons.length ? seasons.map((s) => `<div class="ff-srow">
        <span class="ff-sart" aria-hidden="true">${s.art ? `<img src="${esc(s.art)}" alt="" loading="lazy">` : "🏭"}</span>
        <div class="ff-srow-main"><a href="/shift/builder?season=${encodeURIComponent(s.id)}"><b>${esc(A.seasonLabel(s))}</b></a><small>${esc(A.fmtRange(s.startsAt, s.endsAt))}${s.createdBy?.name ? ` · drafted by ${esc(s.createdBy.name)}` : ""}${s.test ? " · test season" : ""}</small></div>
        ${A.statusBadge(s.status)}
        <div class="ff-srow-acts"><a class="bt-btn bt-btn--secondary bt-btn--sm" href="/shift/builder?season=${encodeURIComponent(s.id)}">Open</a><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-dup="${esc(s.id)}">Duplicate</button></div>
      </div>`).join("") : `<div class="bt-empty"><span class="bt-empty-title">No seasons yet</span><p>Start one, or ask an admin to seed the test season.</p></div>`;
  } catch (err) {
    root.querySelector<HTMLElement>("[data-list]")!.innerHTML = `<p class="bt-notice bt-notice--error">${esc(messageFor(err, "The seasons didn't load. Refresh the page."))}</p>`;
  }
  root.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const nb = t.closest<HTMLButtonElement>("[data-new]");
    const db = t.closest<HTMLButtonElement>("[data-dup]");
    if (!nb && !db) return;
    const btn = (nb || db)!;
    btn.disabled = true;
    try {
      const id = nb ? (await A.save(null, "season", "create", {})).seasonId! : (await A.duplicate(db!.dataset.dup!)).seasonId;
      location.href = `/shift/builder?season=${encodeURIComponent(id)}`;
    } catch (err) { btn.disabled = false; toast(messageFor(err), { kind: "error" }); }
  });
}

// =====================================================================================
// Editor
// =====================================================================================
async function openEditor(id: string) {
  root.innerHTML = `<span class="bt-skeleton ff-skel-title"></span><span class="bt-skeleton ff-skel-card"></span>`;
  try {
    [view, typeList, ideas] = await Promise.all([A.getSeason(id), A.loadTypes(), A.loadIdeas().catch(() => [])]);
  } catch (err) {
    root.innerHTML = `<p class="bt-notice bt-notice--error">${esc(messageFor(err, "That season didn't load."))} <a href="/shift/builder">Back to the seasons</a></p>`;
    return;
  }
  tree = view.tree;
  ideas = ideas.filter((i) => !i.retired);
  open = view.stages.find((s) => s.state === "now")?.key || "theme";
  if (tree.season.status === "live") open = "live";
  focus.chapterId = tree.chapters[0]?.id || "";
  focus.campaignId = tree.campaigns.find((c) => c.chapterId === focus.chapterId)?.id || "";
  document.title = `${A.seasonLabel(tree.season)} · Season builder`;
  root.innerHTML = `
    <div class="ff-bhead" data-head></div>
    <div data-note></div>
    <div data-stepper></div>
    <div class="bt-drawer-layout ff-editor">
      <section class="ff-panel" data-panel aria-labelledby="ff-panel-h"></section>
      <aside class="bt-drawer" data-drawer aria-label="Ideas"></aside>
    </div>`;
  bindEditor();
  renderAll();
}

/** Re-run the checks on the local tree (the same function the server uses). */
function recheck() {
  const types = Object.fromEntries(Object.entries(view.types).map(([k, v]) => [k, v.enabled]));
  const r = stageChecks(tree, { types, others: view.others, now: Date.now() }) as { stages: Stage[]; budget: SeasonView["budget"]; readyToSubmit: boolean };
  view.stages = r.stages; view.budget = r.budget; view.readyToSubmit = r.readyToSubmit;
}
const status = () => tree.season.status;
const isLive = () => status() === "live";
const canEdit = () => EDITABLE.includes(status()) || isLive();
/** Can this field of this node change now? Live seasons only allow titles and new things. */
function fieldOpen(node: string, field: string, item?: { revealed?: boolean } | null) {
  if (EDITABLE.includes(status())) return true;
  if (!isLive()) return false;
  if (node === "season") return LIVE_FIELDS.season.includes(field);
  if (item && item.revealed !== true) return true;
  return (LIVE_FIELDS[node] || []).includes(field);
}
const dis = (on: boolean) => (on ? "" : " disabled");

function renderAll() { recheck(); renderHead(); renderNote(); renderStepper(); renderPanel(); renderDrawer(); }
function renderProgress() { recheck(); renderHead(); renderStepper(); renderChecks(); if (open === "rewards") renderBudget(); }

// ---------- header ----------
let saveState = "Saved";
function renderHead() {
  const s = tree.season, st = status();
  const who = (s as any).createdBy?.name ? ` · drafted by ${esc((s as any).createdBy.name)}` : "";
  const acts: string[] = [`<button type="button" class="bt-btn bt-btn--secondary" data-go="review">👁 Preview as…</button>`];
  if (st === "draft") acts.push(`<button type="button" class="bt-btn bt-btn--primary" data-act="submit"${view.readyToSubmit ? "" : ` disabled title="Finish stages 1 to 6 first"`}>Submit for review</button>`);
  if (st === "review" && isAdmin) acts.push(`<button type="button" class="bt-btn bt-btn--admin" data-act="publish">Approve and schedule</button><button type="button" class="bt-btn bt-btn--ghost" data-act="sendback">Send back</button>`);
  if (st === "scheduled" && isAdmin) acts.push(`<button type="button" class="bt-btn bt-btn--ghost" data-act="unpublish">Unpublish</button>`);
  root.querySelector<HTMLElement>("[data-head]")!.innerHTML = `
    <div class="ff-bhead-l"><span class="ff-kicker"><a href="/shift/builder">Seasons</a> · ${st === "live" ? "Running" : st === "ended" ? "Finished" : "Planning"}</span>
      <h1 class="bt-heading ff-bname">${esc(A.seasonLabel(s))}</h1>
      <span class="ff-muted">${esc(A.fmtRange(s.startsAt, s.endsAt))}${who} · <span data-save role="status">${esc(saveState)}</span></span></div>
    <div class="ff-bhead-r">${A.statusBadge(st)}${acts.join("")}</div>`;
}
function setSave(text: string, kind: "ok" | "busy" | "err" = "ok") {
  saveState = text;
  const el = root.querySelector<HTMLElement>("[data-save]");
  if (el) { el.textContent = text; el.dataset.kind = kind; }
}
function renderNote() {
  const s = tree.season, st = status();
  const box = root.querySelector<HTMLElement>("[data-note]")!;
  const notes: string[] = [];
  if (st === "draft" && s.reviewNote?.text) notes.push(`<div class="bt-notice"><b>Sent back by ${esc(s.reviewNote.by)}:</b> ${esc(s.reviewNote.text)}</div>`);
  if (st === "review") notes.push(`<div class="bt-notice">In review. ${isAdmin ? "Check it over, then approve and schedule it or send it back." : "An admin will approve it or send it back. You can still make changes."}</div>`);
  if (st === "scheduled") notes.push(`<div class="bt-notice">Scheduled to start ${esc(A.fmtDay(s.startsAt, true))}. ${isAdmin ? "Unpublish it to make changes." : "An admin can unpublish it if it needs changes."}</div>`);
  if (st === "live") notes.push(`<div class="bt-notice">Live. Titles, instructions, art and hunt hints can still change, and you can add campaigns and events. Targets, XP and dates that have passed are locked.</div>`);
  if (st === "ended" || st === "archived") notes.push(`<div class="bt-notice">This season has ended. Duplicate it from the season list to start a new one.</div>`);
  box.innerHTML = notes.join("");
}

// ---------- stepper ----------
function renderStepper() {
  const box = root.querySelector<HTMLElement>("[data-stepper]")!;
  box.innerHTML = stepperHtml({ steps: view.stages.map((s) => ({ ...s, icon: STAGE_ICONS[s.key] || s.icon })), open, crate: `S${String(tree.season.number ?? 0).padStart(2, "0")}`, label: "Season stages" });
  keepOpenInView(box);
}

// ---------- panel ----------
const stageOf = (k: string) => view.stages.find((s) => s.key === k)!;
const checksHtml = (k: string) => `<ul class="ff-checks" data-checks>${stageOf(k).checks.map((c) => `<li class="${c.state ? `is-${c.state}` : ""}">${esc(c.text)}</li>`).join("")}</ul>`;
function renderChecks() { const el = root.querySelector<HTMLElement>("[data-checks]"); if (el) el.outerHTML = checksHtml(open); }
const head = (n: number, t: string, p: string, extra = "") => `<div class="ff-ph"><div><h2 id="ff-panel-h">${n} · ${esc(t)}</h2><p>${p}</p></div>${extra}</div>`;
const field = (label: string, input: string, id: string, hint = "") => `<div class="ff-f"><label class="bt-label" for="${id}">${label}</label>${input}${hint ? `<small class="ff-hint">${hint}</small>` : ""}</div>`;
const chapterById = (id: string) => tree.chapters.find((c) => c.id === id);
const sortedChapters = () => [...tree.chapters].sort((a, b) => (a.unlockAt ?? Infinity) - (b.unlockAt ?? Infinity) || a.order - b.order);
const campsOf = (chId: string) => tree.campaigns.filter((c) => c.chapterId === chId).sort((a, b) => a.order - b.order);
const actsOf = (cId: string) => tree.activities.filter((a) => a.campaignId === cId).sort((a, b) => a.order - b.order);
const chLabel = (c: Chapter) => `Ch ${sortedChapters().indexOf(c) + 1} · ${c.name || "Untitled"}`;
const typeName = (id: string) => typeList.find((t) => t.id === id)?.name || view.types[id]?.name || id;

const PANELS: Record<string, () => string> = {
  theme() {
    const s = tree.season;
    return head(1, "Theme", "Name the season and give it a one-line pitch members will see on the season pass.")
      + `<div class="ff-grid2">${field("Season name", `<input class="bt-input" id="ff-name" data-bind="season::name" maxlength="60" value="${esc(s.name)}"${dis(fieldOpen("season", "name"))}>`, "ff-name")}${field("Number", `<input class="bt-input" id="ff-num" value="Season ${String(s.number ?? 0).padStart(2, "0")}" disabled>`, "ff-num")}</div>`
      + field("Pitch", `<input class="bt-input" id="ff-pitch" data-bind="season::pitch" maxlength="200" value="${esc(s.pitch)}"${dis(fieldOpen("season", "pitch"))}>`, "ff-pitch")
      + `<div class="ff-f"><span class="bt-label" id="ff-tags-l">Mood tags</span><div class="ff-sel" role="group" aria-labelledby="ff-tags-l">${(s.tags || []).map((t) => `<span class="bt-chip bt-chip--small is-active">${esc(t)}${fieldOpen("season", "tags") ? `<button type="button" class="ff-x" data-tag-del="${esc(t)}" aria-label="Remove ${esc(t)}">×</button>` : ""}</span>`).join("")}${fieldOpen("season", "tags") && (s.tags || []).length < 6 ? `<input class="bt-input ff-taginput" data-tag-add placeholder="+ Add tag" maxlength="24" aria-label="Add a mood tag">` : ""}</div></div>`
      + `<div class="ff-upload"><span class="ff-art" aria-hidden="true">${s.art?.url ? `<img src="${esc(s.art.url)}" alt="">` : "🏭"}</span><div><b>Season art</b><br>Square, at least 800 by 800 pixels, JPG, PNG or WebP, up to 5 MB.</div>${fieldOpen("season", "name") ? `<label class="bt-btn bt-btn--secondary bt-btn--sm ff-filebtn">${s.art?.url ? "Replace" : "Upload"}<input type="file" accept="image/png,image/jpeg,image/webp" data-art hidden></label>` : ""}</div>`
      + checksHtml("theme");
  },
  chapters() {
    const s = tree.season, open = canEdit() && EDITABLE.includes(status());
    const wins = chapterWindows(s, tree.chapters) as (Chapter & { start: number | null; end: number | null })[];
    return head(2, "Chapters", "2 to 5 chapters. Each unlocks on its date, and its name stays secret until then. Click a name, then Use an idea to replace it.")
      + `<div class="ff-grid2">${field("Season starts", `<input class="bt-input" type="date" id="ff-start" data-bind="season::startsAt" value="${A.centralDate(s.startsAt)}"${dis(EDITABLE.includes(status()))}>`, "ff-start", "Midnight Central")}${field("Season ends (last day)", `<input class="bt-input" type="date" id="ff-end" data-bind="season::endsAt" value="${s.endsAt != null ? A.centralDate(s.endsAt - 1) : ""}"${dis(EDITABLE.includes(status()))}>`, "ff-end", "About 13 weeks later")}</div>`
      + `<div class="ff-chrows">${wins.map((c, i) => {
        const weeks = c.start != null && c.end != null ? Math.round((c.end - c.start) / W) : null;
        return `<div class="ff-chrow" data-ch-row="${esc(c.id)}"><span>${i + 1}</span>
          <input class="bt-input" data-bind="chapter:${esc(c.id)}:name" data-ch="${i}" data-ch-id="${esc(c.id)}" value="${esc(c.name)}" placeholder="Name this chapter" aria-label="Chapter ${i + 1} name" maxlength="60"${dis(fieldOpen("chapter", "name", c))}>
          <input class="bt-input" type="date" data-bind="chapter:${esc(c.id)}:unlockAt" value="${A.centralDate(c.unlockAt)}" aria-label="Chapter ${i + 1} unlock date"${dis(fieldOpen("chapter", "unlockAt", c) && !(c.revealed))}>
          <span class="ff-len">${weeks != null ? `${weeks} week${weeks === 1 ? "" : "s"}` : "—"}</span>
          ${open ? `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-del="chapter:${esc(c.id)}" aria-label="Delete chapter ${i + 1}">Delete</button>` : ""}</div>`;
      }).join("")}</div>${open && tree.chapters.length < 5 ? `<button type="button" class="ff-add" data-add-chapter>+ Add chapter</button>` : ""}`
      + checksHtml("chapters");
  },
  campaigns() {
    const add = EDITABLE.includes(status()) || isLive();
    return head(3, "Campaigns", "Each chapter needs at least one Daily or Weekly campaign and one Story campaign. Story and Milestone campaigns stay open until the season ends.")
      + (tree.chapters.length ? `<div class="ff-chcols">${sortedChapters().map((ch) => `<div class="ff-chcol${ch.id === focus.chapterId ? " is-target" : ""}" data-col="${esc(ch.id)}"><b>${esc(chLabel(ch))}</b>${campsOf(ch.id).map((c) => `<button type="button" class="ff-cchip" style="--c:var(--bt-${A.CADENCE[c.cadence][1]})" data-edit-campaign="${esc(c.id)}">${esc(c.name || "Untitled")}<small>${A.CADENCE[c.cadence][0]} · ${A.AUDIENCE[c.audience]} · ${actsOf(c.id).length} act.</small></button>`).join("")}${add ? `<button type="button" class="ff-add" data-add-campaign="${esc(ch.id)}">+ Campaign</button>` : ""}</div>`).join("")}</div>` : `<p class="ff-muted">Add chapters first (stage 2).</p>`)
      + checksHtml("campaigns");
  },
  activities() {
    const chs = sortedChapters();
    if (!chs.length || !tree.campaigns.length) return head(4, "Activities", "Add campaigns first (stage 3).") + checksHtml("activities");
    if (!chapterById(focus.chapterId)) focus.chapterId = chs[0].id;
    const camps = campsOf(focus.chapterId);
    if (!camps.find((c) => c.id === focus.campaignId)) focus.campaignId = camps[0]?.id || "";
    const camp = tree.campaigns.find((c) => c.id === focus.campaignId);
    const acts = camp ? actsOf(camp.id) : [];
    const addOk = camp && (EDITABLE.includes(status()) || (isLive() && camp.revealed !== true));
    return head(4, "Activities", "Pick a campaign, then add activities. Each one is a type, a target and XP. Targets lock once the chapter goes live.", camp ? `<span class="ff-cd">${esc(chLabel(chapterById(camp.chapterId)!))} · ${esc(camp.name || "Untitled")}</span>` : "")
      + `<div class="ff-sel" role="group" aria-label="Chapter">${chs.map((c) => `<button type="button" class="bt-chip bt-chip--small${c.id === focus.chapterId ? " is-active" : ""}" data-pick-chapter="${esc(c.id)}" aria-pressed="${c.id === focus.chapterId}">${esc(chLabel(c))}</button>`).join("")}</div>`
      + `<div class="ff-sel" role="group" aria-label="Campaign">${camps.map((c) => `<button type="button" class="bt-chip bt-chip--small${c.id === focus.campaignId ? " is-active" : ""}" data-pick-campaign="${esc(c.id)}" aria-pressed="${c.id === focus.campaignId}">${actsOf(c.id).length ? "" : "○ "}${esc(c.name || "Untitled")} <small>${actsOf(c.id).length}</small></button>`).join("") || `<span class="ff-muted">No campaigns in this chapter yet.</span>`}</div>`
      + (camp ? `<div class="ff-tbl"><table><thead><tr><th scope="col">Activity</th><th scope="col">Type</th><th scope="col">Target</th><th scope="col">XP</th><th scope="col">Repeats</th></tr></thead><tbody>${acts.map((a) => `<tr data-edit-activity="${esc(a.id)}" tabindex="0"><td><b>${esc(a.title || "Untitled")}</b><small>${esc(a.instructions)}</small></td><td>${esc(typeName(a.typeId))}${a.params?.action ? ` · ${esc(a.params.action)}` : ""}</td><td class="num">${a.target}</td><td class="num">+${a.xp}</td><td>${{ none: "Once", daily: "Daily", weekly: "Weekly" }[a.repeat] || "Once"}</td></tr>`).join("") || `<tr><td colspan="5" class="ff-muted">No activities yet.</td></tr>`}</tbody></table></div>${addOk ? `<button type="button" class="ff-add" data-add-activity>+ Add activity</button>` : ""}` : "")
      + checksHtml("activities");
  },
  rewards() {
    const s = tree.season, b = s.badge;
    const edit = EDITABLE.includes(status());
    return head(5, "Rewards", "Check the season's XP budget and pick the season badge. The budget is what one member who does everything would earn.")
      + `<div data-budget>${budgetHtml()}</div>`
      + `<div class="ff-badgepick"><span data-badge-art>${medalHtml({ emoji: b?.emoji || "🏅", rarity: b?.rarity || 3, size: 72 })}</span><div>
          <span class="bt-label">Season badge (finish the story)</span>
          <div class="ff-grid3">
            <input class="bt-input" id="ff-badge" data-badge="name" value="${esc(b?.name || "")}" placeholder="Badge name" maxlength="40" aria-label="Badge name"${dis(edit)}>
            <select class="bt-select" data-badge="rarity" aria-label="Rarity"${dis(edit)}>${[1, 2, 3, 4, 5].map((r) => `<option value="${r}"${(b?.rarity || 3) === r ? " selected" : ""}>${RARITY[r].name}</option>`).join("")}</select>
            <input class="bt-input" data-badge="emoji" value="${esc(b?.emoji || "🏅")}" maxlength="8" aria-label="Emoji (until the art arrives)"${dis(edit)}>
          </div>
          <small class="ff-hint">It goes into the Trophy Room catalog as a draft and turns on when the season is published.</small></div></div>`
      + field("Daily XP cap (optional)", `<input class="bt-input" type="number" min="0" step="10" id="ff-cap" data-bind="season::dailyXpCap" value="${s.dailyXpCap ?? ""}" placeholder="No cap"${dis(edit)}>`, "ff-cap", "The most Night Shift XP one member can earn in a day.")
      + checksHtml("rewards");
  },
  schedule() {
    const s = tree.season;
    const lanes = s.startsAt != null && s.endsAt != null && s.endsAt > s.startsAt ? lanesView() : `<p class="ff-muted">Set the season's dates (stage 2) to see the timeline.</p>`;
    const events = tree.campaigns.filter((c) => c.cadence === "event");
    return head(6, "Schedule", "The season on one timeline. Change dates with the date fields below (dragging comes later).")
      + lanes
      + `<div class="ff-grid2">${field("Season starts", `<input class="bt-input" type="date" id="ff-start2" data-bind="season::startsAt" value="${A.centralDate(s.startsAt)}"${dis(EDITABLE.includes(status()))}>`, "ff-start2")}${field("Season ends (last day)", `<input class="bt-input" type="date" id="ff-end2" data-bind="season::endsAt" value="${s.endsAt != null ? A.centralDate(s.endsAt - 1) : ""}"${dis(EDITABLE.includes(status()))}>`, "ff-end2")}</div>`
      + (events.length ? `<span class="bt-label">Events</span><div class="ff-chrows">${events.map((c) => `<div class="ff-evrow"><b>${esc(c.name || "Untitled")}</b><input class="bt-input" type="date" data-bind="campaign:${esc(c.id)}:opensAt" value="${A.centralDate(c.opensAt)}" aria-label="${esc(c.name)} opens"${dis(fieldOpen("campaign", "opensAt", c) && !(c.opensAt != null && c.opensAt <= Date.now()))}><input class="bt-input" type="date" data-bind="campaign:${esc(c.id)}:closesAt" value="${A.centralDate(c.closesAt)}" aria-label="${esc(c.name)} closes"${dis(fieldOpen("campaign", "closesAt", c) && !(c.closesAt != null && c.closesAt <= Date.now()))}></div>`).join("")}</div>` : "")
      + checksHtml("schedule");
  },
  review() {
    const st = status();
    const flow = (["draft", "review", "scheduled", "live", "ended"] as const).map((k) => A.statusBadge(k)).join(`<i aria-hidden="true">→</i>`);
    const acts = st === "draft" ? `<button type="button" class="bt-btn bt-btn--primary" data-act="submit"${view.readyToSubmit ? "" : " disabled"}>Submit for review</button><span class="ff-muted">${view.readyToSubmit ? "Ready when you are." : "Finish stages 1 to 6 first."}</span>`
      : st === "review" ? (isAdmin ? `<button type="button" class="bt-btn bt-btn--admin" data-act="publish">Approve and schedule</button><button type="button" class="bt-btn bt-btn--ghost" data-act="sendback">Send back</button>` : `<span class="ff-muted">Waiting for an admin.</span>`)
      : `<span class="ff-muted">${A.STATUS[st][0]}.</span>`;
    return head(7, "Review", "When stages 1 to 6 are green, a mod submits the season. An admin reviews it, previews it and schedules it.")
      + `<div class="ff-flowline">${flow}</div>` + checksHtml("review")
      + `<span class="bt-label">Plan map</span>${treeHtml()}`
      + previewRow()
      + `<div class="ff-prev">${acts}</div>`;
  },
  live() {
    const st = status();
    return head(8, "Live", `${tree.season.startsAt != null ? `From ${esc(A.fmtDay(tree.season.startsAt))}` : "Once it starts"} the season runs on its own: chapters unlock on their dates and every reset is on Central time.`)
      + `<div class="ff-grid2"><div class="bt-drawer-tip"><b>You can still change</b><br>Titles and instructions · new campaigns and events · art · hunt hints</div><div class="bt-drawer-tip"><b>Locked once live</b><br>Targets and XP of live activities · chapter dates already passed · the season's start</div></div>`
      + `<div class="ff-prev">${st === "live" ? `<button type="button" class="bt-btn bt-btn--secondary" data-add-event>Add an event</button>${isAdmin ? `<button type="button" class="bt-btn bt-btn--danger" data-act="end">End season early</button>` : ""}<span class="ff-muted">${isAdmin ? "Every change is logged." : "Admins can end a season early. Every change is logged."}</span>` : `<span class="ff-muted">${st === "ended" ? "This season has ended." : "These open once the season is live."}</span>`}</div>`
      + checksHtml("live");
  },
};
/** Review: open the season pass as a Fan Club, Sub Club or crew member on a chosen day (factoryPreview). */
function previewRow() {
  const s = tree.season;
  if (!focus.pvDate) focus.pvDate = A.centralDate(Math.max(s.startsAt ?? Date.now(), Date.now()));
  const href = `/shift?preview=${encodeURIComponent(s.id)}&as=${focus.pvAs}&date=${focus.pvDate}`;
  return `<div class="ff-prev"><span class="bt-label" id="ff-pv-l">Preview as</span><span class="ff-sel" role="group" aria-labelledby="ff-pv-l">${([["fan", "Fan Club"], ["sub", "Sub Club"], ["crew", "Crew"]] as const).map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small${focus.pvAs === k ? " is-active" : ""}" data-pv-as="${k}" aria-pressed="${focus.pvAs === k}">${l}</button>`).join("")}</span><input class="bt-input ff-pvdate" type="date" data-pv-date value="${focus.pvDate}" aria-label="Preview date"><a class="bt-btn bt-btn--secondary bt-btn--sm" href="${href}" target="_blank" rel="noopener" data-pv-open>Open preview</a><span class="ff-muted">Opens the season pass as that member would see it that day.</span></div>`;
}
function renderPanel() {
  const panel = root.querySelector<HTMLElement>("[data-panel]")!;
  panel.innerHTML = PANELS[open]();
}

function budgetHtml() {
  const b = view.budget, max = Math.max(1, ...Object.values(b.byCadence));
  return `<div class="ff-budget" role="img" aria-label="XP budget by campaign type, total ${b.total}">${CADENCES.map((k) => `<div class="ff-budget-row"><span>${A.CADENCE[k][0]}</span><div class="ff-bbar"><i style="--v:${((b.byCadence[k] || 0) / max) * 100}%;--c:var(--bt-${A.CADENCE[k][1]})"></i></div><span>${(b.byCadence[k] || 0).toLocaleString("en-US")}</span></div>`).join("")}<div class="ff-total"><span>Season total for an all-in member (Everyone campaigns)</span><b>${b.total.toLocaleString("en-US")} XP</b></div></div>`;
}
function renderBudget() { const el = root.querySelector<HTMLElement>("[data-budget]"); if (el) el.innerHTML = budgetHtml(); }

function lanesView() {
  const s = tree.season;
  const weeks = Math.max(1, Math.ceil((s.endsAt! - s.startsAt!) / W));
  const wk = (t: number | null) => (t == null ? 0 : Math.floor((t - s.startsAt!) / W));
  const span = (a: number | null, b: number | null) => ({ from: Math.max(0, wk(a)), len: Math.max(1, Math.ceil(((b ?? s.endsAt!) - (a ?? s.startsAt!)) / W)) });
  const wins = chapterWindows(s, tree.chapters) as (Chapter & { start: number | null; end: number | null })[];
  const byId = new Map(wins.map((c) => [c.id, c]));
  const rows = [{ label: "Chapters", head: true, bars: wins.filter((c) => c.start != null).map((c, i) => ({ ...span(c.start, c.end), text: `Ch ${i + 1}${c.name ? ` · ${c.name}` : ""}`, color: "title" })) }];
  for (const c of [...tree.campaigns].sort((a, b) => wins.findIndex((x) => x.id === a.chapterId) - wins.findIndex((x) => x.id === b.chapterId) || a.order - b.order)) {
    const w = campaignWindow(c, byId.get(c.chapterId), s) as { start: number | null; end: number | null };
    if (w.start == null) continue;
    rows.push({ label: c.name || "Untitled", head: false, bars: [{ ...span(w.start, w.end), text: `${A.CADENCE[c.cadence][0]}${c.audience !== "all" ? ` · ${A.AUDIENCE[c.audience]}` : ""}`, color: A.CADENCE[c.cadence][1] }] });
  }
  return lanesHtml({ weeks, weekLabel: (i) => `W${i + 1}`, rows, label: `Season timeline: ${wins.length} chapters and ${tree.campaigns.length} campaigns over ${weeks} weeks` });
}
function treeHtml() {
  return `<div class="ff-tree">${sortedChapters().map((c, i) => {
    const win = (chapterWindows(tree.season, tree.chapters) as any[]).find((x) => x.id === c.id);
    const weeks = win?.start != null && win?.end != null ? Math.round((win.end - win.start) / W) : null;
    return `<div class="ff-tree-ch"><b>Ch ${i + 1} · ${esc(c.name || "Untitled")}</b><span>${esc(A.fmtDay(c.unlockAt))}${weeks != null ? ` · ${weeks} weeks` : ""}</span>${campsOf(c.id).map((cp) => { const n = actsOf(cp.id).length; return `<div class="ff-tree-camp"><span class="ff-dot" style="--c:var(--bt-${n ? A.CADENCE[cp.cadence][1] : "border-2"})"></span>${esc(cp.name || "Untitled")}<em>${n ? `${n} act.` : "empty"}</em></div>`; }).join("")}</div>`;
  }).join("") || `<p class="ff-muted">No chapters yet.</p>`}</div>`;
}

// ---------- drawer ----------
const tag = (t: string, tone = "gray") => `<span class="bt-badge bt-badge--${tone}">${esc(t)}</span>`;
function ideaItem(i: Idea, title: string, desc = "", meta = "", waiting = "") {
  const used = i.usedIn?.length ? tag(`Used in ${i.usedIn.join(", ")}`, "gold") : "";
  return `<div class="bt-drawer-item${waiting ? " is-waiting" : ""}${used ? " is-used" : ""}"><b>${title}</b>${waiting ? tag(waiting) : `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-use="${esc(i.id)}"${canEdit() ? "" : " disabled"}>Use</button>`}${desc ? `<p>${esc(desc)}</p>` : ""}${meta || used ? `<div class="bt-drawer-meta">${meta}${used}</div>` : ""}</div>`;
}
const TIPS: Record<string, string[]> = {
  schedule: ["<b>Chapters of 3 weeks</b> keep a steady drumbeat. Make the longest one the middle chapter, when energy dips.", "<b>Put events on weekends</b> or around a big stream.", "<b>Leave a week</b> between seasons for results and hype."],
  review: ["<b>Read every activity aloud.</b> If it needs explaining, rewrite it.", "<b>Is there something to do every day?</b> Check each chapter has a Daily campaign.", "Admins approve; the season goes Scheduled and starts on its own."],
  live: ["<b>Add a surprise event</b> mid-chapter if activity drops.", "<b>Fix typos freely.</b> Targets and XP stay locked for fairness.", "Season end awards trophies, plaques and season badges automatically."],
};
function renderDrawer() {
  const box = root.querySelector<HTMLElement>("[data-drawer]")!;
  const byKind = (k: Idea["kind"]) => ideas.filter((i) => i.kind === k);
  let title = "Idea library", sub = "", tools = "", body = "", foot = "";
  if (open === "theme") {
    const themes = byKind("theme");
    sub = `${themes.length} season themes`;
    tools = `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-inspire>🎲 Inspire me</button>`;
    const order = [...focus.inspire.map((id) => themes.find((t) => t.id === id)!).filter(Boolean), ...themes.filter((t) => !focus.inspire.includes(t.id))];
    body = order.map((t) => ideaItem(t, `${esc(t.emoji || "")} ${esc(t.name)}`, t.pitch, (t.tags || []).map((x) => tag(x)).join("") + (focus.inspire.includes(t.id) ? tag("Picked for you", "teal") : ""))).join("");
  } else if (open === "chapters") {
    const target = sortedChapters()[focus.ch];
    sub = target ? `Fills chapter ${focus.ch + 1} · click a chapter to change` : "Adds a chapter";
    const themeName = ideas.find((i) => i.id === tree.season.ideaId)?.name || tree.season.name;
    const names = byKind("chapter");
    const groups = [...new Set([themeName, "Any theme", ...names.map((n) => n.theme || "Any theme")])].filter((g) => names.some((n) => (n.theme || "Any theme") === g));
    body = groups.map((g) => `<span class="bt-label bt-drawer-group">${g === themeName ? `Matches ${esc(g)}` : esc(g)}</span>` + names.filter((n) => (n.theme || "Any theme") === g).map((n) => ideaItem(n, esc(n.name))).join("")).join("");
  } else if (open === "campaigns") {
    const target = chapterById(focus.chapterId) || sortedChapters()[0];
    sub = target ? `Adds to ${chLabel(target)} · click a chapter to change` : "Add chapters first";
    const names = byKind("campaign");
    const audTag = (n: Idea) => (n.audience && n.audience !== "all" ? tag(A.AUDIENCE[n.audience], n.audience === "sub" ? "gold" : "teal") : "");
    body = CADENCES.map((cad) => { const l = names.filter((n) => n.cadence === cad); return l.length ? `<span class="bt-label bt-drawer-group">${A.CADENCE[cad][0]}</span>` + l.map((n) => ideaItem(n, esc(n.name), "", audTag(n))).join("") : ""; }).join("")
      + ((l) => (l.length ? `<span class="bt-label bt-drawer-group">Sub Club and Crew (any cadence)</span>` + l.map((n) => ideaItem(n, esc(n.name), "", audTag(n))).join("") : ""))(names.filter((n) => !n.cadence || !A.CADENCE[n.cadence]));
  } else if (open === "activities") {
    const camp = tree.campaigns.find((c) => c.id === focus.campaignId);
    sub = camp ? `Adds to ${camp.name || "Untitled"}` : "Pick a campaign first";
    tools = `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-inspire title="Random cadence">🎲</button>`;
    const typeOn = (id?: string) => !!(id && view.types[id]?.enabled);
    const list = byKind("activity").filter((a) => a.cadence === focus.cad && (focus.waiting || typeOn(a.typeId)));
    body = `<div class="ff-sel" role="group" aria-label="Cadence">${CADENCES.map((c) => `<button type="button" class="bt-chip bt-chip--small${c === focus.cad ? " is-active" : ""}" data-cad="${c}" aria-pressed="${c === focus.cad}">${A.CADENCE[c][0]}</button>`).join("")}</div>`
      + `<label class="ff-check"><input type="checkbox" data-waiting${focus.waiting ? " checked" : ""}> Show ideas waiting on new features</label>`
      + (list.map((a) => {
        const ty = typeList.find((t) => t.id === a.typeId);
        const waiting = typeOn(a.typeId) ? "" : `Needs ${ty?.needs || "a new feature"}`;
        return ideaItem(a, esc(a.title), a.instructions, tag(typeName(a.typeId || "")) + tag(`+${a.xp} XP`, "gold") + (a.audience && a.audience !== "all" ? tag(A.AUDIENCE[a.audience], a.audience === "sub" ? "gold" : "teal") : ""), waiting);
      }).join("") || `<p class="bt-drawer-foot">No ${A.CADENCE[focus.cad][0].toLowerCase()} ideas${focus.waiting ? "" : " ready yet"}.</p>`);
    foot = "Waiting ideas light up when their feature ships and an admin switches the activity type on.";
  } else if (open === "rewards") {
    sub = "Season and campaign badge names";
    body = byKind("reward").map((r) => ideaItem(r, esc(r.name))).join("");
  } else {
    title = "Tips";
    body = (TIPS[open] || []).map((t) => `<div class="bt-drawer-tip">${t}</div>`).join("");
  }
  if (!body && open !== "schedule" && open !== "review" && open !== "live") body = `<p class="bt-drawer-foot">No ideas here yet. Ask an admin to seed the idea library.</p>`;
  box.innerHTML = `<div class="bt-drawer-head"><div><b>${title}</b><small>${esc(sub)}</small></div>${tools ? `<div class="bt-drawer-tools">${tools}</div>` : ""}</div><div class="bt-drawer-list">${body}</div>${foot ? `<p class="bt-drawer-foot">${foot}</p>` : ""}`;
}

// ---------- saving ----------
const timers = new Map<string, number>();
let pending = 0;
async function persist(node: string, op: string, data: Record<string, unknown>) {
  pending++;
  setSave("Saving…", "busy");
  let tries = 0;
  for (;;) {
    try {
      const r = await A.save(tree.season.id, node, op, data);
      pending--;
      if (!pending) setSave("Saved", "ok");
      return r;
    } catch (err: any) {
      const reason = err?.details?.reason;
      const permanent = ["field", "args", "params", "type", "live", "pastDate", "locked", "notStaff", "badge", "art", "tooMany", "noNode"].includes(reason);
      if (permanent || ++tries > 3) {
        pending--;
        setSave("Couldn't save", "err");
        toast(messageFor(err, "That change didn't save."), { kind: "error", ms: 7000 });
        throw err;
      }
      setSave("Couldn't save, retrying", "err");
      await new Promise((r) => setTimeout(r, [1000, 3000, 6000][tries - 1]));
    }
  }
}
/** A field changed: update the local tree, the checks, and save it (debounced for typing). */
function onBind(el: HTMLInputElement | HTMLSelectElement, typing: boolean) {
  const [node, id, f] = el.dataset.bind!.split(":");
  const raw = el.value;
  let val: unknown = raw;
  // Dates are midnight Central; a season's end is exclusive, so "ends Apr 11" is midnight starting Apr 12.
  if (["startsAt", "endsAt", "unlockAt", "opensAt", "closesAt"].includes(f)) { val = raw ? A.centralMidnight(node === "season" && f === "endsAt" ? A.nextDay(raw) : raw) : null; if (raw && val == null) return; }
  if (f === "dailyXpCap") val = raw === "" ? null : Math.max(0, Math.round(Number(raw)));
  const target: any = node === "season" ? tree.season : (node === "chapter" ? tree.chapters : node === "campaign" ? tree.campaigns : tree.activities).find((x: any) => x.id === id);
  if (!target) return;
  target[f] = val;
  renderProgress();
  if (f === "name" && node === "season") root.querySelector(".ff-bname")!.textContent = A.seasonLabel(tree.season);
  if (["unlockAt", "startsAt", "endsAt"].includes(f) && !typing) { renderHead(); if (open === "chapters") refreshPanelKeepFocus(); }
  const key = `${node}:${id}:${f}`;
  clearTimeout(timers.get(key));
  timers.set(key, window.setTimeout(() => {
    timers.delete(key);
    persist(node, "update", node === "season" ? { [f]: val } : { id, [f]: val }).catch(() => {});
  }, typing ? 700 : 0));
}
function refreshPanelKeepFocus() {
  const active = document.activeElement as HTMLElement | null;
  const bind = active?.dataset?.bind;
  renderPanel();
  if (bind) root.querySelector<HTMLElement>(`[data-bind="${CSS.escape(bind)}"]`)?.focus();
}
function flash(el: Element | null) { if (!el) return; el.classList.remove("ff-flash"); void (el as HTMLElement).offsetWidth; el.classList.add("ff-flash"); }

// ---------- events ----------
function bindEditor() {
  root.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.bind && el.type !== "date") onBind(el, true);
    if (el.dataset.badge) badgeChanged();
  });
  root.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.bind) onBind(el, el.type === "text" || el.tagName === "TEXTAREA");
    if (el.matches("[data-badge]")) badgeChanged(true);
    if (el.matches("[data-art]") && el.files?.[0]) void uploadArt(el.files[0]);
    if (el.matches("[data-waiting]")) { focus.waiting = el.checked; renderDrawer(); }
    if (el.matches("[data-pv-date]") && el.value) { focus.pvDate = el.value; renderPanel(); }
  });
  root.addEventListener("keydown", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.matches("[data-tag-add]") && e.key === "Enter") { e.preventDefault(); addTag(el.value); }
    if (el.matches("tr[data-edit-activity]") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); activityModal(el.dataset.editActivity!); }
  });
  root.addEventListener("focusin", (e) => {
    const el = e.target as HTMLElement;
    if (el.dataset.ch != null) { focus.ch = Number(el.dataset.ch); if (open === "chapters") renderDrawer(); }
  });
  root.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const q = <T extends HTMLElement>(s: string) => t.closest<T>(s);
    let b: HTMLElement | null;
    if ((b = q("[data-step]")) || (b = q("[data-go]"))) { open = b.dataset.step || b.dataset.go!; focus.inspire = []; renderStepper(); renderPanel(); renderDrawer(); root.querySelector("[data-panel]")?.scrollIntoView({ block: "nearest" }); return; }
    if ((b = q("[data-act]"))) return flowAction(b.dataset.act!, b as HTMLButtonElement);
    if ((b = q("[data-use]"))) return useIdea(b.dataset.use!);
    if (q("[data-inspire]")) {
      if (open === "theme") { const pool = ideas.filter((i) => i.kind === "theme" && i.name !== tree.season.name).map((i) => i.id); focus.inspire = pool.sort(() => Math.random() - 0.5).slice(0, 3); }
      else if (open === "activities") focus.cad = CADENCES[Math.floor(Math.random() * CADENCES.length)];
      renderDrawer(); return;
    }
    if ((b = q("[data-cad]"))) { focus.cad = b.dataset.cad as Cadence; renderDrawer(); return; }
    if ((b = q("[data-pv-as]"))) { focus.pvAs = b.dataset.pvAs!; renderPanel(); return; }
    if ((b = q("[data-tag-del]"))) { const tags = (tree.season.tags || []).filter((x) => x !== b!.dataset.tagDel); tree.season.tags = tags; renderPanel(); persist("season", "update", { tags }).catch(() => {}); return; }
    if (q("[data-add-chapter]")) return addChapter();
    if ((b = q("[data-del]"))) { const [node, id] = b.dataset.del!.split(":"); return deleteNode(node, id); }
    if ((b = q("[data-col]")) && !q("button")) { focus.chapterId = b.dataset.col!; renderPanel(); renderDrawer(); return; }
    if ((b = q("[data-add-campaign]"))) { focus.chapterId = b.dataset.addCampaign!; return campaignModal(null, b.dataset.addCampaign!); }
    if ((b = q("[data-edit-campaign]"))) { const c = tree.campaigns.find((x) => x.id === b!.dataset.editCampaign); if (c) { focus.chapterId = c.chapterId; campaignModal(c, c.chapterId); } return; }
    if ((b = q("[data-pick-chapter]"))) { focus.chapterId = b.dataset.pickChapter!; focus.campaignId = ""; renderPanel(); renderDrawer(); return; }
    if ((b = q("[data-pick-campaign]"))) { focus.campaignId = b.dataset.pickCampaign!; renderPanel(); renderDrawer(); return; }
    if (q("[data-add-activity]")) return activityModal(null);
    if ((b = q("tr[data-edit-activity]"))) return activityModal(b.dataset.editActivity!);
    if (q("[data-add-event]")) { const now = Date.now(); const ch = (chapterWindows(tree.season, tree.chapters) as any[]).find((c) => c.start != null && c.start <= now && (c.end == null || now < c.end)) || sortedChapters()[0]; return campaignModal(null, ch?.id || "", "event"); }
  });
}

function addTag(raw: string) {
  const t = raw.trim().toLowerCase().slice(0, 24);
  if (!t) return;
  const tags = [...new Set([...(tree.season.tags || []), t])].slice(0, 6);
  tree.season.tags = tags;
  renderPanel();
  root.querySelector<HTMLInputElement>("[data-tag-add]")?.focus();
  persist("season", "update", { tags }).catch(() => {});
}

async function uploadArt(file: File) {
  setSave("Uploading art…", "busy");
  try {
    const publicId = await A.uploadArt(file);
    const r = await persist("season", "art", { uploadPublicId: publicId });
    tree.season.art = r?.art || tree.season.art;
    renderAll();
  } catch (err) {
    setSave("Couldn't save", "err");
    toast(messageFor(err, "The art didn't upload."), { kind: "error", ms: 7000 });
  }
}

let badgeTimer = 0;
function badgeChanged(now = false) {
  const get = (k: string) => root.querySelector<HTMLInputElement>(`[data-badge="${k}"]`)?.value ?? "";
  const data = { name: get("name").trim(), rarity: Number(get("rarity")) || 3, emoji: get("emoji").trim() || "🏅" };
  const art = root.querySelector("[data-badge-art]");
  if (art) art.innerHTML = medalHtml({ emoji: data.emoji, rarity: data.rarity, size: 72 });
  clearTimeout(badgeTimer);
  if (!data.name) return;
  badgeTimer = window.setTimeout(async () => {
    try {
      const r = await persist("badge", "update", data);
      tree.season.badgeId = r?.badgeId || tree.season.badgeId;
      tree.season.badge = { id: tree.season.badgeId!, name: data.name, rarity: data.rarity, emoji: data.emoji, status: tree.season.badge?.status || "draft" };
      renderProgress();
    } catch { /* shown */ }
  }, now ? 0 : 700);
}

async function addChapter() {
  const chs = sortedChapters();
  const last = chs[chs.length - 1];
  // Three weeks after the last chapter, at midnight Central (whole weeks of milliseconds drift an hour across daylight saving).
  const unlockAt = last?.unlockAt != null ? A.centralMidnight(A.centralDate(last.unlockAt + 3 * W + 12 * 3600000)) : tree.season.startsAt ?? null;
  try {
    const r = await persist("chapter", "create", { name: "", unlockAt });
    tree.chapters.push({ id: r!.id!, order: tree.chapters.length, name: "", unlockAt, revealed: false });
    renderAll();
    focus.ch = tree.chapters.length - 1;
    root.querySelector<HTMLInputElement>(`[data-ch-id="${CSS.escape(r!.id!)}"]`)?.focus();
  } catch { /* shown */ }
}

async function deleteNode(node: string, id: string) {
  const label = node === "chapter" ? "this chapter, its campaigns and their activities" : node === "campaign" ? "this campaign and its activities" : "this activity";
  const ok = await confirmAction({ title: "Delete it?", message: `This deletes ${label}.`, confirmLabel: "Delete", busyLabel: "Deleting…", feature: "factory", onConfirm: async () => { await persist(node, "delete", { id }); } });
  if (!ok) return;
  if (node === "chapter") {
    const camps = tree.campaigns.filter((c) => c.chapterId === id).map((c) => c.id);
    tree.activities = tree.activities.filter((a) => !camps.includes(a.campaignId));
    tree.campaigns = tree.campaigns.filter((c) => c.chapterId !== id);
    tree.chapters = tree.chapters.filter((c) => c.id !== id);
  } else if (node === "campaign") {
    tree.activities = tree.activities.filter((a) => a.campaignId !== id);
    tree.campaigns = tree.campaigns.filter((c) => c.id !== id);
  } else tree.activities = tree.activities.filter((a) => a.id !== id);
  renderAll();
}

// ---------- modals ----------
const opt = (v: string, label: string, sel: unknown) => `<option value="${esc(v)}"${String(sel) === v ? " selected" : ""}>${esc(label)}</option>`;
function campaignModal(c: Campaign | null, chapterId: string, cadence: Cadence = "daily", preset: { name?: string; audience?: string; ideaId?: string } = {}) {
  const live = isLive(), locked = (f: string) => !fieldOpen("campaign", f, c ?? { revealed: false });
  const { modal, close } = openModal({ feature: "factory", wide: false, title: c ? "Edit campaign" : "New campaign", content: `${modalHeader(c ? "Edit campaign" : "New campaign", esc(chapterById(chapterId) ? chLabel(chapterById(chapterId)!) : ""))}
    <form class="bt-stack ff-form" novalidate>
      <div class="bt-field"><label class="bt-label" for="cm-name">Name</label><input class="bt-input" id="cm-name" name="name" maxlength="60" value="${esc(c?.name || preset.name || "")}" required${locked("name") ? " disabled" : ""}></div>
      <div class="ff-grid2"><div class="bt-field"><label class="bt-label" for="cm-cad">Cadence</label><select class="bt-select" id="cm-cad" name="cadence"${locked("cadence") ? " disabled" : ""}>${CADENCES.map((k) => opt(k, A.CADENCE[k][0], c?.cadence || cadence)).join("")}</select></div>
      <div class="bt-field"><label class="bt-label" for="cm-aud">Audience</label><select class="bt-select" id="cm-aud" name="audience"${locked("audience") ? " disabled" : ""}>${(["all", "sub", "crew"] as const).map((k) => opt(k, A.AUDIENCE[k], c?.audience || preset.audience || "all")).join("")}</select></div></div>
      <div class="ff-grid2"><div class="bt-field"><label class="bt-label" for="cm-open">Opens (optional)</label><input class="bt-input" type="date" id="cm-open" name="opensAt" value="${A.centralDate(c?.opensAt)}"${locked("opensAt") || (c?.opensAt != null && c.opensAt <= Date.now()) ? " disabled" : ""}><small class="ff-hint">Blank: with its chapter. Events need both dates.</small></div>
      <div class="bt-field"><label class="bt-label" for="cm-close">Closes (optional)</label><input class="bt-input" type="date" id="cm-close" name="closesAt" value="${A.centralDate(c?.closesAt)}"${locked("closesAt") ? " disabled" : ""}><small class="ff-hint">Blank: Daily and Weekly end with the chapter; the rest run to the season's end.</small></div></div>
      <div class="bt-field"><label class="bt-label" for="cm-bonus">Completion bonus XP (optional)</label><input class="bt-input" type="number" id="cm-bonus" name="bonus" min="0" max="2000" step="5" value="${c?.bonus?.xp || ""}"${locked("bonus") ? " disabled" : ""}></div>
      <p class="bt-error" hidden></p>
      <div class="bt-modal-actions">${c && (EDITABLE.includes(status()) || c.revealed !== true) ? `<button type="button" class="bt-btn bt-btn--ghost" data-delete>Delete</button>` : ""}<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--primary">${c ? "Save" : "Add campaign"}</button></div>
    </form>` });
  const form = modal.querySelector("form")!, err = modal.querySelector<HTMLElement>(".bt-error")!;
  modal.querySelector("[data-delete]")?.addEventListener("click", () => { close(); deleteNode("campaign", c!.id); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data: Record<string, unknown> = {};
    const put = (k: string, v: unknown) => { if (!(modal.querySelector<HTMLInputElement>(`[name="${k}"]`)?.disabled)) data[k] = v; };
    put("name", String(fd.get("name") || "").trim());
    put("cadence", fd.get("cadence"));
    put("audience", fd.get("audience"));
    put("opensAt", fd.get("opensAt") ? A.centralMidnight(String(fd.get("opensAt"))) : null);
    put("closesAt", fd.get("closesAt") ? A.centralMidnight(String(fd.get("closesAt"))) : null);
    const bonus = Number(fd.get("bonus") || 0);
    put("bonus", bonus > 0 ? { xp: Math.round(bonus), badgeId: c?.bonus?.badgeId || null } : null);
    if (!c && !data.name) { err.textContent = "Give it a name."; err.hidden = false; return; }
    if (data.cadence === "event" && (!data.opensAt || !data.closesAt) && !c) { err.textContent = "An event needs an opening and a closing date."; err.hidden = false; return; }
    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    btn.disabled = true;
    try {
      if (c) { await persist("campaign", "update", { id: c.id, ...data }); Object.assign(c, data); }
      else {
        const r = await persist("campaign", "create", { chapterId, ...data, ...(preset.ideaId ? { ideaId: preset.ideaId } : {}) });
        tree.campaigns.push({ id: r!.id!, chapterId, name: String(data.name), cadence: data.cadence as Cadence, audience: data.audience as any, opensAt: (data.opensAt as number) ?? null, closesAt: (data.closesAt as number) ?? null, order: tree.campaigns.length, bonus: (data.bonus as any) ?? null, revealed: false });
        focus.campaignId = r!.id!;
      }
      close();
      renderAll();
      if (!c) flash(root.querySelector(`[data-edit-campaign="${CSS.escape(focus.campaignId)}"]`));
    } catch (e2) { btn.disabled = false; err.textContent = messageFor(e2); err.hidden = false; }
    void live;
  });
}

function activityModal(id: string | null, preset: Partial<Activity> = {}) {
  const a = id ? tree.activities.find((x) => x.id === id) || null : null;
  const camp = tree.campaigns.find((c) => c.id === (a?.campaignId || focus.campaignId));
  if (!camp) { toast("Pick a campaign first.", { kind: "info" }); return; }
  const v: Partial<Activity> = { title: "", instructions: "", typeId: "checkin", target: 1, xp: 10, repeat: camp.cadence === "daily" ? "daily" : camp.cadence === "weekly" ? "weekly" : "none", params: {}, link: null, ...preset, ...(a || {}) };
  const locked = (f: string) => !fieldOpen("activity", f, a ?? { revealed: false });
  const typesOn = typeList.filter((t) => t.enabled || t.id === v.typeId);
  const { modal, close } = openModal({ feature: "factory", wide: true, title: a ? "Edit activity" : "New activity", content: `${modalHeader(a ? "Edit activity" : "New activity", esc(`${camp.name || "Untitled"} · ${A.CADENCE[camp.cadence][0]}`))}
    <form class="bt-stack ff-form" novalidate>
      <div class="bt-field"><label class="bt-label" for="am-title">Title</label><input class="bt-input" id="am-title" name="title" maxlength="80" value="${esc(v.title)}"${locked("title") ? " disabled" : ""}></div>
      <div class="bt-field"><label class="bt-label" for="am-ins">Instructions</label><input class="bt-input" id="am-ins" name="instructions" maxlength="200" value="${esc(v.instructions)}"${locked("instructions") ? " disabled" : ""}><small class="ff-hint">One line someone could follow without asking.</small></div>
      <div class="ff-grid2"><div class="bt-field"><label class="bt-label" for="am-type">Type</label><select class="bt-select" id="am-type" name="typeId"${locked("typeId") ? " disabled" : ""}>${typesOn.map((t) => opt(t.id, t.name, v.typeId)).join("")}</select></div>
      <div class="bt-field" data-pf="action"><label class="bt-label" for="am-action">Counts</label><select class="bt-select" id="am-action" name="action"${locked("params") ? " disabled" : ""}></select></div></div>
      <div class="ff-grid3">
        <div class="bt-field" data-pf="gameId"><label class="bt-label" for="am-game">Game (optional)</label><input class="bt-input" id="am-game" name="gameId" placeholder="Any game" value="${esc(v.params?.gameId ?? "")}"${locked("params") ? " disabled" : ""}></div>
        <div class="bt-field" data-pf="collection"><label class="bt-label" for="am-coll">Collection (optional)</label><input class="bt-input" id="am-coll" name="collection" placeholder="Any collection" value="${esc(v.params?.collection ?? "")}"${locked("params") ? " disabled" : ""}></div>
        <div class="bt-field" data-pf="rarity"><label class="bt-label" for="am-rar">Rarity (optional)</label><select class="bt-select" id="am-rar" name="rarity"${locked("params") ? " disabled" : ""}>${opt("", "Any rarity", v.params?.rarity ?? "")}${[1, 2, 3, 4, 5].map((r) => opt(String(r), RARITY[r].name, v.params?.rarity ?? "")).join("")}</select></div>
      </div>
      <div class="ff-grid3"><div class="bt-field"><label class="bt-label" for="am-target">Target</label><input class="bt-input" type="number" min="1" max="1000" id="am-target" name="target" value="${v.target}"${locked("target") ? " disabled" : ""}></div>
      <div class="bt-field"><label class="bt-label" for="am-xp">XP</label><input class="bt-input" type="number" min="0" max="2000" step="5" id="am-xp" name="xp" value="${v.xp}"${locked("xp") ? " disabled" : ""}></div>
      <div class="bt-field"><label class="bt-label" for="am-rep">Repeats</label><select class="bt-select" id="am-rep" name="repeat"${locked("repeat") ? " disabled" : ""}>${opt("none", "Once", v.repeat)}${opt("daily", "Every day", v.repeat)}${opt("weekly", "Every week", v.repeat)}</select></div></div>
      <div class="bt-field"><label class="bt-label" for="am-link">Link (optional)</label><input class="bt-input" id="am-link" name="link" placeholder="/arcade" value="${esc(v.link ?? "")}"${locked("link") ? " disabled" : ""}></div>
      <div class="ff-hunt" data-hunt hidden></div>
      <p class="bt-error" hidden></p>
      <div class="bt-modal-actions">${a && (EDITABLE.includes(status()) || a.revealed !== true) ? `<button type="button" class="bt-btn bt-btn--ghost" data-delete>Delete</button>` : ""}<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button><button type="submit" class="bt-btn bt-btn--primary">${a ? "Save" : "Add activity"}</button></div>
    </form>` });
  const form = modal.querySelector("form")!, err = modal.querySelector<HTMLElement>(".bt-error")!;
  const typeSel = form.querySelector<HTMLSelectElement>('[name="typeId"]')!, actSel = form.querySelector<HTMLSelectElement>('[name="action"]')!;
  const syncType = () => {
    const ty = view.types[typeSel.value] || { params: [], actions: [] } as any;
    const actions: string[] = ty.actions || [];
    actSel.innerHTML = opt("", "Anything of this type", v.params?.action ?? "") + actions.map((x) => opt(x, x[0].toUpperCase() + x.slice(1), v.params?.action ?? "")).join("");
    form.querySelectorAll<HTMLElement>("[data-pf]").forEach((el) => { el.hidden = el.dataset.pf === "action" ? !actions.length : !(ty.params || []).includes(el.dataset.pf); });
    renderHunt();
  };
  const huntBox = form.querySelector<HTMLElement>("[data-hunt]")!;
  /** The hunt's medals, always from the local tree (a medal hunt's hunt id is its activity id). */
  function renderHunt() {
    huntBox.hidden = typeSel.value !== "medals";
    if (huntBox.hidden) return;
    if (!a) { huntBox.innerHTML = `<p class="ff-muted">Add the activity first, then place its medals here.</p>`; return; }
    const medals = tree.hunts.find((h) => h.id === a.id)?.medals || [];
    const liveLock = isLive() && a.revealed === true;
    huntBox.innerHTML = `<span class="bt-label">Hidden medals (${medals.length} of 10)</span>${medals.map((m, i) => `<div class="ff-medalrow" data-medal="${esc(m.id)}"><span>${i + 1}</span>
        <select class="bt-select" data-mf="path" aria-label="Medal ${i + 1} page"${liveLock ? " disabled" : ""}>${A.VISIT_SECTIONS.map((p) => opt(p, p === "/factory" ? "/shift" : p, m.path)).join("")}</select>
        <select class="bt-select" data-mf="position" aria-label="Medal ${i + 1} corner"${liveLock ? " disabled" : ""}>${A.POSITIONS.map(([p, l]) => opt(p, l, m.position)).join("")}</select>
        <input class="bt-input" data-mf="hint" value="${esc(m.hint)}" placeholder="Hint (optional)" maxlength="120" aria-label="Medal ${i + 1} hint">
        ${liveLock ? "" : `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-medal-del aria-label="Remove medal ${i + 1}">Remove</button>`}</div>`).join("")}
      ${!liveLock && medals.length < 10 ? `<button type="button" class="ff-add" data-medal-add>+ Hide a medal</button>` : ""}<small class="ff-hint">Pages are the site tour's sections. Each medal sits in a corner of its page.</small>`;
  }
  typeSel.addEventListener("change", syncType);
  syncType();
  huntBox.addEventListener("change", async (e) => {
    const el = e.target as HTMLInputElement, row = el.closest<HTMLElement>("[data-medal]");
    if (!row || !a) return;
    try {
      await persist("medal", "update", { activityId: a.id, id: row.dataset.medal, [el.dataset.mf!]: el.value });
      const m = tree.hunts.find((h) => h.id === a.id)?.medals.find((x) => x.id === row.dataset.medal);
      if (m) (m as unknown as Record<string, string>)[el.dataset.mf!] = el.value;
    } catch { /* shown */ }
  });
  huntBox.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    if (!a) return;
    try {
      let h = tree.hunts.find((x) => x.id === a.id);
      if (t.closest("[data-medal-add]")) {
        const r = await persist("medal", "create", { activityId: a.id, path: "/arcade", position: "bottom-right", hint: "" });
        if (!h) { h = { id: a.id, activityId: a.id, name: a.title, medals: [] }; tree.hunts.push(h); }
        h.medals.push({ id: r!.id!, path: "/arcade", position: "bottom-right", hint: "", order: h.medals.length });
        renderHunt();
      }
      const del = t.closest<HTMLElement>("[data-medal-del]");
      if (del && h) {
        const mid = del.closest<HTMLElement>("[data-medal]")!.dataset.medal!;
        await persist("medal", "delete", { activityId: a.id, id: mid });
        h.medals = h.medals.filter((m) => m.id !== mid);
        renderHunt();
      }
    } catch { /* shown */ }
  });
  modal.querySelector("[data-delete]")?.addEventListener("click", () => { close(); deleteNode("activity", a!.id); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const enabled = (n: string) => !(form.querySelector<HTMLInputElement>(`[name="${n}"]`)?.disabled);
    const data: Record<string, unknown> = {};
    for (const k of ["title", "instructions"]) if (enabled(k)) data[k] = String(fd.get(k) || "").trim();
    if (enabled("link")) data.link = String(fd.get("link") || "").trim() || null;
    if (enabled("typeId")) data.typeId = fd.get("typeId");
    for (const k of ["target", "xp"]) if (enabled(k)) data[k] = Math.round(Number(fd.get(k)));
    if (enabled("repeat")) data.repeat = fd.get("repeat");
    if (enabled("action")) {
      const ty = view.types[String(fd.get("typeId") || v.typeId)] || { params: [] } as any;
      const params: Record<string, string | number> = {};
      const p = (k: string, val: FormDataEntryValue | null, num = false) => { if ((ty.params || []).includes(k) || k === "action") { const s = String(val || "").trim(); if (s) params[k] = num ? Number(s) : s; } };
      if ((ty.actions || []).length) p("action", fd.get("action"));
      p("gameId", fd.get("gameId")); p("collection", fd.get("collection")); p("rarity", fd.get("rarity"), true);
      data.params = params;
    }
    if (!a && !data.title) { err.textContent = "Give it a title."; err.hidden = false; return; }
    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    btn.disabled = true;
    try {
      if (a) { await persist("activity", "update", { id: a.id, ...data }); Object.assign(a, data); close(); }
      else {
        const r = await persist("activity", "create", { campaignId: camp!.id, ideaId: preset.ideaId ?? null, ...data });
        const made: Activity = { id: r!.id!, campaignId: camp!.id, title: String(data.title), instructions: String(data.instructions || ""), link: (data.link as string) ?? null, typeId: String(data.typeId), target: Number(data.target), xp: Number(data.xp), params: (data.params as any) || {}, badgeId: null, repeat: data.repeat as any, order: tree.activities.length, revealed: false };
        if (made.typeId === "medals") { made.params = { ...made.params, huntId: made.id }; tree.hunts.push({ id: made.id, activityId: made.id, name: made.title, medals: [] }); }
        tree.activities.push(made);
        close();
        if (made.typeId === "medals") activityModal(made.id);
      }
      renderAll();
      if (!a) flash(root.querySelector("tr[data-edit-activity]:last-of-type"));
    } catch (e2) { btn.disabled = false; err.textContent = messageFor(e2); err.hidden = false; }
  });
}

// ---------- ideas ----------
async function useIdea(id: string) {
  const i = ideas.find((x) => x.id === id);
  if (!i || !canEdit()) return;
  try {
    if (i.kind === "theme") {
      if (!fieldOpen("season", "name")) return;
      const data = { name: i.name || "", pitch: i.pitch || "", tags: (i.tags || []).slice(0, 6), ideaId: i.id };
      Object.assign(tree.season, data);
      open = "theme"; renderAll();
      flash(root.querySelector("#ff-name"));
      await persist("season", "update", data);
    } else if (i.kind === "chapter") {
      let ch = sortedChapters()[focus.ch];
      if (!ch || ch.name) ch = sortedChapters().find((c) => !c.name) || ch;
      if (!ch) { await addChapter(); ch = sortedChapters()[sortedChapters().length - 1]; }
      if (!ch || !fieldOpen("chapter", "name", ch)) return;
      ch.name = i.name || ""; ch.ideaId = i.id;
      renderAll();
      flash(root.querySelector(`[data-ch-id="${CSS.escape(ch.id)}"]`));
      await persist("chapter", "update", { id: ch.id, name: ch.name, ideaId: i.id });
    } else if (i.kind === "campaign") {
      const ch = chapterById(focus.chapterId) || sortedChapters()[0];
      if (!ch) { toast("Add chapters first.", { kind: "info" }); return; }
      if (!i.cadence || !A.CADENCE[i.cadence]) { campaignModal(null, ch.id, "story", { name: i.name || "", audience: i.audience || "all", ideaId: i.id }); return; }   // pick a cadence first
      const data = { chapterId: ch.id, name: i.name || "", cadence: i.cadence || "daily", audience: i.audience || "all", ideaId: i.id };
      const r = await persist("campaign", "create", data);
      tree.campaigns.push({ id: r!.id!, ...data, cadence: data.cadence as Cadence, audience: data.audience as any, opensAt: null, closesAt: null, order: tree.campaigns.length, bonus: null, revealed: false });
      open = "campaigns"; renderAll();
      flash(root.querySelector(`[data-edit-campaign="${CSS.escape(r!.id!)}"]`));
    } else if (i.kind === "activity") {
      if (!tree.campaigns.find((c) => c.id === focus.campaignId)) { toast("Pick a campaign first.", { kind: "info" }); return; }
      activityModal(null, { title: i.title || "", instructions: i.instructions || "", typeId: i.typeId || "checkin", target: i.target || 1, xp: i.xp || 0, params: i.params || {}, repeat: i.cadence === "daily" ? "daily" : i.cadence === "weekly" ? "weekly" : "none", ideaId: i.id });
    } else if (i.kind === "reward") {
      const input = root.querySelector<HTMLInputElement>('[data-badge="name"]');
      if (!input || input.disabled) return;
      input.value = i.name || "";
      flash(input);
      badgeChanged(true);
    }
  } catch { /* shown */ }
}

// ---------- the status flow ----------
async function reload() {
  const id = tree.season.id;
  view = await A.getSeason(id);
  tree = view.tree;
  renderAll();
}
async function flowAction(act: string, btn: HTMLButtonElement) {
  const id = tree.season.id;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    btn.disabled = true;
    try { await fn(); toast(done); await reload(); } catch (err) { btn.disabled = false; toast(messageFor(err), { kind: "error", ms: 7000 }); }
  };
  if (act === "submit") return run(() => A.submit(id), "Submitted for review.");
  if (act === "publish") {
    await confirmAction({ title: "Approve and schedule?", message: `${A.seasonLabel(tree.season)} starts on its own on ${A.fmtDay(tree.season.startsAt, true)}. Its season badge turns on in the Trophy Room.`, confirmLabel: "Approve and schedule", busyLabel: "Scheduling…", danger: false, feature: "factory",
      onConfirm: async () => { await A.publish(id); } }).then(async (ok) => { if (ok) { toast("Scheduled."); await reload(); } });
    return;
  }
  if (act === "unpublish") {
    await confirmAction({ title: "Unpublish it?", message: "It goes back to Draft so it can be edited, and won't start until it's approved again.", confirmLabel: "Unpublish", busyLabel: "Unpublishing…", danger: false, feature: "factory",
      onConfirm: async () => { await A.unpublish(id); } }).then(async (ok) => { if (ok) { toast("Back to draft."); await reload(); } });
    return;
  }
  if (act === "end") {
    await confirmAction({ title: "End the season now?", message: "Members' progress stops, the leaderboard freezes, and trophies, plaques and the season badge are awarded now. This can't be undone.", confirmLabel: "End season", busyLabel: "Ending…", feature: "factory",
      onConfirm: async () => { await A.endSeason(id); } }).then(async (ok) => { if (ok) { toast("The season has ended."); await reload(); } });
    return;
  }
  if (act === "sendback") {
    const { modal, close } = openModal({ feature: "factory", title: "Send back", content: `${modalHeader("Send it back")}<form class="bt-stack" novalidate><div class="bt-field"><label class="bt-label" for="sb-note">What needs changing?</label><textarea class="bt-textarea" id="sb-note" maxlength="500" required></textarea></div><p class="bt-error" hidden></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--admin">Send back</button></div></form>` });
    const form = modal.querySelector("form")!, err = modal.querySelector<HTMLElement>(".bt-error")!;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const note = modal.querySelector<HTMLTextAreaElement>("textarea")!.value.trim();
      if (!note) { err.textContent = "Say what needs changing."; err.hidden = false; return; }
      try { await A.sendBack(id, note); close(); toast("Sent back to draft."); await reload(); } catch (e2) { err.textContent = messageFor(e2); err.hidden = false; }
    });
  }
}
