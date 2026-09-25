// shared/ui-kit/ui-kit.js — renders the UI Kit reference page into #bt-ui-kit.
// Squarespace Code Block: <div id="bt-ui-kit"></div> + this script + ui-kit.css
// (bt-ui.css itself comes from Header Code Injection).
import { escapeHtml, formatDate, initials } from "../ui/dom.js";
import { openModal, modalHeader } from "../ui/modal.js";
import { confirmAction } from "../ui/confirm.js";
import { initAdminMenu, LOGIN_ICON, SIGNOUT_ICON, SHIELD_ICON } from "../ui/admin-menu.js";

const KIT_VERSION = "dev";

const ICON = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"></polyline></svg>',
  comment: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>',
  disk: '<svg class="kit-disk-icon" viewBox="0 0 32 32" overflow="visible" aria-hidden="true"><ellipse cx="16" cy="9" rx="10" ry="4" fill="none" stroke="var(--bt-primary)" stroke-width="2"></ellipse><path d="M6 9v14c0 2.2 4.5 4 10 4s10-1.8 10-4V9" fill="none" stroke="var(--bt-primary)" stroke-width="2"></path><path d="M6 16c0 2.2 4.5 4 10 4s10-1.8 10-4" fill="none" stroke="var(--bt-primary)" stroke-width="2"></path><circle class="kit-disk-blip" cx="22" cy="22.5" r="1.8" fill="var(--bt-title)"></circle></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  kit: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="11" height="11" rx="2.5" fill="var(--bt-primary)"></rect><rect x="18" y="3" width="11" height="11" rx="5.5" fill="var(--bt-title)"></rect><rect x="3" y="18" width="11" height="11" rx="5.5" fill="var(--bt-text)"></rect><rect x="18" y="18" width="11" height="11" rx="2.5" fill="none" stroke="var(--bt-primary)" stroke-width="2"></rect></svg>',
  // Animated on purpose: the pulse ring bursts well past the 32px icon box,
  // like the real feature icons, to prove the top bar doesn't clip or shift.
  demo: '<svg class="kit-demo-icon" viewBox="0 0 32 32" overflow="visible" aria-hidden="true"><circle class="kit-pulse" cx="16" cy="16" r="6" fill="none" stroke="var(--bt-title)" stroke-width="1.5"></circle><path d="M16 3 L27 9.5 V22.5 L16 29 L5 22.5 V9.5 Z" fill="none" stroke="var(--bt-primary)" stroke-width="2" stroke-linejoin="round"></path><circle cx="16" cy="16" r="4.5" fill="var(--bt-title)"></circle></svg>',
};

const STATUS = {
  submitted:    { label: "Submitted",    tone: "gray" },
  under_review: { label: "Under review", tone: "blue" },
  planned:      { label: "Planned",      tone: "amber" },
  in_progress:  { label: "In progress",  tone: "teal" },
  shipped:      { label: "Shipped",      tone: "green" },
  declined:     { label: "Declined",     tone: "gray" },
};

const ROWS = [
  { id: "r1", title: "Clip button on the live page", desc: "Let viewers grab the last 30 seconds of the stream without leaving the site or opening Twitch.", votes: 42, voted: true, status: "in_progress", comments: 7, author: "Hollow Moth", date: "2026-09-12" },
  { id: "r2", title: "Spoiler tags in chat", desc: "Blur messages about endings and jump scares until you click to reveal them.", votes: 31, voted: false, status: "under_review", comments: 4, author: "Vera Crane", date: "2026-09-03" },
  { id: "r3", title: "Schedule shown in my time zone", desc: "The events page lists everything in Eastern time. Convert it to wherever I am.", votes: 18, voted: false, status: "planned", comments: 2, author: "Ash", date: "2026-08-27" },
  { id: "r4", title: "Monthly scare-o-meter leaderboard", desc: "Rank the games by how many times chat screamed.", votes: 57, voted: true, status: "shipped", comments: 12, author: "Grim Tuesday", date: "2026-07-30" },
  { id: "r5", title: "Move the community to a forum", desc: "Replace the Discord with threaded forum boards on the site.", votes: 6, voted: false, status: "declined", comments: 9, author: "Pale Rider", date: "2026-07-11" },
];

const state = { width: "full", admin: false, list: "loaded", filter: "all", sort: "votes", rows: ROWS.map((r) => ({ ...r })) };

// ---------- Small builders ----------

const badge = (statusKey, dot = true) => {
  const s = STATUS[statusKey];
  return `<span class="bt-badge bt-badge--${s.tone}">${dot ? '<span class="bt-badge-dot"></span>' : ""}${s.label}</span>`;
};

const chip = (label, value, active, extra = "") =>
  `<button type="button" class="bt-chip ${extra} ${active ? "is-active" : ""}" data-value="${value}" aria-pressed="${active}">${label}</button>`;

function adminBlock() {
  return `
  <div class="bt-admin">
    <button type="button" class="bt-admin-menu-toggle" aria-label="Admin menu" aria-expanded="false">${LOGIN_ICON}</button>
    <div class="bt-admin-row">
      <div class="bt-admin-section">
        <span class="bt-admin-label">Admin access</span>
        <button type="button" class="bt-signin-btn" data-kit-signin>Sign in as Admin</button>
      </div>
      <div class="bt-admin-section">
        <span class="bt-admin-label">Signed in as</span>
        <span class="bt-admin-pill" data-kit-pill><span class="bt-admin-pill-dot"></span>Admin</span>
        <button type="button" class="bt-signout-row" data-kit-signout>${SIGNOUT_ICON}Sign out</button>
      </div>
    </div>
  </div>`;
}

function rowHtml(r) {
  return `
  <div class="bt-row bt-row--clickable ${r.status === "declined" ? "bt-row--dimmed" : ""}" data-row="${r.id}" tabindex="0">
    <button type="button" class="bt-tally ${r.voted ? "is-active" : ""}" data-vote="${r.id}" aria-pressed="${r.voted}" aria-label="${r.voted ? "Remove vote" : "Vote"}">
      ${ICON.up}<span class="bt-tally-count">${r.votes}</span><span class="bt-tally-label">votes</span>
    </button>
    <div class="bt-row-body">
      <div class="bt-row-title">${escapeHtml(r.title)}</div>
      <div class="bt-row-desc">${escapeHtml(r.desc)}</div>
      <div class="bt-row-meta"><span class="bt-avatar">${initials(r.author)}</span><span>${escapeHtml(r.author)}</span></div>
    </div>
    <div class="bt-row-side">
      <div class="bt-row-badges">${badge(r.status)}</div>
      <span class="bt-count">${ICON.comment}${r.comments}</span>
      <span class="bt-row-date">${formatDate(r.date + "T12:00:00")}</span>
    </div>
  </div>`;
}

