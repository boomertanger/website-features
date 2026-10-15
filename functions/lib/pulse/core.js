// Traffic Pulse core (docs/specs/traffic-pulse.md §3, §4, §5, §6): pure functions, no Firestore. lib/pulse/index.js feeds them documents and
// writes what they return; scripts/check-pulse.js runs them. Dates are YYYY-MM-DD in America/Los_Angeles.
//
//   laParts(ms)                 { day, hh, mm, month, weekday } in Los Angeles
//   cleanBatch(raw)             the beacon's JSON → a safe batch ({ in, st, u, ev[] }) or null; strips anything unexpected, caps sizes
//   isBot(ua)                   known bots and headless browsers
//   hostAllowed(host, staging)  production: boomertanger.com only; staging: the staging site and Pages previews
//   tally(batches)              buffer batches → the increments for days/{date}, services/{id}/days/{date}, paths/{hash}/days/{date},
//                               sources/{date} (pure: plain numbers, index.js turns them into FieldValue.increment)
//   vitals(services, ctx)       28-day sums per service → Reach, Engagement, Health, Love and the Pulse score (0–100), the focus group
//   moves(scored, ctx)          up to 5 next best moves, ranked by traffic × size of the gap (plain rules, no AI)
//   usual(values)               the median of the same weekday over the last 4 weeks (the alert baseline)
//   goalPace(goal, now, dayOfMonth, daysInMonth)  { fraction, expected, state: ahead | on | behind }
//   pathHash(path)              a short stable id for a path (paths/{hash})
const crypto = require("crypto");

