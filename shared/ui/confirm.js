// shared/ui/confirm.js — styled replacement for window.confirm() with a busy state.
import { openModal, modalHeader } from "./modal.js";
import { escapeHtml } from "./dom.js";

/**
 * confirmAction({ title, message, bodyHtml, cancelLabel, confirmLabel, busyLabel, danger, feature, onOpen, onConfirm })
 * bodyHtml (optional, trusted markup) goes under the message for a dialog that needs a choice or a preview; onOpen(modal) wires it,
 * and onConfirm(modal) can read it (Scream Planner's cancel dialog: reason chips and a preview).
 * onConfirm is async. While it runs, every control is disabled and the confirm
 * button shows a spinner + busyLabel, so a double-click can't fire twice.
 * If onConfirm throws, the error message is shown and the buttons re-enable.
 * Resolves true after a successful confirm, false on cancel.
 */
export function confirmAction({
  title = "Are you sure?",
  message = "",
  bodyHtml = "",
  cancelLabel = "Cancel",
  confirmLabel = "Delete",
  busyLabel = "Deleting…",
  danger = true,
  feature = "",
  onOpen,
  onConfirm = async () => {},
} = {}) {
  return new Promise((resolve) => {
    let done = false;
    const { modal, close, setDismissible } = openModal({
      feature,
      content:
        modalHeader(escapeHtml(title)) +
        (message ? `<p class="bt-section-text" style="font-size:var(--bt-text-base);color:var(--bt-text-muted)">${escapeHtml(message)}</p>` : "") +
        bodyHtml +
        `<p class="bt-error" hidden></p>` +
        `<div class="bt-modal-actions">` +
        `<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>${escapeHtml(cancelLabel)}</button>` +
        `<button type="button" class="bt-btn ${danger ? "bt-btn--danger" : "bt-btn--primary"}" data-bt-confirm>${escapeHtml(confirmLabel)}</button>` +
        `</div>`,
      onClose: () => { if (!done) resolve(false); },
    });

    onOpen?.(modal);
    const confirmBtn = modal.querySelector("[data-bt-confirm]");
    const errorEl = modal.querySelector(".bt-error");

    confirmBtn.addEventListener("click", async () => {
      errorEl.hidden = true;
      setDismissible(false);
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>${escapeHtml(busyLabel)}`;
      try {
        await onConfirm(modal);
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
