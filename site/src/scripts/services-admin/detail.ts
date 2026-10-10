// /admin/services: a service's detail dialog (docs/specs/service-hub.md §7; mockup section 8): health numbers, ratings by version, comments (Hide / Show),
// tests, video, bugs and ideas, version history, and the admin panel (Mark tested, Link video, Set video's version, Retire / Restore, Hide / Show).
// Also the Mark tested and Link video dialogs on their own (Needs attention rows open them straight away), and the Settings panel's Crew task Gears card.
// Every change goes through serviceAdmin; the page re-reads the summary afterwards (onChange / onDone).
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { RATE_ICON, RATE_LABEL } from "../../../../shared/ui/rate.js";
import { messageFor } from "../../lib/errors";
import type { Api, Row, Detail } from "./data";
import { esc, IC, TYPES, thumb, statusBadge, scoreText, ratingBar, inds, nope7, mascot } from "./ui";

const FEATURE = "services";
const day = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "–");
const sect = (title: string, body: string, tools = "") => `<section class="bt-section"><div class="bt-section-head"><h3 class="bt-label">${esc(title)}</h3>${tools}</div>${body}</section>`;
const radios = (name: string, label: string, opts: [string, string][], pick: string) =>
  `<div class="bt-field"><span class="bt-label" id="as-${name}-l">${esc(label)}</span><div class="as-pills"><div class="bt-view-switch" role="radiogroup" aria-labelledby="as-${name}-l" data-radio="${name}">${opts.map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${v === pick}">${esc(l)}</button>`).join("")}</div></div></div>`;
function wireRadios(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>("[data-radio]").forEach((g) => g.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[role=radio]");
    if (!b) return;
    g.querySelectorAll("[role=radio]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    g.dispatchEvent(new CustomEvent("pick", { detail: b.dataset.v }));
  }));
}
const radioVal = (el: HTMLElement, name: string) => el.querySelector<HTMLElement>(`[data-radio="${name}"] [aria-checked="true"]`)?.dataset.v || "";
const showErr = (el: HTMLElement, msg: string) => { const p = el.querySelector<HTMLElement>(".bt-error"); if (p) { p.textContent = msg; p.hidden = !msg; } };
/** A YouTube watch, short or embed URL (or a bare id) → the video id. */
export function youtubeId(s: string): string | null {
  const t = s.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
  try {
    const u = new URL(t);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return /^[A-Za-z0-9_-]{6,40}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v") || u.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,40})/)?.[1] || null;
      return v && /^[A-Za-z0-9_-]{6,40}$/.test(v) ? v : null;
    }
  } catch { /* not a URL */ }
  return null;
}

// ---------------------------------------------------------------------------------------------- the detail dialog
interface Opts { api: Api; id: string; row: Row; onChange: () => Promise<Row[]>; onClose?: () => void }
export async function openDetail(o: Opts) {
  let row = o.row, d: Detail | null = null, err = "";
  const { modal } = openModal({ feature: FEATURE, wide: true, title: row.name, content: shell(row, `<div class="as-empty" aria-busy="true"><p>Loading ${esc(row.name)}…</p></div>`), onClose: o.onClose } as Parameters<typeof openModal>[0]);
  const draw = () => { modal.innerHTML = shell(row, err ? `<div class="as-empty">${mascot()}<p>${esc(err)}</p></div>` : d ? body(row, d) : ""); wire(); };
  const reload = async () => {
    try { d = await o.api.detail(o.id); err = ""; } catch (e) { err = messageFor(e, "Couldn't read this service. Try again."); }
    // the page re-reads the summary; pick up this row's new numbers from it
    const fresh = (await o.onChange())?.find((r) => r.id === o.id);
    if (fresh) row = fresh;
    if (o.api.preview && d) d.item = { ...d.item, ...row };
    draw();
  };
  const act = async (action: string, data: Record<string, unknown>, done: string) => {
    await o.api.admin(action, { serviceId: o.id, ...data });
    toast(done);
    await reload();
  };
  function wire() {
    wireRadios(modal);
    modal.querySelector("[data-as-test]")?.addEventListener("click", () => void openMarkTested({ api: o.api, row, onDone: reload }));
    modal.querySelector("[data-as-video]")?.addEventListener("click", () => void openLinkVideo({ api: o.api, row, onDone: reload }));
    modal.querySelector<HTMLFormElement>("[data-as-covers]")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget as HTMLFormElement, v = (f.querySelector("input") as HTMLInputElement).value.trim(), b = f.querySelector("button")!;
      if (!v) return;
      b.disabled = true;
      try { await act("setCoversVersion", { version: v }, `The video now covers v${v}.`); } catch (er) { b.disabled = false; toast(messageFor(er), { kind: "error" }); }
    });
    modal.querySelector("[data-as-retire]")?.addEventListener("click", () => {
      const retired = row.status === "retired";
      void confirmAction({
        feature: FEATURE, danger: false, title: retired ? `Restore ${row.name}?` : `Retire ${row.name}?`,
        message: retired ? "It goes back to the status it had before, and members can rate it again." : "It leaves the member views and can't be rated. Its ratings, tests and history stay.",
        confirmLabel: retired ? "Restore" : "Retire", busyLabel: retired ? "Restoring…" : "Retiring…",
        onConfirm: () => act(retired ? "restore" : "retire", {}, retired ? `${row.name} is back.` : `${row.name} is retired.`),
      });
    });
    modal.querySelector("[data-as-hide]")?.addEventListener("click", () => {
      const hide = !row.hidden;
      void confirmAction({
        feature: FEATURE, danger: false, title: hide ? `Hide ${row.name}?` : `Show ${row.name}?`,
        message: hide ? "Members stop seeing it in the Service Hub (its page and ratings stay). Use it for a service that isn't ready to show." : "Members see it in the Service Hub again.",
        confirmLabel: hide ? "Hide" : "Show", busyLabel: hide ? "Hiding…" : "Showing…",
        onConfirm: () => act("hide", { hidden: hide }, hide ? `${row.name} is hidden.` : `${row.name} shows again.`),
      });
    });
    modal.querySelectorAll<HTMLElement>("[data-as-cmt]").forEach((b) => b.addEventListener("click", () => {
      const c = d?.comments.find((x) => x.commentId === b.dataset.asCmt);
      if (!c) return;
      const hide = !c.hidden;
      void confirmAction({
        feature: FEATURE, danger: false, title: hide ? "Hide this comment?" : "Show this comment?",
        message: hide ? "Only admins will see it. The rating still counts." : "It shows on the service's comments again.",
        confirmLabel: hide ? "Hide" : "Show", busyLabel: hide ? "Hiding…" : "Showing…",
        onConfirm: async () => {
          await o.api.admin("hideComment", { serviceId: o.id, commentId: c.commentId, hidden: hide });
          c.hidden = hide; toast(hide ? "Comment hidden." : "Comment shows again."); draw();
        },
      });
    }));
  }
  try { d = await o.api.detail(o.id); } catch (e) { err = messageFor(e, "Couldn't read this service. Try again."); }
  draw();
}

function shell(r: Row, inner: string) {
  const link = r.link && r.link.startsWith("/") ? `<a class="bt-btn bt-btn--sm bt-btn--ghost" href="${esc(r.link)}" target="_blank" rel="noopener">Open the page</a>` : "";
  return modalHeader(esc(r.name), `${esc(TYPES[r.type]?.[1] || r.type)} · v${esc(r.version)} · ${esc(r.area)}`, link) + `<div class="bt-modal-body">${inner}</div>`;
}

function body(r: Row, d: Detail) {
  const n7 = nope7(r), live = r.status === "live";
  const health = `<div class="as-health">
    <div><b>${r.ratings.n}</b><span>Members rated${r.coverage ? ` · ${r.coverage}% coverage` : ""}</span></div>
    <div><b>${scoreText(r.ratings.score)}</b><span>Popularity (−2 to +2)</span></div>
    <div><b>${r.ratings.lovePct}%</b><span>Love it</span></div>
    <div><b>${n7 || r.ratings.dislikePct + "%"}</b><span>${n7 ? "New Not for me (7 days)" : "Not for me"}</span></div>
  </div>`;
  const top = `<div class="as-mapcard">${thumb(r)}<div>${statusBadge(r)}${inds(r)}<span class="bt-meta">${esc(r.blurb)}</span></div></div>`;
  const maxV = Math.max(1, ...d.byVersion.map((v) => v.love + v.like + v.dislike));
  const vers = d.byVersion.length
    ? `<div class="as-vers">${d.byVersion.map((v) => { const n = v.love + v.like + v.dislike; return `<div><span class="bt-meta">v${esc(v.version)}</span><div style="width:${Math.max(30, Math.round((n / maxV) * 100))}%">${ratingBar({ ...r, ratings: { ...r.ratings, love: v.love, like: v.like, dislike: v.dislike, n } })}</div></div>`; }).join("")}</div>`
    : `<p class="bt-meta">No ratings yet.</p>`;
  const vk = (v: string) => (v === "dislike" ? "nope" : v) as "nope" | "like" | "love";
  const cmts = d.comments.length
    ? `<div class="as-cmt">${d.comments.map((c) => `<div class="as-cmt-row${c.hidden ? " is-hidden" : ""}"><span class="as-rv" data-v="${esc(c.value)}" title="${esc(RATE_LABEL[vk(c.value)])}">${RATE_ICON[vk(c.value)]}</span><div><span class="bt-meta"><b>${esc(c.handle || "A member")}</b> · ${esc(RATE_LABEL[vk(c.value)])}${c.version ? ` · v${esc(c.version)}` : ""} · ${day(c.at)}${c.counted ? "" : " · staff, not counted"}${c.hidden ? " · hidden" : ""}</span><p>${esc(c.comment)}</p></div><button type="button" class="bt-btn bt-btn--sm bt-btn--ghost" data-as-cmt="${esc(c.commentId)}">${c.hidden ? "Show" : "Hide"}</button></div>`).join("")}</div>`
    : `<p class="bt-meta">No comments yet.</p>`;
  const mark = (env: "staging" | "production", label: string, state: string) => {
    const m = r.tests[env];
    if (!m) return `<li><b>${label}:</b> not tested</li>`;
    return `<li><b>${label}:</b> ${m.result === "issues" ? "issues" : "passed"} on v${esc(m.version)}${state === "old" ? " (older version)" : ""}, ${day(m.at)}${m.by?.handle ? ` by @${esc(String(m.by.handle).replace(/^@/, ""))}` : ""}${m.note ? ` · ${esc(m.note)}` : ""}</li>`;
  };
  const ct = r.communityTests;
  const tests = `<ul class="as-hist">${mark("staging", "Staging", r.stagingTest)}${mark("production", "Production", r.productionTest)}<li><b>Member tests:</b> ${!r.checks.length ? "no checks in the manifest" : ct && ct.version === r.version ? `${ct.pass} passed, ${ct.problems} found problems on v${esc(ct.version)}` : `none on v${esc(r.version)} yet`}</li></ul>`;
  const video = r.video
    ? `<p class="bt-meta"><a href="https://www.youtube.com/watch?v=${encodeURIComponent(r.video.id)}" target="_blank" rel="noopener">${esc(r.video.title || "Watch on YouTube")}</a> · covers v${esc(r.video.coversVersion || r.version)}${r.videoState === "stale" ? ` (the service is on v${esc(r.version)})` : ""}</p>`
      + `<form class="as-acts" data-as-covers><label class="bt-label" for="as-covers">Video covers version</label><input class="bt-input" id="as-covers" value="${esc(r.video.coversVersion || "")}" maxlength="20" style="max-width:120px"><button type="submit" class="bt-btn bt-btn--sm bt-btn--secondary">Save</button></form>`
    : `<p class="bt-meta">No video linked.</p>`;
  const links = `<p class="bt-meta"><b>${r.bugs.open}</b> open bug${r.bugs.open === 1 ? "" : "s"} · <a href="/bug-zapper">Bug Zapper</a> &nbsp;·&nbsp; <b>${r.ideas.open}</b> open idea${r.ideas.open === 1 ? "" : "s"} · <a href="/feature-lab">Feature Lab</a></p>`;
  const hist = `<ol class="as-hist">${d.versionHistory.map((v) => `<li>v${esc(v.version)} · ${day(v.at)}</li>`).join("") || "<li>No history yet.</li>"}</ol>`;
  const admin = `<div class="bt-admin-panel"><span class="bt-admin-tag">Admin</span><div class="as-acts">
      <button type="button" class="bt-btn bt-btn--sm bt-btn--admin" data-as-test>${IC.check}Mark tested</button>
      <button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-as-video>${IC.play}${r.video ? "Change video" : "Link video"}</button>
      <button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-as-retire>${r.status === "retired" ? "Restore" : "Retire"}</button>
      <button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-as-hide>${r.hidden ? "Show" : "Hide"}</button>
    </div>${live ? "" : `<p class="bt-meta">Status ${esc(r.status)}: the manifest sets planned, building and live; Retire and Restore are kept across syncs.</p>`}</div>`;
  return top + health + sect("Ratings by version", vers) + sect(`Comments (${d.comments.length})`, cmts) + sect("Tests", tests) + sect("Video", video) + sect("Bugs and ideas", links) + sect("Version history", hist) + admin;
}

// ---------------------------------------------------------------------------------------------- Mark tested
export async function openMarkTested({ api, row, onDone }: { api: Api; row: Row; onDone: () => unknown }) {
  const { modal, close } = openModal({
    feature: FEATURE, title: `Mark ${row.name} tested`,
    content: modalHeader(`Mark tested`, `${esc(row.name)} v${esc(row.version)}`) + `<form class="bt-modal-body bt-stack" data-as-form>
      ${radios("env", "Where", [["staging", "Staging"], ["production", "Production"]], "staging")}
      ${radios("result", "Result", [["pass", "It passed"], ["issues", "Found issues"]], "pass")}
      <div class="bt-field"><label class="bt-label" for="as-note">Note <span class="bt-meta" data-as-req>(optional)</span></label><textarea class="bt-textarea" id="as-note" rows="3" maxlength="300" placeholder="What you checked, or what's wrong"></textarea></div>
      <p class="bt-error" role="alert" hidden></p>
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--admin">Mark tested</button></div>
    </form>`,
  });
  wireRadios(modal);
  modal.querySelector('[data-radio="result"]')?.addEventListener("pick", (e) => { modal.querySelector("[data-as-req]")!.textContent = (e as CustomEvent).detail === "issues" ? "(required)" : "(optional)"; });
  modal.querySelector<HTMLFormElement>("[data-as-form]")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const env = radioVal(modal, "env"), result = radioVal(modal, "result"), note = (modal.querySelector("#as-note") as HTMLTextAreaElement).value.trim();
    if (result === "issues" && !note) { showErr(modal, "Say what the issues are."); return; }
    const btn = modal.querySelector<HTMLButtonElement>("button[type=submit]")!;
    btn.disabled = true; showErr(modal, "");
    try {
      await api.admin("markTested", { serviceId: row.id, env, result, note });
      modal.innerHTML = modalHeader("Mark tested", `${esc(row.name)} v${esc(row.version)}`) + `<div class="bt-modal-body bt-stack"><div class="as-stampbox">${stampHtml({ label: "Tested", kicker: env === "staging" ? "Staging" : "Production", sub: `v${row.version}`, tone: "lime" })}</div><p class="bt-meta" style="text-align:center">${result === "issues" ? "Logged with issues. File them in Bug Zapper so they get fixed." : "Logged. Thanks for checking it."}</p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary" data-bt-close>Done</button></div></div>`;
      await onDone();
    } catch (er) { btn.disabled = false; showErr(modal, messageFor(er)); }
  });
  return close;
}

