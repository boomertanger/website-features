// Hotline Boom's sending pieces, shared by /contact (contact.ts) and the Talk Back dialog (talkback.ts; docs/specs/talk-back.md §2, §4):
//   newRef()                  a fresh clientRef (contactSend's idempotency key); make a new one after each send
//   turnstileWidget(key)      one Cloudflare Turnstile widget (explicit render, interaction-only): mount(box), token() (waits up to 12 s), reset()
//                             after a failed send (a token is single use), remove() when its dialog closes
//   sendFailure(err, fallback) what went wrong, for the caller's own UI: limit (retryAt), line-off, a bad field (with the message), or an error message
//   limitWhen(retryAt)        "4:20 PM", or "Tuesday 9:14 AM" when it's most of a day away; "" when unknown
import { reasonOf, messageFor } from "../../lib/errors";

export function newRef() { return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9_-]/g, ""); }

/* ---------- Turnstile (explicit render; the token is single use, so the widget resets after each send) ---------- */
declare global { interface Window { turnstile?: { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id?: string): void; remove(id?: string): void } } }
let loading: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.onload = () => res(); s.onerror = () => { loading = null; rej(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return loading;
}

export interface TurnstileWidget { mount(box: HTMLElement | null | undefined): void; token(): Promise<string>; reset(): void; remove(): void; readonly id: string; readonly current: string; keep(token: string): void }
export function turnstileWidget(key: string | undefined, action = "contact"): TurnstileWidget {
  const ts = { id: "", token: "", waiters: [] as ((t: string) => void)[] };
  return {
    get id() { return ts.id; },
    get current() { return ts.token; },
    /** A redraw that moved the box keeps the token it already had. */
    keep(t: string) { ts.token = t; },
    mount(box) {
      if (!key || !box) return;
      ts.token = ""; ts.id = "";
      loadTurnstile().then(() => {
        if (!box.isConnected || !window.turnstile) return;
        ts.id = window.turnstile.render(box, {
          sitekey: key, theme: "dark", appearance: "interaction-only", action,
          callback: (t: string) => { ts.token = t; ts.waiters.splice(0).forEach((fn) => fn(t)); },
          "expired-callback": () => { ts.token = ""; },
          "error-callback": () => { ts.token = ""; return false; },
        });
      }, () => { /* blocked: the send gets "the check didn't pass" and can retry */ });
    },
    /** The current token, waiting up to 12 s for the widget to finish. */
    token() {
      if (ts.token) return Promise.resolve(ts.token);
      return new Promise((res) => { const fn = (t: string) => { clearTimeout(timer); res(t); }; const timer = setTimeout(() => { ts.waiters = ts.waiters.filter((x) => x !== fn); res(""); }, 12000); ts.waiters.push(fn); });
    },
    reset() { ts.token = ""; try { if (ts.id) window.turnstile?.reset(ts.id); } catch { /* gone */ } },
    remove() { try { if (ts.id) window.turnstile?.remove(ts.id); } catch { /* gone */ } ts.id = ""; ts.token = ""; },
  };
}

/* ---------- a failed contactSend, sorted for the caller ---------- */
export type SendFailure = { kind: "limit"; retryAt: number } | { kind: "line-off" } | { kind: "field"; field: string; message: string } | { kind: "error"; message: string };
export function sendFailure(err: unknown, fallback: string): SendFailure {
  const reason = reasonOf(err);
  const d = (err as { details?: { field?: string; retryAt?: number } }).details;
  if (reason === "rate-limited") return { kind: "limit", retryAt: Number(d?.retryAt) || 0 };
  if (reason === "line-off") return { kind: "line-off" };
  if (reason === "bad-input" && d?.field && d.field !== "line") return { kind: "field", field: d.field, message: messageFor(err) };
  return { kind: "error", message: messageFor(err, fallback) };
}
export function limitWhen(retryAt: number): string {
  const t = retryAt ? new Date(retryAt) : null;
  if (!t) return "";
  return t.getTime() - Date.now() > 20 * 3600e3 ? t.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" }) : t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
