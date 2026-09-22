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
// - Admins: real Firebase Auth via Google Sign-In, reusing the existing
//   syncAdminStatus Cloud Function (adminAllowlist -> admins/{uid}) that
//   Feature Lab already established. Priority, status, and duplicate
//   linking are admin-only fields, hidden from the member-facing view.
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
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";

const ROOT_ID = "bug-zapper-root";

// ---------- Config you need to fill in (see README) ----------
// Cloudinary cloud name is confirmed: nz4usqtz.
// UPLOAD_PRESET still needs to be created in the Cloudinary dashboard —
// an UNSIGNED preset, image-only, with a server-side file-size limit set
// on the preset itself (client-side compression below is a first pass,
// not the real limit).
const CLOUDINARY_CLOUD_NAME = "nz4usqtz";
const CLOUDINARY_UPLOAD_PRESET = "REPLACE_ME_bug_zapper_unsigned"; // <-- fill in

const MAX_ORIGINAL_FILE_BYTES = 15 * 1024 * 1024; // sanity cap before we even try to compress
const COMPRESS_MAX_WIDTH = 1280;
const COMPRESS_QUALITY = 0.75;

const SEVERITY_META = {
  Cosmetic: { label: "Cosmetic", color: "var(--bz-gray)" },
  Minor: { label: "Minor", color: "var(--bz-blue)" },
  Major: { label: "Major", color: "var(--bz-amber)" },
  Critical: { label: "Critical", color: "var(--bz-accent)" },
};

const STATUS_META = {
  Open: { label: "Open", color: "var(--bz-blue)", bg: "var(--bz-blue-bg)" },
  "In progress": { label: "In progress", color: "var(--bz-amber)", bg: "var(--bz-amber-bg)" },
  Fixed: { label: "Fixed", color: "var(--bz-green)", bg: "var(--bz-green-bg)" },
  "Won't fix": { label: "Won't fix", color: "var(--bz-gray)", bg: "var(--bz-gray-bg)" },
  "Can't reproduce": { label: "Can't reproduce", color: "var(--bz-gray)", bg: "var(--bz-gray-bg)" },
  Duplicate: { label: "Duplicate", color: "var(--bz-gray)", bg: "var(--bz-gray-bg)" },
};

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

