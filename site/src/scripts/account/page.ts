// /account (A2 tabs): shows the right section for the auth state and drives the
// Profile, Linked accounts, Sign-in methods and Privacy tabs. Every change goes
// through a callable (or Firebase Auth itself for sign-in methods); the page then
// re-reads the account (lib/auth.ts refresh()). Download and delete are milestone 2b.
import {
  GoogleAuthProvider, EmailAuthProvider, browserPopupRedirectResolver,
  linkWithPopup, linkWithCredential, signOut,
} from "firebase/auth";
import { auth } from "../../lib/firebase";
import { onAuth, refresh, sendVerification, getAuthState, type AuthState } from "../../lib/auth";
import { call } from "../../lib/call";
import { messageFor, reasonOf } from "../../lib/errors";
import { startTwitch } from "../../lib/twitch";
import { createHandleChecker, cleanHandle } from "../../lib/handle-check";
import { confirmAction } from "../../../../shared/ui/confirm.js";

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)];
const HANDLE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const fmtDate = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, opts);

// ---- messages at the top of the panes ----
function say(kind: "ok" | "err", text: string | null) {
  const ok = $("[data-page-ok]")!, err = $("[data-page-err]")!;
  ok.hidden = err.hidden = true;
  if (!text) return;
  const el = kind === "ok" ? ok : err;
  el.textContent = text;
  el.hidden = false;
  el.scrollIntoView({ block: "nearest" });
}
async function act(btn: HTMLButtonElement | null, fn: () => Promise<void>) {
  say("ok", null);
  if (btn) btn.disabled = true;
  try { await fn(); } catch (err) { say("err", messageFor(err)); } finally { if (btn) btn.disabled = false; }
}

// ---- which section shows ----
function showFor(s: AuthState) {
  const which = s.status === "loading" ? "" : s.status === "signedOut" ? "signedOut" : s.status === "needsSignup" ? "needsSignup" : "member";
  $$("[data-acct-when]").forEach((el) => { el.hidden = el.dataset.acctWhen !== which; });
}

