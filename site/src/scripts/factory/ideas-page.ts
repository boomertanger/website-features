// /shift/builder/ideas: browse, search and filter the idea library; admins add, edit and retire
// ideas (factoryIdeaSave) and switch activity types on or off (factoryTypeToggle). Everything is read
// once (ideas and types are crew-readable) and filtered here.
import { onAccess } from "./layout";
import * as A from "./api";
import type { Idea } from "./api";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { toast } from "../../../../shared/ui/toast.js";
import { escapeHtml } from "../../../../shared/ui/dom.js";
import { messageFor } from "../../lib/errors";

const esc = (v: unknown) => escapeHtml(String(v ?? ""));
const root = document.querySelector<HTMLElement>("[data-ideas]")!;
const KINDS: [Idea["kind"] | "all", string][] = [["all", "All"], ["theme", "Themes"], ["chapter", "Chapter names"], ["campaign", "Campaign names"], ["activity", "Activities"], ["reward", "Rewards"]];
const KIND_ONE: Record<Idea["kind"], string> = { theme: "Theme", chapter: "Chapter name", campaign: "Campaign name", activity: "Activity", reward: "Reward" };
let ideas: Idea[] = [];
let types: Awaited<ReturnType<typeof A.loadTypes>> = [];
let isAdmin = false;
const f = { q: "", kind: "all" as Idea["kind"] | "all", cad: "", retired: false };

onAccess(async (s) => {
  isAdmin = s.isAdmin;
  try {
    [ideas, types] = await Promise.all([A.loadIdeas(), A.loadTypes()]);
  } catch (err) {
    root.removeAttribute("aria-busy");
    root.innerHTML = `<p class="bt-notice bt-notice--error">${esc(messageFor(err, "The idea library didn't load. Refresh the page."))}</p>`;
    return;
  }
  root.removeAttribute("aria-busy");
  root.innerHTML = `
    <div class="ff-head"><div><h1 class="bt-title">Idea library</h1><p class="bt-subtitle">Every idea the builder offers at each stage. ${isAdmin ? "Add your own, edit or retire them, and switch activity types on as new features ship." : "Admins can add, edit and retire ideas."}</p></div>${isAdmin ? `<button type="button" class="bt-btn bt-btn--admin" data-add>+ Add an idea</button>` : ""}</div>
    <div class="ff-filters">
      <div class="bt-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input class="bt-input" type="search" data-q placeholder="Search ideas" aria-label="Search ideas"></div>
      <div class="ff-sel" role="group" aria-label="Kind" data-kinds></div>
      <div class="ff-sel" role="group" aria-label="Cadence" data-cads></div>
      <label class="ff-check"><input type="checkbox" data-retired> Show retired ideas</label>
    </div>
    <p class="ff-muted" data-ff-count aria-live="polite"></p>
    <div class="ff-ideas" data-list></div>
    <section class="ff-types-sec" aria-labelledby="ff-types-h"><h2 class="bt-heading" id="ff-types-h">Activity types</h2><p class="ff-muted">The builder only offers types that are on. Waiting types switch on when their feature ships.</p><div class="ff-types" data-types></div></section>`;
  render();
  renderTypes();
  root.addEventListener("input", (e) => { const el = e.target as HTMLInputElement; if (el.matches("[data-q]")) { f.q = el.value.trim().toLowerCase(); render(); } });
  root.addEventListener("change", async (e) => {
    const el = e.target as HTMLInputElement;
    if (el.matches("[data-retired]")) { f.retired = el.checked; render(); }
  });
  root.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const kind = t.closest<HTMLElement>("[data-kind]"), cad = t.closest<HTMLElement>("[data-cadf]");
    if (kind) { f.kind = kind.dataset.kind as typeof f.kind; if (f.kind !== "activity" && f.kind !== "campaign" && f.kind !== "all") f.cad = ""; render(); return; }
    if (cad) { f.cad = cad.dataset.cadf!; render(); return; }
    if (t.closest("[data-add]")) return editIdea(null);
    const ed = t.closest<HTMLElement>("[data-edit]");
    if (ed) return editIdea(ideas.find((i) => i.id === ed.dataset.edit) || null);
    const rt = t.closest<HTMLButtonElement>("[data-retire]");
    if (rt) {
      const i = ideas.find((x) => x.id === rt.dataset.retire)!;
      rt.disabled = true;
      try { await A.ideaSave({ id: i.id, retired: !i.retired }); i.retired = !i.retired; toast(i.retired ? "Retired. The builder won't offer it." : "Back in the library."); render(); }
      catch (err) { rt.disabled = false; toast(messageFor(err), { kind: "error" }); }
      return;
    }
    const sw = t.closest<HTMLButtonElement>("[data-type]");
    if (sw && isAdmin) {
      const ty = types.find((x) => x.id === sw.dataset.type)!;
      const next = !ty.enabled;
      sw.disabled = true;
      try { await A.typeToggle(ty.id, next); ty.enabled = next; toast(`${ty.name} is ${next ? "on" : "off"}.`); renderTypes(); render(); }
      catch (err) { sw.disabled = false; toast(messageFor(err), { kind: "error" }); }
    }
  });
});