const PAGE_OPTIONS = [
  "boomertanger.com",
  "boomertanger.tv",
  "boomertanger.live",
  "boomertanger.events",
  "boomertanger.games",
  "boomertanger.shop",
  "boomertanger.club (Fan Club)",
  "boomertanger.plus (Sub Club)",
  "Not sure",
];

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
  isAdmin: false,
  uid: null, // Firebase Auth uid (anonymous or real) — used for reporterUid + meTooBy
  memberName: "Member",
  root: null,
  unsubscribeReports: null,
};

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value) {
  if (!value) return "";
  const d = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function meTooCount(r) {
  return (r.meTooBy ?? []).length;
}

function hasMeToo(r) {
  return !!state.uid && (r.meTooBy ?? []).includes(state.uid);
}

function matchesFilter(r) {
  if (state.filter === "all") return true;
  if (state.filter === "closed") return CLOSED_STATUSES.includes(r.status);
  return r.status === state.filter;
}

// ---------- Rendering: shell / list ----------

function renderShell() {
  return `
    <div class="bz-topbar">
      <div class="bz-wordmark bz-display">BUG<span class="bz-wordmark-accent">ZAPPER</span></div>
      <div class="bz-topnav">
        <button type="button" id="bz-admin-menu-toggle" class="bz-admin-menu-toggle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
        </button>
        <div class="bz-admin-row" id="bz-admin-row">
          <div class="bz-admin-section">
            <div class="bz-admin-label">Admin access</div>
            <button type="button" id="bz-admin-signin" class="bz-signin-btn bz-display" hidden>Sign in as Admin</button>
          </div>
          <div class="bz-admin-section">
            <div class="bz-admin-label">Signed in as</div>
            <span id="bz-admin-badge" class="bz-admin-pill" hidden><span class="bz-admin-pill-dot"></span>Admin</span>
          </div>
          <div class="bz-admin-section">
            <button type="button" id="bz-admin-signout" class="bz-signout-row" hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
        <button type="button" id="bz-new-report" class="bz-btn bz-btn-primary bz-display">Report a bug</button>
      </div>
    </div>
    <div class="bz-header">
      <h2 class="bz-title bz-title-brand bz-display">Bug reports</h2>
      <div class="bz-subtitle">Reported by members &middot; log in to add a &ldquo;bit me too&rdquo; or file your own</div>
    </div>
    <div class="bz-filters" id="bz-filters"></div>
    <div class="bz-sortbar" id="bz-sortbar"></div>
    <div class="bz-list" id="bz-list"></div>
    <div id="bz-modal-slot"></div>
  `;
}

function renderLoggedOut() {
  return `
    <div class="bz-logged-out">
      <div class="bz-wordmark bz-display" style="margin-bottom:10px;justify-content:center;">BUG<span class="bz-wordmark-accent">ZAPPER</span></div>
      <h2 class="bz-title bz-display" style="font-size:24px;">Bug reports are for members</h2>
      <p class="bz-subtitle" style="margin-top:8px;">Log in with any Boomertanger membership to see open reports and file your own.</p>
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
    const active = state.filter === f.key ? "bz-active" : "";
    return `<button type="button" class="bz-chip ${active}" data-filter="${f.key}">${f.label} &middot; ${count}</button>`;
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
    <span class="bz-sortbar-label">Sort by</span>
    <div class="bz-sort-options">
      ${SORT_OPTIONS.map(
        (s) =>
          `<button type="button" class="bz-sort-btn ${state.sort === s.key ? "bz-active" : ""}" data-sort="${s.key}">${s.label}</button>`
      ).join("")}
    </div>
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

function renderList() {
  const el = state.root.querySelector("#bz-list");
  const items = sortReports(state.reports.filter(matchesFilter));

  if (items.length === 0) {
    el.innerHTML = `<div class="bz-empty">No reports here yet.</div>`;
    return;
  }

  el.innerHTML = items
    .map((r) => {
      const status = STATUS_META[r.status] ?? STATUS_META.Open;
      const severity = SEVERITY_META[r.severity] ?? SEVERITY_META.Minor;
      return `
      <div class="bz-row bz-clickable" data-id="${r.id}">
        <div class="bz-thumb">${r.screenshotUrl ? `<img src="${escapeHtml(r.screenshotUrl)}" alt="">` : "No screenshot"}</div>
        <div class="bz-row-body">
          <div class="bz-row-badges">
            <span class="bz-pill" style="color:${status.color};background:${status.bg};">${status.label}</span>
            <span class="bz-sev"><span class="bz-sev-dot" style="background:${severity.color};"></span>${severity.label}</span>
          </div>
          <div class="bz-row-title bz-display">${escapeHtml(r.title)}</div>
          <div class="bz-row-meta">reported by ${escapeHtml(r.reporterName)} &middot; ${formatDate(r.createdAt)} &middot; ${escapeHtml(r.page)}${r.duplicateOf ? ` &middot; duplicate of #${escapeHtml(r.duplicateOf)}` : ""}</div>
        </div>
        <div class="bz-row-metoo">
          <div class="bz-display bz-row-metoo-count">${meTooCount(r)}</div>
          <div class="bz-row-metoo-label">bit me too</div>
        </div>
      </div>`;
    })
    .join("");

  el.querySelectorAll(".bz-row").forEach((row) => {
    row.addEventListener("click", () => openDetailModal(row.dataset.id));
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

async function uploadScreenshotAndAttach(docId, file) {
  if (file.size > MAX_ORIGINAL_FILE_BYTES) {
    throw new Error("That image is too large — try a smaller screenshot.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Screenshots need to be an image file.");
  }

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
    throw new Error("Screenshot upload failed. Your report was still submitted.");
  }
  const uploadData = await uploadRes.json();

  const recordBugScreenshot = httpsCallable(functions, "recordBugScreenshot");
  await recordBugScreenshot({
    docId,
    url: uploadData.secure_url,
    publicId: uploadData.public_id,
    sizeBytes: uploadData.bytes,
    resourceType: uploadData.resource_type,
  });
}

// ---------- Submit modal ----------

function openSubmitModal() {
  const slot = state.root.querySelector("#bz-modal-slot");
  slot.innerHTML = `
    <div class="bz-modal-backdrop" id="bz-submit-backdrop">
      <div class="bz-modal">
        <div>
          <div class="bz-eyebrow">New report</div>
          <h3 class="bz-title bz-display" style="font-size:22px;">Report a bug</h3>
          <div class="bz-subtitle">The more detail you give, the faster it gets fixed.</div>
        </div>

        <div class="bz-field">
          <label class="bz-label" for="bz-title-input">Title</label>
          <input id="bz-title-input" class="bz-input" type="text" maxlength="200" placeholder="Short summary, e.g. &ldquo;Chat won't scroll on mobile&rdquo;">
        </div>

        <div class="bz-field">
          <label class="bz-label" for="bz-page-input">Which page or feature?</label>
          <select id="bz-page-input" class="bz-select">
            ${PAGE_OPTIONS.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}
          </select>
        </div>

        <div class="bz-field">
          <label class="bz-label" for="bz-what-input">What happened?</label>
          <textarea id="bz-what-input" class="bz-textarea" rows="3" maxlength="2000" placeholder="Describe what you saw."></textarea>
        </div>

        <div class="bz-field">
          <label class="bz-label" for="bz-expected-input">What did you expect instead?</label>
          <textarea id="bz-expected-input" class="bz-textarea" rows="3" maxlength="2000" placeholder="Describe what should have happened."></textarea>
        </div>

        <div class="bz-field">
          <label class="bz-label" for="bz-steps-input">Steps to reproduce</label>
          <textarea id="bz-steps-input" class="bz-textarea" rows="4" maxlength="2000" placeholder="1. Go to...&#10;2. Click...&#10;3. See..."></textarea>
        </div>

        <div class="bz-field">
          <label class="bz-label" for="bz-severity-input">How bad is it?</label>
          <select id="bz-severity-input" class="bz-select">
            ${SEVERITY_OPTIONS.map((s) => `<option value="${s.value}">${escapeHtml(s.label)}</option>`).join("")}
          </select>
        </div>

        <div class="bz-field">
          <label class="bz-label" for="bz-screenshot-input">Screenshot (optional)</label>
          <input type="file" id="bz-screenshot-input" accept="image/*" style="display:none;">
          <button type="button" id="bz-screenshot-trigger" class="bz-dropzone">
            <span id="bz-screenshot-filename">Click to choose an image</span>
            <div class="bz-hint">JPG or PNG, resized automatically before upload. Max 5MB after resize.</div>
          </button>
        </div>

        <div id="bz-submit-error" class="bz-error" hidden></div>
        <div class="bz-modal-actions">
          <button type="button" id="bz-cancel" class="bz-btn bz-btn-secondary bz-display">Cancel</button>
          <button type="button" id="bz-submit" class="bz-btn bz-btn-primary bz-display">Submit report</button>
        </div>
      </div>
    </div>
  `;

  const close = () => {
    slot.innerHTML = "";
  };
  slot.querySelector("#bz-submit-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "bz-submit-backdrop") close();
  });
  slot.querySelector("#bz-cancel").addEventListener("click", close);

  let selectedFile = null;
  slot.querySelector("#bz-screenshot-trigger").addEventListener("click", () => {
    slot.querySelector("#bz-screenshot-input").click();
  });
  slot.querySelector("#bz-screenshot-input").addEventListener("change", (e) => {
    selectedFile = e.target.files[0] ?? null;
    slot.querySelector("#bz-screenshot-filename").textContent =
      selectedFile ? selectedFile.name : "Click to choose an image";
  });

  slot.querySelector("#bz-submit").addEventListener("click", async () => {
    const title = slot.querySelector("#bz-title-input").value.trim();
    const page = slot.querySelector("#bz-page-input").value;
    const whatHappened = slot.querySelector("#bz-what-input").value.trim();
    const expectedInstead = slot.querySelector("#bz-expected-input").value.trim();
    const stepsToReproduce = slot.querySelector("#bz-steps-input").value.trim();
    const severity = slot.querySelector("#bz-severity-input").value;
    const errorEl = slot.querySelector("#bz-submit-error");
    const submitBtn = slot.querySelector("#bz-submit");

    if (title.length < 3 || title.length > 200) {
      errorEl.textContent = "Title needs to be 3–200 characters.";
      errorEl.hidden = false;
      return;
    }
    if (whatHappened.length < 1) {
      errorEl.textContent = "Let us know what happened.";
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

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
        duplicateOf: null,
        screenshotUrl: null,
        reporterUid: state.uid ?? "",
        reporterName: state.memberName,
        meTooBy: [],
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

function openDetailModal(reportId) {
  const report = state.reports.find((r) => r.id === reportId);
  if (!report) return;

  const slot = state.root.querySelector("#bz-modal-slot");
  const voted = hasMeToo(report);

  const adminControlsHtml = state.isAdmin
    ? `
      <div class="bz-admin-panel">
        <span class="bz-admin-tag">Admin only</span>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin:14px 0;">
          <div class="bz-field" style="flex:1;min-width:160px;">
            <label class="bz-label" for="bz-status-select">Status</label>
            <select id="bz-status-select" class="bz-select">
              ${Object.keys(STATUS_META)
                .map((key) => `<option value="${key}" ${report.status === key ? "selected" : ""}>${STATUS_META[key].label}</option>`)
                .join("")}
            </select>
          </div>
          <div class="bz-field" style="flex:1;min-width:160px;">
            <label class="bz-label" for="bz-priority-select">Priority</label>
            <select id="bz-priority-select" class="bz-select">
              <option value="" ${!report.priority ? "selected" : ""}>&mdash;</option>
              <option value="Low" ${report.priority === "Low" ? "selected" : ""}>Low</option>
              <option value="Normal" ${report.priority === "Normal" ? "selected" : ""}>Normal</option>
              <option value="High" ${report.priority === "High" ? "selected" : ""}>High</option>
              <option value="Urgent" ${report.priority === "Urgent" ? "selected" : ""}>Urgent</option>
            </select>
          </div>
          <div class="bz-field" style="flex:1;min-width:160px;">
            <label class="bz-label" for="bz-dup-input">Duplicate of (report id)</label>
            <input type="text" id="bz-dup-input" class="bz-input" value="${escapeHtml(report.duplicateOf ?? "")}" placeholder="paste from the original report's ID line">
            <div class="bz-hint">Open the original report — its ID is shown just below its title, click it to select and copy.</div>
          </div>
        </div>
        <div id="bz-admin-error" class="bz-error" hidden></div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <button type="button" id="bz-admin-save" class="bz-btn bz-btn-primary bz-display">Save changes</button>
          <button type="button" id="bz-admin-delete" class="bz-btn bz-display" style="background:var(--bz-accent);color:var(--bz-text);">Delete report</button>
        </div>
      </div>`
    : "";

  slot.innerHTML = `
    <div class="bz-modal-backdrop" id="bz-detail-backdrop">
      <div class="bz-modal bz-modal-wide">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div>
            <div class="bz-row-badges" style="margin-bottom:10px;">
              <span class="bz-pill" style="color:${(STATUS_META[report.status] ?? STATUS_META.Open).color};background:${(STATUS_META[report.status] ?? STATUS_META.Open).bg};">${(STATUS_META[report.status] ?? STATUS_META.Open).label}</span>
              <span class="bz-sev"><span class="bz-sev-dot" style="background:${(SEVERITY_META[report.severity] ?? SEVERITY_META.Minor).color};"></span>${(SEVERITY_META[report.severity] ?? SEVERITY_META.Minor).label}</span>
            </div>
            <h3 class="bz-title bz-display" style="font-size:22px;">${escapeHtml(report.title)}</h3>
            <div class="bz-row-meta" style="margin-top:6px;">reported by ${escapeHtml(report.reporterName)} &middot; ${formatDate(report.createdAt)} &middot; ${escapeHtml(report.page)}</div>
            <div class="bz-row-meta" style="margin-top:4px;user-select:all;cursor:text;" title="Click to select, then copy — this is what goes in another report's &quot;Duplicate of&quot; field">ID: ${escapeHtml(report.id)}</div>
          </div>
          <button type="button" id="bz-detail-close" class="bz-btn bz-btn-secondary" style="padding:6px 14px;font-size:22px;line-height:1;">&times;</button>
        </div>

        <div class="bz-section">
          <h4 class="bz-section-label">What happened</h4>
          <p class="bz-section-text">${escapeHtml(report.whatHappened)}</p>
        </div>

        ${report.expectedInstead ? `
        <div class="bz-section">
          <h4 class="bz-section-label">Expected instead</h4>
          <p class="bz-section-text">${escapeHtml(report.expectedInstead)}</p>
        </div>` : ""}

        ${report.stepsToReproduce ? `
        <div class="bz-section">
          <h4 class="bz-section-label">Steps to reproduce</h4>
          <p class="bz-section-text" style="white-space:pre-line;">${escapeHtml(report.stepsToReproduce)}</p>
        </div>` : ""}

        ${report.screenshotUrl ? `
        <div class="bz-section">
          <h4 class="bz-section-label">Screenshot</h4>
          <img src="${escapeHtml(report.screenshotUrl)}" alt="" style="max-width:100%;border-radius:10px;border:1px solid var(--bz-border);">
        </div>` : ""}

        <div class="bz-metoo-row">
          <button type="button" id="bz-metoo-btn" class="bz-btn ${voted ? "bz-btn-secondary" : "bz-btn-primary"} bz-display" ${voted ? "disabled" : ""}>
            ${voted ? "You already bit this too" : "Bit me too"}
          </button>
          <span class="bz-row-meta">${meTooCount(report)} member${meTooCount(report) === 1 ? "" : "s"} also got bit</span>
        </div>

        ${adminControlsHtml}
      </div>
    </div>
  `;

  const close = () => {
    slot.innerHTML = "";
  };
  slot.querySelector("#bz-detail-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "bz-detail-backdrop") close();
  });
  slot.querySelector("#bz-detail-close").addEventListener("click", close);

  const metooBtn = slot.querySelector("#bz-metoo-btn");
  if (!voted) {
    metooBtn.addEventListener("click", async () => {
      if (!state.uid) return;
      metooBtn.disabled = true;
      try {
        await updateDoc(doc(db, "bugReports", reportId), {
          meTooBy: arrayUnion(state.uid),
        });
        close();
      } catch (err) {
        console.error("Failed to add me-too", err);
        metooBtn.disabled = false;
      }
    });
  }

  const saveBtn = slot.querySelector("#bz-admin-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const status = slot.querySelector("#bz-status-select").value;
      const priority = slot.querySelector("#bz-priority-select").value || null;
      const duplicateOf = slot.querySelector("#bz-dup-input").value.trim() || null;
      const errorEl = slot.querySelector("#bz-admin-error");

      const update = { priority, duplicateOf };
      // Only bump statusChangedAt when status actually changes, since
      // Disk Stash's cleanup rule ages off this doc's screenshot based
      // on how long it's sat in a given status.
      if (status !== report.status) {
        update.status = status;
        update.statusChangedAt = serverTimestamp();
      }

      try {
        await updateDoc(doc(db, "bugReports", reportId), update);
        close();
      } catch (err) {
        console.error("Failed to save admin changes", err);
        errorEl.textContent = "Couldn't save changes — you may need to sign in again.";
        errorEl.hidden = false;
      }
    });
  }

  const deleteBtn = slot.querySelector("#bz-admin-delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const confirmed = window.confirm(
        `Delete "${report.title}"? This can't be undone${report.screenshotUrl ? " — its screenshot will also be removed from Cloudinary" : ""}.`
      );
      if (!confirmed) return;

      const errorEl = slot.querySelector("#bz-admin-error");
      deleteBtn.disabled = true;
      deleteBtn.textContent = "Deleting…";

      try {
        const deleteBugReport = httpsCallable(functions, "deleteBugReport");
        await deleteBugReport({ reportId });
        close();
      } catch (err) {
        console.error("Failed to delete report", err);
        errorEl.textContent = "Couldn't delete this report — you may need to sign in again.";
        errorEl.hidden = false;
        deleteBtn.disabled = false;
        deleteBtn.textContent = "Delete report";
      }
    });
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
      renderFilters();
      renderList();
    },
    (err) => {
      console.error("Failed to load bug reports", err);
      state.root.querySelector("#bz-list").innerHTML =
        `<div class="bz-empty">Couldn't load reports right now. Try refreshing.</div>`;
    }
  );
}

