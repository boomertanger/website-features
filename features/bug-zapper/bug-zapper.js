// features/bug-zapper/bug-zapper.js
//
// Renders into <div id="bug-zapper-root"></div>. Import as a module from
// the Squarespace Code Block on the bug-zapper page — see the embed
// snippet in this feature's README.
//
// Security model (see /firestore.rules and /functions/index.js):
// - Any logged-in member: gated client-side by MemberSpace isLoggedIn()
//   (no specific plan required). Writes go through silent Firebase
//   Anonymous Auth, and — unlike Feature Lab — reporterUid/meTooBy use
//   the real Firebase Auth uid (not MemberSpace's numeric id), because
//   this feature's rules verify meTooBy toggles against request.auth.uid.
//   Still per-browser, not identity-verified across a member's devices —
//   same accepted tradeoff as Feature Lab's voting, just one notch
//   stronger since a toggle must exactly match the caller's own uid.
// - Admins: real Firebase Auth via Google Sign-In, via the shared
//   shared/ui/admin-auth.js module (reusing the same syncAdminStatus
//   Cloud Function / adminAllowlist -> admins/{uid} pattern Feature Lab
//   also uses). Priority, status, and duplicate linking are admin-only
//   fields, hidden from the member-facing view.
// - Screenshots: uploaded client-side directly to Cloudinary (unsigned
//   upload preset), then recorded via the recordBugScreenshot Cloud
//   Function, which writes to the shared externalAssets/storageUsage
//   collections (Disk Stash) and sets screenshotUrl on this doc. Bug
//   Zapper never deletes a Cloudinary asset itself — that only ever
//   happens through Disk Stash's deleteExternalAsset or its scheduled
//   sweep, driven by a cleanupRules doc an admin sets up in Disk Stash.

import { getFirebaseApp } from "../../shared/firebase-init.js";
import {
  waitForReady,
  isLoggedIn,
  getCurrentMember,
  hasActivePlan,
  PLANS,
} from "../../shared/memberspace-helper.js";
import { escapeHtml, formatDate, initials, levelBars } from "../../shared/ui/dom.js";
import { openModal, modalHeader } from "../../shared/ui/modal.js";
import { confirmAction } from "../../shared/ui/confirm.js";
import { initRowSpotlight } from "../../shared/ui/effects.js";
import { composerHtml, initComposer } from "../../shared/ui/composer.js";
import { thumbHtml, initLightboxTriggers, cloudinaryUrl } from "../../shared/ui/lightbox.js";
import { initAdminMenu, LOGIN_ICON, SIGNOUT_ICON, SHIELD_ICON, PENCIL_ICON } from "../../shared/ui/admin-menu.js";
import { initAdminAuth } from "../../shared/ui/admin-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";

const ROOT_ID = "bug-zapper-root";

// ---------- Cloudinary (see README) ----------
// "disk-stash" is the shared UNSIGNED upload preset on cloud nz4usqtz.
// Any server-side size/format limits live on the preset itself (the
// client-side compression below is a first pass, not the real limit).
const CLOUDINARY_CLOUD_NAME = "nz4usqtz";
const CLOUDINARY_UPLOAD_PRESET = "disk-stash";

// Matches the comments text.size() <= 1000 check in firestore.rules.
const COMMENT_MAX_LENGTH = 1000;

const MAX_ORIGINAL_FILE_BYTES = 15 * 1024 * 1024; // sanity cap before we even try to compress
const COMPRESS_MAX_WIDTH = 1280;
const COMPRESS_QUALITY = 0.75;

// The bolt's yellow is Bug Zapper's one feature-unique color (declared in
// bug-zapper.css as --bz-bolt); every other fill below is a shared --bt-*
// token so the icon always matches the rest of the palette.
const WORDMARK_ICON = `
  <svg viewBox="0 0 44 44" overflow="visible" aria-hidden="true">
    <path class="bz-bolt-flash" d="M25 3L9 24H18L13 41L35 16H24L29 3H25Z" fill="var(--bz-bolt)" stroke="var(--bz-bolt)" stroke-width="1"/>
    <ellipse cx="17" cy="41.5" rx="8" ry="1.4" fill="var(--bt-border)" fill-opacity="0.7"/>
    <rect class="bz-debris-upleft" x="14.5" y="38" width="2.2" height="2.2" fill="var(--bz-bolt)"/>
    <circle class="bz-debris-left" cx="12" cy="41" r="1.3" fill="var(--bt-text-faint)"/>
    <rect class="bz-debris-downleft" x="10" y="43" width="1.8" height="1.8" fill="var(--bt-title)"/>
    <rect class="bz-debris-upright" x="19.5" y="38" width="2.2" height="2.2" fill="var(--bz-bolt)"/>
    <circle class="bz-debris-right" cx="22" cy="41" r="1.3" fill="var(--bt-text-faint)"/>
    <rect class="bz-debris-downright" x="24" y="43" width="1.8" height="1.8" fill="var(--bt-title)"/>
    <rect class="bz-debris-upleft" x="8" y="40" width="1.4" height="1.4" fill="var(--bt-text-faint)" style="animation-delay:0.2s;"/>
    <rect class="bz-debris-upright" x="26" y="40" width="1.4" height="1.4" fill="var(--bt-text-faint)" style="animation-delay:0.22s;"/>
    <circle class="bz-debris-downleft" cx="13" cy="44" r="1" fill="var(--bz-bolt)" style="animation-delay:0.18s;"/>
    <circle class="bz-debris-downright" cx="21" cy="44" r="1" fill="var(--bz-bolt)" style="animation-delay:0.2s;"/>
  </svg>`;

const UP_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"></polyline></svg>';
const PLUS_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
const TRASH_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';
const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"></path></svg>';
const COMMENT_ICON =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>';

// Site-wide badge system (docs/design-system.md §5). Keys are the stored
// values and never change; labels and tones are presentation only.
// Levels (ordered scales) show signal bars: level n of LEVEL_STEPS.
const LEVEL_STEPS = 4;
const SEVERITY_META = {
  Cosmetic: { label: "Cosmetic", tone: "blue", level: 1 },
  Minor: { label: "Minor", tone: "gold", level: 2 },
  Major: { label: "Major", tone: "pink", level: 3 },
  Critical: { label: "Critical", tone: "red", level: 4 },
};

// Statuses keep the dot. Closed-without-a-change statuses are gray and
// dim their row (CLOSED_STATUSES below).
const STATUS_META = {
  Open: { label: "Open", tone: "blue" },
  "In progress": { label: "In progress", tone: "green" },
  Fixed: { label: "Fixed", tone: "lime" },
  "Won't fix": { label: "Won't fix", tone: "gray" },
  "Can't reproduce": { label: "Can't reproduce", tone: "gray" },
  Duplicate: { label: "Duplicate", tone: "gray" },
};

function statusBadge(meta) {
  return `<span class="bt-badge bt-badge--${meta.tone}"><span class="bt-badge-dot"></span>${meta.label}</span>`;
}

function levelBadge(meta) {
  return `<span class="bt-badge bt-badge--${meta.tone}">${levelBars(meta.level, LEVEL_STEPS)}${meta.label}</span>`;
}

