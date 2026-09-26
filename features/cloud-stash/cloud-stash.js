// features/cloud-stash/cloud-stash.js
//
// Renders into <div id="cloud-stash-root"></div>. Import as a module from
// the Squarespace Code Block on the cloud-stash page.
//
// Security model (see /firestore.rules and /functions/index.js):
// - MemberSpace's Admin plan gates VISIBILITY only (an invite to sign in) —
//   it is not server-verifiable, so it can't gate real reads/writes.
// - Real access: Firebase Auth via Google Sign-In + syncAdminStatus (the
//   same Cloud Function Feature Lab and Bug Zapper use), which checks the
//   signed-in email against adminAllowlist and mirrors the result into
//   admins/{uid}. firestore.rules trusts that doc, not anything
//   client-side.
// - externalAssets and storageUsage are read-only here even for admins —
//   they're written only by Cloud Functions (recordAssetCreated,
//   performAssetDeletion) so they can never drift from Cloudinary's real
//   state. cleanupRules is plain admin-editable config, no Cloud Function
//   needed for that part.
//
// Auth flow note: this feature does NOT use shared/ui/admin-auth.js. That
// module's onAuthStateChanged handler always falls back to a silent
// anonymous sign-in when there's no user, which fits Bug Zapper/Feature
// Lab (public, member-facing views that need to write before anyone signs
// in) but not this one — Cloud Stash has no public view at all, so it
// keeps its own watchAuthState() that shows the sign-in gate on
// user === null instead of ever creating an anonymous session.

import { getFirebaseApp } from "../../shared/firebase-init.js";
import { waitForReady, hasActivePlan, PLANS } from "../../shared/memberspace-helper.js";
import { escapeHtml } from "../../shared/ui/dom.js";
import { confirmAction } from "../../shared/ui/confirm.js";
import { initAdminMenu, LOGIN_ICON, SIGNOUT_ICON, SHIELD_ICON } from "../../shared/ui/admin-menu.js";
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
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";

const ROOT_ID = "cloud-stash-root";

// Storage-only cap tracking (see README: this is bytes we know are stored
// in live externalAssets records — NOT the full Cloudinary credit pool,
// which also spans bandwidth and transforms we have no visibility into
// without a separate call to Cloudinary's own Usage API).
const CAP_BYTES = 25 * 1024 ** 3; // 25 GB, Cloudinary free tier
const BUFFER_BYTES = 20 * 1024 ** 3; // pause new uploads at 20 GB

const WORDMARK_ICON =
  '<svg viewBox="0 0 32 32" overflow="visible" aria-hidden="true">' +
  '<path d="M9 21a5.5 5.5 0 0 1-.6-10.97A6.5 6.5 0 0 1 21 8.5a5 5 0 0 1 .5 9.98" fill="none" stroke="var(--bt-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
  '<rect x="10" y="19" width="3" height="6" rx="1" fill="var(--bt-primary)"></rect>' +
  '<rect x="14.5" y="16" width="3" height="9" rx="1" fill="var(--bt-primary)"></rect>' +
  '<rect x="19" y="18" width="3" height="7" rx="1" fill="var(--bt-primary)"></rect>' +
  '<rect class="cs-bar-glow" x="10" y="19" width="3" height="6" rx="1" fill="var(--bt-title)"></rect>' +
  '<rect class="cs-bar-glow" x="14.5" y="16" width="3" height="9" rx="1" fill="var(--bt-title)" style="animation-delay:.35s"></rect>' +
  '<rect class="cs-bar-glow" x="19" y="18" width="3" height="7" rx="1" fill="var(--bt-title)" style="animation-delay:.7s"></rect>' +
  '</svg>';
const PLUS_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
const X_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

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
  addingRule: false,
  unsubs: [],
};

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
  return `<div class="bt-empty"><p>Cloud Stash is admin-only.</p></div>`;
}

function renderSignInGate() {
  return `
    <div class="bt-logged-out">
      <div class="bt-wordmark"><span class="bt-wordmark-icon">${WORDMARK_ICON}</span><span class="bt-wordmark-text">CLOUD<span class="bt-wordmark-accent">STASH</span></span></div>
      <span class="bt-admin-tag">${SHIELD_ICON}Admin only</span>
      <p class="bt-logged-out-text">Sign in with the Google account on your admin allowlist to continue.</p>
      <button type="button" id="cs-signin" class="bt-signin-btn">Sign in as Admin</button>
      <p id="cs-signin-error" class="bt-error" hidden></p>
    </div>
  `;
}

