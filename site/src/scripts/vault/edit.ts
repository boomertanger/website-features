// Edit a Vault game (admins; round 1 E3, the kit's admin edit mode). Saves through adminEditItem
// with feature "vaultGame": only the fields that changed go, each with the value the editor loaded
// as `before`, so the server can refuse an edit made on stale data. A new cover is cropped to 3:4,
// uploaded with a signature from vaultCoverSignature, then saved as cover { action: "replace" }.
// Delete (red, confirmAction) goes through vaultDeleteGame, which refuses a game any stream uses.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { coverHtml } from "../../../../shared/ui/cover.js";
import { call } from "../../lib/call";
import { messageFor, reasonOf } from "../../lib/errors";
import { esc, STATUS, STATUS_KEYS } from "./ui";
import { coverPicker, uploadSigned } from "./crop";

const LINKS: [string, string][] = [["steam", "Steam"], ["gog", "GOG"], ["itch", "itch.io"], ["epic", "Epic Games Store"], ["official", "Official site"]];
const isoDay = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

/** The editor's starting values, in the exact shapes adminEditItem compares (edit.js currentValue). */
function beforeOf(g: any) {
  return {
    status: g.status,
    review: g.review ? { score: g.review.score, verdict: g.review.verdict || "", body: g.review.body || "" } : null,
    boomerTags: g.tags?.boomer || [],
    legacy: { streamCount: g.legacy?.streamCount || 0, minutes: g.legacy?.minutes || 0, lastStreamedAt: g.legacy?.lastStreamedAt || null },
    summary: g.summary || "",
    links: g.links || {},
    cover: g.cover || null,
  };
}