function skeletonRow() {
  return `
  <div class="bt-skeleton-row" aria-hidden="true">
    <span class="bt-skeleton" style="width:52px;height:58px;border-radius:var(--bt-radius-md)"></span>
    <div class="bt-skeleton-lines">
      <span class="bt-skeleton" style="width:55%;height:16px"></span>
      <span class="bt-skeleton" style="width:85%;height:12px"></span>
      <span class="bt-skeleton" style="width:30%;height:12px"></span>
    </div>
  </div>`;
}

// ---------- Preview (a full feature shell) ----------

function previewBody() {
  if (state.list === "logged_out") {
    return `
    <div class="bt-logged-out">
      <div class="bt-wordmark"><span class="bt-wordmark-icon">${ICON.demo}</span><span class="bt-wordmark-text">DEMO<span class="bt-wordmark-accent">BOARD</span></span></div>
      <h2 class="bt-logged-out-title">Members only</h2>
      <p class="bt-logged-out-text">Log in with your free Fan Club membership to see and vote on feature requests.</p>
      <button type="button" class="bt-btn bt-btn--primary">Log in</button>
    </div>`;
  }

  let list;
  if (state.list === "loading") {
    list = `<div class="bt-list" aria-busy="true">${skeletonRow()}${skeletonRow()}${skeletonRow()}</div>`;
  } else if (state.list === "empty") {
    list = `<div class="bt-list"><div class="bt-empty"><p class="bt-empty-title">No requests yet</p><p>Suggest the first feature and the community can vote on it.</p><button type="button" class="bt-btn bt-btn--primary" data-kit-new>${ICON.plus}New request</button></div></div>`;
  } else if (state.list === "error") {
    list = `<div class="bt-list"><div class="bt-empty"><p class="bt-empty-title">Couldn't load requests</p><p>Check your connection, then refresh the page.</p><button type="button" class="bt-btn bt-btn--secondary" data-kit-retry>Refresh</button></div></div>`;
  } else {
    let rows = state.rows.filter((r) => state.filter === "all" || r.status === state.filter);
    rows.sort((a, b) => state.sort === "votes" ? b.votes - a.votes : state.sort === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    list = `<div class="bt-list">${rows.length ? rows.map(rowHtml).join("") : `<div class="bt-empty"><p class="bt-empty-title">Nothing here</p><p>No requests have this status. Pick another filter.</p></div>`}</div>`;
  }

  const filters = [["All", "all"], ...Object.entries(STATUS).map(([k, s]) => [s.label, k])];
  return `
    <div class="bt-header">
      <h1 class="bt-title">Feature requests</h1>
      <p class="bt-subtitle">Vote on what gets built next.</p>
    </div>
    <div class="bt-filters" data-kit-filters>${filters.map(([l, v]) => chip(l, v, state.filter === v)).join("")}</div>
    <div class="bt-sortbar" data-kit-sort><span class="bt-sortbar-label">Sort by</span>${[["Most votes", "votes"], ["Newest", "newest"], ["Oldest", "oldest"]].map(([l, v]) => chip(l, v, state.sort === v, "bt-chip--small")).join("")}</div>
    ${list}`;
}

function previewHtml() {
  return `
  <div class="bt-root" id="kit-preview">
    <div class="bt-topbar">
      <div class="bt-wordmark"><span class="bt-wordmark-icon">${ICON.demo}</span><span class="bt-wordmark-text">DEMO<span class="bt-wordmark-accent">BOARD</span></span></div>
      <div class="bt-topnav">
        ${adminBlock()}
        <button type="button" class="bt-btn bt-btn--primary" data-kit-new aria-label="New request">${ICON.plus}<span class="bt-btn-label">New request</span></button>
      </div>
    </div>
    <div data-kit-preview-body>${previewBody()}</div>
  </div>`;
}


// ---------- Dashboard preview (Disk Stash–style) ----------

const GB = 1024 ** 3;
const CAP = 25 * GB;
const PAUSE_AT = 20 * GB;
const USAGE_LEVELS = { healthy: 12.4 * GB, near: 21.3 * GB, over: 26.1 * GB };

const ASSETS = [
  { id: "a1", feature: "bugZapper", path: "bugReports/k2Pq81", age: "3 days", bytes: 2.4 * 1024 ** 2 },
  { id: "a2", feature: "bugZapper", path: "bugReports/Zt90aa", age: "12 days", bytes: 1.1 * 1024 ** 2 },
  { id: "a3", feature: "featureLab", path: "featureRequests/m7Xc2d", age: "19 days", bytes: 640 * 1024 },
  { id: "a4", feature: "bugZapper", path: "bugReports/Qn4Lr0", age: "41 days", bytes: 3.8 * 1024 ** 2 },
  { id: "a5", feature: "bugZapper", path: "bugReports/Wd3Hs5", age: "66 days", bytes: 2.9 * 1024 ** 2 },
];
const RULES = [
  { id: "c1", feature: "bugZapper", field: "status", value: "fixed", days: 60, on: true },
  { id: "c2", feature: "bugZapper", field: "status", value: "wont_fix", days: 30, on: false },
];

const dash = { width: "full", access: "admin", usage: "healthy", data: "populated", adding: false,
  assets: ASSETS.map((a) => ({ ...a })), rules: RULES.map((r) => ({ ...r })) };

function formatBytes(b) {
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

function usageCard() {
  const used = USAGE_LEVELS[dash.usage];
  const pct = Math.min(100, (used / CAP) * 100);
  const tone = used >= CAP ? "red" : used >= PAUSE_AT ? "amber" : "green";
  const label = used >= CAP ? "Over limit" : used >= PAUSE_AT ? "Uploads paused" : "Healthy";
  return `
  <div class="bt-card">
    <div class="bt-card-head">
      <h2 class="bt-card-title">Tracked storage</h2>
      <span class="bt-badge bt-badge--${tone}"><span class="bt-badge-dot"></span>${label}</span>
    </div>
    <div class="bt-stat"><span class="bt-stat-value">${formatBytes(used)}</span><span class="bt-stat-unit">of 25 GB on the free tier</span></div>
    <div class="bt-meter bt-meter--${tone}">
      <div class="bt-meter-track" role="meter" aria-valuemin="0" aria-valuemax="25" aria-valuenow="${(used / GB).toFixed(1)}" aria-label="Tracked storage in GB">
        <div class="bt-meter-fill" style="width:${pct}%"></div>
        <div class="bt-meter-marker" style="left:${(PAUSE_AT / CAP) * 100}%" title="Uploads pause at 20 GB"></div>
      </div>
      <div class="bt-meter-legend"><span>0 GB</span><span class="bt-meter-legend-mark" style="--bt-at:${(PAUSE_AT / CAP) * 100}%">Uploads pause at 20 GB</span><span>25 GB</span></div>
    </div>
    <p class="bt-fineprint">Counts files recorded by site features only. Cloudinary's free tier also meters bandwidth and image transforms, which aren't included here.</p>
  </div>`;
}

function assetsCard() {
  const list = dash.data === "empty" ? [] : dash.assets;
  const body = list.length
    ? `<div class="bt-table-wrap"><table class="bt-table">
        <thead><tr><th>Feature</th><th>Linked record</th><th>Age</th><th class="bt-num">Size</th><th><span class="kit-sr">Actions</span></th></tr></thead>
        <tbody>${list.map((a) => `
          <tr>
            <td>${escapeHtml(a.feature)}</td>
            <td><span class="bt-code">${escapeHtml(a.path)}</span></td>
            <td class="bt-muted">${a.age}</td>
            <td class="bt-num bt-muted">${formatBytes(a.bytes)}</td>
            <td class="bt-table-action"><button type="button" class="bt-btn bt-btn--sm bt-btn--danger-outline" data-dash-purge="${a.id}">Purge</button></td>
          </tr>`).join("")}</tbody>
      </table></div>`
    : `<div class="bt-empty bt-empty--compact"><p class="bt-empty-title">No files tracked yet</p><p>Files show up here once a feature saves an upload.</p></div>`;
  return `
  <div class="bt-card bt-card--divided">
    <div class="bt-card-head">
      <h2 class="bt-card-title">Tracked files</h2>
      <span class="bt-card-meta">${list.length} ${list.length === 1 ? "file" : "files"}</span>
    </div>
    ${body}
  </div>`;
}

function rulesCard() {
  const list = dash.data === "empty" ? [] : dash.rules;
  const items = list.length
    ? `<div class="bt-items">${list.map((r) => `
        <div class="bt-item ${r.on ? "" : "bt-item--off"}">
          <div class="bt-item-head">
            <span class="bt-item-title">${escapeHtml(r.feature)}</span>
            <div class="bt-item-actions">
              <button type="button" class="bt-switch" role="switch" aria-checked="${r.on}" data-dash-toggle="${r.id}" aria-label="Run this rule"></button>
              <button type="button" class="bt-icon-btn bt-icon-btn--sm" data-dash-delrule="${r.id}" aria-label="Delete rule">${ICON.x}</button>
            </div>
          </div>
          <p class="bt-item-desc">Deletes files when <span class="bt-code">${escapeHtml(r.field)}</span> is <span class="bt-code">${escapeHtml(r.value)}</span> for ${r.days}+ days</p>
        </div>`).join("")}</div>`
    : (dash.adding ? "" : `<div class="bt-empty bt-empty--compact"><p>No cleanup rules yet. Add one to delete old files automatically.</p></div>`);
  const form = dash.adding ? `
    <div class="bt-form">
      <div class="bt-form-grid">
        <div class="bt-field"><label class="bt-label" for="kr1">Feature key</label><input class="bt-input" id="kr1" placeholder="bugZapper" autofocus></div>
        <div class="bt-field"><label class="bt-label" for="kr2">Collection</label><input class="bt-input" id="kr2" placeholder="bugReports"></div>
        <div class="bt-field"><label class="bt-label" for="kr3">Match field</label><input class="bt-input" id="kr3" placeholder="status"></div>
        <div class="bt-field"><label class="bt-label" for="kr4">Match value</label><input class="bt-input" id="kr4" placeholder="fixed"></div>
        <div class="bt-field"><label class="bt-label" for="kr5">Days before deleting</label><input class="bt-input" id="kr5" type="number" min="1" placeholder="60"></div>
      </div>
      <div class="bt-form-actions">
        <button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-dash-cancel>Cancel</button>
        <button type="button" class="bt-btn bt-btn--sm bt-btn--primary" data-dash-save>Save rule</button>
      </div>
    </div>` : "";
  return `
  <div class="bt-card">
    <div class="bt-card-head">
      <h2 class="bt-card-title">Cleanup rules</h2>
      ${dash.adding ? "" : `<button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-dash-add>${ICON.plus}Add rule</button>`}
    </div>
    ${items}
    ${form}
  </div>`;
}

function dashBody() {
  if (dash.access === "gate") {
    return `
    <div class="bt-logged-out">
      <div class="bt-wordmark"><span class="bt-wordmark-icon">${ICON.disk}</span><span class="bt-wordmark-text">DISK<span class="bt-wordmark-accent">STASH</span></span></div>
      <span class="bt-admin-tag">${SHIELD_ICON}Admin only</span>
      <p class="bt-logged-out-text">Sign in with the Google account on the admin allowlist to manage stored files.</p>
      <button type="button" class="bt-signin-btn" data-dash-signin>Sign in as Admin</button>
    </div>`;
  }
  return `
    <div class="bt-header">
      <h1 class="bt-title">Storage</h1>
      <p class="bt-subtitle">Files saved by site features, and the rules that clean them up.</p>
    </div>
    <div class="bt-body" style="padding-top:0">
      ${usageCard()}
      <div class="bt-columns">
        <div>${assetsCard()}</div>
        <div>${rulesCard()}</div>
      </div>
    </div>`;
}

function dashboardHtml() {
  return `
  <div class="bt-root" id="kit-dash">
    <div class="bt-topbar">
      <div class="bt-wordmark"><span class="bt-wordmark-icon">${ICON.disk}</span><span class="bt-wordmark-text">DISK<span class="bt-wordmark-accent">STASH</span></span></div>
      <div class="bt-topnav">${adminBlock()}</div>
    </div>
    <div data-dash-body>${dashBody()}</div>
  </div>`;
}

// ---------- Token specimens ----------

const SWATCHES = [
  ["Surfaces and text", [
    ["Background", "--bt-bg"], ["Surface", "--bt-surface"], ["Surface 2", "--bt-surface-2"], ["Border", "--bt-border"], ["Border 2", "--bt-border-2"],
    ["Text", "--bt-text"], ["Text muted", "--bt-text-muted"], ["Text faint", "--bt-text-faint"],
  ]],
  ["Brand roles", [
    ["Primary", "--bt-primary"], ["Primary hover", "--bt-primary-hover"], ["Primary tint", "--bt-primary-bg"], ["Primary soft", "--bt-primary-soft"],
    ["Title", "--bt-title"], ["Danger", "--bt-danger"], ["Danger hover", "--bt-danger-hover"], ["Error text", "--bt-danger-text"],
  ]],
  ["Admin context", [
    ["Admin text", "--bt-admin-text"], ["Admin accent", "--bt-admin-accent"], ["Admin tint", "--bt-admin-tint"],
    ["Panel background", "--bt-admin-panel-bg"], ["Panel border", "--bt-admin-panel-border"], ["Admin tag", "--bt-admin-tag"],
  ]],
  ["Status", [
    ["Amber", "--bt-amber"], ["Blue", "--bt-blue"], ["Teal", "--bt-teal"], ["Green", "--bt-green"], ["Gray", "--bt-gray"], ["Red", "--bt-red"],
  ]],
];

function swatchesHtml(root) {
  const cs = getComputedStyle(root);
  return SWATCHES.map(([group, items]) => `
    <p class="kit-sub">${group}</p>
    <div class="kit-swatches">${items.map(([name, token]) => `
      <div class="kit-swatch">
        <div class="kit-chip-color" style="background:var(${token})"></div>
        <div class="kit-swatch-body">
          <span class="kit-swatch-name">${name}</span>
          <span class="kit-swatch-token">${token}</span>
          <span class="kit-swatch-token">${cs.getPropertyValue(token).trim()}</span>
        </div>
      </div>`).join("")}
    </div>`).join("");
}

const SPACES = ["0h", "1", "1h", "2", "3", "4", "5", "6", "8", "12", "16"];
const TYPES = [["2xs", 10], ["xs", 11], ["sm", 12], ["md", 13], ["base", 14], ["lg", 16], ["xl", 18], ["2xl", 20], ["3xl", 32]];
const RADII = [["sm", 8], ["md", 10], ["lg", 12], ["xl", 16], ["full", 999]];

// ---------- Detail modal content ----------

function detailContent(r) {
  return `
    ${modalHeader(escapeHtml(r.title))}
    <div class="bt-row-badges" style="gap:var(--bt-space-3)">${badge(r.status)}<span class="bt-meta">Requested by ${escapeHtml(r.author)} on ${formatDate(r.date + "T12:00:00")}</span></div>
    <div class="bt-modal-section">
      <p class="bt-section-label">Description</p>
      <p class="bt-section-text">${escapeHtml(r.desc)}</p>
    </div>
    ${state.admin ? adminPanelHtml(r) : ""}
    <div class="bt-modal-section">
      <p class="bt-section-label">Comments</p>
      ${commentsHtml()}
    </div>
    <div class="bt-modal-section">
      <p class="bt-section-label">History</p>
      ${historyHtml()}
    </div>
    <div class="bt-modal-actions">
      ${state.admin ? `<button type="button" class="bt-btn bt-btn--danger" data-kit-delete>${ICON.trash}Delete request</button>` : ""}
      <button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button>
    </div>`;
}

function adminPanelHtml(r) {
  return `
    <div class="bt-admin-panel">
      <span class="bt-admin-tag">${SHIELD_ICON}Admin only</span>
      <div class="bt-field">
        <label class="bt-label" for="kit-status">Status</label>
        <select class="bt-select" id="kit-status">${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${r && r.status === k ? "selected" : ""}>${s.label}</option>`).join("")}</select>
      </div>
      <div class="bt-field">
        <label class="bt-label" for="kit-note">Note for the history log</label>
        <input class="bt-input" id="kit-note" placeholder="Optional">
        <span class="bt-hint">Shown to members next to the status change.</span>
      </div>
      <div><button type="button" class="bt-btn bt-btn--primary">Save status</button></div>
    </div>`;
}

function commentsHtml() {
  return `
    <div class="bt-comments">
      <div class="bt-comment">
        <div class="bt-comment-head"><span class="bt-comment-author">Vera Crane</span><span class="bt-comment-time">Sep 13, 2026</span></div>
        <p class="bt-comment-text">Would love this for the Resident Evil marathon next month.</p>
      </div>
      <div class="bt-comment">
        <div class="bt-comment-head"><span class="bt-comment-author">Boomertanger</span><span class="bt-admin-tag bt-admin-tag--small">${SHIELD_ICON}Admin</span><span class="bt-comment-time">Sep 14, 2026</span></div>
        <p class="bt-comment-text">Working on it. Clips will save to your member page so you can share them later.</p>
      </div>
    </div>`;
}

function historyHtml() {
  const items = [
    ["in_progress", "Boomertanger", "Sep 14, 2026", "Started building the clip recorder."],
    ["under_review", "Boomertanger", "Sep 12, 2026", ""],
    ["submitted", "Hollow Moth", "Sep 12, 2026", ""],
  ];
  return `<div class="bt-history">${items.map(([key, who, when, note]) => { const s = STATUS[key].label; return `
    <div class="bt-history-item">
      <div class="bt-history-line"><span class="bt-history-dot bt-history-dot--${STATUS[key].tone}"></span><span class="bt-history-rule"></span></div>
      <div class="bt-history-body"><div><strong style="font-weight:600">${s}</strong></div>${note ? `<div style="color:var(--bt-text-muted);margin-top:2px">${note}</div>` : ""}<div class="bt-meta">${who}, ${when}</div></div>
    </div>`; }).join("")}</div>`;
}

function submitContent() {
  return `
    ${modalHeader("New request")}
    <div class="bt-field">
      <label class="bt-label" for="kit-new-title">Title</label>
      <input class="bt-input" id="kit-new-title" placeholder="Short and specific" autofocus>
    </div>
    <div class="bt-field">
      <label class="bt-label" for="kit-new-desc">What should it do?</label>
      <textarea class="bt-textarea" id="kit-new-desc" placeholder="Describe the feature and why you'd use it"></textarea>
      <span class="bt-hint">Other members will see this and can vote on it.</span>
    </div>
    <p class="bt-error" data-kit-err hidden>Add a title before submitting.</p>
    <div class="bt-modal-actions">
      <button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button>
      <button type="button" class="bt-btn bt-btn--primary" data-kit-submit>Submit request</button>
    </div>`;
}

function openSubmit() {
  const { modal, close } = openModal({ content: submitContent(), feature: "ui-kit" });
  modal.querySelector("[data-kit-submit]").addEventListener("click", () => {
    const input = modal.querySelector("#kit-new-title");
    const err = modal.querySelector("[data-kit-err]");
    const empty = !input.value.trim();
    input.setAttribute("aria-invalid", String(empty));
    err.hidden = !empty;
    if (empty) input.focus(); else close();
  });
}

function openDetail(r) {
  const { modal, close } = openModal({ content: detailContent(r), wide: true, feature: "ui-kit" });
  modal.querySelector("[data-kit-delete]")?.addEventListener("click", async () => {
    const ok = await confirmAction({
      title: "Delete this request?",
      message: `"${r.title}" and its votes will be removed. This can't be undone.`,
      confirmLabel: "Delete request",
      busyLabel: "Deleting…",
      feature: "ui-kit",
      onConfirm: () => new Promise((res) => setTimeout(res, 1400)),
    });
    if (ok) {
      close();
      state.rows = state.rows.filter((x) => x.id !== r.id);
      renderPreview();
    }
  });
}

