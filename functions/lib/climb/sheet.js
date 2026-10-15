// Creator Climb stream sheet (docs/specs/creator-climb.md §3): Boomer's stream log exported as functions/scripts/data/climb-sheet.csv
// (GITIGNORED). Pure functions, no Firestore; only scripts/seed-climb-history.js and scripts/check-climb.js load this (the functions don't).
//
//   parseSheet(text)                                   the CSV → [{ row, day, streams, hours, likes, twitch, tiktok, youtube }] in date order.
//                                                      An unknown or missing header, or a row that doesn't parse, throws with the row number.
//   mergeSheet(history, rows, { backOnAir })           the history file with the sheet's rows added as months in its own shape: each row's
//                                                      follower counts become that day's points (src "import" once imported), streams,
//                                                      hours and likes are summed per month (only for days before backOnAir, "YYYY-MM-DD" or
//                                                      null = all of them). Rows on or before the history's last reading are ignored.
//                                                      → { history, used, ignored, counted }
const HEADERS = {
  "Enter Stream Date": "day",
  "How many streams?": "streams",
  "Enter Total Likes": "likes",
  "Enter Total Hours Streamed": "hours",
  "Enter Twitch Follower Count": "twitch",
  "Enter TikTok Follower Count": "tiktok",
  "Enter YouTube Follower Count": "youtube",
};
const PLATFORMS = ["twitch", "tiktok", "youtube"];

/** One CSV line → cells (double quotes may wrap a cell; "" inside quotes is a quote). */
function cells(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const fail = (msg) => { throw new Error(`climb-sheet.csv: ${msg}`); };
/** "1,234" / "1234" / "" → number or null; anything else is NaN. */
const numOf = (s) => (s === "" ? null : /^-?[\d,]*\.?\d+$/.test(s) ? Number(s.replace(/,/g, "")) : NaN);
/** M/D/YYYY → YYYY-MM-DD (a real date), or null. */
function dayOf(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseSheet(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/);
  const head = cells(lines[0] || "");
  const unknown = head.filter((h) => !(h in HEADERS));
  if (unknown.length) fail(`row 1: unknown header ${unknown.map((h) => `"${h}"`).join(", ")}`);
  const missing = Object.keys(HEADERS).filter((h) => !head.includes(h));
  if (missing.length) fail(`row 1: missing header ${missing.map((h) => `"${h}"`).join(", ")}`);
  const rows = [], seen = new Map();
  for (let i = 1; i < lines.length; i++) {
    const n = i + 1;   // the spreadsheet's row number (the header is row 1)
    if (!lines[i].trim()) continue;
    const c = cells(lines[i]);
    if (c.length !== head.length) fail(`row ${n}: ${c.length} cells, expected ${head.length}`);
    const r = { row: n };
    head.forEach((h, j) => (r[HEADERS[h]] = c[j]));
    const day = dayOf(r.day);
    if (!day) fail(`row ${n}: "${r.day}" isn't a M/D/YYYY date`);
    const out = { row: n, day };
    for (const k of ["streams", "hours", "likes", ...PLATFORMS]) {
      const v = numOf(r[k]);
      if (Number.isNaN(v) || (v != null && v < 0)) fail(`row ${n}: ${k} "${r[k]}" isn't a number`);
      if (v == null && PLATFORMS.includes(k)) fail(`row ${n}: no ${k} follower count`);
      if (v != null && k !== "hours" && !Number.isInteger(v)) fail(`row ${n}: ${k} "${r[k]}" isn't a whole number`);
      out[k] = v;
    }
    if (seen.has(day)) fail(`row ${n}: ${day} is already on row ${seen.get(day)}`);
    seen.set(day, n);
    rows.push(out);
  }
  return rows.sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** The history file's last reading day: the latest lastReadingDay or point. */
function lastHistoryDay(h) {
  let last = null;
  for (const m of Object.values((h && h.months) || {})) {
    if (m.lastReadingDay && (!last || m.lastReadingDay > last)) last = m.lastReadingDay;
    for (const v of Object.values(m.platforms || {})) for (const pt of v.points || []) if (!last || pt[0] > last) last = pt[0];
  }
  return last;
}

function mergeSheet(history, rows, { backOnAir = null } = {}) {
  const h = JSON.parse(JSON.stringify(history));
  const after = lastHistoryDay(h);
  const used = rows.filter((r) => !after || r.day > after);
  const ignored = rows.length - used.length;
  let counted = 0;
  const add = (a, b) => (b == null ? a : (a || 0) + b);
  for (const r of used) {
    const k = r.day.slice(0, 7);
    const m = h.months[k] || (h.months[k] = { streams: null, hours: null, likes: null, highlights: [], platforms: {} });
    for (const p of PLATFORMS) {
      const v = m.platforms[p] || (m.platforms[p] = { monthEnd: null, points: [] });
      v.points.push([r.day, r[p]]);
      v.monthEnd = r[p];
    }
    m.lastReadingDay = r.day;
    if (!backOnAir || r.day < backOnAir) {
      counted++;
      m.streams = add(m.streams, r.streams);
      m.hours = r.hours == null ? m.hours : Math.round(add(m.hours, r.hours) * 100) / 100;
      m.likes = add(m.likes, r.likes);
    }
  }
  h.months = Object.fromEntries(Object.entries(h.months).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { history: h, used: used.length, ignored, counted, after };
}

module.exports = { parseSheet, mergeSheet, lastHistoryDay, HEADERS };
