// features/disk-stash/disk-stash.js
//
// Renders into <div id="disk-stash-root"></div>. Import as a module from
// the Squarespace Code Block on the disk-stash page.
//
// Security model (see /firestore.rules and /functions/index.js):
// - MemberSpace's Admin plan gates VISIBILITY only (an invite to sign in) —
//   it is not server-verifiable, so it can't gate real reads/writes.
// - Real access: Firebase Auth via Google Sign-In + syncAdminStatus (the
//   same Cloud Function Feature Lab uses), which checks the signed-in
//   email against adminAllowlist and mirrors the result into admins/{uid}.
//   firestore.rules trusts that doc, not anything client-side.
// - externalAssets and storageUsage are read-only here even for admins —
//   they're written only by Cloud Functions (recordAssetCreated,
//   performAssetDeletion) so they can never drift from Cloudinary's real
//   state. cleanupRules is plain admin-editable config, no Cloud Function
//   needed for that part.

import { getFirebaseApp } from "../../shared/firebase-init.js";
import { waitForReady, hasActivePlan, PLANS } from "../../shared/memberspace-helper.js";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";

const ROOT_ID = "disk-stash-root";

// Storage-only cap tracking (see README: this is bytes we know are stored
// in live externalAssets records — NOT the full Cloudinary credit pool,
// which also spans bandwidth and transforms we have no visibility into
// without a separate call to Cloudinary's own Usage API).
const CAP_BYTES = 25 * 1024 ** 3; // 25 GB, Cloudinary free tier
const BUFFER_BYTES = 20 * 1024 ** 3; // pause new uploads at 20 GB

const app = getFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);

