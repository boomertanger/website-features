// shared/ui/composer.js — comment box whose post button wakes up when there's text.
import { escapeHtml } from "./dom.js";

/**
 * composerHtml({ placeholder, buttonLabel, maxLength })
 * Markup for a .bt-composer. Render it, then call initComposer() on it.
 */
export function composerHtml({ placeholder = "Add a comment…", buttonLabel = "Post comment", maxLength = 1000, id = "" } = {}) {
  const tid = id || "bt-composer-" + Math.random().toString(36).slice(2, 8);
  return `<div class="bt-composer" data-max="${maxLength}">
    <textarea class="bt-textarea" id="${tid}" aria-label="Comment" placeholder="${escapeHtml(placeholder)}" maxlength="${maxLength}"></textarea>
    <p class="bt-error" hidden></p>
    <div class="bt-composer-actions">
      <span class="bt-composer-count" aria-live="polite">0 / ${maxLength}</span>
      <button type="button" class="bt-btn bt-btn--primary" disabled>${escapeHtml(buttonLabel)}</button>
    </div>
  </div>`;
}

/**
 * initComposer(el, { onSubmit, busyLabel })
 * el: the .bt-composer element. onSubmit(text) is async; while it runs the
 * box and button are locked and the button reads busyLabel. On success the
 * box clears; on error the message shows and the text is kept.
 * Ctrl/Cmd+Enter submits.
 */
export function initComposer(el, { onSubmit = async () => {}, busyLabel = "Posting…" } = {}) {
  const ta = el.querySelector("textarea");
  const btn = el.querySelector(".bt-btn");
  const count = el.querySelector(".bt-composer-count");
  const err = el.querySelector(".bt-error");
  const max = Number(el.dataset.max) || 1000;
  const label = btn.textContent;
  let busy = false;

  function refresh() {
    const len = ta.value.length;
    count.textContent = `${len} / ${max}`;
    count.classList.toggle("is-over", len > max);
    btn.disabled = busy || !ta.value.trim() || len > max;
  }

  async function submit() {
    if (btn.disabled) return;
    busy = true;
    err.hidden = true;
    ta.disabled = true;
    btn.disabled = true;
    btn.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>${escapeHtml(busyLabel)}`;
    try {
      await onSubmit(ta.value.trim());
      ta.value = "";
    } catch (e) {
      console.error(e);
      err.textContent = (e && e.message) || "Couldn't post your comment. Try again.";
      err.hidden = false;
    } finally {
      busy = false;
      ta.disabled = false;
      btn.textContent = label;
      refresh();
    }
  }

  ta.addEventListener("input", refresh);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  });
  btn.addEventListener("click", submit);
  refresh();
  return { focus: () => ta.focus(), reset: () => { ta.value = ""; refresh(); } };
}
