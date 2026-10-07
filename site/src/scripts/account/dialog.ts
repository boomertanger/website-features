// Sign-in dialog (S2 "split with pitch", docs/design/mockups/accounts.html) and the
// signup steps for new members (docs/specs/accounts.md "Screens" 1-7). Loaded on
// demand by scripts/account/ui.ts the first time someone clicks a [data-signin]
// button, so the popup sign-in code never ships on a page by default.
//
// E1 (docs/design/mockups/email-flows.html): the dialog opens in a mode, a Join free
// | Sign in pill at the top. Join free buttons open "join", Log in opens "signin";
// switching keeps the typed email. Then link (sent) and forgot, and for new members
// birthday, under13, handle, terms. The same dialog stays open from the first click to the
// finished account.
import { openModal, CLOSE_ICON } from "../../../../shared/ui/modal.js";
import { escapeHtml } from "../../../../shared/ui/dom.js";
import {
  GoogleAuthProvider, browserPopupRedirectResolver, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendSignInLinkToEmail, sendPasswordResetEmail, signOut,
} from "firebase/auth";
import { auth } from "../../lib/firebase";
import { refresh, getAuthState, sendVerification, initialsOf, continueSettings } from "../../lib/auth";
import { call } from "../../lib/call";
import { messageFor, reasonOf } from "../../lib/errors";
import { startTwitch } from "../../lib/twitch";
import { createHandleChecker, cleanHandle, type HandleState } from "../../lib/handle-check";
import { wordmark, signInReasons, termsVersion } from "../../data/site.json";
import { UNDER13_KEY, EMAIL_FOR_LINK_KEY, RETURN_KEY } from "../../lib/auth-keys";
import { isProduction } from "../../lib/env.js";
import { getRef, clearRef } from "../../lib/referral";

export type Screen = "join" | "signin" | "link" | "forgot" | "birthday" | "under13" | "handle" | "terms";
export type Mode = "join" | "signin";

const RESEND_SECONDS = 30;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } },
};

/** Age on the same conservative rule as the server: the birthday is the LAST day of the month. */
function conservativeAge(year: number, month: number, now = new Date()) {
  const y = now.getUTCFullYear();
  return y - year - (now.getTime() < Date.UTC(y, month, 0, 23, 59, 59, 999) ? 1 : 0);
}

const mask = (email: string) => {
  const [user, domain = ""] = email.split("@");
  if (user.length <= 2) return `${user[0] ?? ""}•••@${domain}`;
  return `${user[0]}${"•".repeat(Math.min(6, user.length - 2))}${user[user.length - 1]}@${domain}`;
};

const head = (title: string, sub: string) =>
  `<div class="bt-modal-heading"><h2 class="bt-modal-title" id="bt-signin-title">${title}</h2><p class="bt-modal-subtitle">${sub}</p></div>`;
