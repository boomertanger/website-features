// /admin/boomertang, the desk (docs/specs/boomertang.md §5, §6 A1). Owner only: the page checks sites/{id}.ownerUid (lib/auth isOwner) and
// every action goes through tangAdmin, which refuses anyone else. Issues newest first (the Firestore docs: the owner reads drafts too) with
// the status badge, the free-for-everyone switch (locked on when the issue's text is in the repo), Publish (confirmAction, then the stamp),
// Preview for drafts and the edition log; the edition note; Chat's Verdict open / close / reopen. Off production, signed out, ?as=owner
// previews the desk's look (display only: nothing can be done without signing in as the owner).
import { onAuth } from "../../lib/auth";
import { call } from "../../lib/call";
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { isProduction } from "../../lib/env.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { thumbHtml } from "../../lib/boomertang/cover.js";
import { loadTang, type TangState } from "./access";

interface IssueMeta { id: string; vol: number; no: number; title: string; inRepo: boolean; sample: boolean; cover: any }
interface Meta { issues: IssueMeta[]; polls: { id: string; question: string; issueId: string; no: number }[] }
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const reason = (err: unknown) => (err as { details?: { reason?: string }; message?: string })?.details?.reason || "";

const root = document.getElementById("boomertang-root");
if (root?.classList.contains("tg-desk")) init(root);