// ---------- Page ----------

function pageHtml() {
  const sizes = [["Full width", "full"], ["1024px", "1024"], ["640px", "640"], ["360px", "360"]];
  const lists = [["Loaded", "loaded"], ["Loading", "loading"], ["Empty", "empty"], ["Error", "error"], ["Logged out", "logged_out"]];
  return `
  <div class="bt-topbar">
    <div class="bt-wordmark"><span class="bt-wordmark-icon">${ICON.kit}</span><span class="bt-wordmark-text">UI<span class="bt-wordmark-accent">KIT</span></span></div>
    <span class="bt-meta">bt-ui @${KIT_VERSION}</span>
  </div>
  <div class="bt-header">
    <h1 class="bt-title">Shared UI kit</h1>
    <p class="bt-subtitle">Every shared component, drawn live from <span class="kit-code">shared/bt-ui.css</span>. Change a token there and every feature follows.</p>
  </div>

  <section class="kit-section">
    <h2 class="kit-h">Feature preview</h2>
    <p class="kit-p">A complete feature built only from shared parts. Change the width to watch the container queries respond, or drag the frame's bottom-right corner. At 640px and below, rows restack and the admin controls fold behind the login icon. At 420px and below, the top bar button keeps only its icon.</p>
    <div class="kit-controls">
      <div class="kit-control"><span class="kit-control-label">Width</span><div class="kit-row" data-kit-width>${sizes.map(([l, v]) => chip(l, v, state.width === v, "bt-chip--small")).join("")}</div></div>
      <div class="kit-control"><span class="kit-control-label">Admin</span><div class="kit-row" data-kit-admin>${chip("Signed out", "out", !state.admin, "bt-chip--small")}${chip("Signed in", "in", state.admin, "bt-chip--small")}</div></div>
      <div class="kit-control"><span class="kit-control-label">List state</span><div class="kit-row" data-kit-list>${lists.map(([l, v]) => chip(l, v, state.list === v, "bt-chip--small")).join("")}</div></div>
    </div>
    <div class="kit-frame" data-kit-frame>${previewHtml()}</div>
    <span class="kit-readout" data-kit-readout></span>
  </section>

  <section class="kit-section">
    <h2 class="kit-h">Dashboard preview</h2>
    <p class="kit-p">An admin dashboard in the style of Disk Stash, built from the same kit. The side column drops below the main one at 1024px, and the table scrolls sideways inside its card on narrow screens instead of squashing.</p>
    <div class="kit-controls">
      <div class="kit-control"><span class="kit-control-label">Width</span><div class="kit-row" data-dash-width>${[["Full width", "full"], ["1024px", "1024"], ["640px", "640"], ["360px", "360"]].map(([l, v]) => chip(l, v, dash.width === v, "bt-chip--small")).join("")}</div></div>
      <div class="kit-control"><span class="kit-control-label">Access</span><div class="kit-row" data-dash-access>${chip("Admin", "admin", true, "bt-chip--small")}${chip("Sign-in gate", "gate", false, "bt-chip--small")}</div></div>
      <div class="kit-control"><span class="kit-control-label">Storage</span><div class="kit-row" data-dash-usage>${chip("Healthy", "healthy", true, "bt-chip--small")}${chip("Near limit", "near", false, "bt-chip--small")}${chip("Over limit", "over", false, "bt-chip--small")}</div></div>
      <div class="kit-control"><span class="kit-control-label">Data</span><div class="kit-row" data-dash-data>${chip("Populated", "populated", true, "bt-chip--small")}${chip("Empty", "empty", false, "bt-chip--small")}</div></div>
    </div>
    <div class="kit-frame" data-dash-frame>${dashboardHtml()}</div>
    <span class="kit-readout" data-dash-readout></span>
  </section>


  <section class="kit-section" id="kit-heading-options">
    <h2 class="kit-h">Card title options</h2>
    <p class="kit-p">Candidates for heading level 3. Pick one with the chips to apply it to the dashboard preview above, then scroll up to judge it in context.</p>
    <div class="kit-control"><span class="kit-control-label">Apply to dashboard preview</span><div class="kit-row" data-heading-pick>${[["A · Current", "a"], ["B · Bigger", "b"], ["C · Gold marker", "c"], ["D · Warm tint", "d"], ["E · Small caps", "e"]].map(([l, v]) => chip(l, v, v === "a", "bt-chip--small")).join("")}</div></div>
    <div class="kit-options">
      ${[["a", "A · Current", "16px semibold, off-white."], ["b", "B · Bigger", "18px bold, off-white. More weight, same calm color."], ["c", "C · Gold marker", "18px bold with a short gold bar. Brings in brand color without gold text."], ["d", "D · Warm tint", "18px bold in a pale gold. Related to the page title but clearly a step down."], ["e", "E · Small caps", "13px bold uppercase, spaced out. Would collide with level 4 labels, which are also uppercase."]].map(([k, name, desc]) => `
      <div class="kit-option" data-heading="${k}">
        <div class="bt-card">
          <div class="bt-card-head"><h3 class="bt-card-title">Tracked files</h3><span class="bt-card-meta">5 files</span></div>
          <p class="bt-section-label" style="margin:0">Description</p>
          <p class="bt-fineprint">Files saved by site features.</p>
        </div>
        <span class="kit-note"><strong style="color:var(--bt-text-muted);font-weight:600">${name}.</strong> ${desc}</span>
      </div>`).join("")}
    </div>
  </section>
  <section class="kit-section">
    <h2 class="kit-h">Heading levels</h2>
    <p class="kit-p">Four levels, used the same way in every feature. Gold text is reserved for the top two so it stays special; level 3 gets a small gold tick instead.</p>
    <div class="kit-ladder">
      <div class="kit-ladder-row"><span class="kit-scale-name">1 · Page title<br><span class="kit-code">.bt-title</span></span><span class="bt-title">Feature requests</span></div>
      <div class="kit-ladder-row"><span class="kit-scale-name">2 · Dialog title<br><span class="kit-code">.bt-modal-title</span></span><span class="bt-modal-title">Clip button on the live page</span></div>
      <div class="kit-ladder-row"><span class="kit-scale-name">3 · Card or section<br><span class="kit-code">.bt-heading</span></span><span class="bt-heading">Tracked files</span></div>
      <div class="kit-ladder-row"><span class="kit-scale-name">4 · Label<br><span class="kit-code">.bt-section-label</span></span><span class="bt-section-label" style="margin:0">Description</span></div>
      <div class="kit-ladder-row"><span class="kit-scale-name">Data, not a heading<br><span class="kit-code">.bt-stat</span></span><span class="bt-stat"><span class="bt-stat-value">12.4 GB</span><span class="bt-stat-unit">of 25 GB</span></span></div>
    </div>
  </section>

  <section class="kit-section">
    <h2 class="kit-h">Colors</h2>
    <p class="kit-p">Purple is for things you can click. Orange is for page titles. Red is only for actions that destroy data. Green marks admin-only areas. Status colors just need to stay distinct from each other and from purple.</p>
    <div class="kit-stack" data-kit-swatches></div>
  </section>

  <section class="kit-section">
    <h2 class="kit-h">Spacing, type, and corners</h2>
    <div class="kit-grid-2">
      <div class="kit-stack">
        <p class="kit-sub">Spacing scale</p>
        <div class="kit-scale">${SPACES.map((s) => `<div class="kit-scale-row"><span class="kit-scale-name">--bt-space-${s}</span><span class="kit-bar" style="width:var(--bt-space-${s})"></span></div>`).join("")}</div>
      </div>
      <div class="kit-stack">
        <p class="kit-sub">Type scale (Inter)</p>
        <div class="kit-scale">${TYPES.map(([n, px]) => `<div class="kit-scale-row"><span class="kit-scale-name">${n} · ${px}px</span><span class="kit-type-sample" style="font-size:var(--bt-text-${n})">The fog rolls in at midnight</span></div>`).join("")}</div>
      </div>
    </div>
    <p class="kit-sub">Corner radii</p>
    <div class="kit-radii">${RADII.map(([n, px]) => `<div class="kit-radius" style="border-radius:var(--bt-radius-${n})">${n}</div>`).join("")}</div>
  </section>

  <section class="kit-section">
    <h2 class="kit-h">Buttons</h2>
    <div class="kit-row">
      <button type="button" class="bt-btn bt-btn--primary">${ICON.plus}New request</button>
      <button type="button" class="bt-btn bt-btn--secondary">Cancel</button>
      <button type="button" class="bt-btn bt-btn--ghost">Clear filters</button>
      <button type="button" class="bt-btn bt-btn--danger">${ICON.trash}Delete report</button>
      <button type="button" class="bt-btn bt-btn--primary" disabled>Disabled</button>
      <button type="button" class="bt-btn bt-btn--danger" disabled><span class="bt-spinner" aria-hidden="true"></span>Deleting…</button>
      <button type="button" class="bt-icon-btn" aria-label="Close">${'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'}</button>
    </div>
    <p class="kit-sub">Admin controls</p>
    <div class="kit-row">
      <button type="button" class="bt-signin-btn">Sign in as Admin</button>
      <span class="bt-admin-pill"><span class="bt-admin-pill-dot"></span>Admin</span>
      <button type="button" class="bt-signout-row">${SIGNOUT_ICON}Sign out</button>
    </div>
  </section>

  <section class="kit-section">
    <h2 class="kit-h">Chips, badges, and counters</h2>
    <p class="kit-sub">Filter chips</p>
    <div class="kit-row">${chip("All", "a", true)}${chip("Open", "b", false)}${chip("Fixed", "c", false)}</div>
    <p class="kit-sub">Sort chips</p>
    <div class="bt-sortbar" style="padding:0">${chip("Most votes", "a", true, "bt-chip--small")}${chip("Newest", "b", false, "bt-chip--small")}</div>
    <p class="kit-sub">Status badges</p>
    <div class="kit-row">
      <span class="bt-badge bt-badge--gray"><span class="bt-badge-dot"></span>Submitted</span>
      <span class="bt-badge bt-badge--blue"><span class="bt-badge-dot"></span>Under review</span>
      <span class="bt-badge bt-badge--amber"><span class="bt-badge-dot"></span>Planned</span>
      <span class="bt-badge bt-badge--teal"><span class="bt-badge-dot"></span>In progress</span>
      <span class="bt-badge bt-badge--green"><span class="bt-badge-dot"></span>Fixed</span>
      <span class="bt-badge bt-badge--red"><span class="bt-badge-dot"></span>Critical</span>
      <span class="bt-badge bt-badge--gray">No dot</span>
    </div>
    <p class="kit-sub">Counters, avatar, and tally</p>
    <div class="kit-row">
      <span class="bt-count">${ICON.comment}7</span>
      <span class="bt-avatar">HM</span>
      <button type="button" class="bt-tally" data-kit-demo-tally aria-pressed="false">${ICON.up}<span class="bt-tally-count">12</span><span class="bt-tally-label">votes</span></button>
      <button type="button" class="bt-tally is-active" aria-pressed="true">${ICON.up}<span class="bt-tally-count">5</span><span class="bt-tally-label">me too</span></button>
    </div>
  </section>

  <section class="kit-section">
    <h2 class="kit-h">Forms</h2>
    <p class="kit-p">Inputs use 16px text so iPhones don't zoom the page when a field is tapped. Every field shows a purple focus ring.</p>
    <div class="kit-grid-2">
      <div class="kit-stack">
        <div class="bt-field"><label class="bt-label" for="kf1">Title</label><input class="bt-input" id="kf1" placeholder="Short and specific"></div>
        <div class="bt-field"><label class="bt-label" for="kf2">Severity</label><select class="bt-select" id="kf2"><option>Low</option><option>Normal</option><option>High</option><option>Critical</option></select></div>
      </div>
      <div class="kit-stack">
        <div class="bt-field"><label class="bt-label" for="kf3">Steps to reproduce</label><textarea class="bt-textarea" id="kf3" placeholder="What did you click, and what happened?"></textarea><span class="bt-hint">Screenshots help. You can attach one on the next step.</span></div>
        <div class="bt-field"><label class="bt-label" for="kf4">Email</label><input class="bt-input" id="kf4" value="not-an-email" aria-invalid="true"><span class="bt-error">Enter an email address like name@example.com.</span></div>
      </div>
    </div>
  </section>

  <section class="kit-section">
    <h2 class="kit-h">Dialogs</h2>
    <p class="kit-p">Dialogs close with Escape, a click outside, or the close button, and keep keyboard focus inside while open. Delete confirmations lock every control while the request runs, so a double-click can't fire twice.</p>
    <div class="kit-row">
      <button type="button" class="bt-btn bt-btn--primary" data-kit-new>Open a form dialog</button>
      <button type="button" class="bt-btn bt-btn--secondary" data-kit-open-detail>Open a detail view</button>
      <button type="button" class="bt-btn bt-btn--danger" data-kit-confirm-ok>Try a delete</button>
      <button type="button" class="bt-btn bt-btn--secondary" data-kit-confirm-fail>Try a delete that fails</button>
    </div>
    <p class="kit-note">Dialogs open just below the site header, measured at the moment they open: 32px below it on wide screens, 24px at tablet width, 16px on phones. When scroll-back has hidden the header, they open that same distance from the top of the screen instead. This preview has a stand-in header so you can try both.</p>
  </section>


  <section class="kit-section">
    <h2 class="kit-h">Dashboard parts</h2>
    <p class="kit-p">Row-level destructive actions use a red outline, so a table full of them stays calm. The solid red button is saved for the final confirmation. Monospace appears only for literal identifiers like <span class="bt-code">bugReports/k2Pq81</span>.</p>
    <p class="kit-sub">Meters</p>
    <div class="kit-grid-2">
      <div class="bt-meter bt-meter--green"><div class="bt-meter-track"><div class="bt-meter-fill" style="width:48%"></div><div class="bt-meter-marker" style="left:80%"></div></div><div class="bt-meter-legend"><span>Healthy</span><span>48%</span></div></div>
      <div class="bt-meter bt-meter--amber"><div class="bt-meter-track"><div class="bt-meter-fill" style="width:85%"></div><div class="bt-meter-marker" style="left:80%"></div></div><div class="bt-meter-legend"><span>Past the marker</span><span>85%</span></div></div>
      <div class="bt-meter bt-meter--red"><div class="bt-meter-track"><div class="bt-meter-fill" style="width:100%"></div><div class="bt-meter-marker" style="left:80%"></div></div><div class="bt-meter-legend"><span>Over limit</span><span>104%</span></div></div>
      <div class="bt-meter bt-meter--blue"><div class="bt-meter-track"><div class="bt-meter-fill" style="width:30%"></div></div><div class="bt-meter-legend"><span>Neutral progress, no marker</span><span>30%</span></div></div>
    </div>
    <p class="kit-sub">Small buttons and switches</p>
    <div class="kit-row">
      <button type="button" class="bt-btn bt-btn--sm bt-btn--primary">Save rule</button>
      <button type="button" class="bt-btn bt-btn--sm bt-btn--secondary">${ICON.plus}Add rule</button>
      <button type="button" class="bt-btn bt-btn--sm bt-btn--danger-outline">Purge</button>
      <button type="button" class="bt-icon-btn bt-icon-btn--sm" aria-label="Delete">${ICON.x}</button>
      <button type="button" class="bt-switch" role="switch" aria-checked="true" data-kit-switch aria-label="Example switch, on"></button>
      <button type="button" class="bt-switch" role="switch" aria-checked="false" data-kit-switch aria-label="Example switch, off"></button>
      <button type="button" class="bt-switch" role="switch" aria-checked="false" disabled aria-label="Disabled switch"></button>
    </div>
    <p class="kit-sub">Card with compact empty state and fine print</p>
    <div class="kit-grid-2">
      <div class="bt-card"><div class="bt-card-head"><h3 class="bt-card-title">Cleanup rules</h3><span class="bt-card-meta">0 rules</span></div><div class="bt-empty bt-empty--compact"><p>No cleanup rules yet. Add one to delete old files automatically.</p></div><p class="bt-fineprint">Rules run once a day at 9:00 AM Pacific.</p></div>
    </div>
  </section>
  <section class="kit-section">
    <h2 class="kit-h">Detail building blocks</h2>
    <div class="kit-grid-2">
      <div class="kit-stack">${adminPanelHtml(ROWS[0])}</div>
      <div class="kit-stack">
        <div class="bt-modal-section"><p class="bt-section-label">Comments</p>${commentsHtml()}</div>
        <div class="bt-modal-section"><p class="bt-section-label">History</p>${historyHtml()}</div>
      </div>
    </div>
  </section>`;
}

