// Game Vault search (docs/specs/game-vault.md §7): a small forgiving matcher, no library,
// no dependencies, safe in the browser and in Node. The whole Vault is searched in the
// browser from public/vault, so there are no server calls.
//
//   const index = buildIndex(games);            // once, when public/vault loads
//   const hits = search(index, "bunker amnesia", { limit: 20 });
//   hits[0] -> { game, score, lit: [titleCharIndexes] }   (lit letters for the command panel)
//
// A game is { title, altNames?, developers?, tags? }; tags may be a list or { auto, boomer }.
// Matching ignores case, accents and punctuation, takes the words in any order (every word
// of the query must match something), forgives typos in longer words, and understands
// acronyms (altNames such as "RE2", and title initials: "sh2" -> Silent Hill 2).
// Title matches rank first, then alt names, then developer, then tags.
// Tested by functions/scripts/check-vault-search.js.

/** Lowercase, accents and punctuation dropped, spaces collapsed: "Amnesia: The Bunker" -> "amnesia the bunker". */
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/['’]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

const tokensOf = (text) => { const n = normalize(text); return n ? n.split(" ") : []; };

/** Edit distance with adjacent swaps counted as one edit, stopping early past `max`. */
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      if (d < best) best = d;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = row;
  }
  return prev[b.length];
}

/** How well query word q matches word t: 0 for no match, up to 1 for an exact one. */
function wordScore(q, t) {
  if (q === t) return 1;
  if (t.startsWith(q)) return 0.9;
  if (q.length >= 3 && t.includes(q)) return 0.6;
  if (q.length >= 5) {
    const allowed = q.length >= 8 ? 2 : 1;
    const d = Math.min(editDistance(q, t, allowed), editDistance(q, t.slice(0, q.length), allowed));
    if (d <= allowed) return 0.75 - 0.1 * d;
  }
  return 0;
}

const tagList = (tags) => (Array.isArray(tags) ? tags : [...(tags?.auto || []), ...(tags?.boomer || [])]);

/** Title tokens with the title's own character positions, so matched letters can be lit. */
function titleSpans(title) {
  const spans = [];
  let cur = null;
  const text = String(title ?? "");
  for (let i = 0; i < text.length; i++) {
    const base = text[i].normalize("NFD")[0].toLowerCase();
    if (/[a-z0-9]/.test(base)) {
      if (!cur) { cur = { token: "", idx: [] }; spans.push(cur); }
      cur.token += base; cur.idx.push(i);
    } else if (text[i] !== "'" && text[i] !== "’") cur = null;   // an apostrophe stays inside the word
  }
  return spans;
}

export function buildIndex(games) {
  return (games || []).map((game) => {
    const spans = titleSpans(game.title);
    return {
      game,
      spans,
      title: normalize(game.title),
      titleTokens: spans.map((s) => s.token),
      initials: spans.map((s) => (/^\d+$/.test(s.token) ? s.token : s.token[0])).join(""),
      alts: (game.altNames || []).map((a) => ({ norm: normalize(a), tokens: tokensOf(a) })),
      devTokens: (game.developers || []).flatMap(tokensOf),
      tagTokens: tagList(game.tags).flatMap(tokensOf),
    };
  });
}

function bestOf(q, list) {
  let best = 0, at = -1;
  for (let i = 0; i < list.length; i++) { const s = wordScore(q, list[i]); if (s > best) { best = s; at = i; } }
  return { score: best, at };
}

const WEIGHT = { title: 1, alt: 0.8, initials: 0.85, dev: 0.5, tag: 0.4 };

function scoreEntry(entry, qTokens, qJoined) {
  let total = 0, inTitle = 0;
  const lit = new Set();
  for (const q of qTokens) {
    const t = bestOf(q, entry.titleTokens);
    let best = t.score * WEIGHT.title, via = t.score > 0 ? "title" : null, at = t.at;
    for (const alt of entry.alts) {
      const a = bestOf(q, alt.tokens).score * WEIGHT.alt;
      if (a > best) { best = a; via = "alt"; }
    }
    if (qTokens.length === 1 && q.length >= 2) {   // acronyms by initials: "sh2"
      let init = 0;
      if (entry.initials === q) init = 0.95;
      else if (q.length >= 3 && entry.initials.startsWith(q)) init = 0.7;
      if (init * WEIGHT.initials > best) { best = init * WEIGHT.initials; via = "initials"; }
    }
    const d = bestOf(q, entry.devTokens).score * WEIGHT.dev;
    if (d > best) { best = d; via = "dev"; }
    const g = bestOf(q, entry.tagTokens).score * WEIGHT.tag;
    if (g > best) { best = g; via = "tag"; }
    if (best <= 0) return null;   // every word has to match something
    total += best;
    if (via === "title") {
      inTitle++;
      const span = entry.spans[at], tok = span.token;
      const from = tok.startsWith(q) || q.length > tok.length ? 0 : Math.max(0, tok.indexOf(q));
      const len = tok.includes(q) ? q.length : Math.min(q.length, tok.length);
      for (let i = from; i < from + len && i < span.idx.length; i++) lit.add(span.idx[i]);
    } else if (via === "initials") {
      entry.spans.forEach((s, i) => { if (i < qJoined.length || /^\d+$/.test(s.token)) lit.add(s.idx[0]); });
    }
  }
  let score = total / qTokens.length;
  if (inTitle === qTokens.length) score += 1;
  if (entry.title === qJoined) score += 2;
  else if (entry.title.startsWith(qJoined)) score += 0.5;
  return { score, lit: [...lit].sort((a, b) => a - b) };
}

/** Matching games, best first: [{ game, score, lit }]. An empty query matches nothing. */
export function search(index, query, { limit = 50 } = {}) {
  const qTokens = tokensOf(query);
  if (!qTokens.length) return [];
  const qJoined = qTokens.join(" ");
  const hits = [];
  for (const entry of index) {
    const r = scoreEntry(entry, qTokens, qJoined);
    if (r) hits.push({ game: entry.game, score: r.score, lit: r.lit });
  }
  hits.sort((a, b) => b.score - a.score || String(a.game.title).localeCompare(String(b.game.title), "en"));
  return hits.slice(0, limit);
}