// ---------- Auth ----------

async function handleAdminSignIn() {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    await syncAdmin();
  } catch (err) {
    console.error("Admin sign-in failed", err);
  }
}

async function handleAdminSignOut() {
  try {
    // Signs out of the real (Google) Firebase session entirely.
    // watchAuthState's onAuthStateChanged listener will fire with
    // user=null and automatically fall back to a fresh anonymous
    // session, same as a first-time visitor.
    await signOut(auth);
    state.isAdmin = false;
    updateAdminUi();
    renderList();
  } catch (err) {
    console.error("Admin sign-out failed", err);
  }
}

async function syncAdmin() {
  try {
    const syncAdminStatus = httpsCallable(functions, "syncAdminStatus");
    const result = await syncAdminStatus();
    state.isAdmin = !!result.data?.isAdmin;
  } catch (err) {
    console.error("Failed to sync admin status", err);
    state.isAdmin = false;
  }
  updateAdminUi();
  renderList();
}

function updateAdminUi() {
  const signinBtn = state.root.querySelector("#bz-admin-signin");
  const badge = state.root.querySelector("#bz-admin-badge");
  const signoutBtn = state.root.querySelector("#bz-admin-signout");
  if (!signinBtn || !badge || !signoutBtn) return;
  // Single expression per element, rather than two branches that could
  // drift apart — signinBtn is hidden whenever isAdmin is true, full
  // stop, regardless of the MemberSpace-plan convenience check below.
  signinBtn.hidden = state.isAdmin || !hasActivePlan(PLANS.ADMIN); // UI convenience only, not a security boundary
  badge.hidden = !state.isAdmin;
  signoutBtn.hidden = !state.isAdmin;
}