function init(root: HTMLElement) {
  const meta = JSON.parse(root.querySelector("[data-desk-meta]")!.textContent || "{}") as Meta;
  const mascot = root.querySelector<HTMLTemplateElement>("[data-tang-mascot]")?.innerHTML.trim() || "";
  const state = (s: string) => { root.dataset.desk = s; };
  const rowsEl = root.querySelector<HTMLElement>("[data-desk-issues]")!, emptyEl = root.querySelector<HTMLElement>("[data-desk-empty]")!;
  const noteIssue = root.querySelector<HTMLSelectElement>("[data-desk-note-issue]")!, noteForm = root.querySelector<HTMLFormElement>("[data-desk-note]")!;
  const noteText = root.querySelector<HTMLInputElement>("#tg-note-text")!, noteCount = root.querySelector<HTMLElement>("[data-desk-note-count]")!;
  let tang: TangState | null = null, live = false, stampOn: { id: string; kind: "pub" | "note" } | null = null;

  async function load() {
    tang = await loadTang(meta.issues.map((i) => i.id));
    paintIssues(); await paintPolls();
  }

  function paintIssues() {
    const t = tang!;
    const seeded = meta.issues.filter((i) => t.issues[i.id]).sort((a, b) => (b.vol - a.vol) || (b.no - a.no));
    const published = seeded.filter((i) => t.issues[i.id]!.status === "published");
    root.querySelector("[data-desk-no]")!.textContent = `No. ${published[0]?.no ?? 1}`;
    rowsEl.innerHTML = seeded.map((i) => {
      const d = t.issues[i.id]!, draft = d.status !== "published", newest = t.currentIssueId === i.id;
      const free = i.inRepo || d.access === "public";
      const badge = draft ? '<span class="bt-badge bt-badge--blue">Draft</span>' : newest ? '<span class="bt-badge bt-badge--lime">Newest</span>' : '<span class="bt-badge bt-badge--gray">Back issue</span>';
      const access = i.inRepo ? "Free for everyone · in the repo" : free ? "Free for everyone" : newest ? "Sub Club first" : draft ? "Members only when published" : "Free with Fan Club";
      const sw = `<div class="tg-swrow"><button type="button" class="bt-switch" role="switch" aria-checked="${free}" aria-label="Free for everyone: No. ${i.no}" data-free="${esc(i.id)}"${i.inRepo || !live ? " disabled" : ""}></button><span>Free for everyone</span><small>${i.inRepo ? "Locked on: its text is in the repo" : free ? "Visitors can read it" : "Off: members only"}</small></div>`;
      const acts = draft ? `<div class="tg-acts"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-publish="${esc(i.id)}"${live ? "" : " disabled"}>Publish No. ${i.no}</button><a class="bt-btn bt-btn--secondary bt-btn--sm" href="/boomertang/vol-${i.vol}/no-${i.no}">Preview</a></div>` : "";
      const eds = d.editions || [];
      const log = eds.length ? `<div class="tg-dlog">${eds.slice(0, 3).map((e, k) => `<div class="${k === 0 && stampOn?.id === i.id && stampOn.kind === "note" ? "is-new" : ""}"><b>${day(e.date)}</b><span>${esc(e.note)}</span></div>`).join("")}</div>` : "";
      const stamp = stampOn?.id === i.id ? `<div class="tg-dstamp">${stampOn.kind === "pub" ? stampHtml({ kicker: "Out now", label: `No. ${i.no}`, sub: "Published", tone: "lime", size: "sm" }) : stampHtml({ kicker: "Edition", label: "✓", sub: "Updated", size: "sm" })}</div>` : "";
      return `<div class="tg-drow" data-issue="${esc(i.id)}">${thumbHtml(i)}<div><h3>No. ${i.no} · ${esc(i.title)}</h3><div class="tg-dmeta">${badge}<span>${esc(access)}</span>${i.sample ? '<span class="tg-sample">Sample</span>' : ""}</div>${sw}${acts}${log}</div>${stamp}</div>`;
    }).join("") || '<p class="tg-dp">No issue is seeded yet. Run functions/scripts/seed-boomertang.js (a dry run first).</p>';
    emptyEl.hidden = seeded.some((i) => t.issues[i.id]!.status !== "published");
    if (!emptyEl.querySelector(".bt-mascot") && mascot) emptyEl.insertAdjacentHTML("afterbegin", mascot);
    const cur = noteIssue.value;
    noteIssue.innerHTML = seeded.map((i) => `<option value="${esc(i.id)}">No. ${i.no} · ${esc(i.title)}</option>`).join("");
    if (cur && seeded.some((i) => i.id === cur)) noteIssue.value = cur;
  }

  async function paintPolls() {
    for (const el of root.querySelectorAll<HTMLElement>("[data-poll]")) {
      const id = el.dataset.poll!, btn = el.querySelector<HTMLButtonElement>("[data-poll-op]")!, m = el.querySelector<HTMLElement>("[data-poll-meta]")!;
      let p: any = null;
      try { const s = await getDoc(doc(db, "sites", SITE_ID, "tang", "main", "polls", id)); p = s.exists() ? s.data() : null; } catch { p = null; }
      if (!p) { btn.disabled = true; btn.textContent = "Not seeded"; m.textContent = "Seed the issue's polls first"; continue; }
      const n = Object.values(p.counts || {}).reduce((a: number, b) => a + Number(b), 0);
      btn.textContent = p.open ? "Close poll" : "Reopen"; btn.dataset.op = p.open ? "close" : "reopen"; btn.disabled = !live;
      m.textContent = `${n} vote${n === 1 ? "" : "s"} · ${p.open ? "Open" : "Closed: the final verdict"}`;
    }
  }

  root.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const pub = t.closest<HTMLButtonElement>("[data-publish]");
    if (pub && live) {
      const i = meta.issues.find((x) => x.id === pub.dataset.publish)!;
      const prev = tang!.currentIssueId ? meta.issues.find((x) => x.id === tang!.currentIssueId) : null;
      await confirmAction({
        title: `Publish No. ${i.no}?`,
        message: `No. ${i.no} becomes the newest issue (Sub Club first, unless it's free for everyone).${prev ? ` No. ${prev.no} becomes a back issue${prev.inRepo ? " and stays free for everyone" : ""}.` : ""} A "tang-issue" entry goes on the activity feed.`,
        confirmLabel: `Publish No. ${i.no}`, busyLabel: "Publishing…", danger: false, feature: "boomertang",
        onConfirm: async () => {
          await call("tangAdmin", { action: "publish", issueId: i.id });
          stampOn = { id: i.id, kind: "pub" };
          await load();
          toast(`No. ${i.no} is out.`, { kind: "ok", ms: 3600 });
        },
      });
      return;
    }
    const sw = t.closest<HTMLButtonElement>("[data-free]");
    if (sw && live && !sw.disabled) {
      const id = sw.dataset.free!, on = sw.getAttribute("aria-checked") !== "true";
      sw.disabled = true;
      try {
        await call("tangAdmin", { action: "setAccess", issueId: id, access: on ? "public" : "members" });
        await load();
        toast(on ? "Free for everyone. Readable now; search engines index it once its files move into the repo." : "Members only again.", { kind: "ok", ms: 4800 });
      } catch (err) {
        toast(reason(err) === "textInRepo" ? "This issue's text is in the repo, so it's always free for everyone." : "That didn't save. Try again.", { kind: "info", ms: 4800 });
        sw.disabled = false;
      }
      return;
    }
    const op = t.closest<HTMLButtonElement>("[data-poll-op]");
    if (op && live && op.dataset.op) {
      const id = op.closest<HTMLElement>("[data-poll]")!.dataset.poll!;
      op.disabled = true;
      try {
        await call("tangAdmin", { action: "poll", pollId: id, op: op.dataset.op });
        toast(op.dataset.op === "close" ? "Poll closed. Its result becomes the final verdict." : "Poll reopened.", { kind: "ok", ms: 3600 });
      } catch { toast("That didn't save. Try again.", { kind: "info", ms: 4000 }); }
      await paintPolls();
    }
  });

  noteText.addEventListener("input", () => { noteCount.textContent = `${noteText.value.length} / 120`; });
  noteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!live) return;
    const note = noteText.value.replace(/\s+/g, " ").trim();
    if (!note) { toast("Write what changed first.", { kind: "info", ms: 3000 }); noteText.focus(); return; }
    const btn = noteForm.querySelector<HTMLButtonElement>("button[type=submit]")!;
    btn.disabled = true;
    try {
      await call("tangAdmin", { action: "addEdition", issueId: noteIssue.value, note });
      stampOn = { id: noteIssue.value, kind: "note" };
      noteText.value = ""; noteCount.textContent = "0 / 120";
      await load();
      toast("Added to the edition log.", { kind: "ok", ms: 3200 });
    } catch (err) {
      toast(reason(err) === "badNote" ? "An edition note is 1 to 120 characters." : "That didn't save. Try again.", { kind: "info", ms: 4000 });
    } finally { btn.disabled = false; }
  });

  onAuth(async (s) => {
    if (s.status === "loading") return;
    const signedIn = !!s.user && (s.status === "verified" || s.status === "unverified");
    const preview = !isProduction && !signedIn && new URLSearchParams(location.search).get("as") === "owner";
    if (!signedIn && !preview) { state("join"); return; }
    if (signedIn && !s.isOwner) { state("denied"); return; }
    live = signedIn && !!s.isOwner;
    state("page");
    try { await load(); } catch (err) { console.warn("desk: couldn't load", err); rowsEl.innerHTML = '<p class="tg-dp">Couldn\'t load the issues. Try again in a minute.</p>'; }
  });
}