const label = (i: Idea) => i.name || i.title || i.id;
function matches(i: Idea) {
  if (!f.retired && i.retired) return false;
  if (f.kind !== "all" && i.kind !== f.kind) return false;
  if (f.cad && i.cadence !== f.cad) return false;
  if (!f.q) return true;
  return [i.name, i.title, i.pitch, i.instructions, i.theme, ...(i.tags || []), i.typeId].some((x) => String(x || "").toLowerCase().includes(f.q));
}
function render() {
  const counts = Object.fromEntries(KINDS.map(([k]) => [k, ideas.filter((i) => (k === "all" || i.kind === k) && (f.retired || !i.retired)).length]));
  root.querySelector<HTMLElement>("[data-kinds]")!.innerHTML = KINDS.map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small${f.kind === k ? " is-active" : ""}" data-kind="${k}" aria-pressed="${f.kind === k}">${l} <small>${counts[k]}</small></button>`).join("");
  const showCad = f.kind === "activity" || f.kind === "campaign";
  root.querySelector<HTMLElement>("[data-cads]")!.innerHTML = showCad ? [["", "Any cadence"], ...Object.entries(A.CADENCE).map(([k, v]) => [k, v[0]])].map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small${f.cad === k ? " is-active" : ""}" data-cadf="${k}" aria-pressed="${f.cad === k}">${l}</button>`).join("") : "";
  const list = ideas.filter(matches).sort((a, b) => a.kind.localeCompare(b.kind) || label(a).localeCompare(label(b)));
  root.querySelector<HTMLElement>("[data-ff-count]")!.textContent = `${list.length} idea${list.length === 1 ? "" : "s"}`;
  const typeOf = (id?: string) => types.find((t) => t.id === id);
  root.querySelector<HTMLElement>("[data-list]")!.innerHTML = list.map((i) => {
    const ty = typeOf(i.typeId);
    const meta = [
      `<span class="bt-badge bt-badge--gray">${KIND_ONE[i.kind]}</span>`,
      i.cadence && A.CADENCE[i.cadence] ? `<span class="bt-badge bt-badge--${A.CADENCE[i.cadence][1]}">${A.CADENCE[i.cadence][0]}</span>` : "",
      i.audience && i.audience !== "all" ? `<span class="bt-badge bt-badge--${i.audience === "sub" ? "gold" : "teal"}">${A.AUDIENCE[i.audience]}</span>` : "",
      ty ? `<span class="bt-tag">${esc(ty.name)}${ty.enabled ? "" : ` · needs ${esc(ty.needs || "a new feature")}`}</span>` : "",
      i.xp != null && i.kind === "activity" ? `<span class="bt-tag">+${i.xp} XP · target ${i.target ?? 1}</span>` : "",
      i.theme && i.kind === "chapter" ? `<span class="bt-tag">${esc(i.theme)}</span>` : "",
      ...(i.tags || []).map((t) => `<span class="bt-tag">${esc(t)}</span>`),
      i.usedIn?.length ? `<span class="bt-badge bt-badge--gold">Used in ${esc(i.usedIn.join(", "))}</span>` : "",
      i.retired ? `<span class="bt-badge bt-badge--gray">Retired</span>` : "",
    ].join("");
    const waiting = ty && !ty.enabled;
    return `<div class="bt-drawer-item${waiting || i.retired ? " is-waiting" : ""}${i.usedIn?.length ? " is-used" : ""}"><b>${esc(i.emoji ? `${i.emoji} ` : "")}${esc(label(i))}</b>${isAdmin ? `<span class="ff-row-acts"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-edit="${esc(i.id)}">Edit</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-retire="${esc(i.id)}">${i.retired ? "Restore" : "Retire"}</button></span>` : ""}${i.pitch || i.instructions ? `<p>${esc(i.pitch || i.instructions)}</p>` : ""}<div class="bt-drawer-meta">${meta}</div></div>`;
  }).join("") || `<div class="bt-empty"><span class="bt-empty-title">No ideas match</span><p>${ideas.length ? "Try another search or filter." : "The library is empty. An admin seeds it with seed-factory-ideas.js."}</p></div>`;
}
function renderTypes() {
  root.querySelector<HTMLElement>("[data-types]")!.innerHTML = types.map((t) => `<div class="ff-type${t.enabled ? "" : " is-off"}">
    <div><b id="ty-${esc(t.id)}">${esc(t.name)}</b><small>${esc(t.description || "")}${t.source ? ` · ${esc(t.source)}` : ""}${t.enabled ? "" : ` · needs ${esc(t.needs || "a new feature")}`}</small></div>
    ${isAdmin ? `<button type="button" class="bt-switch" role="switch" aria-checked="${t.enabled}" aria-labelledby="ty-${esc(t.id)}" data-type="${esc(t.id)}"></button>` : `<span class="bt-badge bt-badge--${t.enabled ? "green" : "gray"}">${t.enabled ? "On" : "Waiting"}</span>`}
  </div>`).join("");
}

