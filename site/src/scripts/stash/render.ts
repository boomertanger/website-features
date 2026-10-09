// Cloud Stash's page parts (docs/specs/cloud-stash.md §8; mockup P2 Overview and tabs, S2 hero, F2 rows): the hero, the banners, the Overview cards, the Files list, the Rules and
// Activity tabs, and the states (loading, nothing stashed yet, all clean, couldn't load). Markup and copy follow the approved mockup; everything is drawn from the store.
import { S, totals, looseEnds } from "./store";
import { canChange, isOwner } from "./gate";
import { USAGE_STATUS, NEEDS_OVERSEER, featureOf, fmtBytes, FEATURES, type UsageStatus } from "./status";
import type { Asset, Rule, LogEntry } from "./data";
import { esc, badge, ago, ageText, pacific, nextSweepAt, sweepWord, plural } from "./ui";
import { STASH_ICON, heroScene, mascot, IC } from "./art";
import { STATUS as BUG_STATUS } from "../bugs/status";
import * as T from "./targets";

/** Page filters (kept for the visit; the tab is in ?tab=). */
export const F = { filter: "all" as "all" | "orphan" | "due" | "private", feat: "all", sort: "newest", q: "", limit: 50, tab: "overview" };
export const TABS: [string, string][] = [["overview", "Overview"], ["files", "Files"], ["rules", "Rules"], ["activity", "Activity"]];

const usage = () => S.snap?.usage || null;
export const usageStatus = (): UsageStatus => usage()?.status || "healthy";
const pauseAt = () => S.snap?.settings.pauseAtPct ?? 80;
const staleUsage = () => { const u = usage(); return !!u && (u.failures >= 2 || (u.fetchedAt > 0 && Date.now() - u.fetchedAt > 48 * 3600000)); };
const lock = (text: string) => `<span class="cs-lock-note">${IC.lock}${esc(text)}</span>`;

// ---------- hero and banners ----------
export function hero() {
  const u = usage(), st = usageStatus(), m = USAGE_STATUS[st];
  const pct = u && u.credits.pct != null ? u.credits.pct : null;
  const line = u
    ? `${badge(m.badge, m.label)}${pct == null ? "" : `<span><b>${Math.round(pct)}%</b> of this month's ${u.credits.limit ? `${u.credits.limit} credits` : "credits"}</span>`}<span>${esc(u.uploads === "open" ? m.line : USAGE_STATUS[st].line)}</span>`
    : `<span class="bt-meta">No usage numbers yet. Refresh to fetch them from Cloudinary.</span>`;
  return `<section class="cs-hero" data-status="${st}" aria-labelledby="cs-h"><div class="cs-hero-copy"><h1 class="bt-title" id="cs-h">Cloud Stash</h1><p class="bt-subtitle">Every file the site keeps in Cloudinary, and the rules that tidy them up.</p><div class="cs-hero-line">${line}</div></div>${heroScene({ status: st, pct, limit: u?.credits.limit || null, pauseAt: pauseAt() })}</section>`;
}

export function banners() {
  const out: string[] = [];
  const st = usageStatus();
  if (st === "paused") out.push(`<div class="bt-notice bt-notice--warn bt-notice--row" role="status"><b>Uploads paused.</b><span>${S.snap?.settings.manualPause ? `Paused by hand${S.snap.settings.manualPauseReason ? `: ${esc(S.snap.settings.manualPauseReason)}` : ""}. ` : `Usage passed ${pauseAt()}%. `}Bug Zapper screenshots and cover suggestions are refused with a friendly message; staff uploads still work. It lifts by itself on the 1st, or when usage drops.</span>${canChange(S.tier) ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-cs="settings">Change the pause point</button>` : ""}</div>`);
  if (st === "over") out.push(`<div class="bt-notice bt-notice--error bt-notice--row" role="alert"><b>Over the monthly limit.</b><span>Every upload is stopped except the owner's. Cloudinary may slow image delivery until the 1st. An alert went to the owner.</span></div>`);
  if (staleUsage()) out.push(`<div class="bt-notice bt-notice--warn bt-notice--row" role="status"><b>Usage is out of date.</b><span>Cloudinary didn't answer the last checks${usage()?.fetchedAt ? ` (the numbers are ${ageText(usage()!.fetchedAt)} old)` : ""}. Uploads stay open while we can't tell.</span><button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-cs="refresh">${IC.scan}Try again</button></div>`);
  const sw = S.snap?.sweep;
  if (sw && sw.status === "capped") out.push(`<div class="bt-notice bt-notice--warn bt-notice--row" role="status"><b>The last sweep stopped early.</b><span>It hit its ${S.snap?.settings.runCap}-file cap and stopped; nothing past the cap was touched.</span></div>`);
  return out.join("");
}

