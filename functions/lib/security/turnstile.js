// Cloudflare Turnstile, the shared server check (first used by Hotline Boom, docs/specs/hotline-boom.md §6). The site renders the widget with
// the PUBLIC site key (site/src/data/site.json); the callable sends the token it got, and this verifies it with the SECRET key
// (Secret Manager TURNSTILE_SECRET_KEY, bound by the callable that uses it). Never logs the token or the secret.
//
//   verifyTurnstile({ token, secret, ip, fetchFn, timeoutMs }) -> { ok: true, ... } | { ok: false, reason: "missing" | "invalid" | "timeout" | "error", codes, ... }
// Every result also carries the diagnostics a caller may log: called (siteverify was reached), hostname and action (as Cloudflare
// returned them) and tokenLength. No hostname or action is enforced here.
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function verifyTurnstile({ token, secret, ip = null, fetchFn = (...a) => fetch(...a), timeoutMs = 8000 } = {}) {
  const tokenLength = typeof token === "string" ? token.length : 0;
  const diag = { called: false, hostname: null, action: null, tokenLength };
  if (typeof token !== "string" || !token || token.length > 2048) return { ok: false, reason: "missing", codes: [], ...diag };
  if (typeof secret !== "string" || !secret) return { ok: false, reason: "error", codes: ["no-secret"], ...diag };
  const body = new URLSearchParams({ secret, response: token });
  if (ip && typeof ip === "string") body.set("remoteip", ip);
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    diag.called = true;
    const res = await fetchFn(SITEVERIFY, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, signal: ctl ? ctl.signal : undefined });
    const data = await res.json().catch(() => ({}));
    diag.hostname = data && typeof data.hostname === "string" ? data.hostname.slice(0, 100) : null;
    diag.action = data && typeof data.action === "string" ? data.action.slice(0, 50) : null;
    if (data && data.success === true) return { ok: true, codes: [], ...diag };
    return { ok: false, reason: "invalid", codes: Array.isArray(data && data["error-codes"]) ? data["error-codes"].slice(0, 5) : [], status: res.status, ...diag };
  } catch (err) {
    return { ok: false, reason: err && err.name === "AbortError" ? "timeout" : "error", codes: [], error: String((err && err.message) || err).slice(0, 120), ...diag };
  } finally { if (t) clearTimeout(t); }
}

module.exports = { verifyTurnstile, SITEVERIFY };