let menu;

function renderPreview() {
  const body = document.querySelector("[data-kit-preview-body]");
  body.innerHTML = previewBody();
}

function applyAdmin() {
  const p = document.getElementById("kit-preview");
  p.querySelector("[data-kit-signin]").hidden = state.admin;
  p.querySelector("[data-kit-pill]").hidden = !state.admin;
  p.querySelector("[data-kit-signout]").hidden = !state.admin;
  menu.sync();
}

function setChips(group, value) {
  group.querySelectorAll(".bt-chip").forEach((c) => {
    const on = c.dataset.value === value;
    c.classList.toggle("is-active", on);
    c.setAttribute("aria-pressed", String(on));
  });
}

function init() {
  const mount = document.getElementById("bt-ui-kit");
  if (!mount) return;
  mount.classList.add("bt-root");
  mount.innerHTML = pageHtml();
  mount.querySelector("[data-kit-swatches]").innerHTML = swatchesHtml(mount);

  const frame = mount.querySelector("[data-kit-frame]");
  const readout = mount.querySelector("[data-kit-readout]");
  const preview = document.getElementById("kit-preview");
  new ResizeObserver(() => {
    readout.textContent = `Container width: ${Math.round(preview.getBoundingClientRect().width)}px`;
  }).observe(preview);

  menu = initAdminMenu(preview);
  applyAdmin();

  mount.querySelector("[data-kit-width]").addEventListener("click", (e) => {
    const c = e.target.closest(".bt-chip"); if (!c) return;
    state.width = c.dataset.value; setChips(e.currentTarget, state.width);
    frame.style.width = state.width === "full" ? "100%" : `${Number(state.width) + 26}px`;
  });
  mount.querySelector("[data-kit-admin]").addEventListener("click", (e) => {
    const c = e.target.closest(".bt-chip"); if (!c) return;
    state.admin = c.dataset.value === "in"; setChips(e.currentTarget, c.dataset.value); applyAdmin();
  });
  mount.querySelector("[data-kit-list]").addEventListener("click", (e) => {
    const c = e.target.closest(".bt-chip"); if (!c) return;
    state.list = c.dataset.value; setChips(e.currentTarget, state.list); renderPreview();
  });


  // Dashboard preview wiring
  const dFrame = mount.querySelector("[data-dash-frame]");
  const dReadout = mount.querySelector("[data-dash-readout]");
  const dRoot = document.getElementById("kit-dash");
  new ResizeObserver(() => { dReadout.textContent = `Container width: ${Math.round(dRoot.getBoundingClientRect().width)}px`; }).observe(dRoot);
  const dMenu = initAdminMenu(dRoot);
  const renderDash = () => { dRoot.querySelector("[data-dash-body]").innerHTML = dashBody(); };
  const applyDashAdmin = () => {
    const signedIn = dash.access === "admin";
    dRoot.querySelector("[data-kit-signin]").hidden = signedIn;
    dRoot.querySelector("[data-kit-pill]").hidden = !signedIn;
    dRoot.querySelector("[data-kit-signout]").hidden = !signedIn;
    dMenu.sync();
  };
  const setAccess = (v) => { dash.access = v; setChips(mount.querySelector("[data-dash-access]"), v); applyDashAdmin(); renderDash(); dMenu.close(); };
  applyDashAdmin();
  const group = (sel, fn) => mount.querySelector(sel).addEventListener("click", (e) => { const c = e.target.closest(".bt-chip"); if (!c) return; setChips(e.currentTarget, c.dataset.value); fn(c.dataset.value); });
  group("[data-heading-pick]", (v) => { dRoot.dataset.heading = v; });
  group("[data-dash-width]", (v) => { dash.width = v; dFrame.style.width = v === "full" ? "100%" : `${Number(v) + 26}px`; });
  group("[data-dash-access]", (v) => setAccess(v));
  group("[data-dash-usage]", (v) => { dash.usage = v; renderDash(); });
  group("[data-dash-data]", (v) => { dash.data = v; dash.adding = false; renderDash(); });
  dRoot.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.closest("[data-kit-signin], [data-dash-signin]")) { e.stopPropagation(); setAccess("admin"); return; }
    if (t.closest("[data-kit-signout]")) { e.stopPropagation(); setAccess("gate"); return; }
    if (t.closest("[data-dash-add]")) { dash.adding = true; renderDash(); dRoot.querySelector("#kr1")?.focus(); return; }
    if (t.closest("[data-dash-cancel]") || t.closest("[data-dash-save]")) {
      if (t.closest("[data-dash-save]")) {
        const f = dRoot.querySelector("#kr1").value.trim() || "featureLab";
        dash.rules.push({ id: "c" + Date.now(), feature: f, field: dRoot.querySelector("#kr3").value.trim() || "status", value: dRoot.querySelector("#kr4").value.trim() || "declined", days: Number(dRoot.querySelector("#kr5").value) || 90, on: true });
        if (dash.data === "empty") { dash.data = "populated"; setChips(mount.querySelector("[data-dash-data]"), "populated"); }
      }
      dash.adding = false; renderDash(); return;
    }
    const tog = t.closest("[data-dash-toggle]");
    if (tog) { const r = dash.rules.find((x) => x.id === tog.dataset.dashToggle); r.on = !r.on; renderDash(); dRoot.querySelector(`[data-dash-toggle="${r.id}"]`)?.focus(); return; }
    const del = t.closest("[data-dash-delrule]");
    if (del) {
      const r = dash.rules.find((x) => x.id === del.dataset.dashDelrule);
      const ok = await confirmAction({ title: "Delete this rule?", message: `Files from ${r.feature} will no longer be cleaned up automatically. Files already deleted stay deleted.`, confirmLabel: "Delete rule", busyLabel: "Deleting…", feature: "ui-kit", onConfirm: () => new Promise((res) => setTimeout(res, 900)) });
      if (ok) { dash.rules = dash.rules.filter((x) => x.id !== r.id); renderDash(); }
      return;
    }
    const purge = t.closest("[data-dash-purge]");
    if (purge) {
      const a = dash.assets.find((x) => x.id === purge.dataset.dashPurge);
      const ok = await confirmAction({ title: "Purge this file?", message: `Deletes the file for ${a.path} from Cloudinary, then clears the link on that record. This can't be undone.`, confirmLabel: "Purge file", busyLabel: "Purging…", feature: "ui-kit", onConfirm: () => new Promise((res) => setTimeout(res, 1200)) });
      if (ok) { dash.assets = dash.assets.filter((x) => x.id !== a.id); renderDash(); }
    }
  });

  mount.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-kit-signin]")) { state.admin = true; setChips(mount.querySelector("[data-kit-admin]"), "in"); applyAdmin(); menu.close(); return; }
    if (t.closest("[data-kit-signout]")) { state.admin = false; setChips(mount.querySelector("[data-kit-admin]"), "out"); applyAdmin(); menu.close(); return; }
    if (t.closest("[data-kit-new]")) { openSubmit(); return; }
    if (t.closest("[data-kit-retry]")) { state.list = "loading"; setChips(mount.querySelector("[data-kit-list]"), "loading"); renderPreview(); setTimeout(() => { state.list = "loaded"; setChips(mount.querySelector("[data-kit-list]"), "loaded"); renderPreview(); }, 1200); return; }
    if (t.closest("[data-kit-open-detail]")) { openDetail(state.rows.find((x) => x.status === "planned") || state.rows[0] || ROWS[0]); return; }
    if (t.closest("[data-kit-confirm-ok]")) {
      confirmAction({ title: "Delete this report?", message: "The report and its screenshot will be removed. This can't be undone.", confirmLabel: "Delete report", feature: "ui-kit", onConfirm: () => new Promise((r) => setTimeout(r, 1400)) });
      return;
    }
    if (t.closest("[data-kit-confirm-fail]")) {
      confirmAction({ title: "Delete this report?", message: "This one is set up to fail so you can see the error state.", confirmLabel: "Delete report", feature: "ui-kit", onConfirm: () => new Promise((_, rej) => setTimeout(() => rej(new Error("Couldn't delete the report. The server didn't respond. Try again.")), 1400)) });
      return;
    }
    const sw = t.closest("[data-kit-switch]");
    if (sw) { sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true")); return; }
    const demoTally = t.closest("[data-kit-demo-tally]");
    if (demoTally) {
      const on = !demoTally.classList.contains("is-active");
      demoTally.classList.toggle("is-active", on); demoTally.setAttribute("aria-pressed", String(on));
      const n = demoTally.querySelector(".bt-tally-count"); n.textContent = Number(n.textContent) + (on ? 1 : -1);
      return;
    }
    const vote = t.closest("[data-vote]");
    if (vote) {
      const r = state.rows.find((x) => x.id === vote.dataset.vote);
      r.voted = !r.voted; r.votes += r.voted ? 1 : -1; renderPreview(); return;
    }
    const f = t.closest("[data-kit-filters] .bt-chip");
    if (f) { state.filter = f.dataset.value; renderPreview(); return; }
    const s = t.closest("[data-kit-sort] .bt-chip");
    if (s) { state.sort = s.dataset.value; renderPreview(); return; }
    const row = t.closest("[data-row]");
    if (row) openDetail(state.rows.find((x) => x.id === row.dataset.row));
  });
  mount.addEventListener("keydown", (e) => {
    const row = e.target.closest?.("[data-row]");
    if (row && e.target === row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDetail(state.rows.find((x) => x.id === row.dataset.row)); }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