// ---------------------------------------------------------------------------------------------- Link video
export async function openLinkVideo({ api, row, onDone }: { api: Api; row: Row; onDone: () => unknown }) {
  const { modal, close } = openModal({
    feature: FEATURE, title: `Link a video to ${row.name}`,
    content: modalHeader("Link video", esc(row.name)) + `<form class="bt-modal-body bt-stack" data-as-form>
      <div class="bt-field"><label class="bt-label" for="as-yt">YouTube link</label><input class="bt-input" id="as-yt" type="url" placeholder="https://www.youtube.com/watch?v=…" value="${row.video ? `https://youtu.be/${esc(row.video.id)}` : ""}" required></div>
      <div class="bt-field"><label class="bt-label" for="as-yt-t">Title (optional)</label><input class="bt-input" id="as-yt-t" maxlength="120" value="${esc(row.video?.title || "")}"></div>
      <div class="bt-field"><label class="bt-label" for="as-yt-v">Covers version</label><input class="bt-input" id="as-yt-v" maxlength="20" value="${esc(row.version)}" style="max-width:140px"><span class="bt-hint">The version the video shows. It turns stale when the service moves past it.</span></div>
      <p class="bt-error" role="alert" hidden></p>
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--admin">Link video</button></div>
    </form>`,
  });
  modal.querySelector<HTMLFormElement>("[data-as-form]")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = youtubeId((modal.querySelector("#as-yt") as HTMLInputElement).value);
    if (!id) { showErr(modal, "That isn't a YouTube link."); return; }
    const btn = modal.querySelector<HTMLButtonElement>("button[type=submit]")!;
    btn.disabled = true; showErr(modal, "");
    try {
      await api.admin("linkVideo", { serviceId: row.id, videoId: id, title: (modal.querySelector("#as-yt-t") as HTMLInputElement).value.trim(), coversVersion: (modal.querySelector("#as-yt-v") as HTMLInputElement).value.trim() || row.version });
      toast(`Video linked to ${row.name}.`);
      close();
      await onDone();
    } catch (er) { btn.disabled = false; showErr(modal, messageFor(er)); }
  });
  return close;
}

// ---------------------------------------------------------------------------------------------- Settings: Crew task Gears (owner and A2+)
export async function settingsHtml(api: Api) {
  let gears = { test: 15, problems: 10 };
  if (!api.preview) {
    try {
      const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
      const g = (await getDoc(doc(db, "sites", SITE_ID, "crew", "main"))).get("serviceTaskGears");
      if (g) gears = { test: Number(g.test) || 15, problems: Number(g.problems) || 10 };
    } catch { /* the defaults */ }
  }
  return `<div class="bt-admin-panel" data-as-settings-panel><span class="bt-admin-tag">Settings</span><form class="bt-stack" data-as-gears>
    <div><b>Crew task Gears</b><p class="bt-meta">What a crew member earns for the Service Hub's system tasks. 5 to 50 each. Owner and A2 Overseers and up.</p></div>
    <div class="as-acts"><div class="bt-field"><label class="bt-label" for="as-g-test">Test a new version</label><input class="bt-input" id="as-g-test" type="number" min="5" max="50" step="1" value="${gears.test}" style="max-width:110px"></div>
    <div class="bt-field"><label class="bt-label" for="as-g-prob">Look into Not for me</label><input class="bt-input" id="as-g-prob" type="number" min="5" max="50" step="1" value="${gears.problems}" style="max-width:110px"></div></div>
    <p class="bt-error" role="alert" hidden></p>
    <div class="as-acts"><button type="submit" class="bt-btn bt-btn--sm bt-btn--admin">Save Gears</button><button type="button" class="bt-btn bt-btn--sm bt-btn--ghost" data-as-settings>Close</button></div>
  </form></div>`;
}
export function wireSettings(el: HTMLElement, api: Api) {
  const f = el.querySelector<HTMLFormElement>("[data-as-gears]");
  f?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const test = Number((f.querySelector("#as-g-test") as HTMLInputElement).value), problems = Number((f.querySelector("#as-g-prob") as HTMLInputElement).value);
    const ok = (n: number) => Number.isInteger(n) && n >= 5 && n <= 50;
    if (!ok(test) || !ok(problems)) { showErr(f, "Each is a whole number from 5 to 50."); return; }
    const b = f.querySelector<HTMLButtonElement>("button[type=submit]")!;
    b.disabled = true; showErr(f, "");
    try { await api.admin("setTaskGears", { test, problems }); toast(`Saved: ${test} Gears to test, ${problems} for Not for me.`); }
    catch (er) { showErr(f, messageFor(er)); }
    finally { b.disabled = false; }
  });
}