/** Add or edit an idea (admins). The fields depend on the kind. */
function editIdea(i: Idea | null) {
  let kind: Idea["kind"] = i?.kind || (f.kind !== "all" ? f.kind : "theme");
  const opt = (v: string, l: string, sel: unknown) => `<option value="${esc(v)}"${String(sel ?? "") === v ? " selected" : ""}>${esc(l)}</option>`;
  const fields = (k: Idea["kind"]) => {
    const v = i || ({} as Idea);
    const inp = (n: string, l: string, val: unknown, extra = "") => `<div class="bt-field"><label class="bt-label" for="id-${n}">${l}</label><input class="bt-input" id="id-${n}" name="${n}" value="${esc(val ?? "")}"${extra}></div>`;
    if (k === "theme") return inp("name", "Name", v.name, ' maxlength="60"') + inp("pitch", "Pitch", v.pitch, ' maxlength="200"') + `<div class="ff-grid2">${inp("emoji", "Emoji", v.emoji, ' maxlength="8"')}${inp("tags", "Mood tags (comma separated)", (v.tags || []).join(", "))}</div>`;
    if (k === "chapter") return inp("name", "Name", v.name, ' maxlength="60"') + inp("theme", "Theme (blank for Any theme)", v.theme === "Any theme" ? "" : v.theme, ' maxlength="60"');
    if (k === "campaign") return inp("name", "Name", v.name, ' maxlength="60"') + `<div class="ff-grid2"><div class="bt-field"><label class="bt-label" for="id-cad">Cadence</label><select class="bt-select" id="id-cad" name="cadence">${Object.entries(A.CADENCE).map(([c, l]) => opt(c, l[0], v.cadence || "daily")).join("")}</select></div><div class="bt-field"><label class="bt-label" for="id-aud">Audience</label><select class="bt-select" id="id-aud" name="audience">${Object.entries(A.AUDIENCE).map(([c, l]) => opt(c, l, v.audience || "all")).join("")}</select></div></div>`;
    if (k === "activity") return inp("title", "Title", v.title, ' maxlength="80"') + inp("instructions", "Instructions", v.instructions, ' maxlength="200"')
      + `<div class="ff-grid2"><div class="bt-field"><label class="bt-label" for="id-type">Type</label><select class="bt-select" id="id-type" name="typeId">${types.map((t) => opt(t.id, `${t.name}${t.enabled ? "" : " (waiting)"}`, v.typeId)).join("")}</select></div><div class="bt-field"><label class="bt-label" for="id-cad">Cadence</label><select class="bt-select" id="id-cad" name="cadence">${Object.entries(A.CADENCE).map(([c, l]) => opt(c, l[0], v.cadence || "daily")).join("")}</select></div></div>`
      + `<div class="ff-grid3">${inp("target", "Target", v.target ?? 1, ' type="number" min="1" max="1000"')}${inp("xp", "XP", v.xp ?? 10, ' type="number" min="0" max="2000" step="5"')}<div class="bt-field"><label class="bt-label" for="id-aud">Audience</label><select class="bt-select" id="id-aud" name="audience">${Object.entries(A.AUDIENCE).map(([c, l]) => opt(c, l, v.audience || "all")).join("")}</select></div></div>`
      + inp("action", "Counts (the type's action, optional)", v.params?.action ?? "", ' maxlength="30"');
    return inp("name", "Badge name", v.name, ' maxlength="60"');
  };
  const { modal, close } = openModal({ feature: "factory", wide: kind === "activity", title: i ? "Edit idea" : "Add an idea", content: `${modalHeader(i ? "Edit idea" : "Add an idea")}
    <form class="bt-stack ff-form" novalidate>
      ${i ? "" : `<div class="bt-field"><label class="bt-label" for="id-kind">Kind</label><select class="bt-select" id="id-kind" name="kind">${(Object.keys(KIND_ONE) as Idea["kind"][]).map((k) => opt(k, KIND_ONE[k], kind)).join("")}</select></div>`}
      <div data-fields>${fields(kind)}</div>
      <p class="bt-error" hidden></p>
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--admin">${i ? "Save" : "Add idea"}</button></div>
    </form>` });
  const form = modal.querySelector("form")!, err = modal.querySelector<HTMLElement>(".bt-error")!;
  form.querySelector<HTMLSelectElement>('[name="kind"]')?.addEventListener("change", (e) => { kind = (e.target as HTMLSelectElement).value as Idea["kind"]; form.querySelector("[data-fields]")!.innerHTML = fields(kind); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const g = (n: string) => String(fd.get(n) ?? "").trim();
    const data: Record<string, unknown> = {};
    if (kind === "theme") Object.assign(data, { name: g("name"), pitch: g("pitch"), emoji: g("emoji") || null, tags: g("tags").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8) });
    if (kind === "chapter") Object.assign(data, { name: g("name"), theme: g("theme") || "Any theme" });
    if (kind === "campaign") Object.assign(data, { name: g("name"), cadence: g("cadence"), audience: g("audience") });
    if (kind === "activity") Object.assign(data, { title: g("title"), instructions: g("instructions"), typeId: g("typeId"), cadence: g("cadence"), audience: g("audience"), target: Math.round(Number(g("target")) || 1), xp: Math.round(Number(g("xp")) || 0), params: g("action") ? { action: g("action") } : {} });
    if (kind === "reward") Object.assign(data, { name: g("name") });
    if (!(data.name || data.title)) { err.textContent = "Give it a name."; err.hidden = false; return; }
    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    btn.disabled = true;
    try {
      const r = await A.ideaSave(i ? { id: i.id, data } : { kind, data });
      if (i) Object.assign(i, data); else ideas.push({ id: r.id, kind, ...(data as object), usedIn: [], retired: false, source: "admin" } as Idea);
      close(); toast(i ? "Idea saved." : "Idea added."); render();
    } catch (e2) { btn.disabled = false; err.textContent = messageFor(e2); err.hidden = false; }
  });
}