function watchAuthState() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      signInAnonymously(auth).catch((err) => console.error("Anonymous sign-in failed", err));
      return;
    }

    state.uid = user.uid;

    if (!user.isAnonymous) {
      await syncAdmin();
    }

    subscribeToReports();
  });
}

// ---------- Init ----------

export async function initBugZapper() {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error(`Bug Zapper: no #${ROOT_ID} element found on the page.`);
    return;
  }
  state.root = root;
  root.innerHTML = renderShell();

  root.querySelector("#bz-new-report").addEventListener("click", openSubmitModal);
  root.querySelector("#bz-admin-signin").addEventListener("click", handleAdminSignIn);
  root.querySelector("#bz-admin-signout").addEventListener("click", handleAdminSignOut);

  // Mobile-only dots menu: purely a viewport-width thing, not tied to
  // admin state — CSS decides whether the toggle button and the
  // dropdown-vs-inline styling apply at all (see the container query).
  root.querySelector("#bz-admin-menu-toggle").addEventListener("click", (e) => {
    e.stopPropagation();
    root.querySelector("#bz-admin-row").classList.toggle("bz-open");
  });
  document.addEventListener("click", () => {
    const adminRow = root.querySelector("#bz-admin-row");
    if (adminRow) adminRow.classList.remove("bz-open");
  });

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
  watchAuthState();
}

initBugZapper();