const CLOSED_STATUSES = ["Won't fix", "Can't reproduce", "Duplicate"];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "Open", label: "Open" },
  { key: "In progress", label: "In progress" },
  { key: "Fixed", label: "Fixed" },
  { key: "closed", label: "Closed" }, // groups Won't fix / Can't reproduce / Duplicate
];

const SORT_OPTIONS = [
  { key: "newest", label: "Newest" },
  { key: "mostBit", label: "Most bit me too'd" },
];

// Free text (a pasted URL or a feature name). Matches the page.size()
// 1–300 check in firestore.rules. Older reports keep their original
// dropdown values (e.g. "boomertanger.tv", "Not sure") and still display.
const PAGE_MAX_LENGTH = 300;

const SEVERITY_OPTIONS = [
  { value: "Cosmetic", label: "Cosmetic — small visual issue, doesn't block anything" },
  { value: "Minor", label: "Minor — annoying but there's a workaround" },
  { value: "Major", label: "Major — a feature is broken" },
  { value: "Critical", label: "Critical — can't use the site / lost data" },
];

const app = getFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);

const state = {
  reports: [],
  filter: "all",
  sort: "newest", // "newest" | "mostBit"
  listStatus: "loading", // "loading" | "loaded" | "error"
  isAdmin: false,
  uid: null, // Firebase Auth uid (anonymous or real) — used for reporterUid + meTooBy
  memberName: "Member",
  root: null,
  unsubscribeReports: null,
};

function meTooCount(r) {
  return (r.meTooBy ?? []).length;
}

function hasMeToo(r) {
  return !!state.uid && (r.meTooBy ?? []).includes(state.uid);
}

// Private comments are visible only to a real admin or the report's own
// reporter — never any other member, and never shown publicly. This is
// checked both here (to decide what to render) and, more importantly,
// server-side in firestore.rules (the client check alone is never a
// security boundary).
function canSeeComments(r) {
  return state.isAdmin || (!!state.uid && r.reporterUid === state.uid);
}

function matchesFilter(r) {
  if (state.filter === "all") return true;
  if (state.filter === "closed") return CLOSED_STATUSES.includes(r.status);
  return r.status === state.filter;
}

// ---------- Rendering: shell / list ----------

function renderShell() {
  return `
    <div class="bt-topbar">
      <div class="bt-wordmark">
        <span class="bt-wordmark-icon">${WORDMARK_ICON}</span>
        <span class="bt-wordmark-text">BUG<span class="bt-wordmark-accent">ZAPPER</span></span>
      </div>
      <div class="bt-topnav">
        <div class="bt-admin">
          <button type="button" class="bt-admin-menu-toggle" aria-label="Admin menu" aria-expanded="false">${LOGIN_ICON}</button>
          <div class="bt-admin-row">
            <div class="bt-admin-section">
              <span class="bt-admin-label">Admin access</span>
              <button type="button" id="bz-admin-signin" class="bt-signin-btn" hidden>Sign in as Admin</button>
            </div>
            <div class="bt-admin-section">
              <span class="bt-admin-label">Signed in as</span>
              <span id="bz-admin-badge" class="bt-admin-pill" hidden><span class="bt-admin-pill-dot"></span>Admin</span>
              <button type="button" id="bz-admin-signout" class="bt-signout-row" hidden>${SIGNOUT_ICON}<span>Sign out</span></button>
            </div>
          </div>
        </div>
        <button type="button" id="bz-new-report" class="bt-btn bt-btn--primary" aria-label="Report a bug">${PLUS_ICON}<span class="bt-btn-label">Report a bug</span></button>
      </div>
    </div>
    <div class="bt-header">
      <h1 class="bt-title">Bug reports</h1>
      <p class="bt-subtitle">Report issues, add a &ldquo;bit me too&rdquo; if it's happening to you as well, and track fixes &mdash; all in one place.</p>
    </div>
    <div class="bt-filters" id="bz-filters"></div>
    <div class="bt-sortbar" id="bz-sortbar"></div>
    <div class="bt-list" id="bz-list"></div>
  `;
}

function renderLoggedOut() {
  return `
    <div class="bt-logged-out">
      <div class="bt-wordmark"><span class="bt-wordmark-icon">${WORDMARK_ICON}</span><span class="bt-wordmark-text">BUG<span class="bt-wordmark-accent">ZAPPER</span></span></div>
      <h2 class="bt-logged-out-title">Bug reports are for members</h2>
      <p class="bt-logged-out-text">Log in with any Boomertanger membership to see open reports and file your own.</p>
    </div>
  `;
}

function renderFilters() {
  const el = state.root.querySelector("#bz-filters");
  el.innerHTML = FILTERS.map((f) => {
    const count =
      f.key === "all"
        ? state.reports.length
        : f.key === "closed"
        ? state.reports.filter((r) => CLOSED_STATUSES.includes(r.status)).length
        : state.reports.filter((r) => r.status === f.key).length;
    const active = state.filter === f.key;
    return `<button type="button" class="bt-chip ${active ? "is-active" : ""}" data-filter="${f.key}" aria-pressed="${active}">${f.label} &middot; ${count}</button>`;
  }).join("");
  el.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      renderFilters();
      renderList();
    });
  });
}

function renderSortBar() {
  const el = state.root.querySelector("#bz-sortbar");
  el.innerHTML = `
    <span class="bt-sortbar-label">Sort by</span>
    ${SORT_OPTIONS.map(
      (s) =>
        `<button type="button" class="bt-chip bt-chip--small ${state.sort === s.key ? "is-active" : ""}" data-sort="${s.key}" aria-pressed="${state.sort === s.key}">${s.label}</button>`
    ).join("")}
  `;
  el.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.sort = btn.dataset.sort;
      renderSortBar();
      renderList();
    });
  });
}

function sortReports(items) {
  const sorted = [...items];
  if (state.sort === "mostBit") {
    sorted.sort((a, b) => meTooCount(b) - meTooCount(a));
  } else {
    // "newest" — reports already arrive newest-first from the Firestore
    // query's orderBy("createdAt", "desc"), so this is a no-op today,
    // but sorting explicitly here keeps the two modes symmetric and
    // makes the intent obvious if that query ever changes.
    sorted.sort((a, b) => {
      const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    });
  }
  return sorted;
}