const state = {
  root: null,
  isAdmin: false,
  assets: [],
  usage: { totalBytes: 0 },
  rules: [],
  purgeTargetId: null,
  purgeError: null,
  purgeInFlight: false,
  addingRule: false,
  unsubs: [],
};

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(bytes) {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function formatAge(createdAt) {
  if (!createdAt?.toDate) return "—";
  const days = Math.floor((Date.now() - createdAt.toDate().getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

// ---------- Gated / signed-out shells ----------

function renderNotAdmin() {
  return `
    <div id="${ROOT_ID}" class="ds-gate">
      <p>Disk Stash is admin-only.</p>
    </div>
  `;
}

function renderSignInGate() {
  return `
    <div class="ds-header">
      <div class="ds-header-text">
        <h1 class="ds-display">Disk Stash</h1>
        <p class="ds-sub">External storage admin — Cloudinary usage &amp; asset management</p>
      </div>
      <span class="ds-badge ds-badge-amber">ADMIN ONLY</span>
    </div>
    <div class="ds-gate">
      <p>Sign in with the Google account on your admin allowlist to continue.</p>
      <button type="button" id="ds-signin" class="ds-btn ds-btn-primary">Sign in with Google</button>
      <div id="ds-signin-error" class="ds-error" hidden></div>
    </div>
  `;
}

// ---------- Main shell ----------

function renderShell() {
  return `
    <div class="ds-header">
      <div class="ds-header-text">
        <h1 class="ds-display">Disk Stash</h1>
        <p class="ds-sub">External storage admin — Cloudinary usage &amp; asset management</p>
      </div>
      <span class="ds-badge ds-badge-green">ADMIN</span>
    </div>
    <div class="ds-body">
      <div id="ds-usage"></div>
      <div class="ds-columns">
        <div id="ds-assets"></div>
        <div id="ds-rules"></div>
      </div>
    </div>
    <div id="ds-modal"></div>
  `;
}

function renderUsage() {
  const used = state.usage.totalBytes || 0;
  const pct = Math.min(100, (used / CAP_BYTES) * 100);
  const bufferPct = (BUFFER_BYTES / CAP_BYTES) * 100;
  const status = used >= CAP_BYTES ? "over" : used >= BUFFER_BYTES ? "near" : "ok";
  const statusMeta = {
    ok: { label: "HEALTHY", cls: "ds-badge-green" },
    near: { label: "NEAR BUFFER", cls: "ds-badge-amber" },
    over: { label: "OVER BUFFER", cls: "ds-badge-red" },
  }[status];

  return `
    <div class="ds-card">
      <div class="ds-card-head">
        <h2 class="ds-eyebrow">Tracked storage</h2>
        <span class="ds-badge ${statusMeta.cls}">${statusMeta.label}</span>
      </div>
      <div class="ds-bar-track">
        <div class="ds-bar-fill" style="width:${pct}%"></div>
        <div class="ds-bar-buffer" style="left:${bufferPct}%"></div>
      </div>
      <div class="ds-usage-row">
        <div><span class="ds-mono ds-usage-num">${formatBytes(used)}</span> <span class="ds-sub-inline">of 25 GB monthly cap (free tier)</span></div>
        <div class="ds-buffer-note">Upload pause buffer at 20 GB</div>
      </div>
      <p class="ds-fineprint">This tracks bytes in known externalAssets records only — not the full Cloudinary credit pool, which also spans bandwidth and transforms.</p>
    </div>
  `;
}

function renderAssets() {
  if (state.assets.length === 0) {
    return `
      <div class="ds-card">
        <div class="ds-card-head ds-card-head-border">
          <h2 class="ds-title">Tracked assets</h2>
          <span class="ds-mono ds-count">0 assets</span>
        </div>
        <div class="ds-empty">
          <p>Nothing tracked yet</p>
          <p class="ds-empty-sub">Assets appear once a feature writes a record to externalAssets.</p>
        </div>
      </div>
    `;
  }

  const rows = state.assets
    .map(
      (a) => `
      <tr>
        <td>${escapeHtml(a.feature)}</td>
        <td class="ds-mono ds-muted">${escapeHtml(a.linkedDoc?.collection ?? "")}/${escapeHtml(a.linkedDoc?.docId ?? "")}</td>
        <td>${formatAge(a.createdAt)}</td>
        <td class="ds-mono ds-muted">${formatBytes(a.sizeBytes || 0)}</td>
        <td class="ds-row-action"><button type="button" class="ds-btn-ghost-danger" data-purge="${a.id}">Purge</button></td>
      </tr>
    `
    )
    .join("");

  return `
    <div class="ds-card">
      <div class="ds-card-head ds-card-head-border">
        <h2 class="ds-title">Tracked assets</h2>
        <span class="ds-mono ds-count">${state.assets.length} asset${state.assets.length === 1 ? "" : "s"}</span>
      </div>
      <table class="ds-table">
        <thead>
          <tr><th>Feature</th><th>Linked doc</th><th>Age</th><th>Size</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderRules() {
  const list = state.rules
    .map(
      (r) => `
      <div class="ds-rule">
        <div class="ds-rule-top">
          <span class="ds-rule-feature">${escapeHtml(r.feature)}</span>
          <div class="ds-rule-actions">
            <button type="button" class="ds-toggle ${r.enabled ? "ds-toggle-on" : ""}" data-toggle-rule="${r.id}" aria-pressed="${r.enabled}" aria-label="Toggle ${escapeHtml(r.feature)} cleanup rule">
              <span class="ds-toggle-knob"></span>
            </button>
            <button type="button" class="ds-icon-btn" data-delete-rule="${r.id}" aria-label="Delete rule">&times;</button>
          </div>
        </div>
        <p class="ds-rule-desc">${escapeHtml(r.matchField)}: <span class="ds-mono">${escapeHtml(r.matchValue)}</span> · unchanged &ge; <span class="ds-mono">${escapeHtml(String(r.ageThresholdDays))} days</span></p>
      </div>
    `
    )
    .join("");

  const addForm = state.addingRule
    ? `
      <form id="ds-add-rule-form" class="ds-add-form">
        <label>Feature key <input name="feature" required placeholder="bugZapper"></label>
        <label>Collection <input name="collection" required placeholder="bugReports"></label>
        <label>Match field <input name="matchField" required placeholder="status"></label>
        <label>Match value <input name="matchValue" required placeholder="fixed"></label>
        <label>Age field <input name="ageField" required placeholder="statusUpdatedAt"></label>
        <label>Age threshold (days) <input name="ageThresholdDays" type="number" min="1" required placeholder="60"></label>
        <div id="ds-rule-error" class="ds-error" hidden></div>
        <div class="ds-add-form-actions">
          <button type="button" id="ds-cancel-rule" class="ds-btn-ghost">Cancel</button>
          <button type="submit" class="ds-btn ds-btn-primary">Save rule</button>
        </div>
      </form>
    `
    : "";

  return `
    <div class="ds-card ds-card-tight">
      <div class="ds-card-head">
        <h2 class="ds-title">Cleanup rules</h2>
        <button type="button" id="ds-add-rule-btn" class="ds-btn-ghost">+ Add rule</button>
      </div>
      ${
        state.rules.length === 0 && !state.addingRule
          ? `<div class="ds-empty-dashed"><p>No rules yet.</p></div>`
          : `<div class="ds-rule-list">${list}</div>`
      }
      ${addForm}
    </div>
  `;
}

function renderModal() {
  if (!state.purgeTargetId) return "";
  const asset = state.assets.find((a) => a.id === state.purgeTargetId);
  if (!asset) return "";

  return `
    <div class="ds-modal-overlay">
      <div class="ds-modal">
        <h2 class="ds-title">Purge this asset?</h2>
        <p class="ds-modal-meta">${escapeHtml(asset.feature)} · <span class="ds-mono">${escapeHtml(asset.linkedDoc?.collection ?? "")}/${escapeHtml(asset.linkedDoc?.docId ?? "")}</span></p>
        <p class="ds-modal-body">Deletes the file from Cloudinary via the safe-delete function, then clears the reference on the linked doc. This cannot be undone.</p>
        ${state.purgeError ? `<div class="ds-error">${escapeHtml(state.purgeError)}</div>` : ""}
        <div class="ds-modal-actions">
          <button type="button" id="ds-cancel-purge" class="ds-btn-ghost" ${state.purgeInFlight ? "disabled" : ""}>Cancel</button>
          <button type="button" id="ds-confirm-purge" class="ds-btn ds-btn-danger" ${state.purgeInFlight ? "disabled" : ""}>${state.purgeInFlight ? "Purging…" : "Confirm purge"}</button>
        </div>
      </div>
    </div>
  `;
}

// ---------- Render orchestration ----------

function renderAll() {
  state.root.querySelector("#ds-usage").innerHTML = renderUsage();
  state.root.querySelector("#ds-assets").innerHTML = renderAssets();
  state.root.querySelector("#ds-rules").innerHTML = renderRules();
  state.root.querySelector("#ds-modal").innerHTML = renderModal();
  attachBodyHandlers();
}

function attachBodyHandlers() {
  state.root.querySelectorAll("[data-purge]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.purgeTargetId = btn.dataset.purge;
      state.purgeError = null;
      state.root.querySelector("#ds-modal").innerHTML = renderModal();
      attachModalHandlers();
    });
  });

  state.root.querySelectorAll("[data-toggle-rule]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const rule = state.rules.find((r) => r.id === btn.dataset.toggleRule);
      if (!rule) return;
      try {
        await updateDoc(doc(db, "cleanupRules", rule.id), { enabled: !rule.enabled });
      } catch (err) {
        console.error("Failed to toggle rule", err);
      }
    });
  });

  state.root.querySelectorAll("[data-delete-rule]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this cleanup rule?")) return;
      try {
        await deleteDoc(doc(db, "cleanupRules", btn.dataset.deleteRule));
      } catch (err) {
        console.error("Failed to delete rule", err);
      }
    });
  });

  const addBtn = state.root.querySelector("#ds-add-rule-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      state.addingRule = true;
      state.root.querySelector("#ds-rules").innerHTML = renderRules();
      attachBodyHandlers();
    });
  }

  const cancelRuleBtn = state.root.querySelector("#ds-cancel-rule");
  if (cancelRuleBtn) {
    cancelRuleBtn.addEventListener("click", () => {
      state.addingRule = false;
      state.root.querySelector("#ds-rules").innerHTML = renderRules();
      attachBodyHandlers();
    });
  }

  const addForm = state.root.querySelector("#ds-add-rule-form");
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(addForm).entries());
      const errorEl = state.root.querySelector("#ds-rule-error");
      try {
        await addDoc(collection(db, "cleanupRules"), {
          feature: data.feature,
          collection: data.collection,
          matchField: data.matchField,
          matchValue: data.matchValue,
          ageField: data.ageField,
          ageThresholdDays: parseInt(data.ageThresholdDays, 10),
          enabled: true,
          createdAt: serverTimestamp(),
        });
        state.addingRule = false;
        // subscription will re-render with the new rule
      } catch (err) {
        console.error("Failed to save rule", err);
        errorEl.textContent = "Couldn't save that rule — check the fields and try again.";
        errorEl.hidden = false;
      }
    });
  }
}

function attachModalHandlers() {
  const cancelBtn = state.root.querySelector("#ds-cancel-purge");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      state.purgeTargetId = null;
      state.purgeError = null;
      state.root.querySelector("#ds-modal").innerHTML = renderModal();
    });
  }

  const confirmBtn = state.root.querySelector("#ds-confirm-purge");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      state.purgeInFlight = true;
      state.root.querySelector("#ds-modal").innerHTML = renderModal();
      attachModalHandlers();
      try {
        const deleteExternalAsset = httpsCallable(functions, "deleteExternalAsset");
        await deleteExternalAsset({ assetId: state.purgeTargetId });
        state.purgeTargetId = null;
        state.purgeError = null;
      } catch (err) {
        console.error("Purge failed", err);
        state.purgeError = err.message || "Purge failed — see console for details.";
      }
      state.purgeInFlight = false;
      state.root.querySelector("#ds-modal").innerHTML = renderModal();
      attachModalHandlers();
    });
  }
}

// ---------- Data subscriptions ----------

function subscribeToData() {
  state.unsubs.push(
    onSnapshot(collection(db, "externalAssets"), (snap) => {
      state.assets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAll();
    })
  );
  state.unsubs.push(
    onSnapshot(doc(db, "storageUsage", "current"), (snap) => {
      state.usage = snap.exists() ? snap.data() : { totalBytes: 0 };
      renderAll();
    })
  );
  state.unsubs.push(
    onSnapshot(collection(db, "cleanupRules"), (snap) => {
      state.rules = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAll();
    })
  );
}

// ---------- Auth ----------

async function syncAdmin() {
  try {
    const syncAdminStatus = httpsCallable(functions, "syncAdminStatus");
    const result = await syncAdminStatus();
    return !!result.data?.isAdmin;
  } catch (err) {
    console.error("Failed to sync admin status", err);
    return false;
  }
}

async function handleSignIn() {
  const provider = new GoogleAuthProvider();
  const errorEl = state.root.querySelector("#ds-signin-error");
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("Admin sign-in failed", err);
    if (errorEl) {
      errorEl.textContent = "Sign-in failed. Try again.";
      errorEl.hidden = false;
    }
  }
}

function watchAuthState() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      state.root.innerHTML = renderSignInGate();
      state.root.querySelector("#ds-signin").addEventListener("click", handleSignIn);
      return;
    }

    const isAdmin = await syncAdmin();
    state.isAdmin = isAdmin;

    if (!isAdmin) {
      state.root.innerHTML = renderSignInGate();
      const el = state.root.querySelector("#ds-signin-error");
      el.textContent = "That account isn't on the admin allowlist.";
      el.hidden = false;
      state.root.querySelector("#ds-signin").addEventListener("click", handleSignIn);
      return;
    }

    state.root.innerHTML = renderShell();
    subscribeToData();
  });
}

// ---------- Init ----------

export async function initDiskStash() {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error(`Disk Stash: no #${ROOT_ID} element found on the page.`);
    return;
  }
  state.root = root;

  await waitForReady();

  // MemberSpace's Admin plan only decides whether to show the sign-in
  // invite at all — see the file header note on why this isn't a security
  // boundary by itself.
  if (!hasActivePlan(PLANS.ADMIN)) {
    root.innerHTML = renderNotAdmin();
    return;
  }

  root.innerHTML = renderSignInGate();
  root.querySelector("#ds-signin").addEventListener("click", handleSignIn);
  watchAuthState();
}

initDiskStash();
