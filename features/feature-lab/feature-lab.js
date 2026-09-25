// features/feature-lab/feature-lab.js
//
// Renders into <div id="feature-lab-root"></div>. Import as a module
// from the Squarespace Code Block — see the embed snippet in this
// feature's README.
//
// Security model (see /firestore.rules and /functions/index.js):
// - Fan Club members: gated client-side by MemberSpace isLoggedIn(),
//   write via silent Firebase Anonymous Auth (not identity-verified —
//   acceptable given the low stakes of a feature-request board).
// - Admins: real Firebase Auth via Google Sign-In. syncAdminStatus
//   (a Cloud Function) checks the signed-in email against the
//   adminAllowlist collection and mirrors the result into
//   admins/{uid}, which Firestore rules trust for writes.

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
import { initAdminMenu, LOGIN_ICON, SIGNOUT_ICON, SHIELD_ICON } from "../../shared/ui/admin-menu.js";
import { initAdminAuth } from "../../shared/ui/admin-auth.js";
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
  increment,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";

const ROOT_ID = "feature-lab-root";

// Matches the comments text.size() <= 1000 check in firestore.rules.
const COMMENT_MAX_LENGTH = 1000;

const WORDMARK_ICON = `
  <svg viewBox="0 0 44 44" overflow="visible" aria-hidden="true">
    <path d="M16 6H28" stroke="var(--bt-primary)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M17.5 6V9L7 27.5C5.5 31 8 35 12 35H32C36 35 38.5 31 37 27.5L26.5 9V6" stroke="var(--bt-primary)" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M10.5 26.5L12 27.5H32L33.5 26.5C33.5 31 30 34 22 34C14 34 10.5 31 10.5 26.5Z" fill="var(--bt-primary)" fill-opacity="0.4"/>
    <path d="M12 27.5H32" stroke="var(--bt-title)" stroke-width="2.5" stroke-linecap="round"/>
    <circle class="fl-flask-bubble" cx="15" cy="7" r="2.2" fill="var(--bt-primary)"/>
    <circle class="fl-flask-bubble" cx="22" cy="6" r="4" fill="var(--bt-title)"/>
    <circle class="fl-flask-bubble" cx="28" cy="7.5" r="3" fill="var(--bt-primary)"/>
    <circle class="fl-flask-bubble" cx="19" cy="3" r="3.6" fill="var(--bt-title)"/>
    <circle class="fl-flask-bubble" cx="25" cy="2" r="2.4" fill="var(--bt-primary)"/>
    <circle class="fl-flask-burst" cx="22" cy="6" r="4" stroke="var(--bt-title)" fill="none"/>
    <circle class="fl-flask-burst" cx="19" cy="3" r="3.6" stroke="var(--bt-title)" fill="none" style="animation-delay:0.4s;"/>
  </svg>`;

const UP_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"></polyline></svg>';
const PLUS_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
const TRASH_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';
const COMMENT_ICON =
  '<svg width="12" height="12" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 5.5C3 4.67157 3.67157 4 4.5 4H15.5C16.3284 4 17 4.67157 17 5.5V12.5C17 13.3284 16.3284 14 15.5 14H8L4.5 17V14H4.5C3.67157 14 3 13.3284 3 12.5V5.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

// Site-wide badge system (docs/design-system.md §5). Keys are the stored
// values and never change; labels and tones are presentation only.
// under_review isn't in the site-wide table; it uses the spare teal tone.
const STATUS_META = {
  submitted: { label: "Submitted", tone: "blue" },
  under_review: { label: "Under review", tone: "teal" },
  planned: { label: "Planned", tone: "gold" },
  in_progress: { label: "In progress", tone: "green" },
  shipped: { label: "Shipped", tone: "lime" },
  declined: { label: "Declined", tone: "gray" },
};

// Priority is a level (ordered scale): signal bars, level n of LEVEL_STEPS.
const LEVEL_STEPS = 3;
const PRIORITY_META = {
  low: { label: "Low", tone: "blue", level: 1 },
  medium: { label: "Medium", tone: "gold", level: 2 },
  high: { label: "High", tone: "pink", level: 3 },
};

function statusBadge(meta) {
  return `<span class="bt-badge bt-badge--${meta.tone}"><span class="bt-badge-dot"></span>${meta.label}</span>`;
}

function levelBadge(meta) {
  return `<span class="bt-badge bt-badge--${meta.tone}">${levelBars(meta.level, LEVEL_STEPS)}${meta.label}</span>`;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under review" },
  { key: "planned", label: "Planned" },
  { key: "in_progress", label: "In progress" },
  { key: "shipped", label: "Shipped" },
  { key: "declined", label: "Declined" },
];

