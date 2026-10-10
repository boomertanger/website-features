// /live/control: the owner's Recruit Rush card in the Cockpit's right column, under the launch panel (Mod Machina phase 3 part 6; docs/specs/mod-machina.md
// §17a "Recruit Rush"; mockup docs/design/mockups/mod-deck.html section 2). An On/Off switch, Goal and Reward, the R1 meter live, Save (liveRecruitRush).
// Owner only. It reads the MAIN stream's private/control.recruitRush itself (every 5 s while the tab is visible; control.ts only reads private/control while
// live, and a Rush can be set before Start). It patches its own slot in parts, so the count can move while the owner is typing.
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { current, type Ctx } from "./state";
import { esc, toast, messageFor } from "./ui";
import { previewRush, rushBodyHtml, rushFrom, type PubRush } from "./rush";

interface Saved { on: boolean; goal: number; reward: string; count: number; hitAt: number | null }
const POLL_MS = 5000;
const HINT = "Counts new accounts from Start to 30 minutes after Stop. The goal can't change after it's hit.";

export function initRush(ctx: Ctx) {
  if (ctx.role !== "owner") return;
  const pv = previewRush();
  let saved: Saved | null = ctx.api.preview ? (pv ? { on: true, ...pv } : null) : null;
  let draft = { on: saved?.on ?? false, goal: String(saved?.goal ?? 20), reward: saved?.reward ?? "" };
  let dirty = false, busy = false, readFor = "", inflight = false;
  const keys: Record<string, string> = {};

  /** The stream the card is for: the live one (its main stream during an after-show) or the one picked to start. */
  const mainId = () => { const s = current(ctx); return s ? s.afterShowOf || s.id : ""; };
  const count = () => {
    const p = rushFrom(ctx.snap.pub?.recruitRush), s = current(ctx);
    const fromPub = p && s && (ctx.snap.pub?.streamId === s.id || ctx.snap.pub?.streamId === mainId()) ? p.count : 0;
    return Math.max(saved?.count ?? 0, fromPub);
  };
  const hitAt = () => saved?.hitAt ?? null;

  function adopt(next: Saved | null) {
    saved = next;
    if (!dirty) draft = { on: next?.on ?? false, goal: String(next?.goal ?? 20), reward: next?.reward ?? "" };
  }

  // ---- markup, in parts
  const shellHtml = () => crPanelHtml({
    id: "lc-rush", title: "Recruit Rush", icon: "crew",
    tagHtml: `<span data-rr-tag></span>`,
    bodyHtml: `<div class="lc-rr"><div data-rr-form></div><div data-rr-meter></div><span class="lr-rush-hint">${HINT}</span>`
      + `<div class="lc-rr-acts"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-rr-save>Save</button></div></div>`,
  });
  const tagHtml = () => (saved?.on ? `<span class="bt-badge bt-badge--green">On</span>` : `<span class="bt-badge">Off</span>`);
  const formHtml = () => {
    const locked = hitAt() != null;
    return `<div class="lc-rr-row"><span class="bt-label" id="lc-rr-on">Recruit Rush tonight</span><button type="button" class="bt-switch" role="switch" aria-checked="${draft.on}" aria-labelledby="lc-rr-on" data-rr-switch></button></div>`
      + `<label class="lc-rr-row"><span class="bt-label">Goal</span><input class="bt-input" type="number" inputmode="numeric" min="5" max="200" step="1" value="${esc(draft.goal)}" data-rr-goal${locked ? ` disabled title="The goal can't change after it's hit."` : ""}></label>`
      + `<label class="lc-rr-row lc-rr-row--wide"><span class="bt-label">Reward</span><input class="bt-input" type="text" maxlength="80" placeholder="Hard-mode run on Friday" value="${esc(draft.reward)}" data-rr-reward></label>`;
  };
  const meterRush = (): PubRush | null => {
    const goal = Number(draft.goal);
    if (!Number.isInteger(goal) || goal < 5 || goal > 200) return null;
    return { goal, count: count(), reward: draft.reward.trim() || "Your reward", hitAt: hitAt() };
  };

  function put(el: Element | null, name: string, html: string) {
    if (!el || keys[name] === html) return;
    keys[name] = html; el.innerHTML = html;
  }
  function paint() {
    const host = ctx.root.querySelector<HTMLElement>('[data-slot="rush"]');
    if (!host) return;
    if (!mainId() || ctx.mode === "ended") { if (host.innerHTML) { host.innerHTML = ""; for (const k of Object.keys(keys)) delete keys[k]; } return; }
    if (!host.querySelector("#lc-rush")) { host.innerHTML = shellHtml(); for (const k of Object.keys(keys)) delete keys[k]; wire(host); }
    put(host.querySelector("[data-rr-tag]"), "tag", tagHtml());
    const form = host.querySelector<HTMLElement>("[data-rr-form]");
    if (form && !form.contains(document.activeElement)) put(form, "form", formHtml());
    const r = meterRush();
    put(host.querySelector("[data-rr-meter]"), "meter", r ? rushBodyHtml(r) : `<p class="lr-rush-hint">Set a goal from 5 to 200 to see the meter.</p>`);
    const save = host.querySelector<HTMLButtonElement>("[data-rr-save]");
    if (save) { save.disabled = busy; save.toggleAttribute("aria-busy", busy); }
  }

  function wire(host: HTMLElement) {
    host.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.matches("[data-rr-goal]")) draft.goal = t.value;
      else if (t.matches("[data-rr-reward]")) draft.reward = t.value;
      else return;
      dirty = true;
      const r = meterRush();
      put(host.querySelector("[data-rr-meter]"), "meter", r ? rushBodyHtml(r) : `<p class="lr-rush-hint">Set a goal from 5 to 200 to see the meter.</p>`);
    });
    host.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const sw = t.closest<HTMLElement>("[data-rr-switch]");
      if (sw) { draft.on = !draft.on; dirty = true; sw.setAttribute("aria-checked", String(draft.on)); keys.form = ""; return; }
      if (t.closest("[data-rr-save]")) void save();
    });
  }

  async function save() {
    if (busy) return;
    const goal = Number(draft.goal), reward = draft.reward.trim(), sid = mainId();
    if (!Number.isInteger(goal) || goal < 5 || goal > 200) { toast("The goal is 5 to 200.", { kind: "error" }); return; }
    if (!reward || reward.length > 80) { toast("Write a reward of 1 to 80 characters.", { kind: "error" }); return; }
    if (saved?.hitAt != null && goal !== saved.goal) { toast("The goal can't change after it's hit.", { kind: "error" }); return; }
    busy = true; paint();
    try {
      let out: Saved;
      if (ctx.api.preview) {
        const c = count();
        out = { on: draft.on, goal, reward, count: c, hitAt: saved?.hitAt ?? (draft.on && c >= goal ? Date.now() : null) };
        toast("Preview: the Rush is saved on this page only.", { kind: "info" });
      } else {
        const r: any = await ctx.api.call("liveRecruitRush", { streamId: sid, on: draft.on, goal, reward });
        out = { on: !!r.on, goal: r.goal, reward: r.reward, count: r.count || 0, hitAt: r.hitAt ?? null };
        toast(out.on ? "Recruit Rush is on." : "Recruit Rush is off.");
      }
      dirty = false; keys.form = ""; adopt(out);
    } catch (err) { toast(messageFor(err, "Couldn't save the Recruit Rush. Try again."), { kind: "error" }); }
    finally { busy = false; paint(); }
  }

  // ---- reading the main stream's private/control
  async function poll(force = false) {
    const sid = mainId();
    if (ctx.api.preview || inflight || !sid || (document.hidden && !force) || ctx.mode === "ended" || busy) return;
    inflight = true;
    try {
      const snap = await getDoc(doc(db, `sites/${SITE_ID}/streams/${sid}/private/control`));
      const r = snap.exists() ? (snap.data() as any).recruitRush : null;
      if (readFor !== sid) { dirty = false; keys.form = ""; }
      readFor = sid;
      const p = r ? rushFrom({ ...r, on: true }) : null;
      adopt(r && p ? { on: r.on === true, goal: p.goal, reward: p.reward, count: p.count, hitAt: p.hitAt } : null);
      paint();
    } catch (err) { console.warn("control: rush read", err); }
    finally { inflight = false; }
  }
  window.setInterval(() => void poll(), POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void poll(); });
  ctx.after.push(() => { if (mainId() !== readFor && !ctx.api.preview) void poll(true); paint(); });
}