// ---------- Main shell ----------

function renderShell() {
  return `
    <div class="bt-topbar">
      <div class="bt-wordmark">
        <span class="bt-wordmark-icon">${WORDMARK_ICON}</span>
        <span class="bt-wordmark-text">CLOUD<span class="bt-wordmark-accent">STASH</span></span>
      </div>
      <div class="bt-topnav">
        <div class="bt-admin">
          <button type="button" class="bt-admin-menu-toggle" aria-label="Admin menu" aria-expanded="false">${LOGIN_ICON}</button>
          <div class="bt-admin-row">
            <div class="bt-admin-section">
              <span class="bt-admin-label">Admin access</span>
              <button type="button" class="bt-signin-btn" hidden>Sign in as Admin</button>
            </div>
            <div class="bt-admin-section">
              <span class="bt-admin-label">Signed in as</span>
              <span class="bt-admin-pill"><span class="bt-admin-pill-dot"></span>Admin</span>
              <button type="button" id="cs-admin-signout" class="bt-signout-row">${SIGNOUT_ICON}<span>Sign out</span></button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="bt-header">
      <h1 class="bt-title">Storage</h1>
      <p class="bt-subtitle">External storage admin &mdash; Cloudinary usage &amp; asset management.</p>
    </div>
    <div class="bt-body" style="padding-top:0">
      <div id="cs-usage"></div>
      <div class="bt-columns">
        <div id="cs-assets"></div>
        <div id="cs-rules"></div>
      </div>
    </div>
  `;
}

function renderUsage() {
  const used = state.usage.totalBytes || 0;
  const pct = Math.min(100, (used / CAP_BYTES) * 100);
  const bufferPct = (BUFFER_BYTES / CAP_BYTES) * 100;
  const status = used >= CAP_BYTES ? "over" : used >= BUFFER_BYTES ? "near" : "ok";
  const statusMeta = {
    ok: { label: "Healthy", tone: "green" },
    near: { label: "Uploads paused", tone: "gold" },
    over: { label: "Over limit", tone: "red" },
  }[status];

  return `
    <div class="bt-card">
      <div class="bt-card-head">
        <h2 class="bt-card-title">Tracked storage</h2>
        <span class="bt-badge bt-badge--${statusMeta.tone}"><span class="bt-badge-dot"></span>${statusMeta.label}</span>
      </div>
      <div class="bt-stat"><span class="bt-stat-value">${formatBytes(used)}</span><span class="bt-stat-unit">of 25 GB monthly cap (free tier)</span></div>
      <div class="bt-meter bt-meter--${statusMeta.tone}">
        <div class="bt-meter-track" role="meter" aria-valuemin="0" aria-valuemax="${(CAP_BYTES / 1024 ** 3).toFixed(0)}" aria-valuenow="${(used / 1024 ** 3).toFixed(1)}" aria-label="Tracked storage in GB">
          <div class="bt-meter-fill" style="width:${pct}%"></div>
          <div class="bt-meter-marker" style="left:${bufferPct}%" title="Uploads pause at ${formatBytes(BUFFER_BYTES)}"></div>
        </div>
        <div class="bt-meter-legend"><span>0 GB</span><span class="bt-meter-legend-mark" style="--bt-at:${bufferPct}%">Uploads pause at ${formatBytes(BUFFER_BYTES)}</span><span>${formatBytes(CAP_BYTES)}</span></div>
      </div>
      <p class="bt-fineprint">This tracks bytes in known externalAssets records only — not the full Cloudinary credit pool, which also spans bandwidth and transforms.</p>
    </div>
  `;
}