export function openEditor(g: any, { onSaved }: { onSaved: () => void }) {
  const before: any = beforeOf(g);
  let tags = [...before.boomerTags];
  let coverAction: null | { action: "replace"; blob: Blob } | { action: "remove" } = null;
  const coverSource = g.cover?.source === "upload" ? "Using an uploaded cover." : g.cover?.source === "steam" ? "Using Steam's cover." : g.cover ? "Using the IGDB cover." : "No cover: the mascot shows.";
  const scoreOpts = `<option value="">Not rated</option>${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}"${before.review?.score === i + 1 ? " selected" : ""}>${i + 1}</option>`).join("")}`;
  const legacyHours = before.legacy.minutes ? Math.round((before.legacy.minutes / 60) * 10) / 10 : "";
  const content = `<div class="bt-edit-banner"><span class="bt-admin-tag bt-admin-tag--small">Editing as admin</span><span class="bt-meta">Changes are logged</span></div>
  ${modalHeader(esc(g.title), g.createdAt ? `Added ${new Date(g.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "")}
  <form class="bt-stack" style="gap:16px" data-form novalidate>
    <div class="gv-form-grid">
      <div class="bt-field"><label class="bt-label" for="gv-st">Status</label><select class="bt-select" id="gv-st" data-f="status">${STATUS_KEYS.map((k) => `<option value="${k}"${g.status === k ? " selected" : ""}>${STATUS[k][0]}</option>`).join("")}</select></div>
      <div class="bt-field"><label class="bt-label" for="gv-sc">Boomer's score</label><select class="bt-select" id="gv-sc" data-f="score">${scoreOpts}</select></div>
    </div>
    <div class="bt-field"><label class="bt-label" for="gv-vd">Verdict</label><input class="bt-input" id="gv-vd" data-f="verdict" maxlength="140" value="${esc(before.review?.verdict || "")}"><span class="bt-hint" data-count-for="verdict"></span></div>
    <div class="bt-field"><label class="bt-label" for="gv-rv">Review</label><textarea class="bt-textarea" id="gv-rv" rows="6" maxlength="3000" data-f="body">${esc(before.review?.body || "")}</textarea><span class="bt-hint" data-count-for="body"></span></div>
    <div class="bt-field"><span class="bt-label" id="gv-tg-l">Boomer's tags</span><div class="gv-tag-editor" data-tags role="group" aria-labelledby="gv-tg-l"></div><span class="bt-hint">Shown beside the automatic tags from IGDB. Up to 12, press Enter to add.</span></div>
    <div class="gv-form-grid">
      <div class="bt-field"><label class="bt-label" for="gv-ls">Earlier streams</label><input class="bt-input" id="gv-ls" type="number" min="0" max="100000" step="1" data-f="lstreams" value="${before.legacy.streamCount || ""}"></div>
      <div class="bt-field"><label class="bt-label" for="gv-lh">Hours</label><input class="bt-input" id="gv-lh" type="number" min="0" step="0.5" data-f="lhours" value="${legacyHours}"></div>
      <div class="bt-field"><label class="bt-label" for="gv-ll">Last streamed</label><input class="bt-input" id="gv-ll" type="date" data-f="llast" value="${isoDay(before.legacy.lastStreamedAt)}"></div>
    </div>
    <span class="bt-hint" style="margin-top:-8px">History from before the site; it's added into the game's stats.</span>
    <div class="bt-field"><label class="bt-label" for="gv-sm">Summary</label><textarea class="bt-textarea" id="gv-sm" rows="4" maxlength="2000" data-f="summary">${esc(before.summary)}</textarea></div>
    <div class="gv-form-grid">${LINKS.map(([k, l]) => `<div class="bt-field"><label class="bt-label" for="gv-ln-${k}">${l}</label><input class="bt-input" id="gv-ln-${k}" type="url" placeholder="https://" data-link="${k}" value="${esc(before.links[k] || "")}"></div>`).join("")}</div>
    <div class="bt-field"><span class="bt-label">Cover</span><div class="gv-edit-cover"><span data-cover-now>${coverHtml(g.cover)}</span><div class="bt-stack" style="gap:8px"><span class="bt-hint" data-cover-note>${coverSource}</span><div data-cover-pick></div>${g.cover?.source === "upload" ? '<button type="button" class="bt-link-btn" data-cover-remove>Go back to the IGDB or Steam cover</button>' : ""}</div></div></div>
    <div class="bt-field"><label class="bt-label" for="gv-rs">Reason for the edit</label><input class="bt-input" id="gv-rs" data-f="reason" maxlength="300" placeholder="Optional, only admins see it"></div>
    <p class="bt-notice bt-notice--error" data-err role="alert" hidden></p>
    <div class="gv-edit-actions"><button type="button" class="bt-btn bt-btn--danger" data-delete>Delete game</button><span><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--admin" data-save>Save changes</button></span></div>
  </form>`;
  const m = openModal({ title: `Edit ${g.title}`, wide: true, variant: "editing", feature: "game-vault", content });
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => m.modal.querySelector<T>(s)!;
  const val = (f: string) => ($<HTMLInputElement>(`[data-f="${f}"]`).value || "");
  const err = $("[data-err]");
  const showErr = (msg: string) => { err.textContent = msg; err.hidden = !msg; if (msg) err.scrollIntoView({ block: "nearest" }); };

  // character counts
  const counter = (f: string, max: number) => { const out = $(`[data-count-for="${f}"]`); const upd = () => { out.textContent = `${val(f).trim().length} of ${max.toLocaleString("en-US")} characters`; }; $(`[data-f="${f}"]`).addEventListener("input", upd); upd(); };
  counter("verdict", 140); counter("body", 3000);

  // tags
  const tagBox = $("[data-tags]");
  const drawTags = () => {
    tagBox.innerHTML = `${tags.map((t, i) => `<span class="bt-tag">${esc(t)}<button type="button" data-untag="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join("")}${tags.length < 12 ? '<input type="text" maxlength="30" placeholder="Add a tag" aria-label="Add a tag" data-newtag>' : ""}`;
  };
  tagBox.addEventListener("click", (e) => { const b = (e.target as Element).closest<HTMLElement>("[data-untag]"); if (b) { tags.splice(Number(b.dataset.untag), 1); drawTags(); } });
  tagBox.addEventListener("keydown", (e) => {
    const inp = e.target as HTMLInputElement;
    if (!inp.matches("[data-newtag]") || (e.key !== "Enter" && e.key !== ",")) return;
    e.preventDefault();
    const t = inp.value.replace(/\s+/g, " ").trim();
    if (t && !tags.includes(t) && tags.length < 12) { tags.push(t); drawTags(); tagBox.querySelector<HTMLInputElement>("[data-newtag]")?.focus(); }
  });
  drawTags();

  // cover
  coverPicker($("[data-cover-pick]"), { onReady: (blob) => { coverAction = blob ? { action: "replace", blob } : null; } });
  m.modal.querySelector("[data-cover-remove]")?.addEventListener("click", (e) => {
    coverAction = { action: "remove" };
    $("[data-cover-note]").textContent = "Saving goes back to the IGDB or Steam cover.";
    (e.currentTarget as HTMLElement).remove();
  });

  // delete
  $("[data-delete]").addEventListener("click", () => confirmAction({
    title: `Delete ${g.title}?`,
    message: "It's removed from the Vault with its cover, wants and updates. This can't be undone. A game that appears in any stream can't be deleted; set it to Abandoned instead.",
    confirmLabel: "Delete game", busyLabel: "Deleting…", danger: true, feature: "game-vault",
    onConfirm: async () => {
      try { await call("vaultDeleteGame", { slug: g.slug }); }
      catch (e) { throw new Error(messageFor(e)); }
      m.close();
      location.href = "/games";
    },
  }));

  // save
  $<HTMLFormElement>("[data-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr("");
    const changes: Record<string, any> = {};
    const status = val("status");
    if (status !== before.status) changes.status = status;
    const score = val("score") ? Number(val("score")) : null;
    const verdict = val("verdict").trim(), body = val("body").trim();
    const review = score ? { score, verdict, body } : null;
    if (!score && (verdict || body)) return showErr("Pick a score to save a verdict or review (or clear them).");
    if (JSON.stringify(review) !== JSON.stringify(before.review)) changes.review = review;
    if (JSON.stringify(tags) !== JSON.stringify(before.boomerTags)) changes.boomerTags = tags;
    const ls = Number(val("lstreams") || 0), lh = Number(val("lhours") || 0), ll = val("llast");
    if (!Number.isInteger(ls) || ls < 0 || lh < 0) return showErr("Earlier streams and hours must be zero or more.");
    const legacy = { streamCount: ls, minutes: Math.round(lh * 60), lastStreamedAt: ll ? Date.parse(`${ll}T12:00:00Z`) : null };
    if (JSON.stringify(legacy) !== JSON.stringify(before.legacy)) changes.legacy = legacy;
    if (val("summary").trim() !== before.summary.trim()) changes.summary = val("summary").trim();
    const links: Record<string, string> = {};
    m.modal.querySelectorAll<HTMLInputElement>("[data-link]").forEach((i) => { links[i.dataset.link!] = i.value.trim(); });
    const sameLinks = LINKS.every(([k]) => (links[k] || "") === (before.links[k] || ""));
    if (!sameLinks) {
      if (Object.values(links).some((u) => u && !/^https:\/\//i.test(u))) return showErr("Links must start with https://");
      changes.links = links;
    }
    const save = $<HTMLButtonElement>("[data-save]");
    save.disabled = true; save.textContent = "Saving…";
    try {
      if (coverAction?.action === "replace") {
        save.textContent = "Uploading the cover…";
        const sig = await call<{ uploadUrl: string; fields: Record<string, string> }>("vaultCoverSignature", {});
        const up = await uploadSigned(sig, coverAction.blob);
        changes.cover = { action: "replace", publicId: up.public_id };
      } else if (coverAction?.action === "remove") changes.cover = { action: "remove" };
      if (!Object.keys(changes).length) { m.close(); return; }
      const sentBefore = Object.fromEntries(Object.keys(changes).map((k) => [k, before[k]]));
      save.textContent = "Saving…";
      await call("adminEditItem", { feature: "vaultGame", id: g.slug, changes, before: sentBefore, reason: val("reason").trim() });
      m.close();
      onSaved();
    } catch (e2) {
      showErr(reasonOf(e2) === "conflict" ? "This was changed while you were editing. Close and open it again to see the latest." : messageFor(e2));
      save.disabled = false; save.textContent = "Save changes";
    }
  });
}