const app = getFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);

const state = {
  requests: [],
  filter: "all",
  sort: "newest",
  listStatus: "loading", // "loading" | "loaded" | "error"
  isAdmin: false,
  memberId: null,
  memberName: "Member",
  root: null,
  unsubscribeRequests: null,
};

// ---------- Rendering ----------

function renderShell() {
  return `
    <div class="bt-topbar">
      <div class="bt-wordmark">
        <span class="bt-wordmark-icon">${WORDMARK_ICON}</span>
        <span class="bt-wordmark-text">FEATURE <span class="bt-wordmark-accent">LAB</span></span>
      </div>
      <div class="bt-topnav">
        <div class="bt-admin">
          <button type="button" class="bt-admin-menu-toggle" aria-label="Admin menu" aria-expanded="false">${LOGIN_ICON}</button>
          <div class="bt-admin-row">
            <div class="bt-admin-section">
              <span class="bt-admin-label">Admin access</span>
              <button type="button" id="fl-admin-signin" class="bt-signin-btn" hidden>Sign in as Admin</button>
            </div>
            <div class="bt-admin-section">
              <span class="bt-admin-label">Signed in as</span>
              <span id="fl-admin-badge" class="bt-admin-pill" hidden><span class="bt-admin-pill-dot"></span>Admin</span>
              <button type="button" id="fl-admin-signout" class="bt-signout-row" hidden>${SIGNOUT_ICON}<span>Sign out</span></button>
            </div>
          </div>
        </div>
        <button type="button" id="fl-new-request" class="bt-btn bt-btn--primary" aria-label="New request">${PLUS_ICON}<span class="bt-btn-label">New request</span></button>
      </div>
    </div>
    <div class="bt-header">
      <h1 class="bt-title">Feature requests</h1>
      <p class="bt-subtitle">Suggest ideas for the site or the stream, vote on your favorites, and track progress &mdash; all in one place.</p>
    </div>
    <div class="bt-filters" id="fl-filters"></div>
    <div class="bt-sortbar" id="fl-sort"></div>
    <div class="bt-list" id="fl-list"></div>
  `;
}

function renderLoggedOut() {
  return `
    <div class="bt-logged-out">
      <div class="bt-wordmark"><span class="bt-wordmark-icon">${WORDMARK_ICON}</span><span class="bt-wordmark-text">FEATURE <span class="bt-wordmark-accent">LAB</span></span></div>
      <h2 class="bt-logged-out-title">Feature requests are members-only</h2>
      <p class="bt-logged-out-text">Log in with your free Fan Club membership to suggest ideas and vote on what gets built next.</p>
    </div>
  `;
}

function renderFilters() {
  const el = state.root.querySelector("#fl-filters");
  el.innerHTML = FILTERS.map((f) => {
    const count =
      f.key === "all" ? state.requests.length : state.requests.filter((r) => r.status === f.key).length;
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

function renderSort() {
  const el = state.root.querySelector("#fl-sort");
  el.innerHTML = `
    <span class="bt-sortbar-label">Sort by</span>
    <button type="button" class="bt-chip bt-chip--small ${state.sort === "newest" ? "is-active" : ""}" data-sort="newest" aria-pressed="${state.sort === "newest"}">Newest</button>
    <button type="button" class="bt-chip bt-chip--small ${state.sort === "votes" ? "is-active" : ""}" data-sort="votes" aria-pressed="${state.sort === "votes"}">Most voted</button>
  `;
  el.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.sort = btn.dataset.sort;
      renderSort();
      renderList();
    });
  });
}

function voteCount(r) {
  return (r.votes ?? []).length;
}

function hasVoted(r) {
  return !!state.memberId && (r.votes ?? []).includes(state.memberId);
}