async function toggleMeToo(reportId) {
  if (!state.uid) return;
  const report = state.reports.find((r) => r.id === reportId);
  if (!report) return;
  const voted = hasMeToo(report);
  try {
    await updateDoc(doc(db, "bugReports", reportId), {
      meTooBy: voted ? arrayRemove(state.uid) : arrayUnion(state.uid),
    });
  } catch (err) {
    console.error("Failed to toggle me-too", err);
  }
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

function rowHtml(r) {
  const status = STATUS_META[r.status] ?? STATUS_META.Open;
  const severity = SEVERITY_META[r.severity] ?? SEVERITY_META.Minor;
  const voted = hasMeToo(r);
  const showComments = canSeeComments(r) && (r.commentCount ?? 0) > 0;
  return `
  <div class="bt-row bt-row--clickable ${CLOSED_STATUSES.includes(r.status) ? "bt-row--dimmed" : ""}" data-id="${r.id}" tabindex="0">
    <button type="button" class="bt-tally ${voted ? "is-active" : ""}" data-bit-id="${r.id}" aria-pressed="${voted}" aria-label="${voted ? "Remove your bit me too" : "Bit me too"}">
      ${UP_ICON}<span class="bt-tally-count">${meTooCount(r)}</span><span class="bt-tally-label">bit</span>
    </button>
    <div class="bt-row-body">
      <div class="bt-row-title">${escapeHtml(r.title)}</div>
      <div class="bt-row-desc">${escapeHtml(r.whatHappened)}</div>
      <div class="bt-row-meta"><span class="bt-avatar">${initials(r.reporterName)}</span><span>${escapeHtml(r.reporterName)}</span></div>
    </div>
    <div class="bt-row-side">
      <div class="bt-row-badges">
        ${levelBadge(severity)}
        ${statusBadge(status)}
      </div>
      ${showComments ? `<span class="bt-count" title="Private — only visible to you and the reporter">${COMMENT_ICON}${r.commentCount}</span>` : ""}
      <span class="bt-row-date">${formatDate(r.createdAt)}</span>
    </div>
  </div>`;
}

function renderList() {
  const el = state.root.querySelector("#bz-list");

  if (state.listStatus === "loading") {
    el.setAttribute("aria-busy", "true");
    el.innerHTML = skeletonRow() + skeletonRow() + skeletonRow();
    return;
  }
  el.removeAttribute("aria-busy");

  if (state.listStatus === "error") {
    el.innerHTML = `<div class="bt-empty"><p class="bt-empty-title">Couldn't load reports</p><p>Check your connection, then refresh the page.</p></div>`;
    return;
  }

  const items = sortReports(state.reports.filter(matchesFilter));

  if (items.length === 0) {
    el.innerHTML = `<div class="bt-empty"><p class="bt-empty-title">No reports here yet</p><p>Nothing to show for this filter.</p></div>`;
    return;
  }

  el.innerHTML = items.map(rowHtml).join("");

  el.querySelectorAll(".bt-tally").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMeToo(btn.dataset.bitId);
    });
  });

  el.querySelectorAll(".bt-row").forEach((row) => {
    row.addEventListener("click", () => openDetailModal(row.dataset.id));
    row.addEventListener("keydown", (e) => {
      if (e.target === row && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openDetailModal(row.dataset.id);
      }
    });
  });
}

// ---------- Screenshot upload ----------

function compressImage(file, maxWidth = COMPRESS_MAX_WIDTH, quality = COMPRESS_QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed."))),
          "image/jpeg",
          quality
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Returns an error message for a picked file, or "" if it can be uploaded.
function screenshotFileError(file) {
  if (!file.type.startsWith("image/")) return "Screenshots need to be an image file.";
  if (file.size > MAX_ORIGINAL_FILE_BYTES) return "That image is too large — try a smaller screenshot.";
  return "";
}

// Compresses and uploads to Cloudinary (unsigned preset). Returns the
// details recordBugScreenshot / adminEditItem need to track the asset.
async function uploadToCloudinary(file) {
  const problem = screenshotFileError(file);
  if (problem) throw new Error(problem);

  const compressed = await compressImage(file);

  const formData = new FormData();
  formData.append("file", compressed, "screenshot.jpg");
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "bug-zapper");

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!uploadRes.ok) {
    throw new Error("Screenshot upload failed.");
  }
  const uploadData = await uploadRes.json();
  return {
    url: uploadData.secure_url,
    publicId: uploadData.public_id,
    sizeBytes: uploadData.bytes,
    resourceType: uploadData.resource_type,
  };
}

async function uploadScreenshotAndAttach(docId, file) {
  const uploaded = await uploadToCloudinary(file);
  const recordBugScreenshot = httpsCallable(functions, "recordBugScreenshot");
  await recordBugScreenshot({ docId, ...uploaded });
}

// ---------- Submit modal ----------

