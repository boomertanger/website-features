// shared/ui/confirm.js — styled replacement for window.confirm() with a busy state.
import { openModal, modalHeader } from "./modal.js";
import { escapeHtml } from "./dom.js";

/**
 * confirmAction({ title, message, confirmLabel, busyLabel, danger, feature, onConfirm })
 * onConfirm is async. While it runs, every control is disabled and the confirm
 * button shows a spinner + busyLabel, so a double-click can't fire twice.
 * If onConfirm throws, the error message is shown and the buttons re-enable.
 * Resolves true after a successful confirm, false on cancel.
 */
export function confirmAction({
  title = "Are you sure?",
  message = "",
  confirmLabel = "Delete",
  busyLabel = "Deleting…",
  danger = true,
  feature = "",
  onConfirm = async () => {},
} = {}) {
  return new Promise((resolve) => {
    let done = false;
    const { modal, close, setDismissible } = openModal({
      feature,
      content:
        modalHeader(escapeHtml(title)) +
        (message ? `<p class="bt-section-text" style="font-size:var(--bt-text-base);color:var(--bt-text-muted)">${escapeHtml(message)}</p>` : "") +
        `<p class="bt-error" hidden></p>` +
        `<div class="bt-modal-actions">` +
        `<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button>` +
        `<button type="button" class="bt-btn ${danger ? "bt-btn--danger" : "bt-btn--primary"}" data-bt-confirm>${escapeHtml(confirmLabel)}</button>` +
        `</div>`,
      onClose: () => { if (!done) resolve(false); },
    });

    const confirmBtn = modal.querySelector("[data-bt-confirm]");
    const errorEl = modal.querySelector(".bt-error");

    confirmBtn.addEventListener("click", async () => {
      errorEl.hidden = true;
      setDismissible(false);
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>${escapeHtml(busyLabel)}`;
      try {
        await onConfirm();
        done = true;
        setDismissible(true);
        close();
        resolve(true);
      } catch (err) {
        console.error(err);
        errorEl.textContent = (err && err.message) || "That didn't work. Try again.";
        errorEl.hidden = false;
        confirmBtn.disabled = false;
        confirmBtn.textContent = confirmLabel;
        setDismissible(true);
      }
    });
  });
}
