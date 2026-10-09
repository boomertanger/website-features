// shared/ui-kit/ui-kit.js — renders the UI Kit reference page into #bt-ui-kit.
// Squarespace Code Block: <div id="bt-ui-kit"></div> + this script + ui-kit.css
// (bt-ui.css itself comes from Header Code Injection).
import { escapeHtml, formatDate, initials, levelBars } from "../ui/dom.js";
import { openModal, modalHeader } from "../ui/modal.js";
import { confirmAction } from "../ui/confirm.js";
import { initAdminMenu, LOGIN_ICON, SIGNOUT_ICON, SHIELD_ICON, PENCIL_ICON } from "../ui/admin-menu.js";
import { initRowSpotlight } from "../ui/effects.js";
import { composerHtml, initComposer } from "../ui/composer.js";
import { thumbHtml, initLightboxTriggers } from "../ui/lightbox.js";
import { BA_ICON, ttsLogoHtml, boombotIcon } from "../ui/arcade.js";
import { initSegNav } from "../ui/seg-nav.js";
import { initToc } from "../ui/toc.js";
import { initSpotlights } from "../ui/spotlight.js";
import { cycleWheelHtml, initCycleWheels } from "../ui/cycle-wheel.js";
import { coverHtml, initCoverFallbacks } from "../ui/cover.js";
import { initTilt } from "../ui/tilt.js";
import { initCountUp } from "../ui/count-up.js";
import { dialHtml, initDials } from "../ui/dial.js";
import { initCmd, litText } from "../ui/cmd.js";
import { initShelves } from "../ui/shelf.js";
import { sectionHeadHtml } from "../ui/section-head.js";
import { timelineHtml, initTimelines } from "../ui/timeline.js";
import { initDeck, flyOut } from "../ui/deck.js";
import { medalHtml, RARITY } from "../ui/medal.js";
import { initFlipCards } from "../ui/flip-card.js";
import { initChat } from "../ui/chat.js";
import { toast } from "../ui/toast.js";
import { stepperHtml, keepOpenInView } from "../ui/stepper.js";
import { lanesHtml } from "../ui/lanes.js";
import { taskRowHtml, lockCardHtml, clockHtml, pathHtml } from "../ui/season.js";
import { timerHtml, initTimers } from "../ui/countdown.js";
import { backHtml, pagerHtml } from "../ui/pager.js";
import { roadHtml, initRoad } from "../ui/road.js";
import { initTree } from "../ui/tree.js";
import { gradeChipHtml } from "../ui/grade-chip.js";
import { MM_ICON } from "../ui/mod-machina.js";
import { platformIconHtml, roomHtml, crewCardHtml, podiumHtml, timecardHtml, ringHtml } from "../ui/crew.js";
import { swapRowHtml, swapsHtml } from "../ui/swap.js";
import { prefHtml, initPrefs, PREF_OPTIONS } from "../ui/pref.js";
import { ladderHtml, ladderDetailHtml, initLadder } from "../ui/ladder.js";
import { quizHtml, initQuiz, showQuizResults } from "../ui/quiz.js";
import { stampHtml } from "../ui/stamp.js";
import { dayPickerHtml, initDayPicker, DAYS } from "../ui/day-picker.js";
import { chatTileHtml, chatPreviewHtml, initChatTiles } from "../ui/chat-tile.js";
import { initJourney } from "../ui/how-it-works.js";
import { screamPlannerKitHtml, initScreamPlannerKit } from "./kit-scream-planner.js";
import { controlRoomKitHtml, initControlRoomKit } from "./kit-control-room.js";
import { initNavGroups, featureLoadingHtml, watchFeatureHtml, playFeatureHtml, communityFeatureHtml, initWatchTile } from "../ui/navgroup.js";

const KIT_VERSION = "dev";

const ICON = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"></polyline></svg>',
  comment: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>',
  cloud: '<svg viewBox="0 0 32 32" overflow="visible" aria-hidden="true"><path d="M9 21a5.5 5.5 0 0 1-.6-10.97A6.5 6.5 0 0 1 21 8.5a5 5 0 0 1 .5 9.98" fill="none" stroke="var(--bt-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><rect x="10" y="19" width="3" height="6" rx="1" fill="var(--bt-primary)"></rect><rect x="14.5" y="16" width="3" height="9" rx="1" fill="var(--bt-primary)"></rect><rect x="19" y="18" width="3" height="7" rx="1" fill="var(--bt-primary)"></rect><rect class="kit-bar-glow" x="10" y="19" width="3" height="6" rx="1" fill="var(--bt-title)"></rect><rect class="kit-bar-glow" x="14.5" y="16" width="3" height="9" rx="1" fill="var(--bt-title)" style="animation-delay:.35s"></rect><rect class="kit-bar-glow" x="19" y="18" width="3" height="7" rx="1" fill="var(--bt-title)" style="animation-delay:.7s"></rect></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  kit: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="11" height="11" rx="2.5" fill="var(--bt-primary)"></rect><rect x="18" y="3" width="11" height="11" rx="5.5" fill="var(--bt-title)"></rect><rect x="3" y="18" width="11" height="11" rx="5.5" fill="var(--bt-text)"></rect><rect x="18" y="18" width="11" height="11" rx="2.5" fill="none" stroke="var(--bt-primary)" stroke-width="2"></rect></svg>',
  // Animated on purpose: the pulse ring bursts well past the 32px icon box,
  // like the real feature icons, to prove the top bar doesn't clip or shift.
  demo: '<svg class="kit-demo-icon" viewBox="0 0 32 32" overflow="visible" aria-hidden="true"><circle class="kit-pulse" cx="16" cy="16" r="6" fill="none" stroke="var(--bt-title)" stroke-width="1.5"></circle><path d="M16 3 L27 9.5 V22.5 L16 29 L5 22.5 V9.5 Z" fill="none" stroke="var(--bt-primary)" stroke-width="2" stroke-linejoin="round"></path><circle cx="16" cy="16" r="4.5" fill="var(--bt-title)"></circle></svg>',
};


// Demo screenshot: a fake page with small text, so enlarging it matters.
const DEMO_SHOT = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
<rect width="1600" height="1000" fill="#0f0f0f"/><rect width="1600" height="90" fill="#151215"/>
<text x="60" y="58" font-family="Arial" font-size="34" font-weight="700" fill="#ffa100">BOOMER<tspan fill="#f4f2ea">TANGER</tspan></text>
<text x="1080" y="56" font-family="Arial" font-size="24" fill="#a89a9c">Watch    Live    Schedule    Shop</text>
<rect x="60" y="140" width="1040" height="585" rx="10" fill="#1e1a1d"/><text x="480" y="440" font-family="Arial" font-size="40" fill="#332b2e">LIVE STREAM</text>
<rect x="60" y="640" width="1040" height="60" fill="#000" opacity=".6"/><text x="140" y="680" font-family="Arial" font-size="26" fill="#fff">[Subtitles] Did you hear that? Something is in the basement...</text>
<rect x="780" y="520" width="300" height="200" rx="8" fill="#241f22" stroke="#9146ff" stroke-width="3"/>
<text x="800" y="560" font-family="Arial" font-size="20" fill="#c9a8ff">ChatOverlay v2.3</text>
<text x="800" y="600" font-family="Arial" font-size="18" fill="#a89a9c">GrimTuesday: RUN</text><text x="800" y="630" font-family="Arial" font-size="18" fill="#a89a9c">HollowMoth: nope nope</text><text x="800" y="660" font-family="Arial" font-size="18" fill="#a89a9c">VeraCrane: subtitles hidden!</text>
<rect x="1140" y="140" width="400" height="585" rx="10" fill="#1a1619"/><text x="1170" y="190" font-family="Arial" font-size="22" font-weight="700" fill="#f4f2ea">Up next</text>
<text x="1170" y="240" font-family="Arial" font-size="18" fill="#786e70">Fri 9:00 PM  Resident Evil marathon</text><text x="1170" y="275" font-family="Arial" font-size="18" fill="#786e70">Sat 8:30 PM  Viewer picks</text>
<text x="60" y="800" font-family="Arial" font-size="16" fill="#786e70">Console: TypeError: overlay.zIndex is undefined at chat-overlay.js:214:17</text>
</svg>`);

// The site-wide badge system (same word, same color in every feature).
const STATUS = {
  submitted:   { label: "Submitted",   tone: "blue" },
  under_review: { label: "Under review", tone: "teal" },
  planned:     { label: "Planned",     tone: "gold" },
  in_progress: { label: "In progress", tone: "green" },
  shipped:     { label: "Shipped",     tone: "lime" },
  declined:    { label: "Declined",    tone: "gray" },
};
const BADGE_SYSTEM = [
  ["Bug: how bad is it", "level", [["blue", "Cosmetic"], ["gold", "Minor"], ["pink", "Major"], ["red", "Critical"]]],
  ["Bug: priority", "level", [["blue", "Low"], ["gold", "Normal"], ["pink", "High"], ["red", "Urgent"]]],
  ["Bug: status", "status", [["blue", "Open"], ["green", "In progress"], ["lime", "Fixed"], ["gray", "Won't fix"], ["gray", "Can't reproduce"], ["gray", "Duplicate"]]],
  ["Feature: priority", "level", [["blue", "Low"], ["gold", "Medium"], ["pink", "High"]]],
  ["Feature: status", "status", [["blue", "Submitted"], ["teal", "Under review"], ["gold", "Planned"], ["green", "In progress"], ["lime", "Shipped"], ["gray", "Declined"]]],
];
const PRIORITY = [["blue", "Low"], ["gold", "Medium"], ["pink", "High"]];
const levelBadge = (i, list) => `<span class="bt-badge bt-badge--${list[i][0]}">${levelBars(i + 1, list.length)}${list[i][1]}</span>`;

const ROWS = [
  { id: "r1", title: "Clip button on the live page", desc: "Let viewers grab the last 30 seconds of the stream without leaving the site or opening Twitch.", votes: 42, voted: true, status: "in_progress", comments: 7, pri: 2, author: "Hollow Moth", date: "2026-09-12" },
  { id: "r2", title: "Spoiler tags in chat", desc: "Blur messages about endings and jump scares until you click to reveal them.", votes: 31, voted: false, status: "submitted", comments: 4, pri: 1, author: "Vera Crane", date: "2026-09-03" },
  { id: "r6", title: "Rewind the live stream", desc: "Scrub back a few minutes during a stream to catch a jump scare you missed.", votes: 24, voted: false, status: "under_review", comments: 3, pri: 1, author: "Ash", date: "2026-09-05" },
  { id: "r3", title: "Schedule shown in my time zone", desc: "The events page lists everything in Eastern time. Convert it to wherever I am.", votes: 18, voted: false, status: "planned", comments: 2, pri: 0, author: "Ash", date: "2026-08-27" },
  { id: "r4", title: "Monthly scare-o-meter leaderboard", desc: "Rank the games by how many times chat screamed.", votes: 57, voted: true, status: "shipped", comments: 12, pri: 2, author: "Grim Tuesday", date: "2026-07-30" },
  { id: "r5", title: "Move the community to a forum", desc: "Replace the Discord with threaded forum boards on the site.", votes: 6, voted: false, status: "declined", comments: 9, pri: 0, author: "Pale Rider", date: "2026-07-11" },
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
      <div class="bt-row-badges">${badge(r.status)}${levelBadge(r.pri ?? 0, PRIORITY)}</div>
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


// ---------- Dashboard preview (Cloud Stash–style) ----------

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
            <td class="bt-table-action"><button type="button" class="bt-btn bt-btn--sm bt-btn--danger" data-dash-purge="${a.id}">Purge</button></td>
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
        <button type="button" class="bt-btn bt-btn--sm bt-btn--admin" data-dash-save>Save rule</button>
      </div>
    </div>` : "";
  return `
  <div class="bt-card">
    <div class="bt-card-head">
      <h2 class="bt-card-title">Cleanup rules</h2>
      ${dash.adding ? "" : `<button type="button" class="bt-btn bt-btn--sm bt-btn--admin" data-dash-add>${ICON.plus}Add rule</button>`}
    </div>
    ${items}
    ${form}
  </div>`;
}

