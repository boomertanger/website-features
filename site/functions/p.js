// site/functions/p.js — Traffic Pulse's same-origin endpoint /p (docs/specs/traffic-pulse.md §3A), a Cloudflare Pages Function (the Pages
// project's root directory is site/, so site/functions/ is its Functions folder; the Astro build itself stays static).
// The beacon (site/src/scripts/pulse/beacon.ts) sends a small batch here with navigator.sendBeacon; this forwards it to the pulseBeacon Cloud
// Function with the visitor's IP from CF-Connecting-IP (the server only ever hashes it with a daily salt and never stores it), the user agent
// and the hostname, plus the shared secret header x-pulse-key, and answers 204 straight away. pulseBeacon rejects anything without the key.
// Environment (Cloudflare Pages, per environment): PULSE_PROXY_KEY (secret; the same value as the Firebase secret of the same name).
// Optional: PULSE_BEACON_URL (default: the pulseBeacon function of the project this host belongs to).
const MAX = 8192;   // bytes, the same cap as pulseBeacon

export async function onRequestPost(context) {
  const { request, env } = context;
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX) return new Response(null, { status: 413 });
  const body = await request.text();
  if (!body || body.length > MAX) return new Response(null, { status: body ? 413 : 400 });
  if (!env.PULSE_PROXY_KEY) return new Response(null, { status: 204 });   // not set up yet: drop quietly
  const host = new URL(request.url).hostname;
  const project = host === "boomertanger.com" || host === "www.boomertanger.com" ? "boomertanger-prod" : "boomertanger-staging";
  const target = env.PULSE_BEACON_URL || `https://us-central1-${project}.cloudfunctions.net/pulseBeacon`;
  const send = fetch(target, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "x-pulse-key": env.PULSE_PROXY_KEY,
      "x-pulse-ip": request.headers.get("CF-Connecting-IP") || "",
      "x-pulse-ua": (request.headers.get("user-agent") || "").slice(0, 400),
      "x-pulse-host": host,
      "x-pulse-origin": request.headers.get("origin") || "",
    },
    body,
  }).catch(() => null);
  context.waitUntil(send);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export function onRequest() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