async function toggleVote(requestId) {
  if (!state.memberId) return;
  const request = state.requests.find((r) => r.id === requestId);
  if (!request) return;
  const voted = hasVoted(request);
  try {
    await updateDoc(doc(db, "featureRequests", requestId), {
      votes: voted ? arrayRemove(state.memberId) : arrayUnion(state.memberId),
    });
  } catch (err) {
    console.error("Failed to toggle vote", err);
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
  const status = STATUS_META[r.status] ?? STATUS_META.submitted;
  const priority = r.priority ? PRIORITY_META[r.priority] : null;
  const voted = hasVoted(r);
  return `
  <div class="bt-row bt-row--clickable ${r.status === "declined" ? "bt-row--dimmed" : ""}" data-id="${r.id}" tabindex="0">
    <button type="button" class="bt-tally ${voted ? "is-active" : ""}" data-vote-id="${r.id}" aria-pressed="${voted}" aria-label="${voted ? "Remove your vote" : "Vote for this request"}">
      ${UP_ICON}<span class="bt-tally-count">${voteCount(r)}</span><span class="bt-tally-label">votes</span>
    </button>
    <div class="bt-row-body">
      <div class="bt-row-title">${escapeHtml(r.title)}</div>
      <div class="bt-row-desc">${escapeHtml(r.description)}</div>
      <div class="bt-row-meta"><span class="bt-avatar">${initials(r.requesterName)}</span><span>${escapeHtml(r.requesterName)}</span></div>
    </div>
    <div class="bt-row-side">
      <div class="bt-row-badges">
        ${priority ? levelBadge(priority) : ""}
        ${statusBadge(status)}
      </div>
      ${r.commentCount > 0 ? `<span class="bt-count">${COMMENT_ICON}${r.commentCount}</span>` : ""}
      <span class="bt-row-date">${formatDate(r.createdAt)}</span>
    </div>
  </div>`;
}

function renderList() {
  const el = state.root.querySelector("#fl-list");

  if (state.listStatus === "loading") {
    el.setAttribute("aria-busy", "true");
    el.innerHTML = skeletonRow() + skeletonRow() + skeletonRow();
    return;
  }
  el.removeAttribute("aria-busy");

  if (state.listStatus === "error") {
    el.innerHTML = `<div class="bt-empty"><p class="bt-empty-title">Couldn't load requests</p><p>Check your connection, then refresh the page.</p></div>`;
    return;
  }

  let items =
    state.filter === "all" ? state.requests : state.requests.filter((r) => r.status === state.filter);
  if (state.sort === "votes") {
    items = [...items].sort((a, b) => voteCount(b) - voteCount(a));
  }

  if (items.length === 0) {
    el.innerHTML = `<div class="bt-empty"><p class="bt-empty-title">No requests here yet</p><p>Be the first to suggest one.</p></div>`;
    return;
  }

  el.innerHTML = items.map(rowHtml).join("");

  el.querySelectorAll(".bt-tally").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleVote(btn.dataset.voteId);
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

// ---------- Submit modal ----------

function openSubmitModal() {
  const { modal, close } = openModal({
    feature: "feature-lab",
    title: "New request",
    content: `
      ${modalHeader("New request", "Got an idea? Pitch it here and the community will vote on what gets built next.")}
      <div class="bt-field">
        <label class="bt-label" for="fl-title-input">Title</label>
        <input id="fl-title-input" class="bt-input" type="text" maxlength="200" placeholder="e.g. A countdown timer for movie nights" autofocus>
        <span class="bt-hint">3&ndash;200 characters</span>
      </div>
      <div class="bt-field">
        <label class="bt-label" for="fl-desc-input">Description (required)</label>
        <textarea id="fl-desc-input" class="bt-textarea" rows="5" maxlength="2000" placeholder="Describe the idea — what should it do?"></textarea>
        <span class="bt-hint">10&ndash;2,000 characters</span>
      </div>
      <p id="fl-submit-error" class="bt-error" hidden></p>
      <div class="bt-modal-actions">
        <button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button>
        <button type="button" id="fl-submit" class="bt-btn bt-btn--primary">Submit request</button>
      </div>`,
  });

  modal.querySelector("#fl-submit").addEventListener("click", async () => {
    const titleInput = modal.querySelector("#fl-title-input");
    const descInput = modal.querySelector("#fl-desc-input");
    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const errorEl = modal.querySelector("#fl-submit-error");

    if (title.length < 3 || title.length > 200) {
      titleInput.setAttribute("aria-invalid", "true");
      errorEl.textContent = "Title needs to be 3–200 characters.";
      errorEl.hidden = false;
      return;
    }
    titleInput.removeAttribute("aria-invalid");
    if (description.length < 10 || description.length > 2000) {
      descInput.setAttribute("aria-invalid", "true");
      errorEl.textContent = "Description needs to be 10–2,000 characters.";
      errorEl.hidden = false;
      return;
    }
    descInput.removeAttribute("aria-invalid");

    try {
      await addDoc(collection(db, "featureRequests"), {
        title,
        description,
        status: "submitted",
        priority: null,
        votes: [],
        commentCount: 0,
        requesterId: state.memberId ?? "",
        requesterName: state.memberName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        statusHistory: [
          {
            status: "submitted",
            changedBy: state.memberName,
            changedAt: new Date().toISOString(),
          },
        ],
      });
      close();
    } catch (err) {
      console.error("Failed to submit request", err);
      errorEl.textContent = "Something went wrong submitting your request. Please try again.";
      errorEl.hidden = false;
    }
  });
}

// ---------- Detail modal (description, comments, admin controls, history) ----------

function adminPanelHtml(request) {
  return `
    <div class="bt-admin-panel">
      <span class="bt-admin-tag">${SHIELD_ICON}Admin only</span>
      <div class="bt-form-grid">
        <div class="bt-field">
          <label class="bt-label" for="fl-status-select">Status</label>
          <select id="fl-status-select" class="bt-select">
            ${Object.entries(STATUS_META)
              .map(([key, m]) => `<option value="${key}" ${request.status === key ? "selected" : ""}>${m.label}</option>`)
              .join("")}
          </select>
        </div>
        <div class="bt-field">
          <label class="bt-label" for="fl-priority-select">Priority</label>
          <select id="fl-priority-select" class="bt-select">
            <option value="" ${!request.priority ? "selected" : ""}>&mdash;</option>
            ${Object.entries(PRIORITY_META)
              .map(([key, m]) => `<option value="${key}" ${request.priority === key ? "selected" : ""}>${m.label}</option>`)
              .join("")}
          </select>
        </div>
      </div>
      <div class="bt-field">
        <label class="bt-label" for="fl-note-input">Note (optional, added to history)</label>
        <textarea id="fl-note-input" class="bt-textarea" rows="2" maxlength="500" disabled></textarea>
        <span class="bt-hint">A note is saved with a status change.</span>
      </div>
      <p id="fl-admin-error" class="bt-error" hidden></p>
      <div><button type="button" id="fl-admin-save" class="bt-btn bt-btn--admin" disabled>Save changes</button></div>
    </div>`;
}

function historyHtml(history) {
  if (history.length === 0) return `<p class="bt-meta">No history yet.</p>`;
  return `<div class="bt-history">${history
    .map((h) => {
      const meta = STATUS_META[h.status] ?? STATUS_META.submitted;
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

function openDetailModal(requestId) {
  const request = state.requests.find((r) => r.id === requestId);
  if (!request) return;

  const status = STATUS_META[request.status] ?? STATUS_META.submitted;
  const priority = request.priority ? PRIORITY_META[request.priority] : null;
  const history = [...(request.statusHistory ?? [])].reverse();
  let unsubscribeComments = null;

  const { modal, close } = openModal({
    wide: true,
    feature: "feature-lab",
    title: request.title,
    content: `
      ${modalHeader(escapeHtml(request.title), `<span class="bt-meta">Requested by ${escapeHtml(request.requesterName)} on ${formatDate(request.createdAt)}</span>`)}
      <div class="bt-row-badges">
        ${statusBadge(status)}
        ${priority ? levelBadge(priority) : ""}
      </div>
      <div class="bt-modal-section">
        <p class="bt-section-label">Description</p>
        <p class="bt-section-text">${escapeHtml(request.description)}</p>
      </div>
      ${state.isAdmin ? adminPanelHtml(request) : ""}
      <div class="bt-modal-section">
        <p class="bt-section-label">Comments</p>
        <div id="fl-comments-list" class="bt-comments"></div>
        <div style="margin-top:var(--bt-space-3)">${composerHtml({ placeholder: "Ask a question or add context…", maxLength: COMMENT_MAX_LENGTH, id: "fl-comment-input" })}</div>
      </div>
      <div class="bt-modal-section">
        <p class="bt-section-label">History</p>
        ${historyHtml(history)}
      </div>
      <div class="bt-modal-actions">
        ${state.isAdmin ? `<button type="button" id="fl-admin-delete" class="bt-btn bt-btn--danger">${TRASH_ICON}Delete request</button>` : ""}
        <button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button>
      </div>`,
    onClose: () => {
      if (unsubscribeComments) unsubscribeComments();
    },
  });

  // Live comment thread
  const commentsList = modal.querySelector("#fl-comments-list");
  const commentsQuery = query(
    collection(db, "featureRequests", requestId, "comments"),
    orderBy("createdAt", "asc")
  );
  unsubscribeComments = onSnapshot(
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
  );

  // The composer owns the busy state, the empty/over-length guard and the
  // error display; a thrown Error's message is what the member sees.
  initComposer(modal.querySelector(".bt-composer"), {
    onSubmit: async (text) => {
      try {
        await addDoc(collection(db, "featureRequests", requestId, "comments"), {
          text,
          authorId: state.memberId ?? "",
          authorName: state.memberName,
          isAdminAuthor: state.isAdmin,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Failed to post comment", err);
        throw new Error("Something went wrong posting your comment.");
      }
      await updateDoc(doc(db, "featureRequests", requestId), {
        commentCount: increment(1),
      }).catch((err) => console.error("Failed to bump comment count", err));
    },
  });

  // Admin controls (only present in the DOM if state.isAdmin)
  const saveBtn = modal.querySelector("#fl-admin-save");
  if (saveBtn) {
    // Enabled only when status or priority differ from the saved request;
    // a history entry (and its note) is written only on a real status
    // change. firestore.rules enforces the same thing, so a double-click
    // can't add a duplicate history entry.
    const statusSel = modal.querySelector("#fl-status-select");
    const prioritySel = modal.querySelector("#fl-priority-select");
    const noteInput = modal.querySelector("#fl-note-input");
    const errorEl = modal.querySelector("#fl-admin-error");
    const read = () => ({ status: statusSel.value, priority: prioritySel.value || null });
    let saving = false;
    const refresh = () => {
      const v = read();
      const statusChanged = v.status !== request.status;
      noteInput.disabled = !statusChanged;
      saveBtn.disabled = saving || !(statusChanged || v.priority !== (request.priority ?? null));
    };
    [statusSel, prioritySel].forEach((el) => {
      el.addEventListener("input", refresh);
      el.addEventListener("change", refresh);
    });

    saveBtn.addEventListener("click", async () => {
      if (saveBtn.disabled) return;
      const v = read();
      const update = { updatedAt: serverTimestamp() };
      if (v.priority !== (request.priority ?? null)) update.priority = v.priority;
      if (v.status !== request.status) {
        const historyEntry = {
          status: v.status,
          changedBy: state.memberName || "Admin",
          changedAt: new Date().toISOString(),
        };
        const note = noteInput.value.trim();
        if (note) historyEntry.note = note;
        update.status = v.status;
        update.statusHistory = arrayUnion(historyEntry);
      }

      saving = true;
      errorEl.hidden = true;
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>Saving…`;
      try {
        await updateDoc(doc(db, "featureRequests", requestId), update);
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

  const deleteBtn = modal.querySelector("#fl-admin-delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const ok = await confirmAction({
        title: "Delete this request?",
        message: `"${request.title}" will be removed, along with its comments and activity. This can't be undone.`,
        confirmLabel: "Delete request",
        busyLabel: "Deleting…",
        feature: "feature-lab",
        onConfirm: async () => {
          const deleteFeatureRequest = httpsCallable(functions, "deleteFeatureRequest");
          await deleteFeatureRequest({ requestId });
        },
      });
      if (ok) close();
    });
  }
}