function renderAssets() {
  if (state.assets.length === 0) {
    return `
      <div class="bt-card bt-card--divided">
        <div class="bt-card-head">
          <h2 class="bt-card-title">Tracked files</h2>
          <span class="bt-card-meta">0 files</span>
        </div>
        <div class="bt-empty bt-empty--compact">
          <p class="bt-empty-title">No files tracked yet</p>
          <p>Files show up here once a feature saves an upload.</p>
        </div>
      </div>
    `;
  }

  const rows = state.assets
    .map(
      (a) => `
      <tr>
        <td>${escapeHtml(a.feature)}</td>
        <td><span class="bt-code">${escapeHtml(a.linkedDoc?.collection ?? "")}/${escapeHtml(a.linkedDoc?.docId ?? "")}</span></td>
        <td class="bt-muted">${formatAge(a.createdAt)}</td>
        <td class="bt-num bt-muted">${formatBytes(a.sizeBytes || 0)}</td>
        <td class="bt-table-action"><button type="button" class="bt-btn bt-btn--sm bt-btn--danger" data-purge="${a.id}">Purge</button></td>
      </tr>
    `
    )
    .join("");

  return `
    <div class="bt-card bt-card--divided">
      <div class="bt-card-head">
        <h2 class="bt-card-title">Tracked files</h2>
        <span class="bt-card-meta">${state.assets.length} file${state.assets.length === 1 ? "" : "s"}</span>
      </div>
      <div class="bt-table-wrap">
        <table class="bt-table">
          <thead>
            <tr><th>Feature</th><th>Linked record</th><th>Age</th><th class="bt-num">Size</th><th></th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// Collections whose files Cloud Stash can clean up, with the EXACT values
// stored in each match field. Firestore matching is case-sensitive, so a
// rule for "fixed" never matches a report whose status is "Fixed"; offering
// these as a dropdown keeps the stored match value identical to the data.
// Keep in sync with the owning feature (bug-zapper.js STATUS_META /
// SEVERITY_META and its priority options). Fields not listed stay free text.
const RULE_TARGETS = {
  bugReports: {
    feature: "bugZapper",
    matchFields: {
      status: ["Open", "In progress", "Fixed", "Won't fix", "Can't reproduce", "Duplicate"],
      severity: ["Cosmetic", "Minor", "Major", "Critical"],
      priority: ["Low", "Normal", "High", "Urgent"],
    },
    ageFields: ["statusChangedAt", "createdAt"],
  },
};

function knownMatchValues(collectionName, matchField) {
  return RULE_TARGETS[collectionName?.trim()]?.matchFields[matchField?.trim()] ?? null;
}

// Select with the exact stored values when they're known, else free text.
function matchValueControl(collectionName, matchField, current = "") {
  const known = knownMatchValues(collectionName, matchField);
  if (known) {
    return `<select id="cs-f-matchValue" name="matchValue" class="bt-select" required>
      <option value="" ${known.includes(current) ? "" : "selected"} disabled>Choose a value</option>
      ${known.map((v) => `<option value="${escapeHtml(v)}" ${v === current ? "selected" : ""}>${escapeHtml(v)}</option>`).join("")}
    </select>
    <span class="bt-hint">Exact values stored in ${escapeHtml(collectionName.trim())}.${escapeHtml(matchField.trim())}.</span>`;
  }
  return `<input id="cs-f-matchValue" name="matchValue" class="bt-input" required value="${escapeHtml(current)}" placeholder="Exact stored value (case-sensitive)">`;
}

function datalist(id, values) {
  return `<datalist id="${id}">${values.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("")}</datalist>`;
}

function renderRules() {
  const items = state.rules.length
    ? `<div class="bt-items">${state.rules
        .map(
          (r) => `
        <div class="bt-item ${r.enabled ? "" : "bt-item--off"}">
          <div class="bt-item-head">
            <span class="bt-item-title">${escapeHtml(r.feature)}</span>
            <div class="bt-item-actions">
              <button type="button" class="bt-switch" role="switch" aria-checked="${r.enabled}" data-toggle-rule="${r.id}" aria-label="Toggle ${escapeHtml(r.feature)} cleanup rule"></button>
              <button type="button" class="bt-icon-btn bt-icon-btn--sm" data-delete-rule="${r.id}" aria-label="Delete rule">${X_ICON}</button>
            </div>
          </div>
          <p class="bt-item-desc">${escapeHtml(r.matchField)}: <span class="bt-code">${escapeHtml(r.matchValue)}</span> &middot; unchanged &ge; <span class="bt-code">${escapeHtml(String(r.ageThresholdDays))} days</span></p>
        </div>`
        )
        .join("")}</div>`
    : state.addingRule
    ? ""
    : `<div class="bt-empty bt-empty--compact"><p>No cleanup rules yet. Add one to delete old files automatically.</p></div>`;

  const addForm = state.addingRule
    ? `
      <form id="cs-add-rule-form" class="bt-form">
        <div class="bt-form-grid">
          <div class="bt-field"><label class="bt-label" for="cs-f-feature">Feature key</label><input id="cs-f-feature" name="feature" class="bt-input" required placeholder="bugZapper"></div>
          <div class="bt-field"><label class="bt-label" for="cs-f-collection">Collection</label><input id="cs-f-collection" name="collection" class="bt-input" required placeholder="bugReports" list="cs-l-collection">${datalist("cs-l-collection", Object.keys(RULE_TARGETS))}</div>
          <div class="bt-field"><label class="bt-label" for="cs-f-matchField">Match field</label><input id="cs-f-matchField" name="matchField" class="bt-input" required placeholder="status" list="cs-l-matchField"><datalist id="cs-l-matchField"></datalist></div>
          <div class="bt-field" id="cs-f-matchValue-field"><label class="bt-label" for="cs-f-matchValue">Match value</label>${matchValueControl("", "")}</div>
          <div class="bt-field"><label class="bt-label" for="cs-f-ageField">Age field</label><input id="cs-f-ageField" name="ageField" class="bt-input" required placeholder="statusChangedAt" list="cs-l-ageField"><datalist id="cs-l-ageField"></datalist></div>
          <div class="bt-field"><label class="bt-label" for="cs-f-ageThresholdDays">Age threshold (days)</label><input id="cs-f-ageThresholdDays" name="ageThresholdDays" type="number" min="1" class="bt-input" required placeholder="60"></div>
        </div>
        <p id="cs-rule-error" class="bt-error" hidden></p>
        <div class="bt-form-actions">
          <button type="button" id="cs-cancel-rule" class="bt-btn bt-btn--sm bt-btn--secondary">Cancel</button>
          <button type="submit" class="bt-btn bt-btn--sm bt-btn--admin">Save rule</button>
        </div>
      </form>
    `
    : "";

  return `
    <div class="bt-card">
      <div class="bt-card-head">
        <h2 class="bt-card-title">Cleanup rules</h2>
        ${state.addingRule ? "" : `<button type="button" id="cs-add-rule-btn" class="bt-btn bt-btn--sm bt-btn--admin">${PLUS_ICON}Add rule</button>`}
      </div>
      ${items}
      ${addForm}
    </div>
  `;
}

// ---------- Render orchestration ----------

function renderAll() {
  state.root.querySelector("#cs-usage").innerHTML = renderUsage();
  state.root.querySelector("#cs-assets").innerHTML = renderAssets();
  state.root.querySelector("#cs-rules").innerHTML = renderRules();
  attachBodyHandlers();
}

function attachBodyHandlers() {
  state.root.querySelectorAll("[data-purge]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const asset = state.assets.find((a) => a.id === btn.dataset.purge);
      if (!asset) return;
      await confirmAction({
        title: "Purge this file?",
        message: `Deletes the file for ${asset.feature} · ${asset.linkedDoc?.collection ?? ""}/${asset.linkedDoc?.docId ?? ""} from Cloudinary via the safe-delete function, then clears the reference on the linked doc. This can't be undone.`,
        confirmLabel: "Purge file",
        busyLabel: "Purging…",
        feature: "cloud-stash",
        onConfirm: async () => {
          const deleteExternalAsset = httpsCallable(functions, "deleteExternalAsset");
          await deleteExternalAsset({ assetId: asset.id });
        },
      });
      // Success re-renders naturally: the externalAssets onSnapshot
      // subscription drops the purged doc and calls renderAll() again.
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
      const rule = state.rules.find((r) => r.id === btn.dataset.deleteRule);
      if (!rule) return;
      await confirmAction({
        title: "Delete this cleanup rule?",
        message: `Files from ${rule.feature} will no longer be cleaned up automatically. Files already deleted stay deleted.`,
        confirmLabel: "Delete rule",
        busyLabel: "Deleting…",
        feature: "cloud-stash",
        onConfirm: async () => {
          await deleteDoc(doc(db, "cleanupRules", rule.id));
        },
      });
    });
  });

  const addBtn = state.root.querySelector("#cs-add-rule-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      state.addingRule = true;
      state.root.querySelector("#cs-rules").innerHTML = renderRules();
      attachBodyHandlers();
      state.root.querySelector("#cs-f-feature")?.focus();
    });
  }

  const cancelRuleBtn = state.root.querySelector("#cs-cancel-rule");
  if (cancelRuleBtn) {
    cancelRuleBtn.addEventListener("click", () => {
      state.addingRule = false;
      state.root.querySelector("#cs-rules").innerHTML = renderRules();
      attachBodyHandlers();
    });
  }

  const addForm = state.root.querySelector("#cs-add-rule-form");
  if (addForm) {
    const collectionInput = addForm.querySelector("#cs-f-collection");
    const matchFieldInput = addForm.querySelector("#cs-f-matchField");
    const featureInput = addForm.querySelector("#cs-f-feature");
    const valueField = addForm.querySelector("#cs-f-matchValue-field");
    let shownKnown = null;
    const syncRuleForm = () => {
      const target = RULE_TARGETS[collectionInput.value.trim()];
      addForm.querySelector("#cs-l-matchField").innerHTML = target
        ? Object.keys(target.matchFields).map((f) => `<option value="${escapeHtml(f)}"></option>`).join("")
        : "";
      addForm.querySelector("#cs-l-ageField").innerHTML = target
        ? target.ageFields.map((f) => `<option value="${escapeHtml(f)}"></option>`).join("")
        : "";
      if (target && !featureInput.value.trim()) featureInput.value = target.feature;
      // Swap free text <-> dropdown only when the known list changes, so
      // typing elsewhere never wipes a chosen value.
      const known = knownMatchValues(collectionInput.value, matchFieldInput.value);
      if (known !== shownKnown) {
        shownKnown = known;
        const current = addForm.querySelector("#cs-f-matchValue").value;
        valueField.innerHTML = `<label class="bt-label" for="cs-f-matchValue">Match value</label>${matchValueControl(collectionInput.value, matchFieldInput.value, current)}`;
      }
    };
    [collectionInput, matchFieldInput].forEach((el) => {
      el.addEventListener("input", syncRuleForm);
      el.addEventListener("change", syncRuleForm);
    });

    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(addForm).entries());
      const errorEl = state.root.querySelector("#cs-rule-error");
      try {
        await addDoc(collection(db, "cleanupRules"), {
          feature: data.feature.trim(),
          collection: data.collection.trim(),
          matchField: data.matchField.trim(),
          matchValue: knownMatchValues(data.collection, data.matchField) ? data.matchValue : data.matchValue.trim(),
          ageField: data.ageField.trim(),
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

function unsubscribeAll() {
  state.unsubs.forEach((unsub) => unsub());
  state.unsubs = [];
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
  const errorEl = state.root.querySelector("#cs-signin-error");
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

async function handleSignOut() {
  try {
    await signOut(auth);
    // onAuthStateChanged fires with user=null and watchAuthState() shows
    // the sign-in gate — there's no anonymous fallback for this feature.
  } catch (err) {
    console.error("Admin sign-out failed", err);
  }
}

function watchAuthState() {
  onAuthStateChanged(auth, async (user) => {
    unsubscribeAll();

    if (!user) {
      state.isAdmin = false;
      state.root.innerHTML = renderSignInGate();
      state.root.querySelector("#cs-signin").addEventListener("click", handleSignIn);
      return;
    }

    const isAdmin = await syncAdmin();
    state.isAdmin = isAdmin;

    if (!isAdmin) {
      state.root.innerHTML = renderSignInGate();
      const el = state.root.querySelector("#cs-signin-error");
      el.textContent = "That account isn't on the admin allowlist.";
      el.hidden = false;
      state.root.querySelector("#cs-signin").addEventListener("click", handleSignIn);
      return;
    }

    state.root.innerHTML = renderShell();
    initAdminMenu(state.root).sync();
    state.root.querySelector("#cs-admin-signout").addEventListener("click", handleSignOut);
    subscribeToData();
  });
}

// ---------- Init ----------

export async function initCloudStash() {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error(`Cloud Stash: no #${ROOT_ID} element found on the page.`);
    return;
  }
  state.root = root;
  root.classList.add("bt-root");

  await waitForReady();

  // MemberSpace's Admin plan only decides whether to show the sign-in
  // invite at all — see the file header note on why this isn't a security
  // boundary by itself.
  if (!hasActivePlan(PLANS.ADMIN)) {
    root.innerHTML = renderNotAdmin();
    return;
  }

  root.innerHTML = renderSignInGate();
  root.querySelector("#cs-signin").addEventListener("click", handleSignIn);
  watchAuthState();
}

initCloudStash();