function openSubmitModal() {
  const { modal, close } = openModal({
    feature: "bug-zapper",
    title: "Report a bug",
    content: `
      ${modalHeader("Report a bug", "The more detail you give, the faster it gets fixed.")}

      <div class="bt-field">
        <label class="bt-label" for="bz-title-input">Title</label>
        <input id="bz-title-input" class="bt-input" type="text" maxlength="200" placeholder="Short summary, e.g. &ldquo;Chat won't scroll on mobile&rdquo;" autofocus>
      </div>

      <div class="bt-field">
        <label class="bt-label" for="bz-what-input">What happened?</label>
        <textarea id="bz-what-input" class="bt-textarea" rows="3" maxlength="2000" placeholder="Describe what you saw."></textarea>
      </div>

      <div class="bt-field">
        <label class="bt-label" for="bz-expected-input">What did you expect instead?</label>
        <textarea id="bz-expected-input" class="bt-textarea" rows="3" maxlength="2000" placeholder="Describe what should have happened."></textarea>
      </div>

      <div class="bt-field">
        <label class="bt-label" for="bz-page-input">Which page or feature?</label>
        <input id="bz-page-input" class="bt-input" type="text" maxlength="${PAGE_MAX_LENGTH}" placeholder="e.g. www.boomertanger.com/live">
        <span class="bt-hint">Paste the address of the page where it happened.</span>
      </div>

      <div class="bt-field">
        <label class="bt-label" for="bz-steps-input">Steps to reproduce</label>
        <textarea id="bz-steps-input" class="bt-textarea" rows="4" maxlength="2000" placeholder="1. Go to...&#10;2. Click...&#10;3. See..."></textarea>
      </div>

      <div class="bt-field">
        <label class="bt-label" for="bz-severity-input">How bad is it?</label>
        <select id="bz-severity-input" class="bt-select">
          ${SEVERITY_OPTIONS.map((s) => `<option value="${s.value}">${escapeHtml(s.label)}</option>`).join("")}
        </select>
      </div>

      <div class="bt-field">
        <label class="bt-label" for="bz-screenshot-input">Screenshot (optional)</label>
        <input type="file" id="bz-screenshot-input" accept="image/*" style="display:none;">
        <button type="button" id="bz-screenshot-trigger" class="bz-dropzone">
          <span id="bz-screenshot-filename">Click to choose an image</span>
          <div class="bt-hint">JPG or PNG, resized automatically before upload. Max 5MB after resize.</div>
        </button>
      </div>

      <p id="bz-submit-error" class="bt-error" hidden></p>
      <div class="bt-modal-actions">
        <button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button>
        <button type="button" id="bz-submit" class="bt-btn bt-btn--primary">Submit report</button>
      </div>`,
  });

  let selectedFile = null;
  modal.querySelector("#bz-screenshot-trigger").addEventListener("click", () => {
    modal.querySelector("#bz-screenshot-input").click();
  });
  modal.querySelector("#bz-screenshot-input").addEventListener("change", (e) => {
    selectedFile = e.target.files[0] ?? null;
    modal.querySelector("#bz-screenshot-filename").textContent =
      selectedFile ? selectedFile.name : "Click to choose an image";
  });

  modal.querySelector("#bz-submit").addEventListener("click", async () => {
    const titleInput = modal.querySelector("#bz-title-input");
    const title = titleInput.value.trim();
    const pageInput = modal.querySelector("#bz-page-input");
    const page = pageInput.value.trim().slice(0, PAGE_MAX_LENGTH);
    const whatHappened = modal.querySelector("#bz-what-input").value.trim();
    const expectedInstead = modal.querySelector("#bz-expected-input").value.trim();
    const stepsToReproduce = modal.querySelector("#bz-steps-input").value.trim();
    const severity = modal.querySelector("#bz-severity-input").value;
    const errorEl = modal.querySelector("#bz-submit-error");
    const submitBtn = modal.querySelector("#bz-submit");

    if (title.length < 3 || title.length > 200) {
      titleInput.setAttribute("aria-invalid", "true");
      errorEl.textContent = "Title needs to be 3–200 characters.";
      errorEl.hidden = false;
      return;
    }
    titleInput.removeAttribute("aria-invalid");
    if (page.length < 1) {
      pageInput.setAttribute("aria-invalid", "true");
      errorEl.textContent = "Let us know which page or feature it happened on.";
      errorEl.hidden = false;
      return;
    }
    pageInput.removeAttribute("aria-invalid");
    if (whatHappened.length < 1) {
      errorEl.textContent = "Let us know what happened.";
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>Submitting…`;

    try {
      const docRef = await addDoc(collection(db, "bugReports"), {
        title,
        page,
        whatHappened,
        expectedInstead,
        stepsToReproduce,
        severity,
        priority: null,
        status: "Open",
        statusChangedAt: serverTimestamp(),
        statusHistory: [
          {
            status: "Open",
            changedBy: state.memberName || "Member",
            changedAt: new Date().toISOString(),
          },
        ],
        duplicateOf: null,
        screenshotUrl: null,
        reporterUid: state.uid ?? "",
        reporterName: state.memberName,
        meTooBy: [],
        commentCount: 0,
        createdAt: serverTimestamp(),
      });

      if (selectedFile) {
        try {
          await uploadScreenshotAndAttach(docRef.id, selectedFile);
        } catch (err) {
          // The report itself is already saved — a failed screenshot
          // upload should never block or undo the submission.
          console.error("Screenshot upload failed", err);
        }
      }

      close();
    } catch (err) {
      console.error("Failed to submit report", err);
      errorEl.textContent = "Something went wrong submitting your report. Please try again.";
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit report";
    }
  });
}

// ---------- Detail modal ----------

function historyHtml(history) {
  if (history.length === 0) return `<p class="bt-meta">No history yet.</p>`;
  return `<div class="bt-history">${history
    .map((h) => {
      const meta = STATUS_META[h.status] ?? STATUS_META.Open;
      return `
      <div class="bt-history-item">
        <div class="bt-history-line"><span class="bt-history-dot bt-history-dot--${meta.tone}"></span><span class="bt-history-rule"></span></div>
        <div class="bt-history-body">
          <div><strong style="font-weight:600">${meta.label}</strong> &middot; ${escapeHtml(h.changedBy)}</div>
          ${h.note ? `<div style="color:var(--bt-text-muted);margin-top:2px">${escapeHtml(h.note)}</div>` : ""}
          <div class="bt-meta">${formatDate(h.changedAt)}</div>
        </div>
      </div>`;
    })
    .join("")}</div>`;
}

// ---------- Detail modal: view mode + admin edit mode in the same dialog ----------
// Spec: docs/specs/admin-editing.md. Every dialog element is looked up
// through `modal` (openModal renders into a portal on <body>, not the root).

// Fields admins can edit in place. Limits match the create form / rules;
// adminEditItem re-validates everything server-side.
const EDIT_FIELDS = [
  { key: "title", label: "Title", name: "Title", kind: "input", min: 3, max: 200 },
  { key: "whatHappened", label: "What happened?", name: "What happened", kind: "textarea", rows: 3, min: 1, max: 2000 },
  { key: "expectedInstead", label: "What did you expect instead?", name: "What you expected", kind: "textarea", rows: 3, min: 0, max: 2000 },
  { key: "page", label: "Which page or feature?", name: "Page", kind: "input", min: 1, max: PAGE_MAX_LENGTH,
    placeholder: "e.g. www.boomertanger.com/live", hint: "Paste the address of the page where it happened." },
  { key: "stepsToReproduce", label: "Steps to reproduce", name: "Steps to reproduce", kind: "textarea", rows: 4, min: 0, max: 2000 },
  { key: "severity", label: "How bad is it?", name: "How bad is it", kind: "select" },
];

// Short names used in the Admin activity list.
const FIELD_NAMES = {
  title: "title",
  whatHappened: "what happened",
  expectedInstead: "expected",
  page: "page",
  stepsToReproduce: "steps",
  severity: "how bad it is",
  screenshotUrl: "screenshot",
};

const REASON_MAX_LENGTH = 300;

function listJoin(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function detailSubtitle(r) {
  return `<span class="bt-meta">Reported by ${escapeHtml(r.reporterName)} on ${formatDate(r.createdAt)}</span>` +
    (r.editedAt ? `<br><span class="bt-edited">${PENCIL_ICON}Edited by an admin on ${formatDate(r.editedAt)}</span>` : "");
}

function activitySkeleton() {
  return `<div aria-hidden="true" style="display:flex;flex-direction:column;gap:var(--bt-space-2)">
    <span class="bt-skeleton" style="width:60%;height:12px"></span>
    <span class="bt-skeleton" style="width:40%;height:12px"></span>
  </div>`;
}

function activityListHtml(entries) {
  if (!entries.length) return `<p class="bt-meta">No admin activity yet.</p>`;
  return `<div class="bt-history">${entries
    .map((a) => {
      const fields = Object.keys(a.changes || {}).map((f) => FIELD_NAMES[f] || f);
      const what = a.action === "edit" ? `Edited ${listJoin(fields) || "the report"}` : a.action === "delete" ? "Deleted" : "Purged a file";
      return `
      <div class="bt-history-item">
        <div class="bt-history-line"><span class="bt-history-dot bt-history-dot--blue"></span><span class="bt-history-rule"></span></div>
        <div class="bt-history-body">
          <div><strong style="font-weight:600">${escapeHtml(what)}</strong></div>
          ${a.reason ? `<div style="color:var(--bt-text-muted);margin-top:2px">Reason: ${escapeHtml(a.reason)}</div>` : ""}
          <div class="bt-meta">${escapeHtml(a.actorName || "Admin")}, ${formatDate(a.createdAt)}</div>
        </div>
      </div>`;
    })
    .join("")}</div>`;
}

function screenshotThumb(url) {
  return thumbHtml({
    // Transformed at display time only; screenshotUrl stays as stored.
    src: cloudinaryUrl(url, "w_900,c_limit,f_auto,q_auto"),
    full: cloudinaryUrl(url, "f_auto,q_auto"),
    alt: "Screenshot of the bug",
  });
}

function adminPanelHtml(report, notice) {
  return `
    <div class="bt-admin-panel">
      <span class="bt-admin-tag">${SHIELD_ICON}Admin only</span>
      ${notice ? `<p class="bt-error">${escapeHtml(notice)}</p>` : ""}
      <div class="bt-field">
        <span class="bt-label" id="bz-report-id-label">Report ID</span>
        <div style="display:flex;align-items:center;gap:var(--bt-space-2);flex-wrap:wrap">
          <span class="bt-code" id="bz-report-id" aria-labelledby="bz-report-id-label">${escapeHtml(report.id)}</span>
          <button type="button" id="bz-copy-id" class="bt-icon-btn bt-icon-btn--sm" aria-label="Copy report ID" title="Copy report ID">${COPY_ICON}</button>
          <span id="bz-copy-status" class="bt-meta" aria-live="polite"></span>
        </div>
      </div>
      <div class="bt-form-grid">
        <div class="bt-field">
          <label class="bt-label" for="bz-status-select">Status</label>
          <select id="bz-status-select" class="bt-select">
            ${Object.keys(STATUS_META)
              .map((key) => `<option value="${key}" ${report.status === key ? "selected" : ""}>${STATUS_META[key].label}</option>`)
              .join("")}
          </select>
        </div>
        <div class="bt-field">
          <label class="bt-label" for="bz-priority-select">Priority</label>
          <select id="bz-priority-select" class="bt-select">
            <option value="" ${!report.priority ? "selected" : ""}>&mdash;</option>
            <option value="Low" ${report.priority === "Low" ? "selected" : ""}>Low</option>
            <option value="Normal" ${report.priority === "Normal" ? "selected" : ""}>Normal</option>
            <option value="High" ${report.priority === "High" ? "selected" : ""}>High</option>
            <option value="Urgent" ${report.priority === "Urgent" ? "selected" : ""}>Urgent</option>
          </select>
        </div>
        <div class="bt-field">
          <label class="bt-label" for="bz-dup-input">Duplicate of (report id)</label>
          <input type="text" id="bz-dup-input" class="bt-input" value="${escapeHtml(report.duplicateOf ?? "")}" placeholder="paste the original report's ID">
          <span class="bt-hint">Open the original report and use the copy button next to its Report ID above.</span>
        </div>
      </div>
      <div class="bt-field">
        <label class="bt-label" for="bz-note-input">Note (optional, added to history)</label>
        <textarea id="bz-note-input" class="bt-textarea" rows="2" maxlength="500" disabled></textarea>
        <span class="bt-hint">A note is saved with a status change.</span>
      </div>
      <p id="bz-admin-error" class="bt-error" hidden></p>
      <div><button type="button" id="bz-admin-save" class="bt-btn bt-btn--admin" disabled>Save changes</button></div>
      <div class="bt-modal-section">
        <p class="bt-section-label">Admin activity</p>
        <div id="bz-activity" aria-live="polite">${activitySkeleton()}</div>
      </div>
    </div>`;
}

function viewHtml(report, notice = "") {
  const status = STATUS_META[report.status] ?? STATUS_META.Open;
  const severity = SEVERITY_META[report.severity] ?? SEVERITY_META.Minor;
  const voted = hasMeToo(report);
  const history = [...(report.statusHistory ?? [])].reverse();
  const editTool = state.isAdmin
    ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--admin" data-bz-edit aria-label="Edit">${PENCIL_ICON}<span class="bt-btn-label">Edit</span></button>`
    : "";

  const commentsHtml = canSeeComments(report)
    ? `
    <div class="bt-modal-section">
      <p class="bt-section-label">Private comments</p>
      <p class="bt-hint" style="margin:-4px 0 12px">Only visible to you and the reporter — no one else can see this thread.</p>
      <div id="bz-comments-list" class="bt-comments"></div>
      <div style="margin-top:var(--bt-space-3)">${composerHtml({ placeholder: "Reply…", maxLength: COMMENT_MAX_LENGTH, id: "bz-comment-input" })}</div>
    </div>`
    : "";

  return `
      ${modalHeader(escapeHtml(report.title), detailSubtitle(report), editTool)}
      <div class="bt-row-badges">
        ${statusBadge(status)}
        ${levelBadge(severity)}
      </div>

      <div class="bt-modal-section">
        <p class="bt-section-label">What happened</p>
        <p class="bt-section-text">${escapeHtml(report.whatHappened)}</p>
      </div>

      ${report.expectedInstead ? `
      <div class="bt-modal-section">
        <p class="bt-section-label">Expected instead</p>
        <p class="bt-section-text">${escapeHtml(report.expectedInstead)}</p>
      </div>` : ""}

      ${report.page ? `
      <div class="bt-modal-section">
        <p class="bt-section-label">Page</p>
        <p class="bt-section-text">${escapeHtml(report.page)}</p>
      </div>` : ""}

      ${report.stepsToReproduce ? `
      <div class="bt-modal-section">
        <p class="bt-section-label">Steps to reproduce</p>
        <p class="bt-section-text">${escapeHtml(report.stepsToReproduce)}</p>
      </div>` : ""}

      ${report.screenshotUrl ? `
      <div class="bt-modal-section">
        <p class="bt-section-label">Screenshot</p>
        ${screenshotThumb(report.screenshotUrl)}
      </div>` : ""}

      <div class="bz-metoo-row">
        <button type="button" id="bz-metoo-btn" class="bt-btn ${voted ? "bt-btn--secondary" : "bt-btn--primary"}" ${voted ? "disabled" : ""}>
          ${voted ? "You already bit this too" : "Bit me too"}
        </button>
        <span class="bt-meta">${meTooCount(report)} member${meTooCount(report) === 1 ? "" : "s"} also got bit</span>
      </div>

      ${commentsHtml}
      ${state.isAdmin ? adminPanelHtml(report, notice) : ""}

      <div class="bt-modal-section">
        <p class="bt-section-label">History</p>
        ${historyHtml(history)}
      </div>

      <div class="bt-modal-actions">
        ${state.isAdmin ? `<button type="button" id="bz-admin-delete" class="bt-btn bt-btn--danger">${TRASH_ICON}Delete report</button>` : ""}
        <button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button>
      </div>`;
}

function editFieldHtml(f, report) {
  const id = `bz-e-${f.key}`;
  const value = report[f.key] ?? "";
  let control;
  if (f.kind === "select") {
    control = `<select id="${id}" class="bt-select" data-edit="${f.key}">
      ${SEVERITY_OPTIONS.map((s) => `<option value="${s.value}" ${value === s.value ? "selected" : ""}>${escapeHtml(s.label)}</option>`).join("")}
    </select>`;
  } else if (f.kind === "textarea") {
    control = `<textarea id="${id}" class="bt-textarea" rows="${f.rows}" maxlength="${f.max}" data-edit="${f.key}">${escapeHtml(value)}</textarea>`;
  } else {
    control = `<input id="${id}" class="bt-input" type="text" maxlength="${f.max}" data-edit="${f.key}" value="${escapeHtml(value)}"${f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : ""}>`;
  }
  return `
      <div class="bt-field">
        <label class="bt-label" for="${id}">${f.label}</label>
        ${control}
        ${f.hint ? `<span class="bt-hint">${escapeHtml(f.hint)}</span>` : ""}
        <p class="bt-error" data-error-for="${f.key}" hidden></p>
      </div>`;
}

function editHtml(report) {
  return `
      <div class="bt-edit-banner"><span class="bt-admin-tag bt-admin-tag--small">${SHIELD_ICON}Editing as admin</span><span class="bt-meta">Changes are logged</span></div>
      ${modalHeader(escapeHtml(report.title), detailSubtitle(report))}

      <div id="bz-edit-conflict" hidden style="display:flex;flex-direction:column;align-items:flex-start;gap:var(--bt-space-2)">
        <p class="bt-error">This was changed while you were editing. Your text is still below, so copy anything you want to keep, then load the latest version.</p>
        <button type="button" id="bz-edit-reload" class="bt-btn bt-btn--sm bt-btn--secondary">Load latest</button>
      </div>

      ${EDIT_FIELDS.map((f) => editFieldHtml(f, report)).join("")}

      <div class="bt-field">
        <span class="bt-label">Screenshot</span>
        <div id="bz-e-shot-preview"></div>
        <input type="file" id="bz-e-shot-input" accept="image/*" hidden>
        <div style="display:flex;gap:var(--bt-space-2);flex-wrap:wrap">
          <button type="button" id="bz-e-shot-pick" class="bt-btn bt-btn--sm bt-btn--secondary"></button>
          <button type="button" id="bz-e-shot-remove" class="bt-btn bt-btn--sm bt-btn--secondary">Remove screenshot</button>
          <button type="button" id="bz-e-shot-undo" class="bt-btn bt-btn--sm bt-btn--secondary" hidden>Keep current</button>
        </div>
        <span class="bt-hint">A new image is uploaded when you save.</span>
        <p class="bt-error" data-error-for="screenshot" hidden></p>
      </div>

      <div class="bt-field">
        <label class="bt-label" for="bz-e-reason">Reason for the edit</label>
        <input id="bz-e-reason" class="bt-input" type="text" maxlength="${REASON_MAX_LENGTH}" placeholder="Optional, saved to the admin log">
        <p class="bt-error" data-error-for="reason" hidden></p>
      </div>

      <p id="bz-edit-error" class="bt-error" hidden></p>
      <div class="bt-modal-actions">
        <button type="button" id="bz-edit-cancel" class="bt-btn bt-btn--secondary">Cancel</button>
        <button type="button" id="bz-edit-save" class="bt-btn bt-btn--admin" disabled>Save changes</button>
      </div>`;
}

function openDetailModal(reportId) {
  let report = state.reports.find((r) => r.id === reportId);
  if (!report) return;

  // Live listeners for the current mode (comments, admin activity).
  let unsubs = [];
  const stopLive = () => {
    unsubs.forEach((u) => u());
    unsubs = [];
  };

  const { modal, close, setBeforeClose, setDismissible } = openModal({
    wide: true,
    feature: "bug-zapper",
    title: report.title,
    content: viewHtml(report),
    onClose: stopLive,
  });
  initLightboxTriggers(modal);
  wireView();

  async function loadLatest() {
    const snap = await getDoc(doc(db, "bugReports", reportId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  function showView(notice = "") {
    stopLive();
    setBeforeClose(null);
    setDismissible(true); // a save locks the dialog while it runs
    modal.classList.remove("bt-modal--editing");
    modal.innerHTML = viewHtml(report, notice);
    wireView();
  }

  function itemGone(errorEl) {
    errorEl.textContent = "This item no longer exists.";
    errorEl.hidden = false;
    modal.querySelectorAll("button, input, textarea, select").forEach((el) => (el.disabled = true));
    setBeforeClose(null);
    setTimeout(close, 1800);
  }

  // ----- view mode wiring -----
  function wireView() {
    modal.querySelector("[data-bz-edit]")?.addEventListener("click", showEdit);

    const metooBtn = modal.querySelector("#bz-metoo-btn");
    metooBtn.addEventListener("click", async () => {
      if (!state.uid) return;
      metooBtn.disabled = true;
      await toggleMeToo(reportId);
      close();
    });

    // Private comment thread — only wired up at all when it's rendered, per
    // the admin-or-reporter-only rule enforced (for real) in firestore.rules.
    const commentsList = modal.querySelector("#bz-comments-list");
    if (commentsList) {
      const commentsQuery = query(
        collection(db, "bugReports", reportId, "comments"),
        orderBy("createdAt", "asc")
      );
      unsubs.push(onSnapshot(
        commentsQuery,
        (snapshot) => {
          const comments = snapshot.docs.map((d) => d.data());
          if (comments.length === 0) {
            commentsList.innerHTML = `<p class="bt-meta">No comments yet.</p>`;
            return;
          }
          commentsList.innerHTML = comments
            .map(
              (c) => `
            <div class="bt-comment">
              <div class="bt-comment-head">
                <span class="bt-comment-author">${escapeHtml(c.authorName)}</span>
                ${c.isAdminAuthor ? `<span class="bt-admin-tag bt-admin-tag--small">${SHIELD_ICON}Admin</span>` : ""}
                <span class="bt-comment-time">${formatDate(c.createdAt)}</span>
              </div>
              <p class="bt-comment-text">${escapeHtml(c.text)}</p>
            </div>`
            )
            .join("");
        },
        (err) => {
          console.error("Failed to load comments", err);
          commentsList.innerHTML = `<p class="bt-meta">Couldn't load comments.</p>`;
        }
      ));

      // The composer owns the busy state, the empty/over-length guard and the
      // error display; a thrown Error's message is what the member sees.
      initComposer(modal.querySelector(".bt-composer"), {
        onSubmit: async (text) => {
          try {
            await addDoc(collection(db, "bugReports", reportId, "comments"), {
              text,
              authorId: state.uid ?? "",
              authorName: state.memberName,
              isAdminAuthor: state.isAdmin,
              createdAt: serverTimestamp(),
            });
          } catch (err) {
            console.error("Failed to post comment", err);
            throw new Error("Something went wrong posting your comment.");
          }
          await updateDoc(doc(db, "bugReports", reportId), {
            commentCount: increment(1),
          }).catch((err) => console.error("Failed to bump comment count", err));
        },
      });
    }

    // Admin activity: this report's adminLog entries, newest first. The
    // first run on a project needs a composite index (itemPath + createdAt
    // desc); Firestore's error message links straight to creating it.
    const activityEl = modal.querySelector("#bz-activity");
    if (activityEl) {
      unsubs.push(onSnapshot(
        query(
          collection(db, "adminLog"),
          where("itemPath", "==", `bugReports/${reportId}`),
          orderBy("createdAt", "desc"),
          limit(20)
        ),
        (snapshot) => { activityEl.innerHTML = activityListHtml(snapshot.docs.map((d) => d.data())); },
        (err) => {
          console.error("Failed to load admin activity (if this mentions an index, open its link to create it)", err);
          activityEl.innerHTML = `<p class="bt-meta">Couldn't load admin activity.</p>`;
        }
      ));
    }

    // Report ID copy (admin panel only). Falls back to selecting the text
    // when the Clipboard API isn't available (e.g. an insecure context).
    const copyBtn = modal.querySelector("#bz-copy-id");
    if (copyBtn) {
      const idEl = modal.querySelector("#bz-report-id");
      const statusEl = modal.querySelector("#bz-copy-status");
      let statusTimer = null;
      copyBtn.addEventListener("click", async () => {
        let copied = false;
        try {
          await navigator.clipboard.writeText(report.id);
          copied = true;
        } catch (err) {
          const range = document.createRange();
          range.selectNodeContents(idEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        statusEl.textContent = copied ? "Copied" : "Selected — press Ctrl+C to copy";
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { statusEl.textContent = ""; }, 1800);
      });
    }

    // Admin panel save. Enabled only when status, priority or duplicate-of
    // differ from the saved report; a history entry (and its note) is
    // written only on a real status change. firestore.rules enforces the
    // same thing, so a double-click can't add a duplicate history entry.
    const saveBtn = modal.querySelector("#bz-admin-save");
    if (saveBtn) {
      const statusSel = modal.querySelector("#bz-status-select");
      const prioritySel = modal.querySelector("#bz-priority-select");
      const dupInput = modal.querySelector("#bz-dup-input");
      const noteInput = modal.querySelector("#bz-note-input");
      const errorEl = modal.querySelector("#bz-admin-error");
      const read = () => ({
        status: statusSel.value,
        priority: prioritySel.value || null,
        duplicateOf: dupInput.value.trim() || null,
      });
      let saving = false;
      const refresh = () => {
        const v = read();
        const statusChanged = v.status !== report.status;
        noteInput.disabled = !statusChanged;
        saveBtn.disabled = saving || !(statusChanged
          || v.priority !== (report.priority ?? null)
          || v.duplicateOf !== (report.duplicateOf ?? null));
      };
      [statusSel, prioritySel, dupInput].forEach((el) => {
        el.addEventListener("input", refresh);
        el.addEventListener("change", refresh);
      });

      saveBtn.addEventListener("click", async () => {
        if (saveBtn.disabled) return;
        const v = read();
        const update = {};
        if (v.priority !== (report.priority ?? null)) update.priority = v.priority;
        if (v.duplicateOf !== (report.duplicateOf ?? null)) update.duplicateOf = v.duplicateOf;
        if (v.status !== report.status) {
          const historyEntry = {
            status: v.status,
            changedBy: state.memberName || "Admin",
            changedAt: new Date().toISOString(),
          };
          const note = noteInput.value.trim();
          if (note) historyEntry.note = note;
          update.status = v.status;
          update.statusHistory = arrayUnion(historyEntry);
          // Disk Stash's cleanup rule ages off this doc's screenshot based on
          // how long it's sat in a given status.
          update.statusChangedAt = serverTimestamp();
        }

        saving = true;
        errorEl.hidden = true;
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>Saving…`;
        try {
          await updateDoc(doc(db, "bugReports", reportId), update);
          close();
        } catch (err) {
          console.error("Failed to save admin changes", err);
          errorEl.textContent = "Couldn't save changes — you may need to sign in again.";
          errorEl.hidden = false;
          saving = false;
          saveBtn.textContent = "Save changes";
          refresh();
        }
      });
    }

    const deleteBtn = modal.querySelector("#bz-admin-delete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        const ok = await confirmAction({
          title: "Delete this report?",
          message: `"${report.title}" will be removed. This can't be undone${report.screenshotUrl ? " — its screenshot will also be removed from Cloudinary" : ""}.`,
          confirmLabel: "Delete report",
          busyLabel: "Deleting…",
          feature: "bug-zapper",
          onConfirm: async () => {
            const deleteBugReport = httpsCallable(functions, "deleteBugReport");
            await deleteBugReport({ reportId });
          },
        });
        if (ok) close();
      });
    }
  }

  // ----- edit mode (admins only) -----
  function showEdit() {
    if (!state.isAdmin) return;
    stopLive();
    modal.classList.add("bt-modal--editing");
    modal.innerHTML = editHtml(report);

    const inputs = EDIT_FIELDS.map((f) => ({ f, el: modal.querySelector(`[data-edit="${f.key}"]`) }));
    const reasonInput = modal.querySelector("#bz-e-reason");
    const saveBtn = modal.querySelector("#bz-edit-save");
    const cancelBtn = modal.querySelector("#bz-edit-cancel");
    const errorEl = modal.querySelector("#bz-edit-error");
    const conflictEl = modal.querySelector("#bz-edit-conflict");
    const shotPreview = modal.querySelector("#bz-e-shot-preview");
    const shotInput = modal.querySelector("#bz-e-shot-input");
    const shotPick = modal.querySelector("#bz-e-shot-pick");
    const shotRemove = modal.querySelector("#bz-e-shot-remove");
    const shotUndo = modal.querySelector("#bz-e-shot-undo");

    // Screenshot: picking a file only shows a local preview; the upload
    // happens on Save.
    const shot = { mode: "keep", file: null, previewUrl: "" };
    const dropPreview = () => {
      if (shot.previewUrl) URL.revokeObjectURL(shot.previewUrl);
      shot.previewUrl = "";
      shot.file = null;
    };

    let saving = false;
    let conflicted = false;

    const original = (f) => report[f.key] ?? "";
    const current = (f) => (f.kind === "select" ? inputs.find((i) => i.f === f).el.value : inputs.find((i) => i.f === f).el.value.trim());
    const changedFields = () => EDIT_FIELDS.filter((f) => current(f) !== original(f));
    const isDirty = () => changedFields().length > 0 || shot.mode !== "keep";

    function fieldError(key, message) {
      const el = modal.querySelector(`[data-error-for="${key}"]`);
      const input = modal.querySelector(`[data-edit="${key}"]`) || (key === "reason" ? reasonInput : null);
      if (el) {
        el.textContent = message;
        el.hidden = !message;
      }
      if (input) {
        if (message) input.setAttribute("aria-invalid", "true");
        else input.removeAttribute("aria-invalid");
      }
    }

    function clearErrors() {
      modal.querySelectorAll("[data-error-for]").forEach((el) => fieldError(el.dataset.errorFor, ""));
      errorEl.hidden = true;
    }

    function refresh() {
      saveBtn.disabled = saving || conflicted || !isDirty();
    }

    function renderShot() {
      const hasCurrent = !!report.screenshotUrl;
      if (shot.mode === "replace") {
        shotPreview.innerHTML = `${thumbHtml({ src: shot.previewUrl, alt: "New screenshot (not uploaded yet)" })}
          <p class="bt-meta" style="margin-top:var(--bt-space-2)">New image: ${escapeHtml(shot.file.name)} (uploads when you save)</p>`;
      } else if (shot.mode === "remove") {
        shotPreview.innerHTML = `<p class="bt-meta">The screenshot will be removed when you save.</p>`;
      } else {
        shotPreview.innerHTML = hasCurrent ? screenshotThumb(report.screenshotUrl) : `<p class="bt-meta">No screenshot.</p>`;
      }
      shotPick.textContent = shot.mode === "replace" ? "Choose a different image" : hasCurrent ? "Replace screenshot" : "Add screenshot";
      shotRemove.hidden = !hasCurrent || shot.mode !== "keep";
      shotUndo.hidden = shot.mode === "keep";
      refresh();
    }

    function lock(locked) {
      modal.querySelectorAll("#bz-edit-save, #bz-edit-cancel, [data-edit], #bz-e-reason, #bz-e-shot-pick, #bz-e-shot-remove, #bz-e-shot-undo")
        .forEach((el) => (el.disabled = locked));
      setDismissible(!locked);
      if (!locked) refresh();
    }

    function validate() {
      clearErrors();
      let ok = true;
      for (const f of changedFields()) {
        if (f.kind === "select") continue;
        const len = current(f).length;
        if (len < f.min || len > f.max) {
          ok = false;
          fieldError(f.key, f.min > 0
            ? `${f.name} needs to be ${f.min}–${f.max.toLocaleString("en-US")} characters.`
            : `${f.name} can be at most ${f.max.toLocaleString("en-US")} characters.`);
        }
      }
      if (reasonInput.value.trim().length > REASON_MAX_LENGTH) {
        ok = false;
        fieldError("reason", `Reason can be at most ${REASON_MAX_LENGTH} characters.`);
      }
      if (!ok) modal.querySelector('[aria-invalid="true"]')?.focus();
      return ok;
    }

    const discardGuard = async () => !isDirty() || confirmAction({
      title: "Discard your changes?",
      message: "Your edits haven't been saved.",
      confirmLabel: "Discard",
      busyLabel: "Discarding…",
      feature: "bug-zapper",
      onConfirm: async () => {},
    });
    setBeforeClose(discardGuard);

    function leaveEdit(notice = "") {
      dropPreview();
      showView(notice);
    }

    // Listen on the fields themselves: `modal` outlives each edit session.
    inputs.forEach(({ el }) => {
      el.addEventListener("input", refresh);
      el.addEventListener("change", refresh);
    });

    shotPick.addEventListener("click", () => shotInput.click());
    shotInput.addEventListener("change", () => {
      const file = shotInput.files[0];
      shotInput.value = "";
      if (!file) return;
      const problem = screenshotFileError(file);
      if (problem) {
        fieldError("screenshot", problem);
        return;
      }
      fieldError("screenshot", "");
      dropPreview();
      shot.mode = "replace";
      shot.file = file;
      shot.previewUrl = URL.createObjectURL(file);
      renderShot();
    });
    shotRemove.addEventListener("click", () => {
      dropPreview();
      shot.mode = "remove";
      renderShot();
    });
    shotUndo.addEventListener("click", () => {
      dropPreview();
      shot.mode = "keep";
      fieldError("screenshot", "");
      renderShot();
    });

    cancelBtn.addEventListener("click", async () => {
      if (await discardGuard()) leaveEdit();
    });

    modal.querySelector("#bz-edit-reload").addEventListener("click", async () => {
      const latest = await loadLatest().catch((err) => {
        console.error("Failed to load the latest report", err);
        return undefined;
      });
      if (latest === null) return itemGone(errorEl);
      if (!latest) {
        errorEl.textContent = "Couldn't load the latest version. Try again.";
        errorEl.hidden = false;
        return;
      }
      report = latest;
      dropPreview();
      showEdit();
    });

    saveBtn.addEventListener("click", async () => {
      if (saveBtn.disabled || !validate()) return;
      saving = true;
      lock(true);
      saveBtn.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>Saving…`;

      const changes = {};
      const before = {};
      for (const f of changedFields()) {
        changes[f.key] = current(f);
        before[f.key] = report[f.key] ?? "";
      }

      try {
        if (shot.mode !== "keep") {
          before.screenshotUrl = report.screenshotUrl ?? null;
          if (shot.mode === "remove") {
            changes.screenshot = { action: "remove" };
          } else {
            try {
              changes.screenshot = { action: "replace", ...(await uploadToCloudinary(shot.file)) };
            } catch (err) {
              console.error("Screenshot upload failed", err);
              fieldError("screenshot", err.message || "Screenshot upload failed.");
              throw Object.assign(new Error("upload"), { handled: true });
            }
          }
        }

        const adminEditItem = httpsCallable(functions, "adminEditItem");
        const result = await adminEditItem({
          feature: "bugZapper",
          id: reportId,
          changes,
          before,
          reason: reasonInput.value.trim(),
        });
        report = (await loadLatest().catch(() => null)) ?? report;
        leaveEdit((result.data?.warnings ?? []).join(" "));
      } catch (err) {
        saving = false;
        saveBtn.textContent = "Save changes";
        if (err.handled) {
          lock(false);
          return;
        }
        console.error("Failed to save the edit", err);
        if (err.code === "functions/not-found") return itemGone(errorEl);
        if (err.code === "functions/aborted") {
          conflicted = true;
          conflictEl.hidden = false;
          lock(false);
          conflictEl.scrollIntoView({ block: "nearest" });
          modal.querySelector("#bz-edit-reload").focus();
          return;
        }
        if (err.code === "functions/invalid-argument" && err.details?.field) {
          fieldError(err.details.field, err.message);
        } else {
          errorEl.textContent = "Couldn't save your changes. Try again.";
          errorEl.hidden = false;
        }
        lock(false);
      }
    });

    renderShot();
    modal.querySelector("#bz-e-title").focus();
  }
}

// ---------- Data ----------

function subscribeToReports() {
  if (state.unsubscribeReports) return;
  const q = query(collection(db, "bugReports"), orderBy("createdAt", "desc"));
  state.unsubscribeReports = onSnapshot(
    q,
    (snapshot) => {
      state.reports = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.listStatus = "loaded";
      renderFilters();
      renderList();
    },
    (err) => {
      console.error("Failed to load bug reports", err);
      state.listStatus = "error";
      renderList();
    }
  );
}

// ---------- Init ----------

export async function initBugZapper() {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error(`Bug Zapper: no #${ROOT_ID} element found on the page.`);
    return;
  }
  state.root = root;
  root.classList.add("bt-root");
  root.innerHTML = renderShell();
  initRowSpotlight(root);

  root.querySelector("#bz-new-report").addEventListener("click", openSubmitModal);

  const menu = initAdminMenu(root);
  const signinBtn = root.querySelector("#bz-admin-signin");
  const badge = root.querySelector("#bz-admin-badge");
  const signoutBtn = root.querySelector("#bz-admin-signout");

  function updateAdminUi() {
    signinBtn.hidden = state.isAdmin || !hasActivePlan(PLANS.ADMIN); // UI convenience only, not a security boundary
    badge.hidden = !state.isAdmin;
    signoutBtn.hidden = !state.isAdmin;
    menu.sync();
  }

  await waitForReady();

  if (!isLoggedIn()) {
    root.innerHTML = renderLoggedOut();
    return;
  }

  const member = getCurrentMember();
  state.memberName = member?.name ?? "Member";

  renderFilters();
  renderSortBar();
  updateAdminUi();
  renderList();

  const { signIn, signOut } = initAdminAuth({
    auth,
    functions,
    onChange({ user, isAdmin }) {
      state.uid = user ? user.uid : null;
      state.isAdmin = isAdmin;
      updateAdminUi();
      subscribeToReports();
      renderList();
    },
  });
  signinBtn.addEventListener("click", signIn);
  signoutBtn.addEventListener("click", signOut);
}

initBugZapper();
