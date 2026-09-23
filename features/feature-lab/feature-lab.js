// features/feature-lab/feature-lab.js
//
// Renders into <div id="feature-lab-root"></div>. Import as a module
// from the Squarespace Code Block — see the embed snippet in this
// feature's README / kickoff notes.
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
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
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

const ROOT_ID = "feature-lab-root";

const STATUS_META = {
  submitted: { label: "Submitted", color: "var(--fl-gray)", bg: "var(--fl-gray-bg)" },
  under_review: { label: "Under review", color: "var(--fl-amber)", bg: "var(--fl-amber-bg)" },
  planned: { label: "Planned", color: "var(--fl-blue)", bg: "var(--fl-blue-bg)" },
  in_progress: { label: "In progress", color: "var(--fl-teal)", bg: "var(--fl-teal-bg)" },
  shipped: { label: "Shipped", color: "var(--fl-green)", bg: "var(--fl-green-bg)" },
  declined: { label: "Declined", color: "var(--fl-text-faint)", bg: "var(--fl-surface-2)" },
};

const PRIORITY_META = {
  low: { label: "Low", color: "var(--fl-gray)", bg: "var(--fl-gray-bg)" },
  medium: { label: "Medium", color: "var(--fl-amber)", bg: "var(--fl-amber-bg)" },
  high: { label: "High", color: "var(--fl-critical)", bg: "var(--fl-critical-bg)" },
};

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
  isAdmin: false,
  memberId: null,
  memberName: "Member",
  root: null,
  unsubscribeRequests: null,
};

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(name) {
  return String(name ?? "?")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(value) {
  if (!value) return "";
  const d = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------- Rendering ----------

function renderShell() {
  return `
    <div class="fl-wordmark-bar">
      <div class="fl-wordmark-group">
        <svg width="30" height="30" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="visible">
          <path d="M16 6H28" stroke="#9146FF" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M17.5 6V9L7 27.5C5.5 31 8 35 12 35H32C36 35 38.5 31 37 27.5L26.5 9V6" stroke="#9146FF" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M10.5 26.5L12 27.5H32L33.5 26.5C33.5 31 30 34 22 34C14 34 10.5 31 10.5 26.5Z" fill="#9146FF" fill-opacity="0.4"/>
          <path d="M12 27.5H32" stroke="#FFA100" stroke-width="2.5" stroke-linecap="round"/>
          <circle class="fl-flask-bubble" cx="15" cy="7" r="2.2" fill="#9146FF"/>
          <circle class="fl-flask-bubble" cx="22" cy="6" r="4" fill="#FFA100"/>
          <circle class="fl-flask-bubble" cx="28" cy="7.5" r="3" fill="#9146FF"/>
          <circle class="fl-flask-bubble" cx="19" cy="3" r="3.6" fill="#FFA100"/>
          <circle class="fl-flask-bubble" cx="25" cy="2" r="2.4" fill="#9146FF"/>
          <circle class="fl-flask-burst" cx="22" cy="6" r="4" stroke="#FFA100" fill="none"/>
          <circle class="fl-flask-burst" cx="19" cy="3" r="3.6" stroke="#FFA100" fill="none" style="animation-delay:0.4s;"/>
        </svg>
        <div class="fl-wordmark">FEATURE <span class="fl-wordmark-primary">LAB</span></div>
      </div>
      <div class="fl-topnav">
        <button type="button" id="fl-admin-menu-toggle" class="fl-admin-menu-toggle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
        </button>
        <div class="fl-admin-row" id="fl-admin-row">
          <div class="fl-admin-section">
            <div class="fl-admin-label">Admin access</div>
            <button type="button" id="fl-admin-signin" class="fl-signin-btn fl-display" hidden>Sign in as Admin</button>
          </div>
          <div class="fl-admin-section">
            <div class="fl-admin-label">Signed in as</div>
            <span id="fl-admin-badge" class="fl-admin-pill" hidden><span class="fl-admin-pill-dot"></span>Admin</span>
          </div>
          <div class="fl-admin-section">
            <button type="button" id="fl-admin-signout" class="fl-signout-row" hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
        <button type="button" id="fl-new-request" class="fl-btn fl-btn-primary fl-display">+ New request</button>
      </div>
    </div>
    <div class="fl-header">
      <h2 class="fl-title fl-display">Feature requests</h2>
      <div class="fl-subtitle">Suggest ideas for the site or the stream, vote on your favorites, and track progress &mdash; all in one place.</div>
    </div>
    <div class="fl-filters" id="fl-filters"></div>
    <div class="fl-sort" id="fl-sort"></div>
    <div class="fl-list" id="fl-list"></div>
    <div id="fl-modal-slot"></div>
  `;
}

function renderLoggedOut() {
  return `<div class="fl-logged-out">Log in as a Fan Club member to view and submit feature requests.</div>`;
}

function renderFilters() {
  const el = state.root.querySelector("#fl-filters");
  el.innerHTML = FILTERS.map((f) => {
    const count =
      f.key === "all"
        ? state.requests.length
        : state.requests.filter((r) => r.status === f.key).length;
    const active = state.filter === f.key ? "fl-active" : "";
    return `<button type="button" class="fl-chip ${active}" data-filter="${f.key}">${f.label} &middot; ${count}</button>`;
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
    <span class="fl-sort-label">Sort by</span>
    <button type="button" class="fl-chip fl-chip-small ${state.sort === "newest" ? "fl-active" : ""}" data-sort="newest">Newest</button>
    <button type="button" class="fl-chip fl-chip-small ${state.sort === "votes" ? "fl-active" : ""}" data-sort="votes">Most voted</button>
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


function renderList() {
  const el = state.root.querySelector("#fl-list");
  let items =
    state.filter === "all"
      ? state.requests
      : state.requests.filter((r) => r.status === state.filter);

  if (state.sort === "votes") {
    items = [...items].sort((a, b) => voteCount(b) - voteCount(a));
  }

  if (items.length === 0) {
    el.innerHTML = `<div class="fl-empty">No requests here yet.</div>`;
    return;
  }

  el.innerHTML = items
    .map((r) => {
      const status = STATUS_META[r.status] ?? STATUS_META.submitted;
      const priority = r.priority ? PRIORITY_META[r.priority] : null;
      const declinedClass = r.status === "declined" ? "fl-declined" : "";
      const voted = hasVoted(r);
      return `
      <div class="fl-row ${declinedClass} fl-clickable" data-id="${r.id}">
        <div class="fl-row-top" style="display:flex;align-items:flex-start;gap:16px;flex-grow:1;min-width:0;">
          <button type="button" class="fl-vote-btn ${voted ? "fl-voted" : ""}" data-vote-id="${r.id}" aria-label="${voted ? "Remove your vote" : "Vote for this request"}">
            <span class="fl-vote-arrow">&#9650;</span>
            <span class="fl-vote-count">${voteCount(r)}</span>
          </button>
          <div class="fl-dot" style="background:${status.color};margin-top:6px;"></div>
          <div class="fl-row-body">
            <div class="fl-row-title fl-display">${escapeHtml(r.title)}</div>
            <div class="fl-row-desc">${escapeHtml(r.description)}</div>
          </div>
        </div>
        <div class="fl-row-meta" style="display:flex;align-items:center;gap:16px;">
          <div class="fl-row-badges" style="display:flex;gap:6px;">
            ${priority ? `<span class="fl-badge" style="color:${priority.color};background:${priority.bg};">${priority.label}</span>` : `<span class="fl-badge fl-badge-neutral">&mdash;</span>`}
            <span class="fl-badge" style="color:${status.color};background:${status.bg};">${status.label}</span>
            ${r.commentCount > 0 ? `<span class="fl-comment-badge" title="${r.commentCount} comment${r.commentCount === 1 ? "" : "s"}"><svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 5.5C3 4.67157 3.67157 4 4.5 4H15.5C16.3284 4 17 4.67157 17 5.5V12.5C17 13.3284 16.3284 14 15.5 14H8L4.5 17V14H4.5C3.67157 14 3 13.3284 3 12.5V5.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>${r.commentCount}</span>` : ""}
          </div>
          <div class="fl-avatar" title="${escapeHtml(r.requesterName)}">${initials(r.requesterName)}</div>
          <div class="fl-row-date">${formatDate(r.createdAt)}</div>
        </div>
      </div>`;
    })
    .join("");

  el.querySelectorAll(".fl-vote-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleVote(btn.dataset.voteId);
    });
  });

  el.querySelectorAll(".fl-row").forEach((row) => {
    row.addEventListener("click", () => openDetailModal(row.dataset.id));
  });
}

// ---------- Submit modal ----------

function openSubmitModal() {
  const slot = state.root.querySelector("#fl-modal-slot");
  slot.innerHTML = `
    <div class="fl-modal-backdrop" id="fl-submit-backdrop">
      <div class="fl-modal">
        <div>
          <div class="fl-eyebrow">New request</div>
          <h3 class="fl-title fl-display" style="font-size:22px;">What should we build?</h3>
          <div class="fl-subtitle">Visible to the whole Fan Club once submitted.</div>
        </div>
        <div class="fl-field">
          <label class="fl-label" for="fl-title-input">Title</label>
          <input id="fl-title-input" class="fl-input" type="text" maxlength="200" placeholder="e.g. A countdown timer for movie nights">
          <div class="fl-hint">3&ndash;200 characters</div>
        </div>
        <div class="fl-field">
          <label class="fl-label" for="fl-desc-input">Description (required)</label>
          <textarea id="fl-desc-input" class="fl-textarea" rows="5" maxlength="2000" placeholder="Describe the idea — what should it do?"></textarea>
          <div class="fl-hint">10&ndash;2,000 characters</div>
        </div>
        <div id="fl-submit-error" class="fl-error" hidden></div>
        <div class="fl-modal-actions">
          <button type="button" id="fl-cancel" class="fl-btn fl-btn-secondary fl-display">Cancel</button>
          <button type="button" id="fl-submit" class="fl-btn fl-btn-primary fl-display">Submit request</button>
        </div>
      </div>
    </div>
  `;

  const close = () => {
    slot.innerHTML = "";
  };

  slot.querySelector("#fl-submit-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "fl-submit-backdrop") close();
  });
  slot.querySelector("#fl-cancel").addEventListener("click", close);

  slot.querySelector("#fl-submit").addEventListener("click", async () => {
    const title = slot.querySelector("#fl-title-input").value.trim();
    const description = slot.querySelector("#fl-desc-input").value.trim();
    const errorEl = slot.querySelector("#fl-submit-error");

    if (title.length < 3 || title.length > 200) {
      errorEl.textContent = "Title needs to be 3–200 characters.";
      errorEl.hidden = false;
      return;
    }
    if (description.length < 10 || description.length > 2000) {
      errorEl.textContent = "Description needs to be 10–2,000 characters.";
      errorEl.hidden = false;
      return;
    }

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

function openDetailModal(requestId) {
  const request = state.requests.find((r) => r.id === requestId);
  if (!request) return;

  const status = STATUS_META[request.status] ?? STATUS_META.submitted;
  const priority = request.priority ? PRIORITY_META[request.priority] : null;
  const slot = state.root.querySelector("#fl-modal-slot");
  const history = [...(request.statusHistory ?? [])].reverse();
  let unsubscribeComments = null;

  const adminControlsHtml = state.isAdmin
    ? `
        <div class="fl-admin-panel">
          <span class="fl-admin-only-badge"><svg width="18" height="18" viewBox="0 0 24 24" fill="#3ba86b" stroke="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>Admin only</span>
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <div class="fl-field" style="flex:1;min-width:160px;">
              <label class="fl-label" for="fl-status-select">Status</label>
              <select id="fl-status-select" class="fl-select">
                ${Object.entries(STATUS_META)
                  .map(
                    ([key, m]) =>
                      `<option value="${key}" ${request.status === key ? "selected" : ""}>${m.label}</option>`
                  )
                  .join("")}
              </select>
            </div>
            <div class="fl-field" style="flex:1;min-width:160px;">
              <label class="fl-label" for="fl-priority-select">Priority</label>
              <select id="fl-priority-select" class="fl-select">
                <option value="" ${!request.priority ? "selected" : ""}>&mdash;</option>
                ${Object.entries(PRIORITY_META)
                  .map(
                    ([key, m]) =>
                      `<option value="${key}" ${request.priority === key ? "selected" : ""}>${m.label}</option>`
                  )
                  .join("")}
              </select>
            </div>
          </div>
          <div class="fl-field">
            <label class="fl-label" for="fl-note-input">Note (optional, added to history)</label>
            <textarea id="fl-note-input" class="fl-textarea" rows="2" maxlength="500"></textarea>
          </div>
          <div id="fl-admin-error" class="fl-error" hidden></div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <button type="button" id="fl-admin-save" class="fl-btn fl-btn-primary fl-display">Save changes</button>
            <button type="button" id="fl-admin-delete" class="fl-btn fl-btn-critical fl-display">Delete request</button>
          </div>
        </div>`
    : "";

  slot.innerHTML = `
    <div class="fl-modal-backdrop" id="fl-detail-backdrop">
      <div class="fl-modal fl-modal-wide">
        <div class="fl-detail-header">
          <div class="fl-detail-heading">
            <h3 class="fl-title fl-display" style="font-size:22px;">${escapeHtml(request.title)}</h3>
            <span class="fl-detail-pills">
              <span class="fl-badge" style="color:${status.color};background:${status.bg};">${status.label}</span>
              ${priority ? `<span class="fl-badge" style="color:${priority.color};background:${priority.bg};">${priority.label}</span>` : ""}
            </span>
          </div>
          <button type="button" id="fl-detail-close" class="fl-close-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <p style="margin:0;font-size:15px;line-height:1.6;color:var(--fl-text);">${escapeHtml(request.description)}</p>

        <div>
          <div class="fl-label" style="margin-bottom:12px;">Comments</div>
          <div id="fl-comments-list" style="display:flex;flex-direction:column;gap:12px;margin-bottom:14px;"></div>
          <div class="fl-field">
            <textarea id="fl-comment-input" class="fl-textarea" rows="2" maxlength="1000" placeholder="Ask a question or add context&hellip;"></textarea>
          </div>
          <div id="fl-comment-error" class="fl-error" hidden></div>
          <button type="button" id="fl-comment-post" class="fl-btn fl-btn-secondary fl-display" style="margin-top:8px;">Post comment</button>
        </div>

        ${adminControlsHtml}

        <div>
          <div class="fl-label" style="margin-bottom:12px;">History</div>
          ${history
            .map((h, i) => {
              const meta = STATUS_META[h.status] ?? STATUS_META.submitted;
              const isLast = i === history.length - 1;
              return `
              <div class="fl-history-item">
                <div class="fl-history-line">
                  <div class="fl-history-dot" style="background:${meta.color};"></div>
                  ${isLast ? "" : `<div class="fl-history-rule"></div>`}
                </div>
                <div style="padding-bottom:16px;">
                  <div style="font-size:14px;"><strong>${meta.label}</strong> &middot; ${escapeHtml(h.changedBy)}</div>
                  <div style="font-size:13px;color:var(--fl-text-faint);margin-top:2px;">${formatDate(h.changedAt)}${h.note ? ` &mdash; "${escapeHtml(h.note)}"` : ""}</div>
                </div>
              </div>`;
            })
            .join("")}
        </div>
      </div>
    </div>
  `;

  const close = () => {
    if (unsubscribeComments) unsubscribeComments();
    slot.innerHTML = "";
  };
  slot.querySelector("#fl-detail-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "fl-detail-backdrop") close();
  });
  slot.querySelector("#fl-detail-close").addEventListener("click", close);

  // Live comment thread
  const commentsList = slot.querySelector("#fl-comments-list");
  const commentsQuery = query(
    collection(db, "featureRequests", requestId, "comments"),
    orderBy("createdAt", "asc")
  );
  unsubscribeComments = onSnapshot(
    commentsQuery,
    (snapshot) => {
      const comments = snapshot.docs.map((d) => d.data());
      if (comments.length === 0) {
        commentsList.innerHTML = `<div style="font-size:13px;color:var(--fl-text-faint);">No comments yet.</div>`;
        return;
      }
      commentsList.innerHTML = comments
        .map(
          (c) => `
        <div class="fl-comment">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;font-weight:600;">${escapeHtml(c.authorName)}</span>
            ${c.isAdminAuthor ? `<span class="fl-badge" style="color:var(--fl-primary);background:var(--fl-primary-bg);padding:2px 8px;font-size:10px;">Admin</span>` : ""}
            <span style="font-size:12px;color:var(--fl-text-faint);">${formatDate(c.createdAt)}</span>
          </div>
          <div style="font-size:14px;color:var(--fl-text);margin-top:4px;line-height:1.5;">${escapeHtml(c.text)}</div>
        </div>`
        )
        .join("");
    },
    (err) => {
      console.error("Failed to load comments", err);
      commentsList.innerHTML = `<div style="font-size:13px;color:var(--fl-text-faint);">Couldn't load comments.</div>`;
    }
  );

  slot.querySelector("#fl-comment-post").addEventListener("click", async () => {
    const input = slot.querySelector("#fl-comment-input");
    const errorEl = slot.querySelector("#fl-comment-error");
    const text = input.value.trim();
    if (text.length < 1 || text.length > 1000) {
      errorEl.textContent = "Comment can't be empty.";
      errorEl.hidden = false;
      return;
    }
    try {
      await addDoc(collection(db, "featureRequests", requestId, "comments"), {
        text,
        authorId: state.memberId ?? "",
        authorName: state.memberName,
        isAdminAuthor: state.isAdmin,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "featureRequests", requestId), {
        commentCount: increment(1),
      }).catch((err) => console.error("Failed to bump comment count", err));
      input.value = "";
      errorEl.hidden = true;
    } catch (err) {
      console.error("Failed to post comment", err);
      errorEl.textContent = "Something went wrong posting your comment.";
      errorEl.hidden = false;
    }
  });

  // Admin controls (only present in the DOM if state.isAdmin)
  const saveBtn = slot.querySelector("#fl-admin-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const status = slot.querySelector("#fl-status-select").value;
      const priority = slot.querySelector("#fl-priority-select").value || null;
      const note = slot.querySelector("#fl-note-input").value.trim();
      const errorEl = slot.querySelector("#fl-admin-error");

      const historyEntry = {
        status,
        changedBy: state.memberName || "Admin",
        changedAt: new Date().toISOString(),
      };
      if (note) historyEntry.note = note;

      try {
        await updateDoc(doc(db, "featureRequests", requestId), {
          status,
          priority,
          updatedAt: serverTimestamp(),
          statusHistory: arrayUnion(historyEntry),
        });
        close();
      } catch (err) {
        console.error("Failed to save admin changes", err);
        errorEl.textContent = "Couldn't save changes — you may need to sign in again.";
        errorEl.hidden = false;
      }
    });
  }

  const deleteBtn = slot.querySelector("#fl-admin-delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const confirmed = window.confirm(
        `Delete "${request.title}"? This can't be undone. (Its comments will remain in the database, orphaned — a known limitation, not something this deletes for you.)`
      );
      if (!confirmed) return;
      try {
        await deleteDoc(doc(db, "featureRequests", requestId));
        close();
      } catch (err) {
        console.error("Failed to delete request", err);
        const errorEl = slot.querySelector("#fl-admin-error");
        errorEl.textContent = "Couldn't delete — you may need to sign in again.";
        errorEl.hidden = false;
      }
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
      renderFilters();
      renderList();
    },
    (err) => {
      console.error("Failed to load feature requests", err);
      state.root.querySelector("#fl-list").innerHTML =
        `<div class="fl-empty">Couldn't load requests right now. Try refreshing.</div>`;
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
  const signinBtn = state.root.querySelector("#fl-admin-signin");
  const badge = state.root.querySelector("#fl-admin-badge");
  const signoutBtn = state.root.querySelector("#fl-admin-signout");
  if (!signinBtn || !badge || !signoutBtn) return;
  signinBtn.hidden = state.isAdmin || !hasActivePlan(PLANS.ADMIN); // UI convenience only, not a security boundary
  badge.hidden = !state.isAdmin;
  signoutBtn.hidden = !state.isAdmin;
}

function watchAuthState() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // No session yet — sign in anonymously so members can write.
      // This re-triggers onAuthStateChanged with the anonymous user.
      signInAnonymously(auth).catch((err) =>
        console.error("Anonymous sign-in failed", err)
      );
      return;
    }

    if (!user.isAnonymous) {
      // A real (Google) session persisted from a previous visit —
      // re-verify against the allowlist rather than trusting the cache.
      await syncAdmin();
    }

    subscribeToRequests();
  });
}

// ---------- Init ----------

export async function initFeatureLab() {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error(`Feature Lab: no #${ROOT_ID} element found on the page.`);
    return;
  }
  state.root = root;
  root.innerHTML = renderShell();

  root.querySelector("#fl-new-request").addEventListener("click", openSubmitModal);
  root.querySelector("#fl-admin-signin").addEventListener("click", handleAdminSignIn);
  root.querySelector("#fl-admin-signout").addEventListener("click", handleAdminSignOut);

  // Mobile-only dots menu: purely a viewport-width thing, not tied to
  // admin state — CSS decides whether the toggle button and the
  // dropdown-vs-inline styling apply at all (see the container query).
  root.querySelector("#fl-admin-menu-toggle").addEventListener("click", (e) => {
    e.stopPropagation();
    root.querySelector("#fl-admin-row").classList.toggle("fl-open");
  });
  document.addEventListener("click", () => {
    const adminRow = root.querySelector("#fl-admin-row");
    if (adminRow) adminRow.classList.remove("fl-open");
  });

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
  watchAuthState();
}

initFeatureLab();