const TZ = "America/Los_Angeles";
const fmtParts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
function laParts(ms) {
  const p = Object.fromEntries(fmtParts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  return { day, hh: p.hour === "24" ? "00" : p.hour, mm: p.minute, month: day.slice(0, 7), weekday: p.weekday };
}
const pathHash = (p) => crypto.createHash("sha1").update(String(p)).digest("hex").slice(0, 16);

// ---------------------------------------------------------------------------------------------- the beacon
const EVENTS = new Set(["view", "engaged", "scroll", "cta", "error"]);
const BOT = /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp|discordbot|telegram|curl|wget|python-requests|httpclient|go-http/i;
const isBot = (ua) => !ua || BOT.test(ua);
function hostAllowed(host, staging) {
  const h = String(host || "").toLowerCase();
  if (!staging) return h === "boomertanger.com" || h === "www.boomertanger.com";
  return h === "staging.boomertanger.com" || h.endsWith(".pages.dev");
}
const str = (v, max, re) => { if (typeof v !== "string") return null; const s = v.trim().slice(0, max); return re && !re.test(s) ? null : s || null; };
const SERVICE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ID = /^[a-z0-9][a-z0-9_.:-]{0,59}$/;
function cleanEvent(e) {
  if (!e || typeof e !== "object" || !EVENTS.has(e.e)) return null;
  const path = str(e.p, 200, /^\/[^\s?#]*$/);
  const out = { e: e.e, s: str(e.s, 64, SERVICE) || "unassigned", p: path || "/" };
  if (e.e === "view") {
    out.live = ["off", "public", "backstage"].includes(e.live) ? e.live : "off";
    out.dev = ["phone", "tablet", "desktop"].includes(e.dev) ? e.dev : "desktop";
    out.ref = str(e.ref, 80, /^[a-z0-9.-]+$/i) ? e.ref.toLowerCase().slice(0, 80) : null;
    out.tag = str(e.tag, 40, /^[a-z0-9_-]+$/) || null;
    out.sec = str(e.sec, 40, /^[a-z0-9_-]+$/i) || null;
  } else if (e.e === "scroll") {
    if (![25, 50, 75, 100].includes(e.d)) return null;
    out.d = e.d;
  } else if (e.e === "cta") {
    const id = str(typeof e.id === "string" ? e.id.toLowerCase() : e.id, 60, ID);
    if (!id) return null;
    out.id = id.toLowerCase();
  } else if (e.e === "error") {
    out.m = String(e.m || "error").replace(/https?:\/\/([^/\s?#]+)[^\s]*/g, "$1").replace(/\s+/g, " ").trim().slice(0, 120) || "error";
  }
  return out;
}
function cleanBatch(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.ev)) return null;
  const ev = raw.ev.slice(0, 30).map(cleanEvent).filter(Boolean);
  if (!ev.length) return null;
  const u = typeof raw.u === "string" && /^[A-Za-z0-9]{10,64}$/.test(raw.u) ? raw.u : null;
  return { in: raw.in === true, st: raw.st === 1 || raw.st === true, u, ev };
}

// ---------------------------------------------------------------------------------------------- the rollup
const add = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const keyOk = (k) => String(k).replace(/[./\[\]*`~]/g, "_").slice(0, 80);
const PLATFORM_REFS = { "twitch.tv": "twitch", "m.twitch.tv": "twitch", "youtube.com": "youtube", "m.youtube.com": "youtube", "youtu.be": "youtube", "tiktok.com": "tiktok", "vm.tiktok.com": "tiktok" };
/**
 * Buffer batches ({ day, hh, mm, ev: [...] }, each view already flagged by pulseBeacon: uv = first view today site-wide, us = first today on this
 * service, um = first member visit today, mr = a member who also came in the previous 7 days) → increments, keyed by document.
 */
function tally(batches) {
  const days = {}, services = {}, paths = {}, sources = {};
  const D = (day) => (days[day] ||= { views: 0, uniques: 0, engaged: 0, errors: 0, ctas: {}, scroll: {}, devices: {}, hours: {}, live: { views: 0 }, signedIn: 0, members: 0, memberReturns: 0, joinOpens: 0, liveMinutes: {}, hourRefs: {} });
  const S = (id, day) => ((services[id] ||= {})[day] ||= { views: 0, uniques: 0, engaged: 0, errors: 0, ctas: {}, scroll: {}, hours: {}, live: 0, errMsgs: {} });
  const P = (p, s, day) => { const h = pathHash(p); return ((paths[h] ||= {})[day] ||= { path: p, service: s, views: 0, engaged: 0 }); };
  const R = (day) => (sources[day] ||= { refs: {}, tags: {}, platforms: {} });
  for (const b of batches) {
    const day = b.day, d = D(day);
    for (const e of b.ev || []) {
      const s = S(e.s, day);
      if (e.e === "view") {
        d.views++; s.views++; P(e.p, e.s, day).views++;
        add(d.hours, b.hh); add(s.hours, b.hh);
        add(d.devices, e.dev || "desktop");
        if (e.uv) d.uniques++;
        if (e.us) s.uniques++;
        if (b.in) d.signedIn++;
        if (e.um) d.members++;
        if (e.mr) d.memberReturns++;
        if (e.live && e.live !== "off") { d.live.views++; s.live++; add(d.liveMinutes, `${b.hh}${b.mm || "00"}`); }
        if (e.ref) { const r = R(day); add(r.refs, keyOk(e.ref)); const pf = PLATFORM_REFS[e.ref.replace(/^www\./, "")]; if (pf) { add(r.platforms, pf); add((d.hourRefs[b.hh] ||= {}), pf); } }
        if (e.tag) add(R(day).tags, keyOk(e.tag));
      } else if (e.e === "engaged") { d.engaged++; s.engaged++; P(e.p, e.s, day).engaged++; }
      else if (e.e === "scroll") { add(d.scroll, String(e.d)); add(s.scroll, String(e.d)); }
      else if (e.e === "cta") { add(d.ctas, keyOk(e.id)); add(s.ctas, keyOk(e.id)); if (e.id === "join-open") d.joinOpens++; }
      else if (e.e === "error") { d.errors++; s.errors++; const k = crypto.createHash("sha1").update(e.m).digest("hex").slice(0, 10); (s.errMsgs[k] ||= { m: e.m, n: 0 }).n++; }
    }
  }
  return { days, services, paths, sources };
}

// ---------------------------------------------------------------------------------------------- the focus engine (§4)
const MIN_VIEWS = 50;
const median = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return 0; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
/**
 * sums: { [service]: { views, prevViews, uniques, engaged, scroll75, ctaClicks, errors, returns, lcpPass?, brokenHits?, openBugs?, love? } } over 28 days.
 * ctx: { utility: Set of service ids, names: { id: name } }. Returns [{ id, name, ok, reach, engagement, health, love, score, group, x, y, ... }].
 */
function vitals(sums, ctx = {}) {
  const ids = Object.keys(sums);
  const med = median(ids.map((id) => sums[id].views).filter((v) => v >= MIN_VIEWS)) || 1;
  return ids.map((id) => {
    const s = sums[id], views = s.views || 0, ok = views >= MIN_VIEWS;
    const eng = views ? (s.engaged || 0) / views : 0;
    const trend = s.prevViews ? (views - s.prevViews) / s.prevViews : 0;
    const reach = clamp(50 * Math.log2(1 + views / med) + clamp(trend * 50, -15, 15));
    const engagement = clamp(100 * (0.55 * eng + 0.2 * (views ? (s.scroll75 || 0) / views : 0) + 0.15 * Math.min(1, (views ? (s.ctaClicks || 0) / views : 0) * 4) + 0.1 * Math.min(1, s.returns || 0)));
    const errPerK = views ? ((s.errors || 0) / views) * 1000 : 0;
    const health = clamp(100 * (s.lcpPass == null ? 1 : s.lcpPass) - Math.min(40, errPerK * 4) - Math.min(20, (s.brokenHits || 0) * 2) - Math.min(20, (s.openBugs || 0) * 5));
    const love = s.loveScore != null && (s.loveCount || 0) >= 3 ? clamp(s.loveScore) : null;
    const parts = [reach, engagement, health, ...(love != null ? [love] : [])];
    const score = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
    const hiX = views >= med, hiY = eng >= 0.5;
    const group = !ok ? null : hiX && hiY ? "expand" : hiX ? "fix" : hiY ? "spotlight" : "rethink";
    return { id, name: (ctx.names || {})[id] || id, ok, views, prevViews: s.prevViews || 0, eng: Math.round(eng * 1000) / 1000, errPerK: Math.round(errPerK * 10) / 10,
      reach: Math.round(reach), engagement: Math.round(engagement), health: Math.round(health), love: love == null ? null : Math.round(love), score: ok ? score : null, group, utility: !!(ctx.utility && ctx.utility.has(id)), median: med };
  });
}
/** Up to 5 moves, each { id, service, group, title, text, evidence[], impact 1–4, action, href }, ranked by traffic × gap. */
function moves(scored, ctx = {}) {
  const out = [];
  const pct = (v) => `${Math.round(v * 100)}%`;
  for (const s of scored.filter((x) => x.ok)) {
    if (s.group === "fix") out.push({ id: `fix-${s.id}`, service: s.id, group: "fix", title: s.name, text: `Lots of people open ${s.name}, but only ${pct(s.eng)} stay 10 seconds. Look at what they see first.`, evidence: [`${s.views.toLocaleString("en-US")} views`, `${pct(s.eng)} engaged`, "site goal 50%"], weight: s.views * (0.5 - s.eng), action: "Open the service" });
    if (s.group === "spotlight") out.push({ id: `spot-${s.id}`, service: s.id, group: "spotlight", title: s.name, text: `People who find ${s.name} stay (${pct(s.eng)} engaged), but few find it. Link to it from the home page or a stream.`, evidence: [`${s.views.toLocaleString("en-US")} views`, `${pct(s.eng)} engaged`], weight: (s.median - s.views) * (s.eng - 0.5) * 2, action: "Open the service" });
    if (s.health < 70) out.push({ id: `health-${s.id}`, service: s.id, group: "fix", title: s.name, text: `${s.name} has health issues: ${s.errPerK ? `${s.errPerK} script errors per 1,000 views` : "slow pages or broken links"}.`, evidence: [`health ${s.health}`, ...(s.errPerK ? [`${s.errPerK} errors / 1k`] : [])], weight: s.views * ((70 - s.health) / 100), action: "Open Health" });
    if (s.group === "expand" && s.views > s.prevViews * 1.2 && s.prevViews > 0) out.push({ id: `grow-${s.id}`, service: s.id, group: "expand", title: s.name, text: `${s.name} is growing (${pct((s.views - s.prevViews) / s.prevViews)} more views) and people stay. Give it more.`, evidence: [`${s.views.toLocaleString("en-US")} views`, `${pct(s.eng)} engaged`], weight: s.views * 0.15, action: "Open the service" });
  }
  if (ctx.join && ctx.join.weakest) out.push({ id: "join-path", service: "join", group: "fix", title: "Join path", text: `The biggest drop on the way to joining is "${ctx.join.weakest.label}": ${pct(ctx.join.weakest.drop)} of people stop there.`, evidence: ctx.join.steps.map((st) => `${st.label} ${st.n.toLocaleString("en-US")}`).slice(0, 3), weight: (ctx.join.steps[0]?.n || 0) * ctx.join.weakest.drop, action: "Open the join path" });
  const ranked = out.filter((m) => m.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 5);
  const top = ranked[0]?.weight || 1;
  return ranked.map((m) => ({ ...m, impact: Math.max(1, Math.min(4, Math.ceil((m.weight / top) * 4))), weight: Math.round(m.weight) }));
}
/** Join path (§4): Visited → Opened Join → Started signup → Made an account → Came back within 7 days. The step with the biggest drop. */
function joinPath(counts) {
  const labels = ["Visited", "Opened Join", "Started signup", "Made an account", "Came back within 7 days"];
  const keys = ["visited", "opened", "started", "accounts", "returned"];
  const steps = keys.map((k, i) => ({ key: k, label: labels[i], n: Math.max(0, Math.round(counts[k] || 0)) }));
  let weakest = null;
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1].n, b = steps[i].n;
    if (a <= 0) continue;
    const drop = Math.max(0, 1 - b / a);
    steps[i].drop = Math.round(drop * 1000) / 1000;
    if (!weakest || drop > weakest.drop) weakest = { key: steps[i].key, label: steps[i].label, drop: steps[i].drop };
  }
  return { steps, weakest };
}

// ---------------------------------------------------------------------------------------------- baselines, goals
/** The usual value: the median of up to 4 same-weekday values (missing ones skipped). */
const usual = (values) => median((values || []).filter((v) => Number.isFinite(v)));
function goalPace(goal, now, dayOfMonth, daysInMonth) {
  const fraction = goal.target > 0 ? now / goal.target : 0;
  if (goal.kind === "returnRate") return { fraction, expected: 1, state: fraction >= 0.97 ? "on" : "behind" };
  const expected = dayOfMonth / daysInMonth;
  const state = fraction >= expected * 1.05 ? "ahead" : fraction >= expected * 0.95 ? "on" : "behind";
  return { fraction, expected, state };
}

module.exports = { TZ, laParts, pathHash, cleanBatch, cleanEvent, isBot, hostAllowed, tally, vitals, moves, joinPath, usual, goalPace, median, MIN_VIEWS, PLATFORM_REFS };