const steps = (n: number) =>
  `<div><div class="bt-steps-label">Step ${n} of 3</div><div class="bt-steps" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= n ? "is-on" : ""}"></i>`).join("")}</div></div>`;
const errBox = `<div class="bt-notice bt-notice--error" role="alert" data-err hidden></div>`;
const fine = `<p class="bt-fine">By joining you agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a>. You must be 13 or older.</p>`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const badEmail = () => Object.assign(new Error("bad email"), { code: "auth/invalid-email" });

interface Draft { email: string; month: number | null; year: number | null; handle: string; displayName: string; handleOk: boolean; terms: boolean; reminders: boolean }

let open: { go: (s: Screen) => void } | null = null;

/**
 * Opens the sign-in dialog. `title` replaces the Join tab's heading ("Join the club"),
 * e.g. "Join to enter the Arcade". `previewError` (non-production builds only, for the
 * live UI kit at /dev/ui-kit) shows that message in the first screen's error line.
 */
export function openSignIn({ screen, mode = "join", title, previewError }: { screen?: Screen; mode?: Mode; title?: string; previewError?: string } = {}) {
  const now = getAuthState();
  const start: Screen = screen ?? (now.status === "needsSignup" ? "birthday" : mode);
  if (open) return open.go(start);
  if (now.user && now.status !== "needsSignup" && !screen) { location.href = "/account"; return; }

  const draft: Draft = { email: store.get(EMAIL_FOR_LINK_KEY) || "", month: null, year: null, handle: "", displayName: "", handleOk: false, terms: false, reminders: false };
  const twitchLogin = now.account?.linked?.twitch?.login;
  if (twitchLogin) draft.handle = twitchLogin.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);

  const mascot = (document.getElementById("bt-mascot-tpl") as HTMLTemplateElement | null)?.innerHTML ?? "";
  const m = openModal({
    variant: "split",
    title: "Sign in",
    content: `<div class="bt-modal-art">
        <div class="bt-modal-splat" aria-hidden="true"><img src="/images/blood-splatter.webp" alt="" width="500" height="286" decoding="async" />${mascot}</div>
        <div><p class="bt-modal-wordmark">${escapeHtml(wordmark[0])}<span>${escapeHtml(wordmark[1])}</span></p>
        <ul class="bt-modal-reasons">${signInReasons.map((r) => `<li><span aria-hidden="true">${r.icon}</span>${escapeHtml(r.text)}</li>`).join("")}</ul></div>
      </div>
      <div class="bt-modal-body"><button type="button" class="bt-icon-btn bt-modal-x" data-bt-close aria-label="Close">${CLOSE_ICON}</button><div class="bt-stack" data-screen></div></div>`,
    onClose: () => { open = null; clearInterval(resendTimer); },
  });
  m.modal.setAttribute("aria-labelledby", "bt-signin-title");
  const body = m.modal.querySelector<HTMLElement>("[data-screen]")!;
  const $ = <T extends Element = HTMLElement>(s: string) => body.querySelector<T>(s);
  let resendTimer = 0;

  const showErr = (msg: string | null) => { const e = $("[data-err]"); if (!e) return; e.textContent = msg || ""; e.hidden = !msg; };
  /** For messages with an action inside (e.g. "Sign in instead"); only our own markup. */
  const showErrHtml = (html: string) => { const e = $("[data-err]"); if (!e) return; e.innerHTML = html; e.hidden = false; };
  const busy = (on: boolean) => {
    body.setAttribute("aria-busy", String(on));
    body.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("button, input, select").forEach((el) => {
      if (on) { el.dataset.wasDisabled = String(el.disabled); el.disabled = true; }
      else if (el.dataset.wasDisabled !== undefined) { el.disabled = el.dataset.wasDisabled === "true"; delete el.dataset.wasDisabled; }
    });
  };
  const run = async (fn: () => Promise<void>) => { showErr(null); busy(true); try { await fn(); } catch (err) { showErr(messageFor(err)); } finally { if (body.isConnected) busy(false); } };

  // ---- screens ----
  // The E1 pieces the Join and Sign in tabs share.
  const modeTabs = (mode: Mode) => `<div class="bt-pills bt-pills--mode" role="tablist" aria-label="Join or sign in">${(["join", "signin"] as Mode[]).map((k) =>
    `<button type="button" role="tab" data-mode="${k}" aria-selected="${k === mode}" tabindex="${k === mode ? 0 : -1}"${k === mode ? ' class="is-on"' : ""}>${k === "join" ? "Join free" : "Sign in"}</button>`).join("")}</div>`;
  const providers = `<div class="bt-providers bt-providers--row">
        <button type="button" class="bt-provider" data-act="google"><span class="bt-provider-icon bt-provider-icon--google" aria-hidden="true">G</span>Google</button>
        <button type="button" class="bt-provider" data-act="twitch"><span class="bt-provider-icon bt-provider-icon--twitch" aria-hidden="true">Tw</span>Twitch</button>
      </div>
      <div class="bt-notice" role="alert" data-blocked hidden>Your browser blocked the Google window. Allow pop-ups for this site, or try again:<br /><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-act="google">Try Google again</button></div>`;
  const emailField = () => `<div class="bt-field"><label class="bt-label" for="bt-si-email">Email</label><input class="bt-input" id="bt-si-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required value="${escapeHtml(draft.email)}" /></div>`;
  const passwordInput = (autocomplete: string, placeholder: string) =>
    `<div class="bt-password"><input class="bt-input" id="bt-si-pw" name="password" type="password" autocomplete="${autocomplete}"${placeholder ? ` placeholder="${placeholder}"` : ""} required /><button type="button" class="bt-password-toggle" data-pw-toggle aria-controls="bt-si-pw" aria-pressed="false" aria-label="Show password">Show</button></div>`;

  const SCREENS: Record<Screen, () => string> = {
    join: () => `${modeTabs("join")}${head(escapeHtml(title || "Join the club"), "Free, and it takes a minute.")}${providers}
      <div class="bt-or">or with email</div>
      <form class="bt-stack" data-form="join" novalidate>
        ${emailField()}
        <div class="bt-field"><label class="bt-label" for="bt-si-pw">Create a password</label>${passwordInput("new-password", "8+ characters")}</div>
        ${errBox}
        <button type="submit" class="bt-btn bt-btn--primary bt-btn--block">Create account</button>
      </form>${fine}`,
    signin: () => `${modeTabs("signin")}${head("Welcome back", "Sign in to your account.")}${providers}
      <div class="bt-or">or with email</div>
      <form class="bt-stack" data-form="signin" novalidate>
        ${emailField()}
        <div class="bt-field"><label class="bt-label" for="bt-si-pw">Password</label>${passwordInput("current-password", "")}
          <div class="bt-row-split"><button type="button" class="bt-link-btn" data-go="forgot">Forgot password?</button><button type="button" class="bt-link-btn" data-act="sendlink">Email me a link instead</button></div></div>
        ${errBox}
        <button type="submit" class="bt-btn bt-btn--primary bt-btn--block">Sign in</button>
      </form>
      <p class="bt-fine">New here? <button type="button" class="bt-link-btn" data-mode="join">Join free</button></p>`,
    link: () => `${head("Check your email", `We sent a sign-in link to ${escapeHtml(mask(draft.email))}.`)}
      <div class="bt-modal-icon" aria-hidden="true">✉️</div>
      <p class="bt-center bt-modal-subtitle">Open it on this device to sign in.</p>
      ${errBox}
      <div class="bt-row-center"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="resend" disabled>Resend in 0:${RESEND_SECONDS}</button><button type="button" class="bt-link-btn" data-go="signin">Use a password instead</button></div>`,
    forgot: () => `${head("Reset your password", "We'll email you a link to choose a new one.")}
      <form class="bt-stack" data-form="forgot" novalidate>
        <div class="bt-field"><label class="bt-label" for="bt-si-remail">Email</label><input class="bt-input" id="bt-si-remail" name="email" type="email" autocomplete="email" required value="${escapeHtml(draft.email)}" /></div>
        ${errBox}<div class="bt-notice bt-notice--ok" role="status" data-ok hidden></div>
        <button type="submit" class="bt-btn bt-btn--primary bt-btn--block">Send reset link</button>
      </form>
      <button type="button" class="bt-link-btn" data-go="signin">← Back to sign in</button>`,
    birthday: () => {
      const y = new Date().getFullYear();
      return `${head("When's your birthday?", "We ask everyone. It keeps the club safe and follows the law.")}${steps(1)}
      <div class="bt-bday">
        <div class="bt-field"><label class="bt-label" for="bt-su-month">Month</label><select class="bt-select" id="bt-su-month"><option value="">Month</option>${MONTHS.map((n, i) => `<option value="${i + 1}"${draft.month === i + 1 ? " selected" : ""}>${n}</option>`).join("")}</select></div>
        <div class="bt-field"><label class="bt-label" for="bt-su-year">Year</label><select class="bt-select" id="bt-su-year"><option value="">Year</option>${Array.from({ length: 101 }, (_, k) => y - k).map((v) => `<option${draft.year === v ? " selected" : ""}>${v}</option>`).join("")}</select></div>
      </div>
      <p class="bt-fine bt-fine--left">We only keep your birth month and year, privately. They're never shown on your profile.</p>
      ${errBox}<button type="button" class="bt-btn bt-btn--primary bt-btn--block" data-act="birthday">Continue</button>`;
    },
    under13: () => `${head("Not yet, sorry", "You need to be 13 or older to create an account.")}
      <div class="bt-modal-icon" aria-hidden="true">🦇</div>
      <p class="bt-center bt-modal-subtitle">You can still watch the streams, browse the site and play Tap the Splat. Come back when you're 13!</p>
      <button type="button" class="bt-btn bt-btn--secondary bt-btn--block" data-bt-close>Back to the site</button>
      <p class="bt-fine">Nothing you entered was saved.</p>`,
    handle: () => `${head("Pick your handle", "This is how the club sees you on the Boom Board and leaderboards.")}${steps(2)}
      <div class="bt-field"><label class="bt-label" for="bt-su-handle">Handle</label>
        <div class="bt-handle-input"><input class="bt-input" id="bt-su-handle" maxlength="20" autocomplete="off" autocapitalize="none" spellcheck="false" value="${escapeHtml(draft.handle)}" aria-describedby="bt-su-hstate" /></div>
        <div class="bt-field-state" id="bt-su-hstate" data-hstate aria-live="polite"></div></div>
      <div class="bt-field"><label class="bt-label" for="bt-su-name">Display name</label><input class="bt-input" id="bt-su-name" maxlength="30" autocomplete="nickname" placeholder="How your name shows" value="${escapeHtml(draft.displayName)}" /></div>
      <div class="bt-profile-preview" aria-hidden="true"><span class="bt-avatar-md" data-pv-av></span><div><b data-pv-name></b><small>@<span data-pv-handle></span></small></div></div>
      <p class="bt-fine bt-fine--left">You can change your handle once every 30 days.</p>
      ${errBox}<button type="button" class="bt-btn bt-btn--primary bt-btn--block" data-act="handle" disabled>Continue</button>`,
    terms: () => {
      const u = auth.currentUser;
      return `${head("One last thing", "Then you're in.")}${steps(3)}
      <label class="bt-check"><input type="checkbox" data-terms${draft.terms ? " checked" : ""} /><span>I agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a>.</span></label>
      <label class="bt-check"><input type="checkbox" data-reminders${draft.reminders ? " checked" : ""} /><span>Email me when a stream is about to start. (Optional. Off unless you tick it.)</span></label>
      ${errBox}<button type="button" class="bt-btn bt-btn--primary bt-btn--block" data-act="create"${draft.terms ? "" : " disabled"}>Create my account</button>
      ${u?.email && !u.emailVerified ? `<p class="bt-fine">We'll send a quick email to confirm it's really you.</p>` : ""}`;
    },
  };

  function go(screen: Screen) {
    // A browser that already hit the under-13 block can't simply retry.
    if (screen === "birthday" && store.get(UNDER13_KEY)) screen = "under13";
    if (screen === "under13") void abandon();
    clearInterval(resendTimer);
    body.innerHTML = SCREENS[screen]();
    wire(screen);
    const first = body.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?? body.querySelector<HTMLElement>("input:not([type=checkbox]), select, .bt-provider, button:not([disabled])");
    requestAnimationFrame(() => first?.focus());
  }

  // After any successful sign-in: new members go on to the signup steps.
  async function afterSignIn() {
    await refresh();
    const s = getAuthState();
    if (s.status === "needsSignup") go("birthday");
    else m.close();
  }

  // Under 13: nothing is kept. The half-made account (and anything tied to it) is
  // deleted on the server, and this browser is marked so the step can't be retried.
  async function abandon() {
    store.set(UNDER13_KEY, "1");
    if (!auth.currentUser) return;
    try { await call("abandonSignup"); } catch (err) { console.error(err); }
    await signOut(auth).catch(() => {});
    await refresh();
  }

  function startResendCooldown() {
    let left = RESEND_SECONDS;
    const btn = $<HTMLButtonElement>('[data-act="resend"]');
    if (!btn) return;
    btn.disabled = true;
    clearInterval(resendTimer);
    resendTimer = window.setInterval(() => {
      left -= 1;
      if (left <= 0) { clearInterval(resendTimer); btn.disabled = false; btn.textContent = "Resend link"; return; }
      btn.textContent = `Resend in 0:${String(left).padStart(2, "0")}`;
    }, 1000);
  }

  async function sendLink() {
    const email = draft.email.trim();
    if (!EMAIL_RE.test(email)) throw badEmail();
    await sendSignInLinkToEmail(auth, email, { url: `${location.origin}/auth/email-link`, handleCodeInApp: true });
    store.set(EMAIL_FOR_LINK_KEY, email);
    store.set(RETURN_KEY, location.pathname + location.search);
  }

  // ---- handle checks (live, debounced; the server has the final say) ----
  function drawPreview() {
    const name = draft.displayName.trim() || draft.handle || "Your name";
    const av = $("[data-pv-av]"), n = $("[data-pv-name]"), h = $("[data-pv-handle]");
    if (av) av.textContent = initialsOf({ displayName: draft.displayName.trim(), handle: draft.handle });
    if (n) n.textContent = name;
    if (h) h.textContent = draft.handle || "handle";
  }
  function setHandleState(kind: HandleState, html: string) {
    const el = $("[data-hstate]");
    if (!el) return;
    el.className = "bt-field-state" + (kind && kind !== "checking" ? ` bt-field-state--${kind}` : "");
    el.innerHTML = html;
    draft.handleOk = kind === "ok";
    const btn = $<HTMLButtonElement>('[data-act="handle"]');
    if (btn && body.getAttribute("aria-busy") !== "true") btn.disabled = !draft.handleOk;
  }
  const checkHandleSoon = (() => { const check = createHandleChecker(setHandleState); return () => check(draft.handle); })();

  // ---- wiring ----
  function wire(screen: Screen) {
    body.querySelectorAll<HTMLElement>("[data-go]").forEach((b) => b.addEventListener("click", () => {
      const email = $<HTMLInputElement>('input[type="email"]');
      if (email) draft.email = email.value.trim();
      go(b.dataset.go as Screen);
    }));

    if (screen === "join" || screen === "signin") {
      const emailIn = $<HTMLInputElement>("#bt-si-email")!, pwIn = $<HTMLInputElement>("#bt-si-pw")!;
      emailIn.addEventListener("input", () => { draft.email = emailIn.value.trim(); });

      // The pill: switching tabs keeps whatever email was typed.
      body.querySelectorAll<HTMLElement>("[data-mode]").forEach((btn) => btn.addEventListener("click", () => {
        draft.email = emailIn.value.trim();
        if (btn.dataset.mode !== screen) go(btn.dataset.mode as Mode);
      }));
      body.querySelector<HTMLElement>('[role="tablist"]')?.addEventListener("keydown", (ev) => {
        if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
        ev.preventDefault();
        draft.email = emailIn.value.trim();
        go(screen === "join" ? "signin" : "join");
      });

      $("[data-pw-toggle]")!.addEventListener("click", (ev) => {
        const t = ev.currentTarget as HTMLButtonElement, show = pwIn.type === "password";
        pwIn.type = show ? "text" : "password";
        t.textContent = show ? "Hide" : "Show";
        t.setAttribute("aria-pressed", String(show));
        t.setAttribute("aria-label", show ? "Hide password" : "Show password");
      });

      body.querySelectorAll('[data-act="google"]').forEach((b) => b.addEventListener("click", () => run(async () => {
        ($("[data-blocked]") as HTMLElement).hidden = true;
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        try {
          await signInWithPopup(auth, provider, browserPopupRedirectResolver);
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === "auth/popup-blocked") { ($("[data-blocked]") as HTMLElement).hidden = false; return; }
          if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
          throw err;
        }
        await afterSignIn();
      })));
      $('[data-act="twitch"]')!.addEventListener("click", () => {
        store.set(RETURN_KEY, location.pathname + location.search);
        startTwitch("signin");
      });

      $<HTMLFormElement>("[data-form]")!.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const email = emailIn.value.trim(), pw = pwIn.value;
        draft.email = email;
        if (screen === "join") {
          run(async () => {
            if (!EMAIL_RE.test(email)) throw badEmail();
            if (pw.length < 8) throw Object.assign(new Error("short"), { code: "auth/weak-password" });
            try {
              await createUserWithEmailAndPassword(auth, email, pw);
            } catch (err) {
              if ((err as { code?: string }).code !== "auth/email-already-in-use") throw err;
              // The only clear case: this email already has an account (password or not).
              showErrHtml(`You already have an account with this email. <button type="button" class="bt-link-btn" data-mode="signin">Sign in instead</button>, or use Google if that's how you joined.`);
              $('[data-err] [data-mode="signin"]')!.addEventListener("click", () => go("signin"));
              return;
            }
            await afterSignIn();   // new accounts go on to the signup steps
          });
        } else {
          run(async () => {
            if (!EMAIL_RE.test(email)) throw badEmail();
            if (!pw) throw Object.assign(new Error("Enter your password."), { code: "bt/msg" });
            await signInWithEmailAndPassword(auth, email, pw);
            await afterSignIn();
          });
        }
      });

      $('[data-act="sendlink"]')?.addEventListener("click", () => {
        draft.email = emailIn.value.trim();
        run(async () => { await sendLink(); go("link"); startResendCooldown(); });
      });
    }

    if (screen === "link") {
      startResendCooldown();
      $('[data-act="resend"]')!.addEventListener("click", () => run(async () => { await sendLink(); startResendCooldown(); }));
    }

    if (screen === "forgot") {
      $<HTMLFormElement>('[data-form="forgot"]')!.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const email = ($<HTMLInputElement>("#bt-si-remail")!).value.trim();
        draft.email = email;
        run(async () => {
          if (!EMAIL_RE.test(email)) throw badEmail();
          await sendPasswordResetEmail(auth, email, continueSettings("/account"));
          const ok = $("[data-ok]")!;
          ok.textContent = `If there's an account for ${email}, a reset link is on its way. Check your inbox.`;
          ok.hidden = false;
        });
      });
    }

    if (screen === "birthday") {
      $('[data-act="birthday"]')!.addEventListener("click", () => {
        const month = Number($<HTMLSelectElement>("#bt-su-month")!.value), year = Number($<HTMLSelectElement>("#bt-su-year")!.value);
        if (!month || !year) return showErr("Pick your birth month and year.");
        draft.month = month; draft.year = year;
        if (conservativeAge(year, month) < 13) return go("under13");
        go("handle");
      });
    }

    if (screen === "handle") {
      const hi = $<HTMLInputElement>("#bt-su-handle")!, ni = $<HTMLInputElement>("#bt-su-name")!;
      hi.addEventListener("input", () => {
        const clean = cleanHandle(hi.value);
        if (clean !== hi.value) hi.value = clean;
        draft.handle = clean; drawPreview(); checkHandleSoon();
      });
      ni.addEventListener("input", () => { draft.displayName = ni.value; drawPreview(); });
      $("[data-hstate]")!.addEventListener("click", (ev) => {
        const s = (ev.target as HTMLElement).closest<HTMLElement>("[data-suggest]");
        if (!s) return;
        hi.value = s.dataset.suggest!; draft.handle = hi.value; drawPreview(); checkHandleSoon(); hi.focus();
      });
      $('[data-act="handle"]')!.addEventListener("click", () => { if (draft.handleOk) go("terms"); });
      drawPreview();
      if (draft.handle) checkHandleSoon();
    }

    if (screen === "terms") {
      const t = $<HTMLInputElement>("[data-terms]")!, r = $<HTMLInputElement>("[data-reminders]")!, btn = $<HTMLButtonElement>('[data-act="create"]')!;
      t.addEventListener("change", () => { draft.terms = t.checked; btn.disabled = !t.checked; });
      r.addEventListener("change", () => { draft.reminders = r.checked; });
      btn.addEventListener("click", async () => {
        if (!draft.terms) return;
        m.setDismissible(false);
        showErr(null); busy(true);
        try {
          await call("completeSignup", {
            birthMonth: draft.month, birthYear: draft.year, handle: draft.handle,
            displayName: draft.displayName.trim(), termsVersion, reminders: draft.reminders,
            ...(getRef() ? { refHandle: getRef() } : {}),   // a /join/@handle link, kept 30 days (lib/referral.ts)
          });
          clearRef();   // the link was used (or ignored by the server: first link wins); don't carry it to another signup
          const u = auth.currentUser;
          if (u?.email && !u.emailVerified) await sendVerification().catch((err) => console.error(err));
          await refresh({ forceToken: true });
          m.setDismissible(true);
          m.close();
          return;
        } catch (err) {
          m.setDismissible(true);
          const reason = reasonOf(err);
          if (reason === "under13") { store.set(UNDER13_KEY, "1"); await refresh(); return go("under13"); }
          if (reason === "taken" || reason === "reserved" || reason === "invalid") {
            draft.handleOk = false;
            go("handle");
            return showErr(messageFor(err));
          }
          if (body.isConnected) { busy(false); showErr(messageFor(err)); }
        }
      });
    }
  }

  open = { go };
  go(start);
  if (previewError && !isProduction) showErr(previewError);
}