// ---------- overview cards ----------
function usageCard() {
  const u = usage(), st = usageStatus(), m = USAGE_STATUS[st];
  if (!u) return `<div class="bt-card cs-tile"><div class="bt-card-head"><h2 class="bt-card-title">This month's usage</h2></div><p class="cs-why">No usage numbers yet. They come from Cloudinary once a day, or when you press Refresh.</p><div class="cs-actions"><button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-cs="refresh">${IC.scan}Refresh</button></div></div>`;
  const lim = u.credits.limit || 0;
  const w = (v: number) => `${lim ? Math.min(100, (v / lim) * 100).toFixed(1) : "0"}%`;
  const parts = [["storage", "Storage", "var(--bt-primary)", u.storage.credits], ["bandwidth", "Bandwidth", "var(--bt-teal)", u.bandwidth.credits], ["transformations", "Transformations", "var(--bt-blue)", u.transformations.credits]] as const;
  const top = [...parts].sort((a, b) => b[3] - a[3])[0];
  const why = top[0] === "bandwidth" ? "Most of it is <b>bandwidth</b> (people viewing images). Purging old files frees storage, not bandwidth." : top[0] === "storage" ? "Most of it is <b>storage</b>. Purging old files brings it down." : "Most of it is <b>transformations</b> (images resized on the fly).";
  return `<div class="bt-card cs-tile"><div class="bt-card-head"><h2 class="bt-card-title">This month's usage</h2>${badge(m.badge, m.label)}</div>
    <div class="bt-stat"><span class="bt-stat-value">${Math.round(u.credits.used * 10) / 10} credits</span><span class="bt-stat-unit">${lim ? `of ${lim} on Cloudinary's ${esc(u.plan || "current")} plan` : "this month"}</span></div>
    <div class="bt-meter bt-meter--stack bt-meter--${m.meter}"><div class="bt-meter-track" role="meter" aria-valuemin="0" aria-valuemax="${lim || 100}" aria-valuenow="${u.credits.used}" aria-label="Cloudinary credits used this month">${parts.map(([, , c, v]) => `<span class="bt-meter-seg" style="width:${w(v)};--c:${c}"></span>`).join("")}<div class="bt-meter-marker" style="left:${pauseAt()}%" title="Uploads pause at ${pauseAt()}%"></div></div>
      <div class="bt-meter-legend"><span>0</span><span class="bt-meter-legend-mark" style="--bt-at:${pauseAt()}%">Uploads pause at ${pauseAt()}%</span><span>${lim || ""}</span></div></div>
    <ul class="bt-meter-keys">${parts.map(([, label, c, v]) => `<li><i style="--c:${c}"></i>${label} <b>${Math.round(v * 10) / 10}</b></li>`).join("")}</ul>
    <p class="cs-why">${why}</p>
    <div class="cs-actions"><span class="bt-meta">From Cloudinary, ${esc(ago(u.fetchedAt))}</span><button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-cs="refresh">${IC.scan}Refresh</button></div></div>`;
}

function looseCard() {
  const l = looseEnds(), sc = S.snap?.scan;
  const count = (n: number, label: string, small: string, filter: string) => `<button type="button" class="cs-count${n ? " is-warn" : " is-zero"}" ${n ? `data-cs="filter" data-filter="${filter}"` : "disabled"}><b>${n}</b><span>${label}</span><small>${small}</small></button>`;
  const bulk = l.orphan + l.stale;
  const clean = sc && !bulk && !l.untracked;
  return `<div class="bt-card cs-tile"><div class="bt-card-head"><h2 class="bt-card-title">Loose ends</h2><span class="bt-card-meta">${sc ? `Scanned ${esc(pacific(sc.at).replace(" Pacific", ""))}` : "Never scanned"}</span></div>
    ${clean ? `<div class="cs-clean" data-confetti>${mascot()}<div><b>All clean</b><p>No orphans, nothing stale, nothing untracked. The stash is tidy.</p></div><span class="cs-sun" aria-hidden="true"></span></div>` : `<div class="cs-stats">${count(l.orphan, "Orphans", "Item is gone", "orphan")}${count(l.stale, "Stale", "Item moved on", "orphan")}${count(l.untracked, "Untracked", "No record", "untracked")}</div>`}
    <div class="cs-actions">${canChange(S.tier) ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--danger-outline" data-cs="purge-loose"${bulk ? "" : " disabled"}>${IC.broom}Purge orphans and stale</button>` : `<button type="button" class="bt-btn bt-btn--sm bt-btn--danger-outline" disabled>${IC.broom}Purge orphans and stale</button>${lock(NEEDS_OVERSEER)}`}<button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-cs="untracked">See untracked</button></div>
    ${sc?.truncated ? `<p class="bt-fineprint">The scan found more than it lists. Showing the first ones.</p>` : ""}</div>`;
}

function featCard() {
  const bf = S.snap?.current?.byFeature || {};
  const rows = Object.entries(bf).sort((a, b) => b[1].bytes - a[1].bytes);
  const t = totals();
  if (!rows.length) return `<div class="bt-card cs-tile"><div class="bt-card-head"><h2 class="bt-card-title">Recorded by feature</h2></div><div class="bt-empty bt-empty--compact cs-empty">${mascot()}<p class="bt-empty-title">Nothing recorded yet</p><p>Run a scan to count the site's records.</p></div></div>`;
  const max = Math.max(...rows.map(([, f]) => f.bytes), 1);
  return `<div class="bt-card cs-tile"><div class="bt-card-head"><h2 class="bt-card-title">Recorded by feature</h2><span class="bt-card-meta">${fmtBytes(t.bytes)} in ${plural(t.files, "file")}</span></div>
    <ul class="cs-feat">${rows.map(([k, f]) => { const F2 = featureOf(k); return `<li><span class="cs-feat-ic" aria-hidden="true">${F2.ic}</span><b>${esc(F2.name)}</b><em>${fmtBytes(f.bytes)} · ${plural(f.files, "file")}</em><i style="--w:${(f.bytes / max) * 100}%"></i></li>`; }).join("")}</ul>
    <p class="bt-fineprint">Counted from the site's own records. Recounted at every scan${S.snap?.current?.recountedAt ? ` (last ${esc(ago(S.snap.current.recountedAt))})` : ""}.</p></div>`;
}

const SWEEP_BADGE: Record<string, [string, string]> = { ok: ["lime", "OK"], partial: ["gold", "Partly failed"], capped: ["gold", "Stopped at the cap"], failed: ["red", "Failed"] };
function sweepCard() {
  const sw = S.snap?.sweep;
  const b = sw ? SWEEP_BADGE[sw.status] || SWEEP_BADGE.ok : null;
  return `<div class="bt-card cs-tile"><div class="bt-card-head"><h2 class="bt-card-title">Last sweep</h2>${b ? badge(b[0], b[1]) : ""}</div>
    ${sw ? `<dl class="cs-kv"><dt>Ran</dt><dd>${esc(pacific(sw.lastRunAt))}</dd><dt>Purged</dt><dd>${plural(sw.purged, "file")}${sw.bytes ? ` (${fmtBytes(sw.bytes)})` : ""}</dd><dt>Next</dt><dd>${esc(pacific(nextSweepAt()))}</dd></dl>${sw.skipped.length ? `<p class="cs-why">${plural(sw.skipped.length, "rule")} skipped because ${sw.skipped.length === 1 ? "it isn't" : "they aren't"} in a safe shape. The Rules tab says which.</p>` : ""}${sw.failures.length ? `<p class="cs-why">${plural(sw.failures.length, "problem")}: ${esc(sw.failures[0].message)}${sw.failures.length > 1 ? ` and ${sw.failures.length - 1} more.` : ""}</p>` : ""}` : `<p class="cs-why">The sweep hasn't run yet. It runs every morning at 9:00 AM Pacific. Next: ${esc(pacific(nextSweepAt()))}.</p>`}
    <div class="cs-actions">${canChange(S.tier) ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-cs="sweep">${IC.play}Run the sweep now</button>` : lock(`Running it now ${NEEDS_OVERSEER.toLowerCase()}`)}</div></div>`;
}

function settingsCard() {
  const s = S.snap?.settings;
  return `<div class="bt-card cs-tile"><div class="bt-card-head"><h2 class="bt-card-title">Limits and settings</h2>${canChange(S.tier) ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-cs="settings">${IC.gear}Change</button>` : ""}</div>
    <dl class="cs-kv"><dt>Uploads pause at</dt><dd>${s?.pauseAtPct ?? 80}% of ${usage()?.credits.limit ? `${usage()!.credits.limit} credits` : "the monthly credits"}</dd><dt>Paused by hand</dt><dd>${s?.manualPause ? `Yes${s.manualPauseReason ? `: ${esc(s.manualPauseReason)}` : ""}` : "No"}</dd><dt>Sweep stops after</dt><dd>${plural(s?.runCap ?? 100, "file")}</dd><dt>Admin log kept for</dt><dd>${S.snap?.retentionDays ? `${S.snap.retentionDays} days` : "the default"} (owner only)</dd></dl></div>`;
}

// ---------- files ----------
const dueBadge = () => badge("blue", sweepWord());
function stateBadge(a: Asset) {
  if (a.scan?.state === "orphan") return badge("gold", "Orphan");
  if (a.scan?.state === "stale") return badge("gold", "Stale");
  if (a.scan?.due) return dueBadge();
  return "";
}
export const isLoose = (a: Asset) => a.scan?.state === "orphan" || a.scan?.state === "stale";

export function fileRow(a: Asset) {
  const f = featureOf(a.feature), loose = isLoose(a), priv = a.deliveryType === "authenticated";
  const thumb = priv ? `<span class="bt-file-thumb bt-file-thumb--locked" title="Private file">${IC.lock}<small>Private</small></span>` : `<span class="bt-file-thumb"><span class="cs-art"></span></span>`;
  const purge = canChange(S.tier) ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--danger-outline" data-cs="purge" data-id="${esc(a.id)}">Purge</button>` : `<button type="button" class="bt-btn bt-btn--sm bt-btn--danger-outline" disabled title="${NEEDS_OVERSEER}">Purge</button>`;
  return `<div class="bt-row bt-row--clickable cs-file${loose ? " bt-row--dimmed" : ""}" tabindex="0" role="button" data-cs="file" data-id="${esc(a.id)}" aria-label="${esc(a.publicId)}. Open">
    ${thumb}
    <div class="bt-row-body"><div class="bt-row-title"><span data-title>${esc(a.publicId.split("/").pop() || a.publicId)}</span></div><div class="bt-row-desc"><span class="bt-code">${esc(a.publicId)}</span></div>
      <div class="bt-row-meta"><span>${f.ic} ${esc(f.name)}</span><span>·</span><span data-kind>${esc(f.name === a.feature ? "File" : "")}</span><span>·</span><span>${esc(ageText(a.createdAt))} old</span></div></div>
    <div class="bt-row-side"><span class="cs-size">${fmtBytes(a.sizeBytes)}</span>${stateBadge(a)}${priv ? `<button type="button" class="bt-icon-btn bt-icon-btn--sm" data-cs="file" data-id="${esc(a.id)}" aria-label="Show preview">${IC.eye}</button>` : ""}${purge}</div></div>`;
}

export function filteredAssets(): Asset[] {
  let list = (S.snap?.assets || []).slice();
  if (F.filter === "orphan") list = list.filter(isLoose);
  else if (F.filter === "private") list = list.filter((a) => a.deliveryType === "authenticated");
  else if (F.filter === "due") list = list.filter((a) => !!a.scan?.due);
  if (F.feat !== "all") list = list.filter((a) => a.feature === F.feat);
  const q = F.q.trim().toLowerCase();
  if (q) list = list.filter((a) => a.publicId.toLowerCase().includes(q) || featureOf(a.feature).name.toLowerCase().includes(q) || (titleCache.get(a.id) || "").toLowerCase().includes(q));
  const by: Record<string, (x: Asset, y: Asset) => number> = { newest: (x, y) => y.createdAt - x.createdAt, largest: (x, y) => y.sizeBytes - x.sizeBytes, oldest: (x, y) => x.createdAt - y.createdAt };
  return list.sort(by[F.sort] || by.newest);
}
/** Item titles already read (so the search can match them). */
export const titleCache = new Map<string, string>();

function filesBody(limit: number) {
  if (!(S.snap?.assets.length)) return `<div class="bt-empty bt-empty--compact cs-empty">${mascot()}<p class="bt-empty-title">Nothing stashed yet</p><p>Files show up here as soon as a feature saves an upload: bug screenshots, covers, season art.</p></div>`;
  const list = filteredAssets();
  if (!list.length) return `<div class="bt-empty bt-empty--compact cs-empty">${mascot()}<p class="bt-empty-title">Nothing matches</p><p>No files fit these filters. Try All.</p><button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-cs="filter" data-filter="all">Show all files</button></div>`;
  return `<div class="cs-files">${list.slice(0, limit).map(fileRow).join("")}</div>${list.length > limit && limit >= F.limit ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--ghost cs-more" data-cs="more">Show ${Math.min(50, list.length - limit)} more</button>` : ""}`;
}

export function filesCard(limit = F.limit, compact = false) {
  const t = totals(), assets = S.snap?.assets || [];
  const chip = (k: string, label: string, n: number | null) => `<button type="button" class="bt-chip bt-chip--small${F.filter === k ? " is-active" : ""}" aria-pressed="${F.filter === k}" data-cs="filter" data-filter="${k}">${label}${n != null ? `<span class="bt-chip-n">${n}</span>` : ""}</button>`;
  const l = looseEnds();
  const feats = [["all", "Every feature"], ...Object.keys(S.snap?.current?.byFeature || {}).concat(Object.keys(FEATURES).filter((k) => !(S.snap?.current?.byFeature || {})[k] && assets.some((a) => a.feature === k))).map((k) => [k, featureOf(k).name])];
  const filters = compact ? "" : `<div class="cs-filters" role="group" aria-label="Filter files">${chip("all", "All", t.files)}${chip("orphan", "Orphans and stale", l.orphan + l.stale)}${chip("due", "Due for the sweep", assets.filter((a) => a.scan?.due).length)}${chip("private", "Private", assets.filter((a) => a.deliveryType === "authenticated").length)}
      <select class="bt-select" aria-label="Feature" data-cs-feat>${feats.map(([k, n]) => `<option value="${esc(k)}"${F.feat === k ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <select class="bt-select" aria-label="Sort" data-cs-sort>${[["newest", "Newest"], ["largest", "Largest"], ["oldest", "Oldest"]].map(([k, n]) => `<option value="${k}"${F.sort === k ? " selected" : ""}>${n}</option>`).join("")}</select>
      <label class="cs-search"><input class="bt-input" type="search" placeholder="Search a file or item" aria-label="Search files" value="${esc(F.q)}" data-cs-search></label></div>`;
  const foot = compact ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--ghost cs-more" data-cs="tab" data-tab="files">See all ${t.files} files</button>` : `<p class="bt-fineprint">${S.snap?.assetsCapped ? "Showing the newest 1,000. " : ""}Opening a private file's preview is logged.</p>`;
  return `<div class="bt-card"><div class="bt-card-head"><h2 class="bt-card-title">${compact ? "Newest files" : "Files"}</h2><span class="bt-card-meta">${plural(t.files, "file")} · ${fmtBytes(t.bytes)}</span></div>${filters}${filesBody(compact ? 3 : limit)}${foot}</div>`;
}

// ---------- rules ----------
export function ruleSentence(r: Rule) {
  if (r.unsafe) return "This rule isn't in a safe shape, so the sweep skips it.";
  if (r.legacy) return esc(r.legacyText || "A rule from the old Cloud Stash page.");
  const all = r.statuses.length >= T.BUG.statuses.length;
  const which = all ? "closed" : `closed as ${T.list(r.statuses.map((s) => BUG_STATUS[s as keyof typeof BUG_STATUS]?.label || s))}`;
  return `Delete <b>${esc(T.BUG.label)}</b> when the report has been <b>${which}</b> for <b>${r.days} days</b>.`;
}
function rulesCard() {
  const rules = S.snap?.rules || [];
  const can = canChange(S.tier);
  return `<div class="bt-card cs-tile"><div class="bt-card-head"><h2 class="bt-card-title">Cleanup rules</h2>${can ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--admin" data-cs="rule">${IC.plus}Add rule</button>` : ""}</div>
    ${rules.length ? `<div class="bt-items">${rules.map((r) => `<div class="bt-item cs-rule${r.enabled ? "" : " bt-item--off"}${r.legacy || r.unsafe ? " cs-rule--legacy" : ""}">
      <div class="bt-item-head"><span class="bt-item-title">${esc(r.name)}${r.legacy ? badge("gray", "Read only", false) : ""}${r.unsafe ? badge("gold", "Needs updating", false) : ""}</span>
        <div class="bt-item-actions"><button type="button" class="bt-switch" role="switch" aria-checked="${r.enabled}" aria-label="Run ${esc(r.name)}" data-cs="toggle" data-id="${esc(r.id)}"${!can && !r.enabled ? ` disabled title="Switching a rule on ${NEEDS_OVERSEER.toLowerCase()}"` : r.legacy && !r.enabled ? ' disabled title="A rule from the old page can only be switched off."' : r.unsafe && !r.enabled ? ' disabled title="Edit this rule first."' : ""}></button>${!r.legacy && can ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-cs="rule" data-id="${esc(r.id)}">Edit</button>` : ""}</div></div>
      <p class="bt-item-desc">${ruleSentence(r)}</p>
      <div class="cs-rule-meta"><span><b>Last run:</b> ${r.lastRun ? `${esc(ago(r.lastRun.at))}, ${r.lastRun.purged ? `${plural(r.lastRun.purged, "file")} purged` : "nothing to delete"}${r.lastRun.failed ? `, ${r.lastRun.failed} failed` : ""}` : r.enabled ? "not yet" : "never (switched off)"}</span></div></div>`).join("")}</div>` : `<div class="bt-empty bt-empty--compact cs-empty">${mascot()}<p class="bt-empty-title">No cleanup rules</p><p>Rules tidy old files by themselves. Add one to start.</p></div>`}
    ${!can ? `<p class="cs-lock-note">${IC.lock}Stewards can switch a rule off. Adding, editing or switching one on needs the owner or an Overseer.</p>` : ""}
    <p class="bt-fineprint">Rules run every morning at 9:00 AM Pacific (11:00 Central). A run stops after ${S.snap?.settings.runCap ?? 100} files and alerts you, so a bad rule can't empty the stash.</p></div>`;
}

// ---------- activity ----------
const LOG_ICON: Record<string, string> = { purge: "🧹", "purge-untracked": "🧹", preview: "🔒", "rule-save": "📝", "rule-toggle": "⏸", "rule-delete": "🗑", "sweep-run": "🤖", limits: "⚙", pause: "⏯", retention: "🗓" };
function logText(e: LogEntry): [string, string] {
  const d = e.details || {};
  const mb = (b: number) => fmtBytes(Number(b) || 0);
  switch (e.action) {
    case "purge": return [`Purged ${esc(e.itemTitle)}${d.bytes ? ` (${mb(d.bytes)})` : ""}`, d.cleanupRule?.id ? "By a cleanup rule" : e.reason || ""];
    case "purge-untracked": return [`Purged an untracked file`, esc(d.publicId || e.itemTitle)];
    case "preview": return ["Opened a private preview", esc(e.itemTitle)];
    case "rule-save": return [`${d.op === "create" ? "Added" : "Edited"} the rule “${esc(e.itemTitle)}”`, esc(d.sentence || "")];
    case "rule-toggle": return [`Switched ${e.changes?.enabled?.after ? "on" : "off"} “${esc(e.itemTitle)}”`, e.reason ? `Reason: ${esc(e.reason)}` : ""];
    case "rule-delete": return [`Deleted the rule “${esc(e.itemTitle)}”`, ""];
    case "sweep-run": return [`${e.actorName === "Automatic" ? "Automatic sweep" : "Sweep run by hand"} purged ${plural(d.purged || 0, "file")}${d.bytes ? ` (${mb(d.bytes)})` : ""}`, d.status && d.status !== "ok" ? `Status: ${esc(d.status)}` : ""];
    case "limits": return [`Changed the pause point to ${e.changes?.pauseAtPct?.after}%`, ""];
    case "pause": return [e.changes?.manualPause?.after ? "Paused member uploads" : "Resumed member uploads", e.reason ? `Reason: ${esc(e.reason)}` : ""];
    case "retention": return [`Admin log kept for ${e.changes?.retentionDays?.after} days`, "Applies to new entries only"];
    default: return [esc(e.action), esc(e.reason)];
  }
}
function activityCard() {
  const log = S.log;
  return `<div class="bt-card cs-tile"><div class="bt-card-head"><h2 class="bt-card-title">Recent activity</h2><span class="bt-card-meta">From the admin log</span></div>
    ${log.length ? `<ul class="cs-log">${log.map((e) => { const [t, s] = logText(e); return `<li><span aria-hidden="true">${LOG_ICON[e.action] || "•"}</span><span>${t}</span><time>${esc(ago(e.createdAt))}</time><small>${s ? `${s} · ` : ""}${esc(e.actorName)}</small></li>`; }).join("")}</ul>` : `<p class="cs-why">Nothing yet. Purges, previews and rule changes show up here.</p>`}</div>`;
}
function alertsCard() {
  const items = S.snap?.alerts || [];
  return `<div class="bt-card cs-tile"><div class="bt-card-head"><h2 class="bt-card-title">Alerts</h2></div>
    ${items.length ? `<ul class="cs-log">${items.slice(0, 10).map((a) => `<li><span aria-hidden="true">${a.severity === "critical" ? "🚨" : a.severity === "warn" ? "⚠" : "ℹ"}</span><span>${esc(a.title)}</span><time>${esc(ago(a.at))}</time><small>${esc(a.body)}</small></li>`).join("")}</ul>` : `<p class="cs-why">No alerts yet.</p>`}
    <p class="bt-fineprint">Alerts go to the owner and admins as admin health items, at most one of each kind a day.</p></div>`;
}

// ---------- the page ----------
export function tabsHtml() {
  return `<nav class="bt-seg-nav cs-tabs" aria-label="Cloud Stash sections">${TABS.map(([k, n]) => `<a href="?tab=${k}" data-cs="tab" data-tab="${k}"${F.tab === k ? ' aria-current="page"' : ""}>${n}</a>`).join("")}</nav>`;
}
export function body() {
  if (S.error) return `<div class="bt-card"><div class="bt-empty cs-empty">${mascot()}<p class="bt-empty-title">Couldn't load Cloud Stash</p><p>Check your connection, then try again. If it keeps happening, the console has the details.</p><button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-cs="retry">Try again</button></div></div>`;
  if (!S.loaded) return `<div class="bt-card"><div class="bt-card-head"><h2 class="bt-card-title">Files</h2></div>${[0, 1, 2].map(() => `<div class="bt-skeleton-row" aria-hidden="true"><span class="bt-skeleton cs-sk-thumb"></span><div class="bt-skeleton-lines"><span class="bt-skeleton cs-sk-a"></span><span class="bt-skeleton cs-sk-b"></span><span class="bt-skeleton cs-sk-c"></span></div></div>`).join("")}</div>`;
  const tab = F.tab;
  if (tab === "files") return filesCard();
  if (tab === "rules") return `<div class="cs-grid">${rulesCard()}<div class="cs-side">${sweepCard()}${settingsCard()}</div></div>`;
  if (tab === "activity") return `<div class="cs-grid">${activityCard()}${alertsCard()}</div>`;
  return `<div class="cs-grid">${usageCard()}${looseCard()}${featCard()}${sweepCard()}<div class="cs-span">${filesCard(3, true)}</div></div>`;
}
export { STASH_ICON, isOwner };