// ---- tabs (hash-driven; #your-data opens Your data) ----
const TAB_IDS = $$("[data-tab]").map((t) => t.dataset.tab!);
function selectTab(id: string, focus = false) {
  if (id === "your-data") id = "data";
  if (!TAB_IDS.includes(id)) id = "profile";
  $$<HTMLAnchorElement>("[data-tab]").forEach((t) => {
    const on = t.dataset.tab === id;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    if (on) { t.scrollIntoView({ block: "nearest", inline: "nearest" }); if (focus) t.focus(); }
  });
  $$(".bt-account-pane").forEach((p) => { p.hidden = p.id !== `pane-${id}`; });
}
$$<HTMLAnchorElement>("[data-tab]").forEach((t) => {
  t.addEventListener("click", (ev) => {
    ev.preventDefault();
    history.replaceState(null, "", `#${t.dataset.tab}`);
    selectTab(t.dataset.tab!);
  });
  t.addEventListener("keydown", (ev) => {
    const i = TAB_IDS.indexOf(t.dataset.tab!);
    const next = ev.key === "ArrowRight" || ev.key === "ArrowDown" ? i + 1 : ev.key === "ArrowLeft" || ev.key === "ArrowUp" ? i - 1 : null;
    if (next === null) return;
    ev.preventDefault();
    const id = TAB_IDS[(next + TAB_IDS.length) % TAB_IDS.length];
    history.replaceState(null, "", `#${id}`);
    selectTab(id, true);
  });
});
window.addEventListener("hashchange", () => selectTab(location.hash.slice(1)));
selectTab(location.hash.slice(1));
// In-page links to a tab (e.g. "Add an email" -> #signin).
document.addEventListener("click", (ev) => {
  const a = (ev.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
  if (!a || a.matches("[data-tab]")) return;
  const id = a.getAttribute("href")!.slice(1);
  if (TAB_IDS.includes(id)) { ev.preventDefault(); history.replaceState(null, "", `#${id}`); selectTab(id); }
});

// Back from the Twitch linking round trip (/auth/twitch/callback).
{
  const q = new URLSearchParams(location.search);
  if (q.has("linked") || q.has("linkError")) {
    if (q.get("linked") === "twitch") say("ok", "Twitch is linked.");
    else if (q.get("linkError")) say("err", q.get("linkError"));
    history.replaceState(null, "", location.pathname + location.hash);
  }
}

// ---- fill the panes ----
function render(s: AuthState) {
  showFor(s);
  if (!s.user || !s.profile || (s.status !== "verified" && s.status !== "unverified")) return;
  const { user, profile, account } = s;
  const joined = profile.joinedAt?.toDate?.();
  $("[data-joined]")!.textContent = joined ? `joined ${fmtDate(joined, { month: "short", year: "numeric" })}` : "";

  const last = account?.handleChangedAt?.toDate?.()?.getTime() ?? 0;
  const nextAt = last + HANDLE_COOLDOWN_MS;
  const canChange = Date.now() >= nextAt;
  $("[data-handle-when]")!.textContent = canChange ? "you can change it once every 30 days" : `you can change it again on ${fmtDate(new Date(nextAt), { month: "short", day: "numeric" })}`;
  $<HTMLButtonElement>('[data-edit="handle"]')!.disabled = !canChange;

  $("[data-email-line]")!.textContent = user.email ? `${user.email} · ${user.emailVerified ? "verified" : "not verified yet"}` : "No email on your account yet";
  $("[data-email-ok]")!.hidden = !(user.email && user.emailVerified);
  $("[data-verify-now]")!.hidden = !(user.email && !user.emailVerified);
  $("[data-add-email]")!.hidden = !!user.email;

  const twitch = account?.linked?.twitch;
  $("[data-twitch-line]")!.textContent = twitch ? twitch.login : "Not linked";
  $("[data-twitch-link]")!.hidden = !!twitch;
  $("[data-twitch-unlink]")!.hidden = !twitch;
  $("[data-twitch-signin-line]")!.textContent = twitch ? `${twitch.login} · also works for signing in` : "Link Twitch under Linked accounts to sign in with it";
  $("[data-twitch-ok]")!.hidden = !twitch;

  const google = user.providerData.find((p) => p.providerId === "google.com");
  $("[data-google-line]")!.textContent = google ? (google.email || "Connected") : "Not connected";
  $("[data-google-ok]")!.hidden = !google;
  $("[data-google-add]")!.hidden = !!google;

  const hasPassword = user.providerData.some((p) => p.providerId === "password");
  $("[data-password-line]")!.textContent = hasPassword ? (user.email || "Connected") : "Not set up";
  $("[data-password-ok]")!.hidden = !hasPassword;
  $<HTMLButtonElement>('[data-edit="password"]')!.hidden = hasPassword;
  $<HTMLInputElement>("[data-pw-email]")!.hidden = !!user.email;

  const prefs = account?.prefs || {};
  $$<HTMLButtonElement>("[data-pref]").forEach((b) => {
    if (!b.dataset.busy) b.setAttribute("aria-checked", String(!!prefs[b.dataset.pref as keyof typeof prefs]));
  });
}
onAuth(render);

// ---- inline edit forms (display name, handle, password) ----
function openForm(name: string, open: boolean) {
  const form = $<HTMLFormElement>(`[data-form="${name}"]`)!, btn = $<HTMLButtonElement>(`[data-edit="${name}"]`)!;
  form.hidden = !open; btn.hidden = open;
  if (open) {
    const s = getAuthState();
    if (name === "name") $<HTMLInputElement>("#acct-name")!.value = s.profile?.displayName || "";
    if (name === "handle") { $<HTMLInputElement>("#acct-handle")!.value = s.profile?.handle || ""; $("[data-hstate]")!.innerHTML = ""; }
    form.querySelector<HTMLInputElement>("input:not([hidden])")?.focus();
  } else {
    render(getAuthState());
  }
}
$$<HTMLButtonElement>("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit!, true)));
$$("[data-form]").forEach((f) => f.querySelector("[data-cancel]")?.addEventListener("click", () => openForm(f.dataset.form!, false)));

$<HTMLFormElement>('[data-form="name"]')!.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const btn = (ev.currentTarget as HTMLFormElement).querySelector<HTMLButtonElement>('[type="submit"]');
  act(btn, async () => {
    await call("updateProfile", { displayName: $<HTMLInputElement>("#acct-name")!.value });
    await refresh();
    openForm("name", false);
    say("ok", "Profile saved.");
  });
});

// Change handle: the same live checks as signup.
{
  const form = $<HTMLFormElement>('[data-form="handle"]')!, input = $<HTMLInputElement>("#acct-handle")!;
  const save = form.querySelector<HTMLButtonElement>('[type="submit"]')!, state = $("[data-hstate]", form)!;
  const check = createHandleChecker((kind, html) => {
    const same = cleanHandle(input.value) === getAuthState().profile?.handle;
    state.className = "bt-field-state" + (kind && kind !== "checking" ? ` bt-field-state--${kind}` : "");
    state.innerHTML = same ? "That's your handle now" : html;
    save.disabled = same || kind !== "ok";
  });
  input.addEventListener("input", () => { const c = cleanHandle(input.value); if (c !== input.value) input.value = c; check(c); });
  state.addEventListener("click", (ev) => {
    const s = (ev.target as HTMLElement).closest<HTMLElement>("[data-suggest]");
    if (s) { input.value = s.dataset.suggest!; check(input.value); input.focus(); }
  });
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    act(save, async () => {
      try {
        await call("changeHandle", { handle: cleanHandle(input.value) });
      } catch (err) {
        if (reasonOf(err) === "cooldown") {
          const next = (err as { details?: { nextAt?: number } }).details?.nextAt;
          throw Object.assign(new Error(next ? `You can change your handle again on ${fmtDate(new Date(next), { month: "short", day: "numeric" })}.` : "You can change your handle once every 30 days."), { code: "bt/msg" });
        }
        throw err;
      }
      await refresh();
      openForm("handle", false);
      say("ok", "Handle changed.");
    });
  });
}