// ---------- Data ----------

function subscribeToRequests() {
  if (state.unsubscribeRequests) return; // already subscribed
  const q = query(collection(db, "featureRequests"), orderBy("createdAt", "desc"));
  state.unsubscribeRequests = onSnapshot(
    q,
    (snapshot) => {
      state.requests = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.listStatus = "loaded";
      renderFilters();
      renderList();
    },
    (err) => {
      console.error("Failed to load feature requests", err);
      state.listStatus = "error";
      renderList();
    }
  );
}

// ---------- Init ----------

export async function initFeatureLab() {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error(`Feature Lab: no #${ROOT_ID} element found on the page.`);
    return;
  }
  state.root = root;
  root.classList.add("bt-root");
  root.innerHTML = renderShell();
  initRowSpotlight(root);

  root.querySelector("#fl-new-request").addEventListener("click", openSubmitModal);

  const menu = initAdminMenu(root);
  const signinBtn = root.querySelector("#fl-admin-signin");
  const badge = root.querySelector("#fl-admin-badge");
  const signoutBtn = root.querySelector("#fl-admin-signout");

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
  state.memberId = member?.id != null ? String(member.id) : null;
  state.memberName = member?.name ?? "Member";

  renderFilters();
  renderSort();
  updateAdminUi();
  renderList();

  const { signIn, signOut } = initAdminAuth({
    auth,
    functions,
    onChange({ isAdmin }) {
      state.isAdmin = isAdmin;
      updateAdminUi();
      subscribeToRequests();
      renderList();
    },
  });
  signinBtn.addEventListener("click", signIn);
  signoutBtn.addEventListener("click", signOut);
}

initFeatureLab();
