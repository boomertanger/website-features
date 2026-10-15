// site/src/scripts/pulse/beacon.ts — the Traffic Pulse beacon (docs/specs/traffic-pulse.md §3A). Cookieless and first-party: it batches a few
// counts per page view and sends them with navigator.sendBeacon to the same-origin /p (site/functions/p.js, a Cloudflare Pages Function), which
// forwards them to the pulseBeacon function. Nothing here stores anything in the browser except the visitor's own opt-out flag, and nothing it
// sends names a person: no cookies, no IP (the proxy passes it to the server, which only hashes it with a salt that changes every day), no ad ids.
//   view     service (body data-service, from the manifests at build), path (no query or hash), section, signed in, live (body data-live),
//            device class, referrer domain, the ?ref= tag (read once, sent with the view, then removed from the address bar)
//   engaged  visible for 10 s or more, once per view
//   scroll   25 / 50 / 75 / 100 %, once each
//   cta      elements with data-pulse="<id>", plus Join opens ([data-signin]), Talk Back ([data-talkback], [data-talk]) and outbound links ("out:<domain>")
//   error    JS errors (up to 5 per view; the message trimmed to 120 characters, URLs cut down to their domain)
// A back/forward-cache restore counts as one new view. Not counted: localhost, ?as= previews, headless browsers and known bots, Global Privacy
// Control or Do Not Track, members who switched on "Don't count my visits" (users/{uid}.pulseOptOut), and outside production any host that
// isn't staging. Staff are marked (st: 1) and dropped on the server while Settings says so (on by default). ?pulse=debug (never in production)
// logs the batches to the console instead of sending them.
import { whenReady } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";

type Ev = Record<string, string | number | boolean | null>;
const ENDPOINT = "/p";
const MAX_ERRORS = 5;
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp|discordbot|telegram/i;