// Add a password (to a Google or Twitch account). Twitch accounts without an
// email add one here too, and it gets a verification email.
$<HTMLFormElement>('[data-form="password"]')!.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const form = ev.currentTarget as HTMLFormElement, btn = form.querySelector<HTMLButtonElement>('[type="submit"]');
  act(btn, async () => {
    const user = auth.currentUser!;
    const email = user.email || $<HTMLInputElement>("[data-pw-email]")!.value.trim();
    const pw = $<HTMLInputElement>("#acct-pw")!.value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error("bad"), { code: "auth/invalid-email" });
    if (pw.length < 8) throw Object.assign(new Error("bad"), { code: "auth/weak-password" });
    await linkWithCredential(user, EmailAuthProvider.credential(email, pw));
    await user.reload();
    if (!user.emailVerified) await sendVerification().catch((err) => console.error(err));
    await refresh({ forceToken: true });
    form.reset();
    openForm("password", false);
    say("ok", user.emailVerified ? "Password added." : "Password added. Check your inbox to verify your email.");
  });
});

// ---- buttons ----
$<HTMLButtonElement>("[data-verify-now]")!.addEventListener("click", (ev) => act(ev.currentTarget as HTMLButtonElement, async () => {
  await sendVerification();
  say("ok", "Sent. Check your inbox (and spam) for the link.");
}));

$<HTMLButtonElement>("[data-google-add]")!.addEventListener("click", (ev) => act(ev.currentTarget as HTMLButtonElement, async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await linkWithPopup(auth.currentUser!, provider, browserPopupRedirectResolver);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    if (code === "auth/popup-blocked") throw Object.assign(new Error("Your browser blocked the Google window. Allow pop-ups for this site and press Add again."), { code: "bt/msg" });
    throw err;
  }
  await auth.currentUser!.reload();
  await refresh({ forceToken: true });
  say("ok", "Google added. You can sign in with it now.");
}));

$<HTMLButtonElement>("[data-twitch-link]")!.addEventListener("click", () => startTwitch("link", "/account#linked"));

$<HTMLButtonElement>("[data-twitch-unlink]")!.addEventListener("click", () => {
  const login = getAuthState().account?.linked?.twitch?.login || "Twitch";
  void confirmAction({
    title: "Unlink Twitch?",
    message: `${login} will no longer count as you here, and you won't be able to sign in with it. You can link it again any time.`,
    confirmLabel: "Unlink",
    busyLabel: "Unlinking…",
    onConfirm: async () => {
      try { await call("unlinkPlatform", { platform: "twitch" }); } catch (err) { throw new Error(messageFor(err)); }
      await refresh();
      say("ok", "Twitch unlinked.");
    },
  });
});

$<HTMLButtonElement>("[data-signout-all]")!.addEventListener("click", () => {
  void confirmAction({
    title: "Sign out everywhere?",
    message: "This signs you out here now, and on your other devices within the hour.",
    confirmLabel: "Sign out everywhere",
    busyLabel: "Signing out…",
    onConfirm: async () => {
      try { await call("signOutEverywhere"); } catch (err) { throw new Error(messageFor(err)); }
      await signOut(auth);
      location.href = "/";
    },
  });
});

// Privacy switches (all off by default): each flips at once, then saves.
$$<HTMLButtonElement>("[data-pref]").forEach((b) => b.addEventListener("click", async () => {
  if (b.dataset.busy) return;
  const key = b.dataset.pref!, on = b.getAttribute("aria-checked") !== "true";
  b.dataset.busy = "1";
  b.setAttribute("aria-checked", String(on));
  say("ok", null);
  try {
    const r = await call<{ photo?: boolean }>("updatePrefs", { [key]: on });
    delete b.dataset.busy;
    await refresh();
    if (key === "useProviderPhoto" && on && !r.photo) say("ok", "Saved. Your sign-in doesn't have a photo, so your initials stay.");
  } catch (err) {
    delete b.dataset.busy;
    b.setAttribute("aria-checked", String(!on));
    say("err", messageFor(err));
  }
}));
