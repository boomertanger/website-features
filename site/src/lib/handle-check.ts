// Live handle checks for the signup step and the account page's Change handle:
// shape first (instant), then the checkHandle callable after a short pause. The
// server has the final say again when the handle is saved.
import { call } from "./call";
import { messageFor } from "./errors";
import { escapeHtml } from "../../../shared/ui/dom.js";

export type HandleState = "ok" | "bad" | "checking" | "";

/** A handle as typed, cleaned the way the server will clean it. */
export const cleanHandle = (raw: string) => raw.replace(/^@/, "").toLowerCase();

/**
 * onState(kind, html): html may contain a [data-suggest] button with the
 * suggested handle in data-suggest.
 */
export function createHandleChecker(onState: (kind: HandleState, html: string) => void, delay = 350) {
  let seq = 0, timer = 0;
  return function check(handle: string) {
    clearTimeout(timer);
    const mine = ++seq;
    if (!handle) return onState("", "");
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) return onState("bad", "3 to 20 letters, numbers or underscores");
    onState("checking", "Checking…");
    timer = window.setTimeout(async () => {
      try {
        const r = await call<{ status: string; suggestion?: string }>("checkHandle", { handle });
        if (mine !== seq) return;
        const h = escapeHtml(handle);
        if (r.status === "available") onState("ok", `✓ @${h} is available`);
        else if (r.status === "taken") {
          const s = r.suggestion ? escapeHtml(r.suggestion) : "";
          onState("bad", `✕ @${h} is taken.${s ? ` <button type="button" class="bt-link-btn" data-suggest="${s}">Try @${s}?</button>` : ""}`);
        } else if (r.status === "reserved") onState("bad", "✕ That handle is reserved");
        else onState("bad", "3 to 20 letters, numbers or underscores");
      } catch (err) {
        if (mine === seq) onState("bad", escapeHtml(messageFor(err, "Couldn't check that handle. Try again.")));
      }
    }, delay);
  };
}
