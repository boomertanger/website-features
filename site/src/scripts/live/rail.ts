// The owner's private checklist rail on /live/control (docs/specs/control-room.md §5). OWNER ONLY, three locks: the grid has no rail slot for anyone
// else, initRail does nothing unless the role is "owner", and api.ts only reads private/checklist for the owner (the rules refuse everyone else).
// Current beat open, the others fold to "Break 1 · 3 of 5", ticking pops and saves at once (liveChecklist tick), and a shortcut row ticks itself when
// its control is used (the server ticks Open check-in too; the others tick here and save). Clicking a shortcut's purple text runs that control.
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { checklistHtml, initChecklist, tickChecklistItem } from "../../../../shared/ui/checklist.js";
import site from "../../data/site.json";
import type { Ctx } from "./state";
import { BEATS, BEAT_LABEL, type Beat, type CBeats, type CItem } from "./model";
import { toast, messageFor, mascotHtml, copyText } from "./ui";

export const SHORTCUT_LABEL: Record<string, string> = { openCheckin: "Open check-in", startQuestions: "Start Questions", startHotSeat: "Start Hot Seat", dropBadge: "Drop a badge", copySocials: "Copy socials" };

let open = new Set<string>();
let openFor = "";
let last: CBeats | null = null;
const pending = new Map<string, boolean>();

function railHtml(ctx: Ctx): string {
  if (ctx.role !== "owner") return "";
  const cl = ctx.snap.checklist;
  const head = (bodyHtml: string) => crPanelHtml({ id: "lc-rail", title: "Your checklist", icon: "checklist", bodyHtml: `${bodyHtml}<p class="lc-private"><svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Only you can see this list. <a class="bt-link-btn" href="/live/control/checklist${location.search}">Edit templates</a></p>` });
  if (ctx.mode !== "live" || !cl) return head(`<div class="lc-empty lc-empty--sm">${mascotHtml()}<p>${ctx.mode === "ended" ? "The stream is over." : "Your list appears here when you start the stream: a fresh copy of your templates."}</p></div>`);
  const cur = ctx.snap.pub?.beat || "start";
  if (openFor !== cur) { openFor = cur; open = new Set([cur]); }
  const groups = BEATS.map((k) => ({ id: k, title: BEAT_LABEL[k], open: open.has(k), items: (cl[k] || []).map((it: CItem) => ({ id: it.id, text: it.text, note: it.note, shortcut: it.shortcut ? SHORTCUT_LABEL[it.shortcut] : "", done: pending.has(`${k}:${it.id}`) ? pending.get(`${k}:${it.id}`) : it.done === true })) }));
  const html = checklistHtml({ groups: groups as any, label: "Your private checklist" });
  // tag each shortcut with its control id so a click can run it
  let tagged = html;
  for (const k of BEATS) for (const it of cl[k] || []) if (it.shortcut) tagged = tagged.replace(new RegExp(`(data-item="${it.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" data-group="${k}"[\\s\\S]*?<span class="bt-checklist-short")`), `$1 data-shortcut="${it.shortcut}" role="button" tabindex="0"`);
  last = cl;
  return head(tagged);
}

async function save(ctx: Ctx, beat: string, itemId: string, done: boolean, quiet = false) {
  const k = `${beat}:${itemId}`;
  pending.set(k, done);
  try { await ctx.api.call("liveChecklist", { action: "tick", beat, itemId, done }); }
  catch (err) { pending.delete(k); if (!quiet) toast(messageFor(err), { kind: "error" }); ctx.render(); return; }
  await ctx.refresh();
  pending.delete(k);
}

async function runShortcut(ctx: Ctx, name: string) {
  if (name === "openCheckin") { (ctx.root.querySelector('[data-act="ci-open"]') as HTMLElement | null)?.click(); return; }
  if (name === "copySocials") {
    const text = (site.socials as { label: string; url: string }[]).map((s) => `${s.label}: ${s.url}`).join("\n");
    toast((await copyText(text)) ? "Socials copied." : "Couldn't copy: your browser blocked it.", { kind: "info" });
    shortcutUsed(ctx, name);
    return;
  }
  toast("That arrives with the live activities.", { kind: "info" });
}

/** A control the owner used ticks the matching row of the current beat. */
function shortcutUsed(ctx: Ctx, name: string) {
  const cl = ctx.snap.checklist, beat = ctx.snap.pub?.beat;
  if (ctx.role !== "owner" || !cl || !beat) return;
  for (const it of cl[beat] || []) {
    if (it.shortcut !== name || it.done) continue;
    tickChecklistItem(ctx.root, it.id, true);
    // the server already ticks Open check-in itself; the other shortcuts save here
    if (name !== "openCheckin") void save(ctx, beat, it.id, true, true);
  }
}

export function initRail(ctx: Ctx) {
  if (ctx.role !== "owner") return;
  ctx.hooks.railHtml = railHtml;
  ctx.hooks.shortcut = (name: string) => shortcutUsed(ctx, name);
  ctx.hooks.rememberChecklist = () => { if (ctx.snap.checklist) last = ctx.snap.checklist; };
  ctx.hooks.unticked = () => {
    const out: { beat: string; text: string }[] = [];
    if (!last) return out;
    for (const k of BEATS as Beat[]) for (const it of last[k] || []) if (!it.done) out.push({ beat: BEAT_LABEL[k], text: it.text });
    return out;
  };
  ctx.after.push(() => {
    const rail = ctx.root.querySelector<HTMLElement>('[data-slot="rail"]');
    if (!rail) return;
    if (ctx.snap.checklist) last = ctx.snap.checklist;
    initChecklist(rail as unknown as Document, { onToggle: (id: string, done: boolean, g: string) => { void save(ctx, g, id, done); } });
    rail.querySelectorAll<HTMLElement>(".bt-checklist-head").forEach((h) => {
      if ((h as any)._lc) return; (h as any)._lc = 1;
      h.addEventListener("click", () => { const g = h.closest<HTMLElement>(".bt-checklist-group")!.dataset.group!; if (h.getAttribute("aria-expanded") === "true") open.add(g); else open.delete(g); });
    });
  });
  ctx.root.addEventListener("click", (e) => {
    const s = (e.target as HTMLElement).closest<HTMLElement>("[data-shortcut]");
    if (!s) return;
    e.preventDefault(); e.stopPropagation();
    void runShortcut(ctx, s.dataset.shortcut!);
  }, true);
  ctx.root.addEventListener("keydown", (e) => {
    const s = (e.target as HTMLElement).closest<HTMLElement>("[data-shortcut]");
    if (s && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); void runShortcut(ctx, s.dataset.shortcut!); }
  });
}