const qs = new URLSearchParams(location.search);
const debug = !isProduction && qs.get("pulse") === "debug";
const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
function skipReason(): string | null {
  const host = location.hostname;
  if (!debug && (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local"))) return "localhost";
  if (qs.has("as")) return "preview";
  if (isProduction && host !== "boomertanger.com" && host !== "www.boomertanger.com") return "host";
  if (!debug && (nav.webdriver || BOT.test(nav.userAgent || ""))) return "bot";
  if (nav.globalPrivacyControl === true || nav.doNotTrack === "1" || (window as unknown as { doNotTrack?: string }).doNotTrack === "1") return "gpc";
  try { if (localStorage.getItem("bt.pulse.off") === "1") return "optout"; } catch { /* storage blocked: fine */ }
  return null;
}

const body = document.body;
const service = body.dataset.service || "unassigned";
const path = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "") || "/";
const device = () => { const w = window.innerWidth; return w < 640 ? "phone" : w < 1024 ? "tablet" : "desktop"; };
const refDomain = () => { try { const r = document.referrer ? new URL(document.referrer).hostname : ""; return r && r !== location.hostname ? r.replace(/^www\./, "") : null; } catch { return null; } };

let queue: Ev[] = [];
let on = false, uid: string | null = null, signedIn = false, staff = false;
let timer = 0;
function flush() {
  clearTimeout(timer);
  if (!queue.length || !on) return;
  const batch = { v: 1, in: signedIn, st: staff ? 1 : 0, ...(uid ? { u: uid } : {}), ev: queue.splice(0, 30) };
  const json = JSON.stringify(batch);
  if (debug) { console.info("[pulse]", batch); return; }
  try {
    if (!nav.sendBeacon || !nav.sendBeacon(ENDPOINT, new Blob([json], { type: "text/plain" }))) void fetch(ENDPOINT, { method: "POST", body: json, keepalive: true, headers: { "content-type": "text/plain" } });
  } catch { /* never let counting break the page */ }
  if (queue.length) flush();
}
function push(e: Ev) {
  if (!on) return;
  queue.push({ s: service, p: path, ...e });
  if (queue.length >= 20) flush();
  else { clearTimeout(timer); timer = window.setTimeout(flush, 5000); }
}

// ---- one page view ----
let engagedSent = false, visibleMs = 0, visibleSince = document.visibilityState === "visible" ? performance.now() : 0, errors = 0;
const depths = new Set<number>();
function view(tag: string | null) {
  engagedSent = false; visibleMs = 0; errors = 0; depths.clear();
  visibleSince = document.visibilityState === "visible" ? performance.now() : 0;
  push({ e: "view", sec: body.dataset.pulseSection || null, live: body.dataset.live || "off", dev: device(), ref: refDomain(), tag });
}
function checkEngaged() {
  if (engagedSent || !on) return;
  const ms = visibleMs + (visibleSince ? performance.now() - visibleSince : 0);
  if (ms >= 10000) { engagedSent = true; push({ e: "engaged" }); }
}
function checkScroll() {
  const doc = document.documentElement, max = doc.scrollHeight - window.innerHeight;
  const pct = max <= 0 ? 100 : Math.min(100, ((window.scrollY || doc.scrollTop) / max) * 100);
  for (const d of [25, 50, 75, 100]) if (pct >= d - 0.5 && !depths.has(d)) { depths.add(d); push({ e: "scroll", d }); }
}
const cleanMsg = (m: unknown) => String(m ?? "").replace(/https?:\/\/([^/\s?#]+)[^\s]*/g, "$1").replace(/\s+/g, " ").trim().slice(0, 120);

export async function startPulse() {
  if (skipReason()) return;
  // ?ref= is read once and removed from the address bar
  const tag = qs.get("ref");
  if (tag) {
    qs.delete("ref");
    const q = qs.toString();
    try { history.replaceState(history.state, "", `${location.pathname}${q ? `?${q}` : ""}${location.hash}`); } catch { /* fine */ }
  }
  const s = await whenReady();
  const acct = s.account as (typeof s.account & { pulseOptOut?: boolean }) | null;
  if (acct?.pulseOptOut) { try { localStorage.setItem("bt.pulse.off", "1"); } catch { /* fine */ } return; }
  on = true;
  signedIn = !!s.user && (s.status === "verified" || s.status === "unverified");
  uid = signedIn ? s.user!.uid : null;
  staff = !!s.isAdmin || (s.roles || []).includes("mod");
  view(tag ? tag.slice(0, 40).toLowerCase().replace(/[^a-z0-9_-]/g, "") || null : null);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { if (visibleSince) { visibleMs += performance.now() - visibleSince; visibleSince = 0; } checkEngaged(); flush(); }
    else visibleSince = performance.now();
  });
  window.setInterval(checkEngaged, 2000);
  let ticking = false;
  window.addEventListener("scroll", () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; checkScroll(); }); }, { passive: true });
  checkScroll();
  window.addEventListener("pagehide", flush);
  window.addEventListener("pageshow", (e) => { if ((e as PageTransitionEvent).persisted) view(null); });
  document.addEventListener("click", (e) => {
    const t = e.target as Element | null;
    if (!t || !t.closest) return;
    const p = t.closest<HTMLElement>("[data-pulse]");
    if (p) { push({ e: "cta", id: (p.dataset.pulse || "").slice(0, 40) }); return; }
    if (t.closest("[data-signin]")) { push({ e: "cta", id: "join-open" }); return; }
    if (t.closest("[data-talkback], [data-talk]")) { push({ e: "cta", id: "talk-back" }); return; }
    const a = t.closest<HTMLAnchorElement>("a[href]");
    if (a) { try { const u = new URL(a.href, location.href); if (/^https?:$/.test(u.protocol) && u.hostname !== location.hostname) push({ e: "cta", id: `out:${u.hostname.replace(/^www\./, "")}`.slice(0, 60) }); } catch { /* fine */ } }
  }, { capture: true });
  const err = (m: unknown) => { if (errors >= MAX_ERRORS) return; errors++; push({ e: "error", m: cleanMsg(m) }); };
  window.addEventListener("error", (e) => err((e as ErrorEvent).message || "error"));
  window.addEventListener("unhandledrejection", (e) => err((e as PromiseRejectionEvent).reason instanceof Error ? (e as PromiseRejectionEvent).reason.message : "unhandled rejection"));
  // the opt-out switch on /account turns counting off at once
  window.addEventListener("bt:pulse-optout", (e) => { if ((e as CustomEvent<boolean>).detail) { queue = []; on = false; } });
}
