// /live/control/checklist (docs/specs/control-room.md §5): the owner's four checklist templates (Start, Break 1, Break 2, End). OWNER ONLY: LiveLayout's
// ownerOnly gate shows the no-access state to everyone else, and this file asks for nothing unless the role is "owner". Add, edit, reorder (drag, or
// Alt+Up / Alt+Down, or the move buttons), platform-only or backstage-only, a shortcut that runs a control; saved with liveChecklist saveTemplates.
// Template edits only affect streams started afterwards. Preview (?as=admin, non-production): a local copy.
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { setLook } from "../../../../shared/ui/control-room.js";
import { onAccess } from "./layout";
import { makeApi } from "./api";
import { BEATS, BEAT_LABEL, type Beat, type CBeats, type CItem } from "./model";
import { SHORTCUT_LABEL } from "./rail";
import { esc, toast, messageFor, withBusy, mascotHtml, reduced } from "./ui";

const TEXT_MAX = 120, NOTE_MAX = 300, ITEMS_MAX = 40;
const uid = () => `t-${Math.random().toString(36).slice(2, 9)}`;

onAccess(async (s, role) => {
  if (role !== "owner") return;   // the gate already kept everyone else out; this is the second lock
  const root = document.querySelector<HTMLElement>("[data-lt]")!;
  const api = await makeApi(s);
  let data: CBeats;
  try {
    const t = await api.templates();   // OWNER ONLY read (live/main/private/checklistTemplates)
    data = (t?.beats || {}) as CBeats;
    const m = await api.main().catch(() => null);
    setLook(root, new URLSearchParams(location.search).get("look") === "crt" ? "crt" : m?.look || "hull");
  } catch (err) {
    root.innerHTML = `<div class="bt-empty"><div class="bt-empty-title">Couldn't load your templates</div><p>${esc(messageFor(err))}</p><button type="button" class="bt-btn bt-btn--secondary" onclick="location.reload()">Try again</button></div>`;
    return;
  }
  for (const k of BEATS) data[k] = (data[k] || []).map((x) => ({ ...x }));
  let dirty = false, focusKey = "";
  const setDirty = (v: boolean) => { dirty = v; const b = root.querySelector<HTMLButtonElement>("[data-save]"); if (b) b.disabled = !v; const st = root.querySelector("[data-state]"); if (st) st.textContent = v ? "Unsaved changes" : "Saved"; };
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  const rowHtml = (beat: Beat, it: CItem, i: number, n: number) => `<li class="lt-row" data-id="${esc(it.id)}" data-beat="${beat}">
    <button type="button" class="lt-grip" draggable="true" data-grip aria-label="Move: ${esc(it.text || "new item")}. Drag, or press Alt and the up or down arrow." title="Drag to reorder (Alt+Up / Alt+Down)"><svg viewBox="0 0 24 24" width="16" aria-hidden="true" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button>
    <div class="lt-fields">
      <label class="bt-sr-only" for="lt-t-${esc(it.id)}">Item text</label><input class="bt-input" id="lt-t-${esc(it.id)}" data-f="text" maxlength="${TEXT_MAX}" value="${esc(it.text)}" placeholder="What to do">
      <label class="bt-sr-only" for="lt-n-${esc(it.id)}">Note (optional)</label><input class="bt-input lt-note" id="lt-n-${esc(it.id)}" data-f="note" maxlength="${NOTE_MAX}" value="${esc(it.note || "")}" placeholder="Note (optional)">
      <div class="lt-opts">
        <label class="lt-sel"><span>Runs on</span><select class="bt-select" data-f="only"><option value=""${!it.only ? " selected" : ""}>Every stream</option><option value="platform"${it.only === "platform" ? " selected" : ""}>Platform streams only</option><option value="backstage"${it.only === "backstage" ? " selected" : ""}>Backstage only</option></select></label>
        <label class="lt-sel"><span>Shortcut</span><select class="bt-select" data-f="shortcut"><option value="">None</option>${Object.entries(SHORTCUT_LABEL).map(([v, l]) => `<option value="${v}"${it.shortcut === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      </div>
    </div>
    <div class="lt-tools"><button type="button" class="bt-icon-btn bt-icon-btn--sm" data-move="-1" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button><button type="button" class="bt-icon-btn bt-icon-btn--sm" data-move="1" aria-label="Move down"${i === n - 1 ? " disabled" : ""}>↓</button><button type="button" class="bt-icon-btn bt-icon-btn--sm" data-del aria-label="Delete this item">✕</button></div></li>`;

  const draw = () => {
    root.innerHTML = `<div class="lt-head"><div><h1 class="bt-title lc-title">Checklist templates</h1><p class="lc-hero-sub">Four lists, one per beat. Every stream gets a fresh copy when you press Start. Changes only affect streams you start afterwards.</p></div><div class="lt-save"><span class="lc-hint" data-state role="status">${dirty ? "Unsaved changes" : "Saved"}</span><button type="button" class="bt-btn bt-btn--primary" data-save${dirty ? "" : " disabled"}>Save templates</button></div></div>
      <div class="lt-grid">${BEATS.map((b) => crPanelHtml({ cls: "lt-panel", title: BEAT_LABEL[b], icon: "checklist", tagHtml: `<span class="bt-badge bt-badge--gray">${data[b].length} ${data[b].length === 1 ? "item" : "items"}</span>`,
        bodyHtml: (data[b].length ? `<ol class="lt-list" data-beat="${b}">${data[b].map((it, i) => rowHtml(b, it, i, data[b].length)).join("")}</ol>` : `<div class="lc-empty lc-empty--sm">${mascotHtml()}<p>Nothing on this list yet.</p></div>`)
          + `<div class="lt-add"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-add="${b}"${data[b].length >= ITEMS_MAX ? " disabled" : ""}>Add an item</button></div>` })).join("")}</div>`;
    if (focusKey) { const [id, what] = focusKey.split("|"); root.querySelector<HTMLElement>(`.lt-row[data-id="${id}"] ${what}`)?.focus(); focusKey = ""; }
  };
  const find = (row: HTMLElement) => { const b = row.dataset.beat as Beat; return { b, i: data[b].findIndex((x) => x.id === row.dataset.id) }; };
  const move = (b: Beat, i: number, to: number, key: string) => {
    if (to < 0 || to >= data[b].length || to === i) return;
    const [it] = data[b].splice(i, 1); data[b].splice(to, 0, it);
    focusKey = key; setDirty(true); draw();
  };

  root.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement, row = t.closest<HTMLElement>(".lt-row");
    if (!row || !t.dataset.f) return;
    const { b, i } = find(row), it = data[b][i], f = t.dataset.f as "text" | "note" | "only" | "shortcut";
    if (f === "text") it.text = t.value;
    else if (t.value) (it as any)[f] = t.value; else delete (it as any)[f];
    t.removeAttribute("aria-invalid");
    setDirty(true);
  });
  root.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLElement>(".lt-row");
    const add = t.closest<HTMLElement>("[data-add]");
    if (add) { const b = add.dataset.add as Beat; const it = { id: uid(), text: "" }; data[b].push(it); focusKey = `${it.id}|[data-f=text]`; setDirty(true); draw(); return; }
    if (row && t.closest("[data-del]")) { const { b, i } = find(row); data[b].splice(i, 1); setDirty(true); draw(); return; }
    if (row && t.closest("[data-move]")) { const { b, i } = find(row); const d = Number(t.closest<HTMLElement>("[data-move]")!.dataset.move); move(b, i, i + d, `${row.dataset.id}|[data-move="${d}"]:not([disabled])`); return; }
    if (t.closest("[data-save]")) {
      let firstBad: HTMLInputElement | null = null;
      root.querySelectorAll<HTMLInputElement>(".lt-row [data-f=text]").forEach((inp) => { if (!inp.value.trim()) { inp.setAttribute("aria-invalid", "true"); firstBad ||= inp; } });
      if (firstBad) { (firstBad as HTMLInputElement).focus(); toast("Every item needs some text.", { kind: "error" }); return; }
      await withBusy(t.closest<HTMLButtonElement>("[data-save]"), "Saving…", async () => {
        try {
          const beats = {} as CBeats;
          for (const b of BEATS) beats[b] = data[b].map((x) => ({ id: x.id, text: x.text.trim(), ...(x.note?.trim() ? { note: x.note.trim() } : {}), ...(x.only ? { only: x.only } : {}), ...(x.shortcut ? { shortcut: x.shortcut } : {}) }));
          await api.call("liveChecklist", { action: "saveTemplates", templates: { beats } });
          for (const b of BEATS) data[b] = beats[b];
          setDirty(false);
          if (!api.preview) toast("Templates saved. Your next stream starts with them.");
          celebrate();
        } catch (err) { toast(messageFor(err), { kind: "error" }); }
      });
    }
  });
  const celebrate = () => {
    const st = root.querySelector(".lt-save"); if (!st) return;
    const el = document.createElement("span"); el.className = "lt-stamp"; el.innerHTML = stampHtml({ label: "Saved", tone: "lime", size: "sm" });
    st.prepend(el); setTimeout(() => el.remove(), reduced() ? 1800 : 2400);
  };
  // keyboard: Alt+Up / Alt+Down moves the row you are in
  root.addEventListener("keydown", (e) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>(".lt-row"); if (!row) return;
    e.preventDefault();
    const { b, i } = find(row), d = e.key === "ArrowUp" ? -1 : 1;
    const inField = (e.target as HTMLElement).matches("[data-f=text]");
    move(b, i, i + d, `${row.dataset.id}|${inField ? "[data-f=text]" : "[data-grip]"}`);
  });
  // drag: grab a row's handle, drop on another row of the same list
  let dragging: HTMLElement | null = null;
  root.addEventListener("dragstart", (e) => {
    const g = (e.target as HTMLElement).closest<HTMLElement>("[data-grip]"); if (!g) return;
    dragging = g.closest<HTMLElement>(".lt-row"); dragging!.classList.add("is-drag");
    e.dataTransfer!.effectAllowed = "move"; e.dataTransfer!.setData("text/plain", dragging!.dataset.id!);
  });
  root.addEventListener("dragover", (e) => { const r = (e.target as HTMLElement).closest<HTMLElement>(".lt-row"); if (dragging && r && r.dataset.beat === dragging.dataset.beat) { e.preventDefault(); root.querySelectorAll(".is-over").forEach((x) => x.classList.remove("is-over")); if (r !== dragging) r.classList.add("is-over"); } });
  root.addEventListener("drop", (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>(".lt-row");
    if (!dragging || !r || r.dataset.beat !== dragging.dataset.beat) return;
    e.preventDefault();
    const a = find(dragging), b2 = find(r);
    move(a.b, a.i, b2.i, `${dragging.dataset.id}|[data-grip]`);
  });
  root.addEventListener("dragend", () => { dragging?.classList.remove("is-drag"); dragging = null; root.querySelectorAll(".is-over").forEach((x) => x.classList.remove("is-over")); });
  draw();
});