function dashBody() {
  if (dash.access === "gate") {
    return `
    <div class="bt-logged-out">
      <div class="bt-wordmark"><span class="bt-wordmark-icon">${ICON.cloud}</span><span class="bt-wordmark-text">CLOUD<span class="bt-wordmark-accent">STASH</span></span></div>
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
      <div class="bt-wordmark"><span class="bt-wordmark-icon">${ICON.cloud}</span><span class="bt-wordmark-text">CLOUD<span class="bt-wordmark-accent">STASH</span></span></div>
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
  ["Boom Arcade ranks (one set for boards and the podium; rank-silver / rank-bronze are aliases of 2 / 3)", [
    ["Rank 1 gold", "--bt-rank-1"], ["Rank 2 silver", "--bt-rank-2"], ["Rank 3 orange", "--bt-rank-3"], ["Rank 4 dark grey", "--bt-rank-4"], ["Rank 5 pink", "--bt-rank-5"],
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

function detailSubtitle(r) {
  return `<span class="bt-meta">Requested by ${escapeHtml(r.author)} on ${formatDate(r.date + "T12:00:00")}</span>` +
    (r.editedAt ? `<br><span class="bt-edited">${PENCIL_ICON}Edited by an admin on ${formatDate(r.editedAt)}</span>` : "");
}

function detailContent(r) {
  const tools = state.admin ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--admin" data-kit-edit aria-label="Edit">${PENCIL_ICON}<span class="bt-btn-label">Edit</span></button>` : "";
  return `
    ${modalHeader(escapeHtml(r.title), detailSubtitle(r), tools)}
    <div class="bt-row-badges">${badge(r.status)}</div>
    <div class="bt-modal-section">
      <p class="bt-section-label">Description</p>
      <p class="bt-section-text">${escapeHtml(r.desc)}</p>
    </div>
    <div class="bt-modal-section">
      <p class="bt-section-label">Screenshot</p>
      ${thumbHtml({ src: DEMO_SHOT, alt: "Screenshot of the live page" })}
    </div>
    ${state.admin ? adminPanelHtml(r) : ""}
    <div class="bt-modal-section">
      <p class="bt-section-label">Comments</p>
      ${commentsHtml()}
      <div style="margin-top:var(--bt-space-3)">${composerHtml()}</div>
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

function editContent(r) {
  return `
    <div class="bt-edit-banner"><span class="bt-admin-tag bt-admin-tag--small">${SHIELD_ICON}Editing as admin</span><span class="bt-meta">Changes are logged</span></div>
    ${modalHeader(escapeHtml(r.title), detailSubtitle(r))}
    <div class="bt-field"><label class="bt-label" for="kit-e-title">Title</label><input class="bt-input" id="kit-e-title" data-edit="title" value="${escapeHtml(r.title)}"></div>
    <div class="bt-field"><label class="bt-label" for="kit-e-desc">What should it do?</label><textarea class="bt-textarea" id="kit-e-desc" data-edit="desc">${escapeHtml(r.desc)}</textarea></div>
    <div class="bt-field"><label class="bt-label" for="kit-e-reason">Reason for the edit</label><input class="bt-input" id="kit-e-reason" data-reason placeholder="Optional, saved to the admin log"></div>
    <div class="bt-modal-actions">
      <button type="button" class="bt-btn bt-btn--secondary" data-kit-edit-cancel>Cancel</button>
      <button type="button" class="bt-btn bt-btn--admin" data-kit-edit-save disabled>Save changes</button>
    </div>`;
}

function activityHtml(r) {
  const items = (r.activity || []);
  return `<div class="bt-modal-section"><p class="bt-section-label">Admin activity</p>${items.length ? `<div class="bt-history">${items.map((a) => `
    <div class="bt-history-item"><div class="bt-history-line"><span class="bt-history-dot bt-history-dot--blue"></span><span class="bt-history-rule"></span></div>
    <div class="bt-history-body"><div><strong style="font-weight:600">${escapeHtml(a.what)}</strong></div>${a.reason ? `<div style="color:var(--bt-text-muted);margin-top:2px">Reason: ${escapeHtml(a.reason)}</div>` : ""}<div class="bt-meta">Boomertanger, ${a.when}</div></div></div>`).join("")}</div>` : `<p class="bt-meta">No admin activity yet.</p>`}</div>`;
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
      <div><button type="button" class="bt-btn bt-btn--admin">Save status</button></div>
      ${r && r.id ? activityHtml(r) : ""}
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
    ["planned", "Boomertanger", "Sep 12, 2026", ""],
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
    ${modalHeader("New request", "Got an idea? Pitch it here and the community will vote on what gets built next.")}
    <div class="bt-field">
      <label class="bt-label" for="kit-new-title">Title</label>
      <input class="bt-input" id="kit-new-title" placeholder="Short and specific" autofocus>
    </div>
    <div class="bt-field">
      <label class="bt-label" for="kit-new-desc">What should it do?</label>
      <textarea class="bt-textarea" id="kit-new-desc" placeholder="Describe the feature and why you'd use it"></textarea>
      <span class="bt-hint">Other members will see this and can vote on it.</span>
    </div>
    <div class="bt-field">
      <label class="bt-label" for="kit-new-page">Page</label>
      <input class="bt-input" id="kit-new-page" placeholder="e.g. www.boomertanger.com/live">
      <span class="bt-hint">Paste the address of the page this is about.</span>
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
  const { modal, close, setBeforeClose } = openModal({ content: detailContent(r), wide: true, feature: "ui-kit" });
  initLightboxTriggers(modal);
  let dirty = false;
  const discardGuard = async () => !dirty || confirmAction({
    title: "Discard your changes?", message: "Your edits haven't been saved.",
    confirmLabel: "Discard", busyLabel: "Discarding…", feature: "ui-kit", onConfirm: async () => {},
  });

  function showView() {
    dirty = false; setBeforeClose(null);
    modal.classList.remove("bt-modal--editing");
    modal.innerHTML = detailContent(r);
    initComposer(modal.querySelector(".bt-composer"), { onSubmit: () => new Promise((res) => setTimeout(res, 900)) });
    wireView();
  }
  function showEdit() {
    modal.classList.add("bt-modal--editing");
    modal.innerHTML = editContent(r);
    setBeforeClose(discardGuard);
    const inputs = [...modal.querySelectorAll("[data-edit]")];
    const save = modal.querySelector("[data-kit-edit-save]");
    const refresh = () => { dirty = inputs.some((el) => el.value !== r[el.dataset.edit]); save.disabled = !dirty || !modal.querySelector("#kit-e-title").value.trim(); };
    modal.addEventListener("input", refresh);
    modal.querySelector("#kit-e-title").focus();
    modal.querySelector("[data-kit-edit-cancel]").addEventListener("click", async () => { if (await discardGuard()) showView(); });
    save.addEventListener("click", async () => {
      save.disabled = true; save.innerHTML = '<span class="bt-spinner" aria-hidden="true"></span>Saving…';
      await new Promise((res) => setTimeout(res, 900));
      const changed = inputs.filter((el) => el.value !== r[el.dataset.edit]).map((el) => el.dataset.edit === "desc" ? "description" : el.dataset.edit);
      inputs.forEach((el) => { r[el.dataset.edit] = el.value.trim(); });
      r.editedAt = new Date().toISOString();
      r.activity = [{ what: `Edited ${changed.join(" and ")}`, reason: modal.querySelector("[data-reason]").value.trim(), when: formatDate(r.editedAt) }, ...(r.activity || [])];
      renderPreview();
      showView();
    });
  }
  function wireView() {
    modal.querySelector("[data-kit-edit]")?.addEventListener("click", showEdit);
    modal.querySelector("[data-kit-delete]")?.addEventListener("click", onDelete);
  }
  initComposer(modal.querySelector(".bt-composer"), { onSubmit: () => new Promise((res) => setTimeout(res, 900)) });
  wireView();

  async function onDelete() {
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
  }
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
    <p class="kit-p">An admin dashboard in the style of Cloud Stash, built from the same kit. The side column drops below the main one at 1024px, and the table scrolls sideways inside its card on narrow screens instead of squashing.</p>
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
      <button type="button" class="bt-btn bt-btn--admin">Save status</button>
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
    <p class="kit-sub">Badge system</p>
    <p class="kit-p">Levels (how bad, priority) use signal bars and climb blue, gold, pink, red. Statuses use a dot: blue = new, teal = under review, gold = planned, green = in progress, lime = done, gray = closed. The same word is the same color in every feature.</p>
    <div class="kit-ladder">${BADGE_SYSTEM.map(([name, kind, list]) => `<div class="kit-ladder-row"><span class="kit-scale-name">${name}</span><div class="kit-row" style="gap:8px">${list.map(([tone, label], i) => kind === "level" ? `<span class="bt-badge bt-badge--${tone}">${levelBars(i + 1, list.length)}${label}</span>` : `<span class="bt-badge bt-badge--${tone}"><span class="bt-badge-dot"></span>${label}</span>`).join("")}</div></div>`).join("")}</div>
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
    <p class="kit-p">Row-level destructive actions use the same solid red as every delete, in the small size. Green buttons are admin-only actions: soft green at rest, neon on hover. Monospace appears only for literal identifiers like <span class="bt-code">bugReports/k2Pq81</span>.</p>
    <p class="kit-sub">Meters</p>
    <div class="kit-grid-2">
      <div class="bt-meter bt-meter--green"><div class="bt-meter-track"><div class="bt-meter-fill" style="width:48%"></div><div class="bt-meter-marker" style="left:80%"></div></div><div class="bt-meter-legend"><span>Healthy</span><span>48%</span></div></div>
      <div class="bt-meter bt-meter--amber"><div class="bt-meter-track"><div class="bt-meter-fill" style="width:85%"></div><div class="bt-meter-marker" style="left:80%"></div></div><div class="bt-meter-legend"><span>Past the marker</span><span>85%</span></div></div>
      <div class="bt-meter bt-meter--red"><div class="bt-meter-track"><div class="bt-meter-fill" style="width:100%"></div><div class="bt-meter-marker" style="left:80%"></div></div><div class="bt-meter-legend"><span>Over limit</span><span>104%</span></div></div>
      <div class="bt-meter bt-meter--blue"><div class="bt-meter-track"><div class="bt-meter-fill" style="width:30%"></div></div><div class="bt-meter-legend"><span>Neutral progress, no marker</span><span>30%</span></div></div>
    </div>
    <p class="kit-sub">Stacked meter (.bt-meter--stack: segments .bt-meter-seg with their own colour in --c, a marker, and .bt-meter-keys under it; Cloud Stash's usage card)</p>
    <div class="bt-meter bt-meter--stack bt-meter--green">
      <div class="bt-meter-track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="62" aria-label="This month's usage, by what is driving it">
        <span class="bt-meter-seg" style="width:34%;--c:var(--bt-primary)"></span><span class="bt-meter-seg" style="width:18%;--c:var(--bt-teal)"></span><span class="bt-meter-seg" style="width:10%;--c:var(--bt-gold)"></span>
        <div class="bt-meter-marker" style="left:80%"></div>
      </div>
      <ul class="bt-meter-keys"><li style="--c:var(--bt-primary)"><i></i>Storage <b>34%</b></li><li style="--c:var(--bt-teal)"><i></i>Bandwidth <b>18%</b></li><li style="--c:var(--bt-gold)"><i></i>Transformations <b>10%</b></li></ul>
    </div>
    <p class="kit-sub">Notices (.bt-notice with --ok, --warn or --error; add --row to lay a short title, a line and a button on one row) and file tiles (.bt-file-thumb, --locked for a private file, --lg for a dialog preview)</p>
    <div class="kit-stack">
      <div class="bt-notice bt-notice--ok">Saved. The rule is on.</div>
      <div class="bt-notice bt-notice--warn bt-notice--row"><b>Uploads paused</b><span>Storage is nearly full, so member uploads wait until it drops.</span><button type="button" class="bt-btn bt-btn--sm bt-btn--secondary">Limits</button></div>
      <div class="bt-notice bt-notice--error bt-notice--row"><b>Over the limit</b><span>Only the owner can upload until the month rolls over.</span></div>
    </div>
    <div class="kit-row">
      <span class="bt-file-thumb"><svg viewBox="0 0 52 52" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="52" height="52" fill="var(--bt-surface-2)"/><circle cx="26" cy="26" r="10" fill="var(--bt-primary)"/></svg></span>
      <span class="bt-file-thumb bt-file-thumb--locked"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><small>Private</small></span>
      <span class="bt-file-thumb bt-file-thumb--lg" style="max-width:220px"><svg viewBox="0 0 160 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="160" height="100" fill="var(--bt-surface-2)"/><circle cx="80" cy="50" r="24" fill="var(--bt-primary)"/></svg></span>
    </div>
    <p class="kit-sub">Small buttons and switches</p>
    <div class="kit-row">
      <button type="button" class="bt-btn bt-btn--sm bt-btn--admin">${ICON.plus}Add rule</button>
      <button type="button" class="bt-btn bt-btn--sm bt-btn--secondary">Cancel</button>
      <button type="button" class="bt-btn bt-btn--sm bt-btn--danger">Purge</button>
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
    <p class="kit-sub">Hidden comment (.bt-comment--hidden, the staff view of a comment a mod hid: dashed, faded, struck through, with who hid it and why; members never receive it). Beside it, a visible comment for comparison</p>
    <div class="kit-grid-2">
      <div class="bt-comments">
        <div class="bt-comment"><div class="bt-comment-head"><span class="bt-comment-author">Vera Crane</span><span class="bt-comment-time">Sep 13, 2026</span></div><p class="bt-comment-text">Would love this for the Resident Evil marathon next month.</p></div>
      </div>
      <div class="bt-comments">
        <div class="bt-comment bt-comment--hidden"><div class="bt-comment-head"><span class="bt-comment-author">Hollow Moth</span><span class="bt-admin-tag bt-admin-tag--small">${SHIELD_ICON}Mod</span><span class="bt-comment-time">Sep 13, 2026</span></div><p class="bt-comment-text">Buy my gold at the link in my profile, cheapest on the web!</p><span class="bt-comment-hidden-note">Hidden by @deadairdan: spam. Only staff see this.</span></div>
      </div>
    </div>
  </section>
${navHtml()}
${arcadeHtml()}
${vaultKitHtml()}
${pagerKitHtml()}
${trophyKitHtml()}
${storyKitHtml()}
${toastKitHtml()}
${factoryKitHtml()}
${seasonKitHtml()}
${roadKitHtml()}
${modMachinaKitHtml()}${storyPiecesKitHtml()}${navgroupKitHtml()}${screamPlannerKitHtml({ mascotHtml: `<img src="${KIT_MASCOT}" alt="" width="92" height="92">` })}${controlRoomKitHtml()}`;
}

// ---------- Boom Arcade (docs/specs/arcade-step1.md §8, design-system.md §5 "Boom Arcade") ----------

const KIT_MASCOT = new URL("../assets/mascot.svg", import.meta.url).href;
const ARCADE_NAMES = [["CryptRat", "cryptrat"], ["Hexxy", "hexxy"], ["Vexa", "vexa"], ["NightOwl", "nightowl"], ["Dredd", "dredd"], ["RavenByte", "ravenbyte"]];
const kitTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
const kitInitials = (name) => name.replace(/[^A-Z]/g, "").slice(0, 2) || name.slice(0, 2).toUpperCase();
function kitBoard({ mini = false, me = 0, pin = false, n = 5 } = {}) {
  const tr = (r, [name, handle], secs, isMe) => `<tr data-r="${r}"${isMe ? ' class="is-me"' : ""}><td class="bt-board-rank">${r}</td><td><span class="bt-board-who"><span class="bt-avatar-sm" aria-hidden="true">${kitInitials(name)}</span><span>${name}${mini ? "" : `<small>@${handle}</small>`}</span></span></td>${mini ? "" : `<td class="bt-board-date">Oct ${r + 1}</td>`}<td class="bt-board-time">${kitTime(secs)}</td></tr>`;
  const rows = ARCADE_NAMES.slice(0, n).map((p, i) => tr(i + 1, p, 36.94 + i * 1.6 + i * i * 0.2, me === i + 1)).join("");
  const gap = pin ? `<tr class="bt-board-gap" aria-hidden="true"><td colspan="${mini ? 3 : 4}">···</td></tr>${tr(312, ["NightOwl", "nightowl"], 81.4, true)}` : "";
  const head = mini ? "" : `<thead><tr><th scope="col">#</th><th scope="col">Member</th><th scope="col" class="bt-board-date">Date</th><th scope="col">Time</th></tr></thead>`;
  return `<table class="bt-board${mini ? " bt-board--mini" : ""}">${head}<tbody>${rows}${gap}</tbody></table>`;
}
// ---------- Navigation, headings and wordmark power-on (docs/design/mockups/arcade-styling-ideas.html) ----------

/** The Boom Arcade wordmark with the .bt-wordmark--power hover (Gold shine). `lit` freezes it lit. */
function arcadeMark(lit = false) {
  return `<a class="bt-wordmark bt-wordmark--power${lit ? " is-lit" : ""}" href="#" aria-label="Boom Arcade"><span class="bt-wordmark-icon">${BA_ICON}</span><span class="bt-wordmark-text" aria-hidden="true">BOOM<span class="bt-wordmark-accent">ARCADE</span></span></a>`;
}
const KIT_TOC = ["What's inside", "How games are born", "How games grow", "Versions", "Roles", "Badges", "Fair play"];
const kitToc = (at) => `<nav class="bt-toc" aria-label="On this page (demo)" data-kit-toc="${at}"><span class="bt-toc-rail" aria-hidden="true"></span><span class="bt-toc-fill" aria-hidden="true"></span>${KIT_TOC.map((t, i) => `<a href="#kit-toc-${i}">${t}</a>`).join("")}</nav>`;
const kitSeg = (cur, live = true) => `<nav class="bt-seg-nav"${live ? " data-kit-seg" : ""} aria-label="Arcade (demo)">${["Games", "Leaderboards", "How it works"].map((t, i) => `<a href="#"${i === cur ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`;
function navHtml() {
  return `
  <section class="kit-section" id="kit-nav-patterns">
    <h2 class="kit-h">Navigation, headings and wordmarks</h2>
    <p class="kit-p">Most of these live in their hover and focus states: point at them or tab through. Under reduced motion nothing moves; only the colours change (the pill jumps instead of gliding, the letters light without the flash, the stick stays still).</p>

    <p class="kit-sub">Buttons (A2): primary lifts 1px with a purple glow; secondary lifts and lights up. Disabled buttons don't react. Link-buttons never underline (ghost stays underlined on purpose).</p>
    <div class="kit-row"><a class="bt-btn bt-btn--primary" href="#">Enter the Arcade</a><a class="bt-btn bt-btn--secondary" href="#">Try Tap the Splat</a><button type="button" class="bt-btn bt-btn--primary" disabled>Disabled</button><button type="button" class="bt-btn bt-btn--secondary" disabled>Disabled</button><a class="bt-btn bt-btn--ghost" href="#">Ghost link</a></div>

    <p class="kit-sub">Top tabs: .bt-seg-nav (B3), with shared/ui/seg-nav.js. The lit pill glides to the hovered or focused tab and settles on the current one.</p>
    <div class="kit-stack">${kitSeg(0)}${kitSeg(2)}</div>
    <p class="kit-note">Without the script (below) only the current tab is lit, with the same pill and tick.</p>
    <div class="kit-row">${kitSeg(1, false)}</div>

    <p class="kit-sub">Side menu: .bt-toc progress rail (C3), with shared/ui/toc.js following the scroll. Shown at the first, third and last stop. At 640px and below it becomes a swipeable chip row with a thin gold progress bar.</p>
    <div class="kit-grid-2">${kitToc(0)}${kitToc(2)}${kitToc(6)}</div>

    <p class="kit-sub">Chapter headings: .bt-chapter and its variants (D1-D4), for the top-level sections of long pages. Same markup for all four (the eyebrow stays in it; the variants hide it), so switching is just the class. Panels and cards keep .bt-heading.</p>
    ${[
      ["bt-chapter", "D2, the default: gold mono eyebrow with a fading rule. Use it for long pages."],
      ["bt-chapter bt-chapter--bar", "D1: the .bt-heading gold bar at chapter size, no eyebrow. Quiet pages and short sections."],
      ["bt-chapter bt-chapter--ember", "D3: uppercase gradient title, gold-to-blood bar, an occasional blood drip (still under reduced motion). Special moments: game pages, launches."],
      ["bt-chapter bt-chapter--ghost", "D4: a huge outlined numeral from data-n behind the title (smaller on phones). Being tried on How it works."],
    ].map(([cls, when]) => `<div class="kit-stack"><p class="kit-note"><span class="kit-code">.${cls.split(" ").pop()}</span> · ${when}</p>${[["01", "What's inside", "Four parts, one arcade. Every game gets its own Play, Leaderboards and Workshop tabs."], ["02", "How a game is born", "From a pitch in the Arcade Studio to a game you can play."]].map(([n, t, l]) => `<header class="${cls}" data-n="${n}"><p class="bt-chapter-eyebrow" aria-hidden="true">${n} · Chapter</p><h2 class="bt-chapter-title">${t}</h2><p class="bt-chapter-lede">${l}</p></header>`).join("")}</div>`).join("")}

    <p class="kit-sub">Hero title: .bt-title.bt-title--hero (40px, 28px at 640px and below). Page titles stay the only gradient heading.</p>
    <div class="kit-stack"><h1 class="bt-title bt-title--hero">Horror games, built with you</h1><h1 class="bt-title">Page title (for comparison)</h1></div>

    <p class="kit-sub">Door card: .bt-card.bt-card--door (a card that IS a link), with .bt-card-go, .bt-icon-tile--lg and .bt-spotlight. Hover or focus: it lifts 3px with a purple border and glow, the arrow slides, the icon tilts, and a soft glow follows the pointer (pointer devices only). Plain cards (Soon) stay put, with the gold tile and a faint gold spotlight.</p>
    <div class="kit-grid-2">
      <a class="bt-card bt-card--door bt-spotlight" href="#"><span class="bt-icon-tile--lg" aria-hidden="true">🕹</span><h3>Games</h3><p class="kit-p">A card that goes somewhere.</p><span class="bt-card-go">Enter the Arcade<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span></a>
      <div class="bt-card bt-spotlight bt-spotlight--gold"><span class="bt-icon-tile--lg bt-icon-tile--soon" aria-hidden="true">💡</span><h3>Arcade Studio <span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>Soon</span></h3><p class="kit-p">A plain card: no lift, no arrow.</p></div>
    </div>

    <p class="kit-sub">BOOMBOT: .bt-boombot (shared/ui/arcade.js BOOMBOT_ICON, or boombotIcon(uid) when a page shows more than one). The Arcade's helper character for help and FAQ answers; never a real person or Boomertanger. Its eyes blink now and then; .is-thinking (on it or a parent) scans the eyes and blinks the antenna while it "types". Still under reduced motion.</p>
    <div class="kit-row"><span style="display:inline-flex;gap:14px;align-items:center">${boombotIcon("kit-bb-a").replace('class="bt-boombot"', 'class="bt-boombot" style="width:56px;height:56px"')}<span class="kit-note">At rest</span></span><span class="is-thinking" style="display:inline-flex;gap:14px;align-items:center">${boombotIcon("kit-bb-b").replace('class="bt-boombot"', 'class="bt-boombot" style="width:56px;height:56px"')}<span class="kit-note">.is-thinking</span></span></div>

    <p class="kit-sub">Wordmark power-on: .bt-wordmark--power, Gold shine. Hover or focus: ARCADE switches from the resting purple to gold with a warm glow while one sheen crosses it (the same move as TANGER on the main logo), BOOM gets a faint white glow, the lamp comes fully on and the stick wiggles once. Touch screens play it once as it scrolls into view. Reduced motion: gold with no sheen and no wiggle. Left: at rest (hover it); right: frozen lit (.is-lit).</p>
    <div class="kit-row">${arcadeMark()}${arcadeMark(true)}</div>

    <p class="kit-sub">Cycle wheel: .bt-cycle-wheel (shared/ui/cycle-wheel.js: cycleWheelHtml() builds it from stage data, initCycleWheels(root) wires it). A version's stages round a ring in --bt-cycle-1..8 (decorative only, never a status): future stages faint, finished ones half strength, the chosen one full colour, lifted and glowing. The segments are a tablist (arrow keys, Home, End), the card is the tabpanel, Play goes round the wheel every 2.6 s and stops on any other interaction. Wheel above the card at 900px and below. Reduced motion: colour and glow only.</p>
    <div class="kit-stack">
      <p class="kit-note">Full: title, Play, badge and the loop note, at stage 1</p>
      ${cycleWheelHtml({ id: "kit-cw-a", title: "Tap the Splat · v2", badge: `<span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>Opens soon</span>`, stages: KIT_STAGES, note: "After Thanks and badges, the next cycle opens." })}
      <p class="kit-note">Mid-cycle (stage 5, In development): stages 1-4 finished, half strength</p>
      ${cycleWheelHtml({ id: "kit-cw-b", title: "Tap the Splat · v3", badge: `<span class="bt-badge bt-badge--green"><span class="bt-badge-dot"></span>Building</span>`, stages: KIT_STAGES, current: 4, play: false })}
      <p class="kit-note">Last stage, no top row: the next arrow is disabled</p>
      ${cycleWheelHtml({ id: "kit-cw-c", stages: KIT_STAGES, current: 7, play: false })}
    </div>

    <p class="kit-sub">Keyhole link: .bt-keyhole-link (a round dark .bt-keyhole-icon holding a warm amber keyhole (--bt-title) that flickers every few seconds, bold text and a muted small). A deliberate exception to "purple = clickable": warm amber, used only for the members-only gate's peek-inside invitation (design-system.md §8h). Hover and focus, "door ajar": a wedge of amber light swings open across the pill from the left, the border brightens with a soft glow, the keyhole's circle warms and "· no account needed" brightens; no lift, no underline. Reduced motion: no flicker; the light appears without the swing. Always give it an aria-label.</p>
    <div class="kit-row">
      <a class="bt-keyhole-link" href="#" aria-label="Peek inside: how the Arcade works (no account needed)"><span class="bt-keyhole-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3a5 5 0 0 0-2.4 9.4L8 21h8l-1.6-8.6A5 5 0 0 0 12 3z"/></svg></span><span aria-hidden="true">Peek inside <small>· no account needed</small></span></a>
    </div>
  </section>`;
}

const KIT_STAGES = [
  ["Ideas open", "Anyone can post ideas for the next version on the Draft board, and comment and vote on others.", "All members"],
  ["Shortlist", "The Keeper merges duplicates and picks the strongest ideas for a vote, with a short reason for each.", "Keeper"],
  ["Vote", "Members vote on the shortlist. The results guide the plan, they don't dictate it.", "All members"],
  ["Plan locked", "The Keeper writes the plan and Boomertanger approves it. This is what gets built.", "Keeper + Boomertanger"],
  ["In development", "Boomertanger builds the version. The Keeper posts progress updates on the Draft board.", "Boomertanger"],
  ["Playtest", "Members play the beta from the version picker and report bugs or balance problems.", "All members"],
  ["Release", "The new version drops with fresh leaderboards and release notes crediting every idea used.", "Everyone"],
  ["Thanks and badges", "Contributors, playtesters and the Keeper earn badges. The Keeper's term ends, and the next cycle opens.", "Everyone"],
].map(([name, text, who]) => ({ name, text, who }));

function arcadeHtml() {
  const soon = `<span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>Soon</span>`;
  const art = `<div class="bt-game-art"><img src="${KIT_MASCOT}" alt="" width="96" height="96"></div>`;
  const stats = `<div class="bt-game-stats"><span><b>8.4K</b> runs</span><span><b>612</b> finished</span><span>👍 <b>1.2K</b></span></div>`;
  const me = `<div class="bt-game-me"><span class="bt-meta">Your best</span><span>🖥 Desktop <b>0:43.02</b></span><span class="bt-meta">📱 Mobile: no run yet</span></div>`;
  const acts = `<div class="bt-game-acts"><button type="button" class="bt-btn bt-btn--go">Play now</button><a class="bt-btn bt-btn--secondary" href="#">Leaderboards</a></div>`;
  const tabs = (cur) => `<nav class="bt-page-tabs" aria-label="Game"><a href="#"${cur === 0 ? ' aria-current="page"' : ""}>Play</a><a href="#"${cur === 1 ? ' aria-current="page"' : ""}>Leaderboards</a></nav>`;
  return `
  <section class="kit-section" id="kit-arcade">
    <h2 class="kit-h">Boom Arcade</h2>
    <p class="kit-p">The Arcade's pieces (<span class="kit-code">docs/specs/arcade-step1.md</span> §8). Every Arcade page uses the feature top bar with the joystick wordmark; a game's name uses the game's own lettering (<span class="kit-code">.bt-game-logo</span>), and every other title stays gold. Narrow the window to see the phone versions: the tabs become pills and the board drops the Date column and @handles. The game art here shows the mascot only; the site adds the splat.</p>
    <p class="kit-sub">Top bar (.bt-topbar, .bt-wordmark, .bt-ba-icon; static under reduced motion)</p>
    <div class="bt-topbar">${arcadeMark()}<nav class="bt-topnav" aria-label="Arcade"><a class="bt-btn bt-btn--ghost bt-btn--sm" href="#" aria-current="page">Games</a><a class="bt-btn bt-btn--ghost bt-btn--sm" href="#">Leaderboards</a><a class="bt-btn bt-btn--ghost bt-btn--sm" href="#">How it works</a></nav></div>
    <p class="kit-sub">Sticky bar, stuck (.bt-sticky-bar.is-stuck round the .bt-topbar; shared/ui/sticky-bar.js). On desktop the bar is 80px at rest; it sticks at the top and slims to 66px (a 14px margin-bottom makes up the difference, and it un-sticks only 40px back up, so it never shakes) on the page black at 85% with a blur, a soft shadow and a bottom border; on pages with the side menu a gold-to-purple reading-progress line runs along its bottom edge (frozen at 40% here). While it's stuck it sets --bt-sticky-top, so the side menu tucks in under it. On phones it's a 62px bar with the icon switch; past the first screen it slides away after 200px of continuous scrolling down and comes back after 24px up (never under reduced motion).</p>
    <div class="bt-sticky-bar is-stuck" style="position:relative"><div class="bt-topbar">${arcadeMark()}<nav class="bt-seg-nav" aria-label="Arcade (stuck demo)"><a href="#">Games</a><a href="#">Leaderboards</a><a href="#" aria-current="page">How it works</a></nav></div><span class="bt-sticky-bar-progress" aria-hidden="true" style="--bt-read:0.4;animation:none"></span></div>
    <p class="kit-sub">Icon-only switch (.bt-seg-nav--icons): the Arcade bar's Games / Leaderboards / How it works on phones. No text at all; each link has aria-label and title with its name and is 44 x 44px; the current one is lit with the purple underline.</p>
    <div class="kit-row">${[0, 1, 2].map((cur) => `<nav class="bt-seg-nav bt-seg-nav--icons" aria-label="Arcade (demo)">${[["Games", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4.5 15.5h15l1.5 3v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1z\"/><path d=\"M9 15.5V9\"/><circle cx=\"9\" cy=\"6.5\" r=\"2.8\"/></svg>"], ["Leaderboards", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M8 4h8v5a4 4 0 0 1-8 0z\"/><path d=\"M8 6H5.5a2.5 2.5 0 0 0 2.8 3.9M16 6h2.5a2.5 2.5 0 0 1-2.8 3.9\"/><path d=\"M12 13v3.5\"/><path d=\"M8.5 20h7l-.8-3.5H9.3z\"/></svg>"], ["How it works", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M9.7 9.5a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 2-2.3 3.6\"/><path d=\"M12 17.2h.01\"/></svg>"]].map(([l, ic], i) => `<a href="#" aria-label="${l}" title="${l}"${i === cur ? ' aria-current="page"' : ""}>${ic}</a>`).join("")}</nav>`).join("")}</div>
    <p class="kit-sub">Game logo (.bt-game-logo--lg page title, --sm on cards) and page tabs (.bt-page-tabs)</p>
    <div class="kit-stack"><div>${ttsLogoHtml("lg")}</div><div>${ttsLogoHtml("sm")}</div>${tabs(0)}${tabs(1)}</div>
    <p class="kit-sub">Go button (.bt-btn--go: Play now and Play again, the §8f green exception)</p>
    <div class="kit-row"><button type="button" class="bt-btn bt-btn--go">Play now</button><button type="button" class="bt-btn bt-btn--go bt-btn--sm">Play now</button></div>
    <p class="kit-sub">Game card: marquee, compact with no runs yet, soon (.bt-game-card, --compact, .is-soon)</p>
    <article class="bt-tile bt-game-card">${art}<div class="bt-game-body"><div class="kit-row"><span class="bt-badge bt-badge--lime"><span class="bt-badge-dot"></span>New</span><span class="bt-badge bt-badge--gray">v1</span></div><h2 class="bt-game-name">${ttsLogoHtml("sm")}</h2><p class="bt-game-tag">A horror puzzle hidden in the footer of every page. Ten traps, one splat, your fastest clean run.</p>${stats}${me}${acts}</div></article>
    <div class="kit-grid-2">
      <article class="bt-tile bt-game-card bt-game-card--compact">${art}<div class="bt-game-body"><div class="kit-row"><span class="bt-badge bt-badge--gray">v1</span></div><h2 class="bt-game-name">${ttsLogoHtml("sm")}</h2><div class="bt-game-stats"><span>No runs yet. Be the first.</span></div><div class="bt-game-me"><span class="bt-meta">No finished runs yet. Your best times show here.</span></div>${acts}</div></article>
      <article class="bt-tile bt-game-card bt-game-card--compact is-soon"><div class="bt-game-art"><span class="bt-game-art-soon" aria-hidden="true">🔒</span></div><div class="bt-game-body"><div class="kit-row">${soon}</div><h2 class="bt-game-name">Game 2</h2><p class="bt-game-tag">Pitched and voted on in the Arcade Studio.</p></div></article>
    </div>
    <p class="kit-sub">Leaderboard (.bt-board): your row in the top 100, pinned under a gap row (unverified footer), mini top 3, empty and not on this board</p>
    <div class="kit-grid-2">
      <div class="bt-tile bt-board-card">${kitBoard({ me: 4 })}<div class="bt-board-foot"><span class="bt-meta">Showing 25 of 100</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm">Show more</button></div></div>
      <div class="bt-tile bt-board-card">${kitBoard({ pin: true, n: 3 })}<div class="bt-board-foot"><span>Verify your email to get on the board.</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm">Resend email</button></div></div>
      <div class="bt-tile bt-board-card"><div class="bt-tile-head"><h3>Top 3 · Desktop · all time</h3><a href="#">Full leaderboard</a></div>${kitBoard({ mini: true, n: 3 })}</div>
      <div class="bt-tile bt-board-card"><div class="bt-board-empty"><b>No finished runs this week yet</b><span>Be the first on the desktop board.</span><button type="button" class="bt-btn bt-btn--go">Play now</button></div><div class="bt-board-foot"><span>You're not on this board yet. Finish a run on a computer to get on it.</span><button type="button" class="bt-btn bt-btn--go bt-btn--sm">Play now</button></div></div>
    </div>
    <p class="kit-sub">Teaser (.bt-tease for visitors and members, --stack in a narrow column)</p>
    <div class="kit-stack">
      <div class="bt-tease"><span class="bt-tease-ic" aria-hidden="true">🕹</span><span class="bt-tease-txt"><b>More games for members ${soon}</b><small>Horror point-and-click puzzles, leaderboards and badges. Join free to play them first.</small></span><a class="bt-btn bt-btn--primary bt-btn--sm" href="#">Join free</a></div>
      <div class="bt-tease"><span class="bt-tease-ic" aria-hidden="true">🕹</span><span class="bt-tease-txt"><b>More games coming ${soon}</b><small>You'll play them first.</small></span></div>
      <div class="kit-narrow"><div class="bt-tease bt-tease--stack"><span class="bt-tease-ic" aria-hidden="true">🕹</span><span class="bt-tease-txt"><b>More games coming ${soon}</b><small>You'll play them first.</small></span></div></div>
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
  initRowSpotlight(mount);
  mount.querySelectorAll("[data-kit-seg]").forEach((n) => initSegNav(n));
  mount.querySelectorAll("[data-kit-toc]").forEach((n) => initToc(n, { observe: false }).set(+n.dataset.kitToc));
  initSpotlights(mount);
  initCycleWheels(mount);
  initVaultKit(mount);
  initFlipCards(mount);
  initChat(mount);
  initFactoryKit(mount);
  initSeasonKit(mount);
  initRoadKit(mount);
  initModMachinaKit(mount);
  initStoryPiecesKit(mount);
  initNavgroupKit(mount);
  initScreamPlannerKit(mount);
  initControlRoomKit(mount);
  mount.querySelector("#kit-toast")?.addEventListener("click", (e) => { const k = e.target.closest("[data-kit-toast-kind]")?.dataset.kitToastKind; if (k) toast(k === "error" ? "That badge is for crew only." : k === "info" ? "Your trophy case has a free slot." : "Hype Engine awarded to @nightjar.", { kind: k }); });
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

// ---------- Flip card, placard and chat (promoted from the Arcade's How it works) ----------
function storyKitHtml() {
  const flip = (tone, ic, t, sub, how, unl) => `<button type="button" class="bt-flip bt-flip--${tone}" aria-label="${t}: ${sub}. How to earn: ${how} Unlocks: ${unl}."><span class="bt-flip-in"><span class="bt-flip-face" aria-hidden="true"><span class="bt-flip-medal">${ic}</span><b>${t}</b><span class="bt-flip-sub">${sub}</span><span class="bt-flip-hint">Hover or tap to flip</span></span><span class="bt-flip-face bt-flip-face--back" aria-hidden="true"><span class="bt-flip-k">How to earn</span><span class="bt-flip-v">${how}</span><span class="bt-flip-k">Unlocks</span><span class="bt-flip-tag">${unl}</span></span></span></button>`;
  const rules = [["⏱", "Time is the score", "Fastest finished run wins."], ["🏁", "Only finished runs count", "Close calls count as runs played."], ["🖥", "Desktop and Mobile are separate", "Each gets its own board."], ["🔒", "Runs are checked", "Impossible times are removed."]];
  const qa = [["How do I earn badges?", "Play, show up for streams and join in. Each badge says how to earn it."], ["What do rarities mean?", "How hard a badge is to get: Common to Legendary, with 1 to 5 bars."]];
  return `
  <section class="kit-section" id="kit-story-pieces">
    <h2 class="kit-h">Flip card, placard and chat</h2>
    <p class="kit-p">Promoted from the Arcade's How it works (the Trophy Room is the second page to use them). Same look and behaviour; under reduced motion the flip cross-fades, the bulbs and typing dots stop.</p>
    <p class="kit-sub">Flip card: .bt-flip (hover or focus turns it; a tap toggles .is-flipped, shared/ui/flip-card.js) in a .bt-flip-grid (4 columns, 2 at 900px). Tones --red --gold --teal --primary</p>
    <div class="bt-flip-grid">${flip("red", "🩸", "Splat finisher", "Finished Tap the Splat", "Finish Tap the Splat once.", "Unlocks pitching")}${flip("gold", "🏆", "Top 10", "Reached a top 10", "Place in an all-time top 10.", "Contest entry")}${flip("teal", "💡", "Idea shipped", "Your idea made it", "Post an idea that ships.", "Credited in notes")}${flip("primary", "🗝", "Keeper", "Led a version", "Take a version to release.", "Forever on profile")}</div>
    <p class="kit-sub">Placard: .bt-placard with .bt-placard-head (blinking bulbs) over ol.bt-placard-list of li.bt-placard-rule (.bt-placard-n numeral, b, text); one column at 640px</p>
    <div class="bt-placard"><div class="bt-placard-head"><i aria-hidden="true"></i><b>House rules</b><i aria-hidden="true"></i></div><ol class="bt-placard-list">${rules.map(([ic, t, d], i) => `<li class="bt-placard-rule"><span class="bt-placard-n" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><b>${t} <span aria-hidden="true">${ic}</span></b><span>${d}</span></li>`).join("")}</ol></div>
    <p class="kit-sub">Chat (Ask BOOMBOT): .bt-chat with button.bt-chat-q questions and .bt-chat-a answers (shared/ui/chat.js: one open at a time, 650 ms of typing). Click a question</p>
    <div class="bt-chat">${qa.map(([q, a], i) => `<button type="button" class="bt-chat-q" aria-expanded="${i === 0}" aria-controls="kit-ans-${i}"><span class="bt-chat-qi" aria-hidden="true">Q${i + 1}</span>${q}</button><div class="bt-chat-a" id="kit-ans-${i}" role="region" aria-label="BOOMBOT's answer: ${q}"${i ? " hidden" : ""}><span class="bt-chat-av">${boombotIcon(`kit-chat-bb-${i}`)}</span><div class="bt-chat-bub"><small>BOOMBOT</small><span class="bt-chat-typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="bt-chat-text">${a}</span></div></div>`).join("")}</div>
  </section>`;
}

// ---------- Stepper, drawer and lanes (Night Shift builder) ----------
const KIT_FF_STAGES = [
  ["theme", "🎨", "Theme", "done", "Done", 100], ["chapters", "📖", "Chapters", "done", "4 chapters", 100], ["campaigns", "🗂", "Campaigns", "done", "16 campaigns", 100],
  ["activities", "⚙️", "Activities", "now", "9 of 16 filled", 56], ["rewards", "🏅", "Rewards", "todo", "1 warning", 40], ["schedule", "📅", "Schedule", "todo", "3 of 3 checks", 100],
  ["review", "🔍", "Review", "todo", "After 1 to 6", 0], ["live", "🚀", "Live", "todo", "Jan 11", 0],
].map(([key, icon, label, state, status, pct]) => ({ key, icon, label, state, status, pct }));
function factoryKitHtml() {
  const idea = (t, p, meta, extra = "") => `<div class="bt-drawer-item${extra}"><b>${t}</b>${extra.includes("waiting") ? `<span class="bt-badge bt-badge--gray">Needs Control Room</span>` : `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm">${extra.includes("used") ? "Used" : "Use"}</button>`}${p ? `<p>${p}</p>` : ""}${meta ? `<div class="bt-drawer-meta">${meta}</div>` : ""}</div>`;
  const tag = (t, c = "gray") => `<span class="bt-badge bt-badge--${c}">${t}</span>`;
  return `
  <section class="kit-section" id="kit-factory">
    <h2 class="kit-h">Stepper, drawer and lanes</h2>
    <p class="kit-p">The Night Shift builder's pieces (docs/specs/fun-factory.md §7). Reusable for any multi-stage editor. Reduced motion: the belt stands still and the lamp doesn't blink.</p>
    <p class="kit-sub">Stepper: .bt-stepper, the assembly line (shared/ui/stepper.js stepperHtml). Machines are buttons (data-step); .is-done gold lamp, .is-now blinking lamp, .is-todo, .is-open. Click a machine. Phones: a sideways strip that keeps the open stage in view</p>
    <div data-kit-stepper>${stepperHtml({ steps: KIT_FF_STAGES, open: "activities", crate: "S2", label: "Season stages" })}</div>
    <p class="kit-sub">.bt-stepper--rail: the compact form with progress rings, for narrow side panels</p>
    <div>${stepperHtml({ steps: KIT_FF_STAGES, open: "activities", rail: true, label: "Season stages (rail)" })}</div>
    <p class="kit-sub">Drawer: .bt-drawer in a .bt-drawer-layout (content + a sticky 320px panel; stacks under the content below 1024px). Items: .bt-drawer-item with .is-used and .is-waiting</p>
    <div class="bt-drawer-layout">
      <div class="bt-card"><div class="bt-card-head"><h3 class="bt-card-title">The panel's content</h3></div><p class="bt-section-text">The drawer sits beside whatever is being edited and offers ideas for it.</p></div>
      <aside class="bt-drawer" aria-label="Ideas"><div class="bt-drawer-head"><div><b>Idea library</b><small>20 season themes</small></div><div class="bt-drawer-tools"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm">🎲 Inspire me</button></div></div>
        <div class="bt-drawer-list">${idea("📡 Dark Signal", "A strange broadcast is leaking into the stream. Trace it to its source.", tag("tech") + tag("mystery") + tag("Used in S01", "gold"), " is-used")}${idea("🗝 Vaultbreakers", "The vault is sealed. The community cracks it open, one key at a time.", tag("heist") + tag("puzzle"))}${idea("Check in to the stream", "Enter today's stream code while live.", tag("Stream presence") + tag("+25 XP", "gold"), " is-waiting")}<div class="bt-drawer-tip"><b>Chapters of 3 weeks</b> keep a steady drumbeat.</div></div>
        <p class="bt-drawer-foot">Waiting ideas light up when their feature ships.</p></aside>
    </div>
    <p class="kit-sub">Lanes: .bt-lanes, week columns with labelled lanes and bars (shared/ui/lanes.js lanesHtml). Not .bt-timeline, which is the Vault's dots on a line</p>
    ${lanesHtml({ weeks: 13, label: "Season timeline", rows: [
      { label: "Chapters", head: true, bars: [{ from: 0, len: 3, text: "Ch 1" }, { from: 3, len: 3, text: "Ch 2" }, { from: 6, len: 4, text: "Ch 3" }, { from: 10, len: 3, text: "Ch 4" }] },
      { label: "Recover the Lost Keys", bars: [{ from: 0, len: 13, text: "Story · open all season", color: "rank-3" }] },
      { label: "Daily + Weekly", bars: [{ from: 0, len: 13, text: "Swap each chapter", color: "blue" }] },
      { label: "Full Moon Event", bars: [{ from: 5, len: 1, text: "Feb 13", color: "teal" }] },
    ] })}
  </section>`;
}
function initFactoryKit(mount) {
  const box = mount.querySelector("[data-kit-stepper]");
  if (!box) return;
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-step]");
    if (!b) return;
    box.innerHTML = stepperHtml({ steps: KIT_FF_STAGES, open: b.dataset.step, crate: "S2", label: "Season stages" });
    keepOpenInView(box);
  });
}

// ---------- Task row, timer, lock card, clock and path (Night Shift season pass) ----------
function seasonKitHtml() {
  const H = 3600000, D = 24 * H;
  return `
  <section class="kit-section" id="kit-season">
    <h2 class="kit-h">Task row, timer, lock card, clock and path</h2>
    <p class="kit-p">The season pass pieces (docs/specs/fun-factory.md §8; shared/ui/season.js builds them, shared/ui/countdown.js ticks the timers once a minute). Reduced motion: no bar or line animation.</p>
    <p class="kit-sub">Task row: .bt-task-row in a .bt-task-list (two across, one on phones). .is-done gold edge; .is-soon dashed and dimmed</p>
    <div class="bt-task-list">${taskRowHtml({ icon: "⏱", title: "Punch the clock", sub: "Press Punch the clock up top", n: 1, of: 1, xp: 10 })}${taskRowHtml({ icon: "🩸", title: "Splat run", sub: "Finish Tap the Splat 3 times", n: 2, of: 3, xp: 60 })}${taskRowHtml({ icon: "📺", title: "Check in to the stream", sub: "Needs the Control Room", soon: true })}${taskRowHtml({ icon: "🏔", title: "Month of shifts", sub: "Clock in on 30 days", n: 12, of: 30, xp: 250 })}</div>
    <p class="kit-sub">Timer: .bt-timer, a countdown pill (--locked grey). Not .bt-countdown, which is the home hero's next-stream digits</p>
    <div class="kit-row">${timerHtml({ until: Date.now() + 7 * H + 12 * 60000, label: "Resets in" })}${timerHtml({ until: Date.now() + 10 * D + 14 * H, label: "Ch 3 in" })}${timerHtml({ until: Date.now() + 2 * D + 3 * H, label: "Ends in", icon: "⚡" })}${timerHtml({ until: Date.now() + 40 * D, label: "Unlocks in", icon: "🔒", locked: true })}</div>
    <p class="kit-sub">Lock card: .bt-lock-card, the upsell a Fan Club member sees in place of Sub Club campaigns</p>
    ${lockCardHtml({ icon: "⭐", title: "2 Sub Club campaigns this chapter", text: "Hidden gems and the Inner circle run: more ways to earn season XP. Same XP per task as everyone.", href: "#kit-season", label: "See Sub Club" })}
    <p class="kit-sub">Clock: .bt-clock (data-clock-btn; .is-done once punched in today). Click it</p>
    <div class="kit-grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px" data-kit-clock>${clockHtml({ streak: 12, savers: 1, cap: 2 })}${clockHtml({ streak: 31, savers: 3, cap: 3, done: true })}</div>
    <p class="kit-sub">Path: .bt-path, the story path; the line fills gold to the next node</p>
    ${pathHtml({ nodes: [{ icon: "🗺", label: "Site tour", state: "done" }, { icon: "🔗", label: "Link up", state: "done" }, { icon: "🏅", label: "Hidden medals 3/5", state: "now" }, { icon: "🕹", label: "Finish the season game" }, { icon: "🔒", label: "Chapter 4", state: "locked" }] })}
    <p class="kit-sub">Hidden medal: .bt-hunt-medal in a corner of a .bt-hunt-host; glints, and pops away when claimed. Click one</p>
    <div class="bt-hunt-host" style="height:120px;border:1px dashed var(--bt-border-2);border-radius:var(--bt-radius-lg)" data-kit-hunt>${["top-left", "bottom-right"].map((c) => `<button type="button" class="bt-hunt-medal bt-hunt-medal--${c}" aria-label="A hidden medal. Claim it.">${medalHtml({ emoji: "🏅", rarity: 3, size: 28 })}</button>`).join("")}</div>
  </section>`;
}
// ---------- Road and tree (Goal Tracker) ----------
const KIT_ROAD = [
  [0, "🔧", "Rebuild", "Now until relaunch", "Level 0"], [1, "🎬", "Relaunch", "When it's ready", "Level 1"], [2, "📈", "Grow", "Spring 2027", "Level 2"],
  [3, "💥", "Break out", "Summer 2027", "Level 3"], [4, "🎃", "Halloween", "October 2027", "Level 4"], [5, "🏆", "The Game Awards", "Nominees Nov, show Dec", "Final boss", true],
];
const roadLevels = (now) => KIT_ROAD.map(([n, icon, name, when, lv, boss]) => ({ n, icon, name, when, lv, boss, state: now == null ? "later" : n < now ? "done" : n === now ? "now" : "later" }));
const roadPanel = (n) => { const [, icon, name, when, lv] = KIT_ROAD[n]; return `<div class="bt-card" aria-live="polite"><div class="bt-card-head"><h3 class="bt-card-title">${icon} ${name}</h3><span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>Planned</span></div><p class="bt-section-text">${lv} · ${when}. The panel under the road: whatever belongs to the chosen stop.</p></div>`; };
const KIT_ROADS = [["now", 2, "Level 2 is current: stops 0 and 1 are gold, the mascot stands on 2, the rest are dashed, the last is the boss"], ["start", null, "Nothing started: every stop dashed, no fill, no mascot"], ["done", 5, "The boss is current: everything before it is gold"]];
function roadKitHtml() {
  const tr = (d, type, t, s, vis, extra = "", due = "", open = true) => {
    const ST = { planned: ["gold", "Planned"], progress: ["green", "In progress"], done: ["lime", "Done"], dropped: ["gray", "Dropped"] };
    const VIS = { public: ["🌐", "Public"], members: ["👥", "Members"], private: ["🔒", "Private"] };
    return `<div class="bt-tree-row" role="treeitem" aria-level="${d + 1}" data-id="${t}" data-parent="${d ? type.split(":")[1] : ""}" data-type="${type.split(":")[0]}" style="--d:${d}">`
      + `<button type="button" class="bt-tree-caret" data-caret="${t}" aria-label="Collapse"${open ? "" : " disabled"}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>`
      + `<span class="bt-tree-main"><b>${t}</b><span class="bt-tree-type">${type.split(":")[0]}</span>${extra}</span>`
      + `<span class="bt-tree-meta"><span class="bt-tree-vis" title="${VIS[vis][1]}" aria-label="${VIS[vis][1]}">${VIS[vis][0]}</span>${due ? `<span class="bt-tree-opt">${due}</span>` : ""}${s ? `<button type="button" class="bt-tree-status" aria-label="Status: ${ST[s][1]}"><span class="bt-badge bt-badge--${ST[s][0]}"><span class="bt-badge-dot"></span>${ST[s][1]}</span></button>` : ""}</span>`
      + `<span class="bt-tree-acts"><button type="button" class="bt-icon-btn bt-icon-btn--sm bt-tree-move" aria-label="Move up">↑</button><button type="button" class="bt-icon-btn bt-icon-btn--sm bt-tree-move" aria-label="Move down">↓</button><button type="button" class="bt-icon-btn bt-icon-btn--sm" aria-label="Edit">✎</button></span></div>`;
  };
  const unpub = `<span class="bt-tree-tag">Unpublished</span>`, rel = `<span class="bt-tree-tag bt-tree-tag--quiet">Relaunch</span>`, over = `<span class="bt-badge bt-badge--pink">Overdue</span>`;
  return `
  <section class="kit-section" id="kit-road">
    <h2 class="kit-h">Road and tree</h2>
    <p class="kit-p">The Goal Tracker's pieces (docs/specs/goal-tracker.md §7). The road is a level select: pick a stop and the panel under it changes. Reduced motion: the fill is drawn at once, no glow or bobbing.</p>
    ${KIT_ROADS.map(([key, now, note]) => `<p class="kit-sub">Road, ${key}: .bt-road (shared/ui/road.js roadHtml, initRoad). ${note}. Click a stop. At 640px and under it becomes a vertical path and the panel opens under the tapped stop</p>
    <div data-kit-road="${key}" data-now="${now ?? ""}">${roadHtml({ levels: roadLevels(now), selected: now ?? 0, label: "Levels", mascot: `<img class="bt-mascot" src="${KIT_MASCOT}" alt="">`, panelHtml: roadPanel(now ?? 0) })}</div>`).join("")}
    <p class="kit-sub">Tree: .bt-tree of .bt-tree-row (--d depth, data-type track / goal / milestone / task), shared/ui/tree.js initTree. The caret collapses its children; a disabled caret has none. Row parts: .bt-tree-main (title, .bt-tree-type, .bt-tree-tag), .bt-tree-meta (.bt-tree-vis, .bt-tree-opt, a .bt-tree-status button around a status badge), .bt-tree-acts (.bt-tree-move hides on phones). Click a caret</p>
    <div class="bt-tree" role="tree" aria-label="The plan (demo)" data-kit-tree>
      ${tr(0, "track", "Platforms", "", "public")}
      ${tr(1, "goal:Platforms", "Twitch Partner", "progress", "public", rel, "Mar 2027")}
      ${tr(2, "milestone:Twitch Partner", "Hit the viewer average", "planned", "public", over, "Jan 2027", false)}
      ${tr(2, "milestone:Twitch Partner", "Affiliate to Partner request", "planned", "members", unpub, "Feb 2027", false)}
      ${tr(1, "goal:Platforms", "YouTube 10K", "done", "public", "", "", false)}
      ${tr(0, "track", "Money", "", "private")}
      ${tr(1, "goal:Money", "$1K a month gross", "dropped", "private", "", "Jun 2027", false)}
    </div>
  </section>`;
}
function initRoadKit(mount) {
  mount.querySelectorAll("[data-kit-road]").forEach((host) => initRoad(host, { renderPanel: roadPanel }));
  const tree = mount.querySelector("[data-kit-tree]");
  if (tree) initTree(tree);
}
function initSeasonKit(mount) {
  initTimers(mount);
  mount.querySelector("[data-kit-clock]")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-clock-btn]");
    if (!b || b.getAttribute("aria-disabled") === "true") return;
    const clock = b.closest(".bt-clock");
    const n = clock.querySelector("[data-streak]");
    n.textContent = String(Number(n.textContent) + 1);
    clock.classList.add("is-done"); b.classList.add("is-done"); b.setAttribute("aria-disabled", "true"); b.textContent = "Punched in ✓";
    clock.querySelector(".bt-clock-txt b").textContent = "Punched in for today";
  });
  mount.querySelector("[data-kit-hunt]")?.addEventListener("click", (e) => {
    const b = e.target.closest(".bt-hunt-medal");
    if (!b || b.classList.contains("is-claimed")) return;
    b.classList.add("is-claimed");
    const gone = () => b.remove();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) gone(); else b.addEventListener("animationend", gone, { once: true });
  });
}

// ---------- Toast ----------
function toastKitHtml() {
  return `
  <section class="kit-section" id="kit-toast">
    <h2 class="kit-h">Toast</h2>
    <p class="kit-p">A short confirmation that floats at the bottom of the screen (above the tab bar on phones) and goes away on its own after 4.5 seconds, or stays while hovered or focused. shared/ui/toast.js toast(message, { kind, ms }); it renders in its own .bt-root on body, like a modal. Errors use role="alert", the rest role="status".</p>
    <div class="kit-row"><button type="button" class="bt-btn bt-btn--secondary" data-kit-toast-kind="ok">Show ok</button><button type="button" class="bt-btn bt-btn--secondary" data-kit-toast-kind="error">Show error</button><button type="button" class="bt-btn bt-btn--secondary" data-kit-toast-kind="info">Show info</button></div>
  </section>`;
}

// ---------- Trophy Room kit pieces (docs/specs/rewards.md §12) ----------
function trophyKitHtml() {
  const faces = ["🕯", "💬", "🎃", "🐾", "👁"];
  const rarities = [1, 2, 3, 4, 5].map((r) => `<div class="kit-stack" style="align-items:center;gap:8px">${medalHtml({ emoji: faces[r - 1], rarity: r, label: `${RARITY[r].name} badge` })}<span class="bt-badge bt-badge--${RARITY[r].tone}">${levelBars(r, 5)}${RARITY[r].name}</span></div>`).join("");
  return `
  <section class="kit-section" id="kit-trophy-room">
    <h2 class="kit-h">Trophy Room</h2>
    <p class="kit-p">The Trophy Room's pieces (<span class="kit-code">docs/specs/rewards.md</span>, design-system.md §8j). A badge is a coin: the ring is its rarity, the face its art. Rarity uses the level ladder plus gray, never purple or green. Hover a medal: a shine sweeps across it. Reduced motion: no spin, no shine.</p>
    <p class="kit-sub">Medal: .bt-medal with data-rarity 1 to 5 (Common gray, Uncommon blue, Rare gold notched, Epic pink with a glow and an inner ring, Legendary red/ember with a spinning ring), each with its rarity badge: .bt-badge + levelBars(n, 5), the five-step .bt-level--5</p>
    <div class="kit-row" style="gap:28px;align-items:flex-end">${rarities}</div>
    <p class="kit-sub">Secret (data-secret: a dark dashed silhouette until it's earned), and commissioned art (img.bt-medal-art on the face; the emoji stays as the fallback). shared/ui/medal.js medalHtml({ emoji, art, rarity, size, secret, label })</p>
    <div class="kit-row" style="gap:24px;align-items:center">${medalHtml({ rarity: 5, secret: true, label: "Secret badge" })}${medalHtml({ rarity: 3, secret: true, label: "Secret badge" })}${medalHtml({ emoji: "🗝", art: KIT_MASCOT, rarity: 4, label: "Badge with art" })}</div>
    <p class="kit-sub">Sizes: --bt-medal-size (here 28px, 48px, 72px default and 96px)</p>
    <div class="kit-row" style="gap:24px;align-items:center">${[28, 48, 0, 96].map((s) => medalHtml({ emoji: "👁", rarity: 5, size: s || undefined })).join("")}</div>
    <p class="kit-sub">Signal bars on their own: .bt-level--5, levels 1 to 5</p>
    <div class="kit-row" style="gap:18px">${[1, 2, 3, 4, 5].map((n) => `<span style="color:var(--bt-text)">${levelBars(n, 5)}</span>`).join("")}</div>
  </section>`;
}

// ---------- Game Vault kit pieces (docs/specs/game-vault.md §9) ----------
// Covers here are the mascot fallback and the kit's mascot as an uploaded picture: no stand-in
// cover art, no sample games from the mockups.
const VK_IC = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 11a3 3 0 1 0 0-6M21 20c0-2.6-1.6-4.2-4-4.8"/></svg>',
};
// ---------- Back pill and pager (game-vault-round-3.html N1 + P12; shared/ui/pager.js) ----------
function pagerKitHtml() {
  const pic = { source: "upload", url: KIT_MASCOT };
  const side = (title, meta) => ({ href: "#kit-pager", title, meta, cover: coverHtml(pic, { alt: "" }) });
  return `
  <section class="kit-section" id="kit-pager">
    <h2 class="kit-h">Back pill and pager</h2>
    <p class="kit-p">For stepping through a list one item at a time (the Game Vault's game page). Both sit on busy art, so they're frosted. On phones the back pill shortens and drops its reminder, and the buttons grow to 44px.</p>
    <p class="kit-sub">Back pill: .bt-back, with a small reminder of where you came from (backHtml)</p>
    <div class="kit-row">${backHtml({ href: "#kit-pager", label: "Wishlist, A-Z", long: "Back to the Vault", short: "Vault" })}${backHtml({ href: "#kit-pager", long: "Back to the Vault", short: "Vault" })}</div>
    <p class="kit-sub">Pager: .bt-pager, "3 of 14" with ‹ › (pagerHtml). Hover or focus an arrow for the preview. At either end the missing side is an empty gap, so nothing moves</p>
    <div class="kit-row" style="gap:32px;padding-bottom:90px">
      ${pagerHtml({ pos: 3, total: 14, prev: side("The game before", "6 streams"), next: side("The game after", "Not streamed yet"), label: "Pager demo" })}
      ${pagerHtml({ pos: 1, total: 14, next: side("The second game", "2 streams"), keys: false, label: "Pager demo, first" })}
      ${pagerHtml({ pos: 14, total: 14, prev: side("The one before last", "1 stream"), keys: false, label: "Pager demo, last" })}
    </div>
  </section>`;
}

function vaultKitHtml() {
  const pic = { source: "upload", url: KIT_MASCOT };
  const badge = (tone, label) => `<span class="bt-badge bt-badge--${tone}"><span class="bt-badge-dot"></span>${label}</span>`;
  const score = (n) => (n == null ? '<span class="bt-score-none">Not rated</span>' : `<span class="bt-score" aria-label="Score ${n} out of 10"><b>${n}</b><small>/10</small></span>`);
  const card = ({ title, cover = null, tone = "gold", status = "Wishlist", n = null, meta = "", dimmed = false, overlay = false, tags = "" }) => `<a class="bt-cover-card${dimmed ? " bt-cover-card--dimmed" : ""}" href="#" onclick="return false">${coverHtml(cover, { tilt: true, over: overlay ? `<span class="bt-cover-on bt-cover-on--top">${badge(tone, status)}</span>${n != null ? `<span class="bt-cover-on bt-cover-on--bottom">${score(n)}</span>` : ""}` : "" })}<div class="bt-cover-card-body"><div class="bt-cover-card-title">${title}</div>${overlay ? "" : `<div class="bt-cover-card-row">${badge(tone, status)}${score(n)}</div>`}${meta ? `<div class="bt-cover-card-meta">${meta}</div>` : ""}${tags}</div></a>`;
  const pick = (title, small, right, extra = "") => `<button type="button" class="bt-pick"${extra}>${coverHtml(null, { cls: "bt-cover--sm" })}<span class="bt-pick-main"><b>${title}</b><small>${small}</small></span>${right}</button>`;
  const shelfCards = Array.from({ length: 7 }, (_, i) => card({ title: `Cover card ${i + 1}`, cover: i % 3 ? null : pic, n: i % 2 ? null : 8, meta: "On a shelf" })).join("");
  const ranked = [1, 2, 3, 4].map((i) => `<div class="bt-ranked" style="--rk:var(--bt-rank-${i})"><span class="bt-rank" aria-label="Number ${i}">${i}</span><div class="bt-stack" style="gap:8px">${card({ title: `Most wanted ${i}`, meta: `${10 - i} want it` })}<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm">I want this too</button></div></div>`).join("");
  const tl = timelineHtml({
    label: "Every stream",
    points: [
      { at: 0.04, size: 24, legacy: true, title: "Before the site", lines: ["4 streams, 9 h", "Counted, not listed one by one"], aria: "4 streams before the site, 9 hours" },
      { at: 0.3, size: 18, title: "Aug 29", lines: ["2 h 10 m"], aria: "Aug 29, 2 hours 10 minutes" },
      { at: 0.58, size: 22, title: "Sep 5", lines: ["3 h 5 m"], aria: "Sep 5, 3 hours 5 minutes" },
      { at: 0.86, size: 20, title: "Sep 12", lines: ["2 h 40 m", "Finished it"], aria: "Sep 12, 2 hours 40 minutes, finished it", flag: "🏁" },
    ],
    site: { at: 0.14, label: "Site opens" }, ends: ["Mar 2025", "Sep 2026"],
    keys: [{ label: "A stream (size = length)" }, { cls: "is-legacy", label: "Before the site" }, { flag: "🏁", label: "Finished it" }],
  });
  const deckCard = (anim = "") => `<article class="bt-deck-card ${anim}">${coverHtml(null)}<div class="bt-deck-body"><h3>A queued add</h3><div class="bt-meta">On Steam and IGDB</div><ul class="bt-deck-checks"><li>Found it</li><li>Not already in the Vault</li><li>A full game</li><li class="is-flag">No horror theme on IGDB</li></ul><div class="bt-deck-acts"><button type="button" class="bt-btn bt-btn--admin" data-kit-deck="approve">Approve <kbd>A</kbd></button><button type="button" class="bt-btn bt-btn--secondary" data-kit-deck="reject">Reject <kbd>R</kbd></button><button type="button" class="bt-btn bt-btn--ghost" data-kit-deck="skip">Skip <kbd>S</kbd></button></div></div></article>`;
  return `
  <section class="kit-section" id="kit-vault-pieces">
    <h2 class="kit-h">Covers, search and triage</h2>
    <p class="kit-p">The Game Vault's kit pieces (<span class="kit-code">docs/specs/game-vault.md</span> §9), reusable anywhere: covers and cover cards, scores and the score dial, tags, the search field and its command panel, filter tokens, menus, the sheet, lookup picks, the dropzone, tilt and glare, count-up, shelves, the timeline and the triage deck.</p>

    <p class="kit-sub">Covers: .bt-cover (3:4; an image, or the mascot when a game has none), --sm thumb; shared/ui/cover.js builds the IGDB or Steam URL at display time</p>
    <div class="kit-row" style="align-items:flex-end"><div style="width:150px">${coverHtml(pic)}</div><div style="width:150px">${coverHtml(null)}</div>${coverHtml(null, { cls: "bt-cover--sm" })}</div>

    <p class="kit-sub">Cover cards in a .bt-cover-grid: default, overlay (status and score on the art), --dimmed, with tags. Hover a cover: it tilts and catches the light ([data-tilt] + .bt-glare, pointer devices only)</p>
    <div class="bt-cover-grid">${card({ title: "A finished game", cover: pic, tone: "lime", status: "Finished", n: 9, meta: "6 streams, last Sep 12" })}${card({ title: "Overlay", cover: pic, tone: "green", status: "Playing", n: 8, overlay: true, meta: "23 streams" })}${card({ title: "Dimmed (abandoned)", tone: "gray", status: "Abandoned", n: 5, dimmed: true, meta: "3 streams, last Apr 4" })}${card({ title: "Community pick", meta: "Not streamed yet, 6 want it", tags: `<div class="bt-tags"><span class="bt-tag">${VK_IC.people}Community pick</span><span class="bt-tag">Early access</span></div>` })}</div>

    <p class="kit-sub">Score: .bt-score, --lg, .bt-score-pips, .bt-score-none · Score dial: .bt-dial (shared/ui/dial.js), ten segments lighting in Boomer's gold as it scrolls in; --sm</p>
    <div class="kit-row" style="align-items:center;gap:24px">${score(8)}<span class="bt-score bt-score--lg"><b>9</b><small>/10</small></span><span class="bt-score-pips" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i${i < 7 ? ' class="is-on"' : ""}></i>`).join("")}</span>${score(null)}${dialHtml(9)}${dialHtml(4, { size: "sm", caption: "" })}</div>

    <p class="kit-sub">Tags: .bt-tag in .bt-tags (a/button.bt-tag is clickable) · Tokens: .bt-token, a removable active filter · Chip count .bt-chip-n and .bt-chip--menu (closed, open)</p>
    <div class="kit-row"><span class="bt-tag">First person</span><a class="bt-tag" href="#" onclick="return false">Co-op</a><span class="bt-tag">${VK_IC.people}Community pick</span><button type="button" class="bt-token">Co-op<i aria-hidden="true">×</i></button><button type="button" class="bt-token">Community picks<i aria-hidden="true">×</i></button></div>
    <div class="kit-row"><button type="button" class="bt-chip bt-chip--small is-active">All<span class="bt-chip-n">15</span></button><button type="button" class="bt-chip bt-chip--small">Playing<span class="bt-chip-n">2</span></button><button type="button" class="bt-chip bt-chip--small bt-chip--menu" aria-expanded="false">Tags</button><button type="button" class="bt-chip bt-chip--small bt-chip--menu" aria-expanded="true">Length</button></div>

    <p class="kit-sub">Search: .bt-search (empty with the / key, with a clear button), --lg · Command panel: .bt-cmd (shared/ui/cmd.js) with matched letters, a suggested filter and the action row; type in the field below (arrows, Enter, Esc)</p>
    <div class="kit-stack" style="gap:12px;max-width:620px">
      <label class="bt-search">${VK_IC.search}<input class="bt-input" type="search" placeholder="Steam link or game name" aria-label="Search (demo)"><span class="bt-search-key" aria-hidden="true">/</span></label>
      <label class="bt-search">${VK_IC.search}<input class="bt-input" type="search" value="granny" aria-label="Search with text (demo)"><button type="button" class="bt-search-clear" aria-label="Clear">×</button></label>
      <div style="position:relative"><label class="bt-search bt-search--lg">${VK_IC.search}<input class="bt-input" type="search" data-kit-cmd placeholder="Try “sh”" aria-label="Command panel demo"><span class="bt-search-key" aria-hidden="true">/</span></label><div data-kit-cmd-mount></div></div>
    </div>

    <p class="kit-sub">Popover: .bt-popover (tag menu) · Sheet: .bt-sheet (the phone Filters sheet)</p>
    <div class="kit-row" style="align-items:flex-start;gap:24px">
      <div class="bt-popover" style="position:relative" role="group" aria-label="Tags (demo)">${["First person", "Co-op", "Psychological"].map((t, i) => `<label class="bt-check"><input type="checkbox"${i === 1 ? " checked" : ""}><span>${t}</span><span class="bt-popover-n">${8 - i * 2}</span></label>`).join("")}<div class="bt-popover-foot"><button type="button" class="bt-link-btn">Clear</button><button type="button" class="bt-btn bt-btn--primary bt-btn--sm">Show 4 games</button></div></div>
      <div class="bt-sheet" style="width:320px"><span class="bt-sheet-grip"></span><div class="bt-sheet-head"><b>Filters</b></div><div class="bt-sheet-group"><span class="bt-label">Length</span><div class="bt-sheet-chips"><button type="button" class="bt-chip bt-chip--small">Short</button><button type="button" class="bt-chip bt-chip--small is-active">Medium</button><button type="button" class="bt-chip bt-chip--small">Long</button></div></div><div class="bt-sheet-actions"><button type="button" class="bt-btn bt-btn--secondary">Clear</button><button type="button" class="bt-btn bt-btn--primary">Show 4 games</button></div></div>
    </div>

    <p class="kit-sub">Lookup picks: .bt-pick-list of .bt-pick (pick, chosen with aria-pressed, already there .is-in) · Dropzone: .bt-dropzone (rest, a file dragged over: .is-over)</p>
    <div class="kit-row" style="align-items:flex-start;gap:24px">
      <div class="bt-pick-list" style="width:360px">${pick("A game", "2017, a studio", '<span class="bt-pick-act">Pick</span>')}${pick("The chosen one", "2021, a studio", '<span class="bt-pick-act">Selected</span>', ' aria-pressed="true"')}<button type="button" class="bt-pick is-in">${coverHtml(null, { cls: "bt-cover--sm" })}<span class="bt-pick-main"><b>Already there</b><small>2019, a studio</small></span><span class="bt-tag">In the Vault</span></button></div>
      <div class="kit-stack" style="gap:10px;width:260px"><div class="bt-dropzone" tabindex="0"><span>Drop a JPG, PNG or WebP</span><span><b>or choose a file</b></span></div><div class="bt-dropzone is-over"><span>Drop it here</span></div></div>
    </div>

    <p class="kit-sub">Count-up: [data-count-to] counts up once as it scrolls in (shared/ui/count-up.js)</p>
    <div class="kit-row" style="gap:28px;font-size:30px;font-weight:900"><b data-count-to="61">61</b><b data-count-to="148" data-suffix=" h">148 h</b></div>

    <p class="kit-sub">Shelf: .bt-shelf with its head and arrows (shared/ui/shelf.js); --ranked with outlined .bt-rank numerals in --bt-rank-1…</p>
    <div data-shelf-wrap><div class="bt-shelf-head"><div><h3 class="bt-heading">A shelf</h3><p>Swipe, or use the arrows.</p></div><div class="bt-shelf-tools"><span class="bt-shelf-arrows"><button type="button" class="bt-icon-btn" data-shelf-prev aria-label="Scroll back">‹</button><button type="button" class="bt-icon-btn" data-shelf-next aria-label="Scroll on">›</button></span><button type="button" class="bt-link-btn">See all 7</button></div></div><div class="bt-shelf">${shelfCards}</div></div>
    <div data-shelf-wrap><div class="bt-shelf bt-shelf--ranked">${ranked}</div></div>

    <p class="kit-sub">State helpers: .bt-when-visitor, .bt-when-signed-in, .bt-when-admin and .bt-when-staff (mods and admins) show or hide by the page's data-auth and data-staff; try ?as=admin or ?as=member</p>
    <div class="kit-row"><span class="bt-badge bt-badge--gray bt-when-visitor">Visitors</span><span class="bt-badge bt-badge--blue bt-when-signed-in">Signed in</span><span class="bt-badge bt-badge--teal bt-when-staff">Staff (mods and admins)</span><span class="bt-badge bt-badge--green bt-when-admin">Admins</span></div>

    <p class="kit-sub">Section head: .bt-section-head (shared/ui/section-head.js sectionHeadHtml). An icon tile, the heading with a count pill, a thin gold rule running to the tools. Phones: no rule and no line under the heading. small (.bt-section-head--sm) with a meta note is the head above a card on a detail page (the Game Vault game page)</p>
    <div class="kit-stack" style="gap:22px">
      ${sectionHeadHtml({ icon: "🏆", title: "Boomer's best", count: 12, sub: "Finished, highest score first.", tools: `<span class="bt-shelf-arrows"><button type="button" class="bt-icon-btn" data-shelf-prev aria-label="Scroll back">‹</button><button type="button" class="bt-icon-btn" data-shelf-next aria-label="Scroll on">›</button></span><button type="button" class="bt-link-btn">See all 12</button>` })}
      ${sectionHeadHtml({ icon: "🗝", title: "All games", count: 78, sub: "Last streamed first." })}
      ${sectionHeadHtml({ title: "No icon, no tools", count: 3 })}
      ${sectionHeadHtml({ icon: "📺", title: "Every stream", meta: "6 streams, 14 hours", small: true })}
    </div>

    <p class="kit-sub">Timeline: .bt-timeline (shared/ui/timeline.js). Dots sized by length, a hollow dot for history before the site, a flag; hover or focus a dot</p>
    <div class="bt-card" style="max-width:720px">${tl}</div>

    <p class="kit-sub">Triage deck: .bt-deck (shared/ui/deck.js). Click, or focus the deck and press A, R or S; the card flies off and comes back here</p>
    <div class="bt-deck-count"><span><b>1</b> of 3 to check</span><span class="bt-deck-prog"><i class="is-done"></i><i></i><i></i></span></div>
    <div class="bt-deck" tabindex="0" data-kit-deck-wrap aria-label="Demo deck. Press A to approve, R to reject, S to skip"><span class="bt-deck-ghost"></span><span class="bt-deck-ghost"></span>${deckCard()}</div>
  </section>`;
}

function initVaultKit(mount) {
  initTilt();
  initDials(mount);
  initCountUp(mount);
  initShelves(mount);
  initTimelines(mount);
  initCoverFallbacks();
  const input = mount.querySelector("[data-kit-cmd]");
  if (input) {
    const titles = ["Silent Hill 2", "Signalis", "Still Wakes the Deep", "Shadows of Doubt"];
    initCmd({
      input, mount: mount.querySelector("[data-kit-cmd-mount]"),
      groups: (q) => {
        const hits = titles.map((t) => [t, t.toLowerCase().indexOf(q.toLowerCase())]).filter(([, i]) => i >= 0);
        return [
          { label: "Results", items: hits.map(([t, i]) => ({ value: t, html: `${coverHtml(null, { cls: "bt-cover--sm" })}<b>${litText(t, Array.from({ length: q.length }, (_, k) => i + k), escapeHtml)}</b><small>a studio</small>` })) },
          { label: "Filters", items: q.length > 1 ? [{ value: "filter", html: `<span class="bt-cmd-ic">${VK_IC.filter}</span><b>Only Survival horror games</b><small>4 games</small>` }] : [] },
          { label: "Not here?", items: [{ value: "add", html: `<span class="bt-cmd-ic">${VK_IC.plus}</span><b>Add “${escapeHtml(q)}”</b>` }] },
        ];
      },
      onChoose: (v) => { input.value = v === "add" || v === "filter" ? "" : v; },
    });
  }
  const deck = mount.querySelector("[data-kit-deck-wrap]");
  if (deck) {
    const act = async (kind) => {
      await flyOut(deck.querySelector(".bt-deck-card"), kind);
      const card = deck.querySelector(".bt-deck-card");
      card.classList.remove("is-out-right", "is-out-left", "is-in");
      void card.offsetWidth;
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) card.classList.add("is-in");
    };
    initDeck(deck, { onKey: act });
    deck.addEventListener("click", (e) => { const b = e.target.closest("[data-kit-deck]"); if (b) act(b.dataset.kitDeck); });
  }
}

// ---------- Mod Machina pieces (docs/specs/mod-machina.md §16; shared/ui/grade-chip.js, crew.js, pref.js, ladder.js, quiz.js) ----------
const MM_LADDER = [
  { track: "mod", grade: 1, title: "Initiate", text: "New to the crew. You learn the rooms, welcome people and ask when unsure.", can: ["Remind, warn and flag in chat", "Take a Deckhand seat on a stream"], up: ["Pass the core Academy modules", "Three duties and a vouch from a Watcher"] },
  { track: "mod", grade: 2, title: "Watcher", text: "Trusted to keep a room going without checking in.", can: ["Vouch for people in the queue", "Lead a chat on a quiet stream"], up: ["Pass Safety (module 9)", "A clean record and steady duties"] },
  { track: "mod", grade: 3, title: "Warden", text: "Handles the tricky moments and looks after newer mods.", can: ["Time out and ban when it is needed", "Lead any chat"], up: ["The owner's call, after a long steady run"] },
  { track: "mod", grade: 4, title: "Sentinel", text: "The top of the mod ladder: runs the crew day to day.", can: ["Post tasks on the task board", "Captain a stream"], up: [] },
  { track: "admin", grade: 1, title: "Steward", text: "Looks after the site and the crew tools.", can: ["Use the admin tools"], up: ["By invitation"] },
  { track: "admin", grade: 2, title: "Overseer", text: "Runs the crew's records and standing.", can: ["Confirm tasks", "Record strikes"], up: ["By invitation"] },
  { track: "admin", grade: 3, title: "Right Hand", text: "Acts for the owner on the crew.", can: ["Promote up to Warden"], up: [] },
];
const MM_QUIZ = [
  { text: "A new viewer posts a link to their own stream. What is your first step?", options: ["Ban them so it does not happen again", "Remind them that self-promo is not allowed here", "Time them out for ten minutes"], right: 1 },
  { text: "Someone mentions self-harm in chat. What do you do?", options: ["Ignore it and keep the chat moving", "Flag the owner straight away, and be kind", "Argue with them"], right: 1 },
  { text: "A friend of yours breaks a rule. What now?", options: ["Let it slide, they are a friend", "Treat them like anyone else", "Ban them to look fair"], right: 1 },
];
const mmGrades = () => [{ track: "mod", grade: 1 }, { track: "mod", grade: 2 }, { track: "mod", grade: 3 }, { track: "mod", grade: 4 }, { track: "admin", grade: 1 }, { track: "admin", grade: 2 }, { track: "admin", grade: 3 }];
const mmBoardRow = (r, name, handle, grade, gears, duties, hours, rooms, extra = "") => `<tr${r <= 3 ? ` data-r="${r}"` : ""}${extra ? ` class="${extra}"` : ""}><td class="bt-board-rank">${r}</td><td><span class="bt-board-who"><span class="bt-avatar-sm" aria-hidden="true">${kitInitials(name)}</span><span><b>${name}</b>${gradeChipHtml(grade)}${extra.includes("is-staff") ? '<span class="bt-badge bt-badge--admin">Staff</span>' : ""}</span></span></td><td class="bt-board-n">${gears}</td><td class="bt-board-n bt-board-hide">${duties}</td><td class="bt-board-n bt-board-hide">${hours}</td><td class="bt-board-rooms"><span class="bt-crew-plats">${rooms.map((c) => platformIconHtml(c)).join("")}</span></td></tr>`;

function modMachinaKitHtml() {
  const chips = (code) => mmGrades().map((g) => `<div class="kit-stack" style="align-items:flex-start;gap:8px">${gradeChipHtml({ ...g, code })}</div>`).join("");
  const wordmark = (lit) => `<a class="bt-wordmark bt-wordmark--power${lit ? " is-lit" : ""}" href="#kit-mod-machina" aria-label="Mod Machina"><span class="bt-wordmark-icon">${MM_ICON}</span><span class="bt-wordmark-text" aria-hidden="true">MOD <span class="bt-wordmark-accent">MACHINA</span></span></a>`;
  const room = (chat, state) => roomHtml({ chat, state });
  const card = (o) => crewCardHtml(o);
  const chatsA = { twitch: "favourite", ytLandscape: "happy", ytVertical: "ifNeeded", tiktok: "no" };
  const punched = [{ stamp: "Oct 3", text: "YT vertical · 2 h" }, { stamp: "Oct 9", text: "Twitch · 3 h" }, { stamp: "Oct 14", text: "YT landscape · 1 h" }, { stamp: "Oct 22", text: "TikTok · 2 h" }];
  const bonus = medalHtml({ emoji: "⏱", rarity: 2, size: 36 });
  return `
  <section class="kit-section" id="kit-mod-machina">
    <h2 class="kit-h">Mod Machina</h2>
    <p class="kit-p">The crew's pieces (<span class="kit-code">docs/specs/mod-machina.md</span> §16, design-system.md §5 and §8m). Colours: "needed" is gold, never red (red is for destroying data); admin-only things are green.</p>

    <p class="kit-sub">Admin badge: .bt-badge--admin (the Staff tag; admin green, admin only)</p>
    <div class="kit-row"><span class="bt-badge bt-badge--admin">Staff</span><span class="bt-badge bt-badge--admin"><span class="bt-badge-dot"></span>Admin only</span><span class="bt-badge bt-badge--gold">Gold</span><span class="bt-badge bt-badge--gray">Gray</span></div>

    <p class="kit-sub">Grade chip: .bt-grade, gradeChipHtml({ track, grade, code }) in shared/ui/grade-chip.js. Mod grades: blue, gold, pink, red with 4 bars; admin grades: .bt-badge--admin with 3 bars</p>
    <div class="kit-row" style="gap:10px">${chips(false)}</div>
    <div class="kit-row" style="gap:10px">${chips(true)}</div>

    <p class="kit-sub">Wordmark icon: MM_ICON (shared/ui/mod-machina.js) on .bt-wordmark--power. Rest, and lit (hover, focus or touch: the gear speeds up, the eye lights, MACHINA goes gold). Still under reduced motion</p>
    <div class="kit-row" style="gap:36px">${wordmark(false)}${wordmark(true)}</div>

    <p class="kit-sub">Platform tiles: .bt-platform-icon--sm (the real logo goes in as an img with .has-logo; the corner mark shows YouTube landscape or vertical), platformIconHtml(chat)</p>
    <div class="kit-row" style="gap:16px">${["twitch", "ytLandscape", "ytVertical", "tiktok"].map((c) => platformIconHtml(c)).join("")}${platformIconHtml("twitch", { logo: KIT_MASCOT })}</div>

    <p class="kit-sub">Room: .bt-room with data-state covered, needed (gold) or off, roomHtml({ chat, name, state, text })</p>
    <div class="bt-rooms">${room("twitch", "covered")}${room("ytLandscape", "needed")}${room("ytVertical", "needed")}${room("tiktok", "off")}${roomHtml({ chat: "twitch", name: "Twitch", state: "covered", text: "2 on duty" })}</div>

    <p class="kit-sub">Preference rows: .bt-pref, prefHtml({ rows }) + initPrefs(root, { onChange }). A radio group per chat: arrow keys, Home and End move and choose; "needed" adds a gold edge and tag. Pick one: the line below follows</p>
    <div class="kit-grid-2"><div class="kit-stack" data-kit-pref>${prefHtml({ rows: [
      { chat: "twitch", name: "Twitch", iconHtml: platformIconHtml("twitch"), value: "favourite" },
      { chat: "ytLandscape", name: "YouTube landscape", iconHtml: platformIconHtml("ytLandscape"), value: "happy", needed: true },
      { chat: "ytVertical", name: "YouTube vertical", iconHtml: platformIconHtml("ytVertical"), value: "ifNeeded", needed: true },
      { chat: "tiktok", name: "TikTok", iconHtml: platformIconHtml("tiktok"), value: "no" },
    ] })}<p class="kit-note" data-kit-pref-out aria-live="polite">Nothing changed yet.</p></div></div>

    <p class="kit-sub">Roster card: .bt-crew-card (in .bt-roster), crewCardHtml({ name, handle, gradeHtml, staff, onBreak, chats, meta }). Starred chats are favourites, faded ones are No. Mod, admin (Staff tag) and on a break</p>
    <div class="bt-roster">
      ${card({ name: "NightOwl Kat", handle: "nightowlkat", gradeHtml: gradeChipHtml({ track: "mod", grade: 4 }), chats: chatsA, meta: "88 duties · since Jan 2026" })}
      ${card({ name: "Raven", handle: "ravenrx", gradeHtml: gradeChipHtml({ track: "admin", grade: 2 }), staff: true, chats: { twitch: "favourite", ytLandscape: "happy", ytVertical: "happy", tiktok: "ifNeeded" }, meta: "96 duties" })}
      ${card({ name: "Ghoul Girl Gem", handle: "ghoulgem", gradeHtml: gradeChipHtml({ track: "mod", grade: 2 }), onBreak: true, chats: { twitch: "no", ytLandscape: "no", ytVertical: "no", tiktok: "favourite" }, meta: "15 duties" })}
      ${card({ name: "Lantern Lou", handle: "lanternlou", gradeHtml: gradeChipHtml({ track: "mod", grade: 1 }) })}
    </div>

    <p class="kit-sub">Swap board: .bt-swap in .bt-swaps, swapRowHtml({ id, dow, day, chat, role, roomName, note, state }) (shared/ui/swap.js). Open is gold ("needed", never red) with Take it; is-taken is dimmed with no button; is-mine-now is purple with a lime "Yours" badge. Hover lifts a row (not under reduced motion); on phones the button drops under the row</p>
    <div class="kit-grid-2">${swapsHtml([
      swapRowHtml({ id: "k1", dow: "FRI", day: "16", chat: "ytVertical", role: "Lead", roomName: "YT Vertical", note: "Dropped by @mothlight · 3 days ahead · 7:00 PM", state: "open" }),
      swapRowHtml({ id: "k2", dow: "SAT", day: "17", chat: "twitch", role: "Deckhand", roomName: "Twitch", note: "Dropped by @kitwick · 20 h ahead · late drop, costs them nothing if taken", state: "open" }),
      swapRowHtml({ id: "k3", dow: "WED", day: "14", chat: "ytLandscape", role: "Lead", roomName: "YouTube", note: "Taken by @hollowgrin", state: "taken" }),
      swapRowHtml({ id: "k4", dow: "FRI", day: "16", chat: "captain", role: "Captain", roomName: "", note: "Yours now · confirmed · the Captain can see it", state: "mine" }),
    ].join(""))}</div>

    <p class="kit-sub">Podium (B2): .bt-podium, podiumHtml({ places }), 1st in the middle; one column on phones. With the board table below: .bt-board.bt-board--crew (.bt-board-rooms, .bt-board-n, .bt-board-hide, tr.is-staff, tr.is-me) and .bt-board-legend</p>
    ${podiumHtml({ places: [
      { rank: 1, name: "CryptKeeper Jay", gradeHtml: gradeChipHtml({ track: "mod", grade: 3 }), value: 412, unit: "Gears", sub: "11 duties · 26.5 h" },
      { rank: 2, name: "NightOwl Kat", gradeHtml: gradeChipHtml({ track: "mod", grade: 4 }), value: 377, unit: "Gears", sub: "12 duties · 31 h" },
      { rank: 3, name: "Mothman Mike", gradeHtml: gradeChipHtml({ track: "mod", grade: 2 }), value: 298, unit: "Gears", sub: "8 duties · 19 h" },
    ] })}
    <div class="bt-card"><table class="bt-board bt-board--crew"><thead><tr><th scope="col">#</th><th scope="col">Crew</th><th scope="col" class="bt-board-n">Gears</th><th scope="col" class="bt-board-n bt-board-hide">Duties</th><th scope="col" class="bt-board-n bt-board-hide">Hours</th><th scope="col" class="bt-board-rooms">Rooms</th></tr></thead><tbody>
      ${mmBoardRow(4, "Raven", "ravenrx", { track: "admin", grade: 2 }, 251, 9, 22, ["twitch"], "is-staff")}
      ${mmBoardRow(5, "Salem Spooks", "salemspooks", { track: "mod", grade: 3 }, 233, 9, "21.5", ["twitch", "tiktok"])}
      ${mmBoardRow(6, "Lantern Lou", "lanternlou", { track: "mod", grade: 1 }, 58, 2, 4, ["twitch"], "is-me")}
    </tbody></table><div class="bt-board-legend"><span>Staff rows are tinted green and never win crew awards.</span><span>Your row is highlighted.</span></div></div>

    <p class="kit-sub">Time card (M2): .bt-timecard, timecardHtml({ month, need, total, slots, state, bonusHtml }); states normal, behind, done and "Starts with stream duty" (idle)</p>
    <div class="kit-grid-2">
      <div class="kit-stack"><span class="kit-note">Normal: 2 of 2 punched</span>${timecardHtml({ month: "October", slots: punched.slice(0, 2), bonusHtml: bonus })}</div>
      <div class="kit-stack"><span class="kit-note">Behind: 1 of 2</span>${timecardHtml({ month: "October", slots: punched.slice(0, 1), bonusHtml: bonus })}</div>
      <div class="kit-stack"><span class="kit-note">Done: 4 punched, On the Clock earned</span>${timecardHtml({ month: "October", slots: punched, bonusHtml: bonus })}</div>
      <div class="kit-stack"><span class="kit-note">Starts with stream duty (activity rules off)</span>${timecardHtml({ month: "October", slots: [], state: "idle", bonusHtml: bonus })}</div>
    </div>

    <p class="kit-sub">Progress ring: .bt-ring with --v 0 to 100 and a text centre, ringHtml({ value, centre, caption, label, size, done }); --sm (64px) and --done (lime)</p>
    <div class="kit-row" style="gap:24px">${ringHtml({ value: 0, centre: "0/10", caption: "Passed" })}${ringHtml({ value: 60, centre: "6/10", caption: "Passed" })}${ringHtml({ value: 100, centre: "10/10", caption: "Passed", done: true })}${ringHtml({ value: 60, centre: "3/5", size: "sm" })}${ringHtml({ value: 100, centre: "5/5", size: "sm", done: true })}</div>

    <p class="kit-sub">Ladder: .bt-ladder, ladderHtml({ rungs }) + ladderDetailHtml(...) + initLadder(root). Click a rung, or use the arrow keys (Up climbs); the admin rungs sit above the dashed gate</p>
    ${ladderHtml({ id: "kit-ladder", label: "Crew grades", selected: 1, rungs: MM_LADDER.map((l) => {
      const admin = l.track === "admin";
      const chip = gradeChipHtml({ track: l.track, grade: l.grade });
      return { admin, rungHtml: chip, tag: admin ? "Admin" : `Rung ${l.grade}`, detailHtml: ladderDetailHtml({ chipHtml: chip, meta: admin ? "Invitation only" : `Rung ${l.grade} of 4`, title: l.title, text: l.text, can: l.can, up: l.up, upLabel: l.up.length ? (admin ? "How" : "To move up") : "", admin, tags: admin ? [] : ["Boomer confirms every promotion"] }) };
    }) })}

    <p class="kit-sub">Quiz: .bt-quiz, quizHtml({ questions, passMark }) + initQuiz(root, { submit }). Options are plain radio buttons and the component never knows the answers: submit(answers) is async and returns { correct, say } per question. This demo grades locally (the real Academy asks the server). Pick, then Next</p>
    <div class="kit-grid-2"><div class="bt-card" data-kit-quiz>${quizHtml({ questions: MM_QUIZ, passMark: 2 })}</div></div>
    <p class="kit-sub">Quiz states without a server (showQuizResults): wrong answer in red, right in lime, the rest neutral, BOOMBOT's reply; the result card passed, and not quite</p>
    <div class="kit-grid-2">
      <div class="bt-card" data-kit-quiz-static="3">${quizHtml({ questions: MM_QUIZ, passMark: 2, title: "Passed" })}</div>
      <div class="bt-card" data-kit-quiz-static="1">${quizHtml({ questions: MM_QUIZ, passMark: 2, title: "Not quite" })}</div>
    </div>
  </section>`;
}

function initModMachinaKit(mount) {
  const sec = mount.querySelector("#kit-mod-machina");
  if (!sec) return;
  initPrefs(sec, { onChange: (chat, value) => { const o = sec.querySelector("[data-kit-pref-out]"); if (o) o.textContent = `${chat}: ${PREF_OPTIONS.find((p) => p.value === value)?.label}`; } });
  initLadder(sec);
  const grade = (answers) => answers.map((a, i) => ({ correct: a === MM_QUIZ[i].right, say: a === MM_QUIZ[i].right ? "Right. Start with the gentlest step that works." : "Not quite. Start with a friendly reminder; most people just did not know." }));
  initQuiz(sec.querySelector("[data-kit-quiz]"), { submit: async (answers) => { await new Promise((r) => setTimeout(r, 400)); return { results: grade(answers), say: "Nice work. Come back any time to read it again." }; } });
  sec.querySelectorAll("[data-kit-quiz-static]").forEach((card) => {
    const nRight = Number(card.dataset.kitQuizStatic);
    const answers = MM_QUIZ.map((q, i) => (i < nRight ? q.right : (q.right + 1) % q.options.length));
    showQuizResults(card.querySelector(".bt-quiz"), answers, { results: grade(answers), say: nRight >= 2 ? "Nice work." : "Have another read, then try again." });
  });
}

// ---------- Story page pieces (design-system.md §5 "Story page pieces"; shared/ui/stamp.js, day-picker.js, chat-tile.js; journey .ai-jr--4 is site CSS) ----------
function storyPiecesKitHtml() {
  const step = (cls, num, ic, t, d, v = "") => `<li tabindex="0"${cls ? ` class="${cls}"` : ""}><span class="ai-jr-num" aria-hidden="true">${num}</span><span class="ai-jr-ic" aria-hidden="true">${ic}</span><b>${t}</b><span class="ai-jr-t">${d}</span>${v ? `<span class="ai-jr-v">${v}</span>` : ""}</li>`;
  const j4 = (steps, attrs = "") => `<ol class="ai-jr ai-jr--4"${attrs}>${steps.join("")}</ol>`;
  const msgs = {
    twitch: [{ user: "SalemSpooks", text: "that jump scare 😂", tone: "blue" }, { user: "ravenrx", text: "mods asleep?" }, { user: "nightowlkat", text: "welcome in!", tone: "teal" }],
    ytLandscape: [{ quiet: true, text: "Chat is quiet. Nobody on duty." }, { user: "viewer88", text: "hello? anyone here", tone: "gold" }],
    ytVertical: [{ user: "pixiejo", text: "first time here!", tone: "lime" }, { quiet: true, text: "Slow mode is on." }],
    tiktok: [{ user: "bansheebea", text: "love this one" }, { user: "gh0stly", text: "😍😍😍", tone: "teal" }],
  };
  const tile = (chat, name, value, extra = {}) => chatTileHtml({ chat, name, iconHtml: platformIconHtml(chat), value, note: "Chat note", previewHtml: chatPreviewHtml(msgs[chat]), ...extra });
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, key) => ({ key, label, num: 6 + key }));
  return `
  <section class="kit-section" id="kit-story-pages">
    <h2 class="kit-h">Story page pieces</h2>
    <p class="kit-p">The pieces the Join and Meet the crew pages are built from (<span class="kit-code">docs/design/mockups/crew-story-pages.html</span>, design-system.md §5 and §8m). Tool pages can use the stamp, the day picker and the chat tile too.</p>

    <p class="kit-sub">Four-step journey: .ai-jr.ai-jr--4 (site/src/styles/how-it-works.css, with shared/ui/how-it-works.js initJourney for hover). Step states on the li: is-met (lime check), is-on (the step in focus), is-wait (gold, dashed), is-locked (dimmed), is-waived (teal), and an optional .ai-jr-v value line. Phones go vertical</p>
    <p class="kit-note">All four met, hover or tap a step (live)</p>
    ${j4([step("is-met", "✓", "🎂", "18 or older", "Checked from your birthday", "✓ Yes"), step("is-met", "✓", "📅", "Member 14 days", "Joined Sep 2", "✓ 35 days"), step("is-met", "✓", "🔗", "A linked account", "Twitch, YouTube or TikTok", "✓ Twitch"), step("is-met", "✓", "📺", "3 stream check-ins", "In the last 30 days", "✓ 11")], " data-journey")}
    <p class="kit-note">Met, met, waiting, locked</p>
    ${j4([step("is-met", "✓", "🎂", "18 or older", "Checked from your birthday", "✓ Yes"), step("is-met", "✓", "📅", "Member 14 days", "Joined Sep 2", "✓ 35 days"), step("is-wait", "3", "🔗", "A linked account", "Twitch, YouTube or TikTok", "Not yet"), step("is-locked", "4", "📺", "3 stream check-ins", "Unlocks after a linked account", "Later")])}
    <p class="kit-note">Met, waived by the owner, now (is-on, with --p lighting the line to it), locked</p>
    ${j4([step("is-met is-past", "✓", "🎂", "18 or older", "Checked from your birthday", "✓ Yes"), step("is-waived is-past", "✓", "📅", "Member 14 days", "Waived by Boomer", "Waived"), step("is-on", "3", "🔗", "A linked account", "Twitch, YouTube or TikTok", "Looking now"), step("is-locked", "4", "📺", "3 stream check-ins", "Comes last", "Later")], ' style="--p:2"')}

    <p class="kit-sub">Stamp: .bt-stamp (shared/ui/stamp.js stampHtml({ label, kicker, sub, tone, size })). Slams in and settles; tones gold (default), lime, primary; --sm is 96px. Under reduced motion it sits still (no slam). Re-render to replay</p>
    <div class="kit-row" style="gap:28px;padding:10px 6px">${stampHtml({ kicker: "Application", label: "In", sub: "Oct 7" })}${stampHtml({ label: "Done", sub: "Signed off", tone: "lime" })}${stampHtml({ label: "Sent", tone: "primary" })}${stampHtml({ label: "In", tone: "lime", size: "sm" })}${stampHtml({ label: "Done", size: "sm" })}</div>
    <div class="kit-row"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kit-stamp-replay>Replay the slam</button></div>

    <p class="kit-sub">Day picker: .bt-day-picker, dayPickerHtml({ days, selected, label, disabled }) + initDayPicker(root, { onChange(selected, key) }) in shared/ui/day-picker.js. Real buttons with aria-pressed (Tab, Space, Enter); the dot lights when chosen</p>
    <p class="kit-note">Empty</p>
    ${dayPickerHtml({ label: "Days you are around" })}
    <p class="kit-note">Selected: Mon, Thu, Fri (with date numbers), try it</p>
    <div class="kit-stack" data-kit-days>${dayPickerHtml({ days, selected: [0, 3, 4] })}<p class="kit-note" data-kit-days-out aria-live="polite">Chosen: Mon, Thu, Fri</p></div>
    <p class="kit-note">All seven</p>
    ${dayPickerHtml({ selected: [0, 1, 2, 3, 4, 5, 6] })}
    <p class="kit-note">Disabled (the whole picker, and weekend tiles only)</p>
    ${dayPickerHtml({ selected: [1, 2], disabled: true })}
    ${dayPickerHtml({ days: ["Mon", "Tue", "Wed", "Thu", "Fri", { key: 5, label: "Sat", disabled: true }, { key: 6, label: "Sun", disabled: true }], selected: [0] })}

    <p class="kit-sub">Chat tile: .bt-chat-tile, chatTileHtml({ chat, name, iconHtml, value, needed, boost, previewHtml, note }) + chatPreviewHtml(messages) + initChatTiles(root, { onChange(chat, value) }) in shared/ui/chat-tile.js. The same four values as .bt-pref (favourite, happy, ifNeeded, no); a radio group with arrow keys. Pick one: the tile changes</p>
    <p class="kit-note">Each value, left to right: Favourite, Happy to help, Only if needed, No</p>
    <div class="kit-tiles">${tile("twitch", "Twitch", "favourite")}${tile("tiktok", "TikTok", "happy")}${tile("ytVertical", "YouTube vertical", "ifNeeded")}${tile("twitch", "Twitch", "no")}</div>
    <p class="kit-note">Nothing chosen yet, and "Most needed" (needed + boost 1.5: gold edge and ribbon) with nothing, Favourite and Happy to help chosen</p>
    <div class="kit-tiles">${tile("tiktok", "TikTok", "")}${tile("ytLandscape", "YouTube landscape", "", { needed: true, boost: 1.5 })}${tile("ytLandscape", "YouTube landscape", "favourite", { needed: true, boost: 1.5 })}${tile("ytVertical", "YouTube vertical", "happy", { needed: true })}</div>
    <p class="kit-note" data-kit-tiles-out aria-live="polite">Nothing changed yet. Tab to a tile and use the arrow keys to see the focus ring.</p>
  </section>`;
}

function initStoryPiecesKit(mount) {
  const sec = mount.querySelector("#kit-story-pages");
  if (!sec) return;
  sec.querySelectorAll("[data-journey]").forEach(initJourney);
  initDayPicker(sec, { onChange: (sel) => { const o = sec.querySelector("[data-kit-days-out]"); if (o) o.textContent = `Chosen: ${sel.map((k) => DAYS[k]?.label ?? k).join(", ") || "none"}`; } });
  initChatTiles(sec, { onChange: (chat, value) => { const o = sec.querySelector("[data-kit-tiles-out]"); if (o) o.textContent = `${chat}: ${PREF_OPTIONS.find((p) => p.value === value)?.label}`; } });
  sec.querySelector("[data-kit-stamp-replay]")?.addEventListener("click", () => {
    sec.querySelectorAll(".bt-stamp").forEach((s) => { s.style.animation = "none"; void s.offsetWidth; s.style.animation = ""; });
  });
}

// ---------- Header nav groups (design-system.md §5 "Header nav groups"; shared/ui/navgroup.js; docs/design/mockups/header-nav.html) ----------
const NG_CHEV = `<svg class="bt-navgroup-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const NG_PAGES = {
  watch: [["live", "live", "Live", "Watch the stream right now, on any platform."], ["cal", "schedule", "Schedule", "When I'm on next, in your own time zone."], ["film", "streams", "Streams", "Past streams, highlights and clips."], ["game", "games", "Games", "What I'm playing, and what's up next."]],
  play: [["joystick", "arcade", "Arcade", "Quick horror games with leaderboards."], ["shift", "factory", "Night Shift", "Missions between streams. Keep your streak alive."], ["trophy", "trophies", "Trophy Room", "Every badge and trophy you've earned."]],
  community: [["club", "club", "Club", "Fan Club is free. Sub Club adds the extras."], ["eye", "crew", "Crew", "Meet the mods who keep the chats fun, or join them."], ["target", "goals", "Goals", "What we're working toward together."]],
};
const NG_LABEL = { watch: "Watch", play: "Play", community: "Community" };
const ngCard = ([icon, id, name, blurb], { cls = "", current = false, liveOn = false } = {}) => `<a class="bt-navgroup-link${id === "live" ? " bt-navgroup-link--live" : ""}${cls ? " " + cls : ""}" href="#kit-navgroup"${current ? ' aria-current="page"' : ""}><span class="bt-navgroup-ic" aria-hidden="true"><svg><use href="#i-${icon}"/></svg></span><span class="bt-navgroup-name">${name}${id === "live" ? `<span class="bt-badge bt-badge--red${liveOn ? "" : " bt-when-public"}">Live</span>` : ""}</span><span class="bt-navgroup-blurb">${blurb}</span></a>`;
const ngBtn = (g, { cls = "", expanded = false, dot = false, dotOn = false, trigger = false } = {}) => `<${trigger ? 'a href="#kit-navgroup" data-navgroup-trigger' : 'button type="button"'} class="bt-navgroup-btn${cls ? " " + cls : ""}"${trigger ? "" : ` aria-expanded="${expanded}"`}>${NG_LABEL[g]}${dot ? `<span class="bt-navgroup-dot${dotOn ? "" : " bt-when-public"}" aria-hidden="true"></span>` : ""}${NG_CHEV}</${trigger ? "a" : "button"}>`;
const ngWhen = () => `<time datetime="2026-10-08T19:00:00-05:00">Thursday, 7 PM</time>, your time.`;
const ngFuture = () => new Date(Date.now() + ((2 * 24 + 4) * 60 + 12) * 60000).toISOString();
const NG_TILE = {
  loading: (label) => featureLoadingHtml(label),
  watchOff: () => watchFeatureHtml({ title: "Granny Gauntlet, night 12", whenHtml: ngWhen(), startsAt: ngFuture() }),
  play: () => playFeatureHtml({ title: "Tap the Splat", href: "#kit-navgroup", best: "0:36.94", bestNote: "Your best this week." }),
  community: () => communityFeatureHtml({ month: "September 2026", winners: [{ role: "Top Gear", handle: "hollowhannah" }, { role: "Fan Favourite", handle: "mothmanmike" }] }),
};
const ngSheetLink = ([icon, , name, blurb], current = false) => `<a class="bt-menu-sheet-link" href="#kit-navgroup"${current ? ' aria-current="page"' : ""}><svg aria-hidden="true"><use href="#i-${icon}"/></svg><span>${name}<small>${blurb}</small></span></a>`;
function navgroupKitHtml() {
  const staticPanel = (g, tile) => `<div class="bt-navgroup-panel"><div class="bt-navgroup-links">${NG_PAGES[g].map((p) => ngCard(p)).join("")}</div><div class="bt-navgroup-feature">${tile}</div></div>`;
  const stage = (inner, attrs = "") => `<div class="kit-ng-stage"${attrs}><header class="bt-site-header"><span class="bt-nav" role="presentation">${inner}</span></header></div>`;
  const live = (g) => `<span class="bt-navgroup" data-navgroup="${g}">${ngBtn(g, { trigger: true, cls: g === "watch" ? "is-current" : "", dot: g === "watch" })}<div class="bt-navgroup-panel" id="kit-ng-${g}" hidden><div class="bt-navgroup-links">${NG_PAGES[g].map((p, i) => ngCard(p, { current: i === 1 && g === "watch" })).join("")}</div><div class="bt-navgroup-feature${g === "watch" ? " is-watch" : ""}" data-kit-ng-tile="${g}">${NG_TILE.loading(g === "watch" ? "Next stream" : g === "play" ? "Today in the Arcade" : "The crew")}</div></div></span>`;
  const tile = (cap, inner, { feature = "" } = {}) => `<figure><div class="bt-navgroup-feature${feature ? " " + feature : ""}">${inner}</div><figcaption>${cap}</figcaption></figure>`;
  return `
  <section class="kit-section" id="kit-navgroup">
    <h2 class="kit-h">Header nav groups</h2>
    <p class="kit-p">The site header's Watch, Play and Community menus (<span class="kit-code">docs/specs/header-nav.md</span>, mockup <span class="kit-code">docs/design/mockups/header-nav.html</span>). <span class="kit-code">.bt-navgroup</span> > trigger <span class="kit-code">.bt-navgroup-btn</span> + panel <span class="kit-code">.bt-navgroup-panel</span> of cards <span class="kit-code">.bt-navgroup-link</span> (<span class="kit-code">-ic</span>, <span class="kit-code">-name</span>, <span class="kit-code">-blurb</span>) and one feature tile <span class="kit-code">.bt-navgroup-feature</span>. <span class="kit-code">shared/ui/navgroup.js</span> opens on hover (about 140 ms) or click, one at a time; outside click, scroll or Escape closes (Escape returns focus to the trigger). A disclosure (button + aria-expanded + aria-controls), not an ARIA menu. Without the script the trigger is a link to the group's first page.</p>

    <p class="kit-sub">Trigger states</p>
    <div class="kit-ng-triggers">
      <figure><span class="bt-navgroup">${ngBtn("play")}</span><figcaption>Closed</figcaption></figure>
      <figure><span class="bt-navgroup">${ngBtn("play", { cls: "is-hover" })}</span><figcaption>Hover</figcaption></figure>
      <figure><span class="bt-navgroup">${ngBtn("play", { expanded: true })}</span><figcaption>Open</figcaption></figure>
      <figure><span class="bt-navgroup">${ngBtn("watch", { cls: "is-current" })}</span><figcaption>Current section (purple underline)</figcaption></figure>
      <figure><span class="bt-navgroup">${ngBtn("watch", { dot: true, dotOn: true })}</span><figcaption>Live dot (Watch while live)</figcaption></figure>
    </div>

    <p class="kit-sub">Page cards: default, hover (glow and icon lift), current page, and Live (badge and icon pulse while live)</p>
    <div class="kit-ng-cards">
      ${ngCard(NG_PAGES.watch[2])}${ngCard(NG_PAGES.watch[3], { cls: "is-hover" })}${ngCard(NG_PAGES.watch[1], { current: true })}${ngCard(NG_PAGES.watch[0], { liveOn: true })}
    </div>

    <p class="kit-sub">Live demo: hover or click Watch, Play and Community (Tab, Enter and Escape work too). The tiles shimmer, then fill the first time a panel opens, as on the site.</p>
    ${stage(`${live("watch")}${live("play")}${live("community")}<a href="#kit-navgroup">Shop</a>`, " data-kit-ng-demo")}

    <p class="kit-sub">Open panel at tablet width (container 700px, so 1024px and below): it fits the container and the tile moves under the cards</p>
    <div class="kit-ng-narrow">${stage(`<span class="bt-navgroup">${ngBtn("play", { expanded: true })}${staticPanel("play", NG_TILE.play())}</span>`)}</div>

    <p class="kit-sub">Feature tiles: loading, live, offline, start passed, and the Play and Community states</p>
    <div class="kit-ng-tiles">
      ${tile("Loading (shimmer)", NG_TILE.loading("Today in the Arcade"))}
      ${tile("Watch: live now (red)", watchFeatureHtml({ title: "Granny Gauntlet, night 12", whenHtml: ngWhen(), startsAt: ngFuture() }), { feature: "is-watch is-live" })}
      ${tile("Watch: offline (countdown and calendar)", NG_TILE.watchOff(), { feature: "is-watch is-off" })}
      ${tile("Watch: start has passed", watchFeatureHtml({ title: "Granny Gauntlet, night 12", whenHtml: ngWhen(), startsAt: "2026-10-01T19:00:00-07:00" }), { feature: "is-watch is-off" })}
      ${tile("Play: with the member's best", NG_TILE.play())}
      ${tile("Play: call to action (signed out or no score)", playFeatureHtml({ title: "Tap the Splat", href: "#kit-navgroup" }))}
      ${tile("Community: Mod of the Month", NG_TILE.community())}
      ${tile("Community: empty (call to action, mascot)", communityFeatureHtml({ mascotHtml: `<img src="${KIT_MASCOT}" alt="" width="92" height="92">` }))}
    </div>

    <p class="kit-sub">Phone More sheet: .bt-menu-sheet regrouped under .bt-menu-sheet-h headings, a line under each page (.bt-menu-sheet-link > svg + span > small), and a small tile on top (.bt-menu-sheet-feature, red with .is-live). Pages already in the tab bar are left out.</p>
    <div class="kit-ng-sheets">
      <figure><div class="bt-menu-sheet kit-ng-sheet">
        <a class="bt-menu-sheet-feature" href="#kit-navgroup"><span class="bt-navgroup-ic" aria-hidden="true"><svg><use href="#i-joystick"/></svg></span><span><b>Today in the Arcade</b><small>Tap the Splat. Your best this week: 0:36.94</small></span></a>
        <p class="bt-menu-sheet-h">Watch</p>${ngSheetLink(["film", "streams", "Streams", "Past streams, highlights and clips."])}
        <p class="bt-menu-sheet-h">Play</p>${NG_PAGES.play.map((p) => ngSheetLink(p)).join("")}
        <p class="bt-menu-sheet-h">Community</p>${NG_PAGES.community.map((p, i) => ngSheetLink(p, i === 1)).join("")}
        <p class="bt-menu-sheet-h">Shop</p>${ngSheetLink(["bag", "shop", "Shop", "Merch and crew drops."])}
      </div><figcaption>Offline: Arcade tile, current page marked</figcaption></figure>
      <figure><div class="bt-menu-sheet kit-ng-sheet">
        <a class="bt-menu-sheet-feature is-live" href="#kit-navgroup"><span class="bt-navgroup-ic" aria-hidden="true"><svg><use href="#i-live"/></svg></span><span><b>Live now</b><small>Granny. Watch now.</small></span></a>
        <p class="bt-menu-sheet-h">Watch</p>${ngSheetLink(["film", "streams", "Streams", "Past streams, highlights and clips."])}
        <p class="bt-menu-sheet-h">Play</p>${ngSheetLink(NG_PAGES.play[0])}
      </div><figcaption>Live: the tile turns red</figcaption></figure>
    </div>
  </section>`;
}
function initNavgroupKit(mount) {
  const sec = mount.querySelector("#kit-navgroup");
  if (!sec) return;
  sec.querySelectorAll(".kit-ng-tiles .bt-navgroup-feature").forEach((t) => {
    const c = t.querySelector("[data-ng-count]");
    if (c) initWatchTile(t, { title: "Granny Gauntlet, night 12", startsAt: c.dataset.ngCount, url: location.href }).start();
  });
  const demo = sec.querySelector("[data-kit-ng-demo]");
  if (!demo) return;
  let watch = null;
  initNavGroups(demo, {
    onOpen(name, panel, { first }) {
      const t = panel.querySelector("[data-kit-ng-tile]");
      if (name === "watch") {
        if (watch) watch.start();
        else if (first) setTimeout(() => {
          t.innerHTML = NG_TILE.watchOff();
          watch = initWatchTile(t, { title: "Granny Gauntlet, night 12", startsAt: t.querySelector("[data-ng-count]").dataset.ngCount, url: location.href });
          if (!panel.hidden) watch.start();
        }, 900);
      } else if (first) setTimeout(() => { t.innerHTML = name === "play" ? NG_TILE.play() : NG_TILE.community(); }, 900);
    },
    onClose(name) { if (name === "watch" && watch) watch.stop(); },
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
