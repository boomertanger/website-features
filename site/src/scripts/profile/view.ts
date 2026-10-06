// /u/{handle}, a member's public profile (docs/specs/rewards.md §11). Reads handles/{handle}, then
// the profile, the badges they hold and their trophies (all public), plus the badge catalog
// (cached 5 minutes). Anyone can view it, signed in or not.
// The role tag is profiles/{uid}.roleTag (fan, sub, mod, admin), the public copy of the member's
// highest role that functions keep in step; your own profile falls back to your sign-in's roles.
import { medalHtml, RARITY } from "../../../../shared/ui/medal.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { whenReady } from "../../lib/auth";
import { progress, PERSONA_ICONS } from "../../lib/rewards.js";
import { badgeCardHtml, earnedLine, LIVE_SOURCES, type BadgeDoc, type Held } from "../trophies/card";
import { loadCatalog, loadHeld, loadProfile, loadTrophies, uidForHandle, type RewardProfile, type Trophy } from "../trophies/data";
import { TR_CUP } from "../trophies/art";

const root = document.querySelector<HTMLElement>("[data-pf]")!;

function handleFromUrl() {
  const parts = location.pathname.split("/").filter(Boolean);   // ["u", handle]
  const fromPath = parts[0] === "u" && parts[1] && parts[1] !== "view" ? decodeURIComponent(parts[1]) : "";
  return (fromPath || new URLSearchParams(location.search).get("handle") || "").replace(/^@/, "");
}

const ROLE_TAG: Record<string, [string, string]> = { admin: ["teal", "Admin"], mod: ["teal", "Mod"], sub: ["gold", "Sub Club"], fan: ["gray", "Fan Club"] };
const tagFromRoles = (roles: string[]) => (["admin", "mod", "sub"].find((k) => roles.includes(k)) ?? "fan");
function roleTag(tag: string) {
  const [tone, label] = ROLE_TAG[tag] ?? ROLE_TAG.fan;
  return `<span class="bt-badge bt-badge--${tone}">${label}</span>`;
}

function notFound(handle: string) {
  document.title = "No such member · Boomertanger";
  root.removeAttribute("aria-busy");
  root.innerHTML = `<div class="bt-empty tr-pf-none">
    <span class="tr-pf-none-art" aria-hidden="true">${medalHtml({ rarity: 1, size: 72, secret: true })}</span>
    <h1 class="bt-empty-title">No member called @${esc(handle || "?")}</h1>
    <p>Check the spelling. Handles can change, so an old link might point nowhere now.</p>
    <a class="bt-btn bt-btn--secondary" href="/trophies/how-it-works">How the Trophy Room works</a>
  </div>`;
}

function avatarHtml(p: RewardProfile, featured: BadgeDoc | null) {
  const a = p.avatar;
  const inner = a?.type === "photo" && a.url ? `<img src="${esc(a.url)}" alt="" referrerpolicy="no-referrer">` : esc((a?.initials || p.displayName || p.handle || "?").slice(0, 2).toUpperCase());
  return `<span class="tr-av tr-av--lg" aria-hidden="true">${inner}${featured ? medalHtml({ emoji: featured.emoji ?? "", art: featured.art ?? "", rarity: featured.rarity, size: 36 }) : ""}</span>`;
}

function trophyHtml(t: Trophy) {
  const place = t.place && t.place <= 3 ? t.place : 0;
  const ord = ["", "1st", "2nd", "3rd"][place] || (t.place ? `${t.place}th` : "");
  const when = t.earnedAt ? t.earnedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  return `<li class="tr-cup${place ? ` tr-cup--${place}` : ""}">${TR_CUP}<b>${esc([ord, t.label].filter(Boolean).join(" · "))}</b><span>${esc([t.period, when].filter(Boolean).join(" · "))}</span></li>`;
}

async function main() {
  const handle = handleFromUrl().toLowerCase();
  if (!handle) return notFound("");
  try {
    const uid = await uidForHandle(handle);
    if (!uid) return notFound(handle);
    const [profile, held, trophies, { collections, badges }, me, season] = await Promise.all([loadProfile(uid), loadHeld(uid), loadTrophies(uid), loadCatalog(), whenReady(), seasonPlace(uid)]);
    if (!profile) return notFound(handle);
    const byId = new Map(badges.map((b) => [b.id, b]));
    const isMe = me.user?.uid === uid;
    const tag = profile.roleTag ?? (isMe ? tagFromRoles(me.roles) : null);
    const p = progress(profile.xp);
    const pins = profile.showcase.filter((id) => held.has(id) && byId.has(id));
    const featured = byId.get(profile.featuredBadge ?? pins[0] ?? "") ?? null;
    const name = profile.displayName || profile.handle;
    document.title = `${name} (@${profile.handle}) · Boomertanger`;

    const pct = p.nextXp > p.levelXp ? ((p.xp - p.levelXp) / (p.nextXp - p.levelXp)) * 100 : 100;
    const persona = profile.persona ? `<span class="bt-tag">${PERSONA_ICONS[profile.persona as keyof typeof PERSONA_ICONS] ?? ""} ${esc(profile.persona)}</span>` : "";
    const pinHtml = pins.map((id, i) => {
      const b = byId.get(id)!, h = held.get(id)!;
      return `<li class="tr-pin${i === 0 ? " is-featured" : ""}">${medalHtml({ emoji: b.emoji ?? "", art: b.art ?? "", rarity: b.rarity, size: 64, label: `${b.name}, ${RARITY[b.rarity].name}` })}<b>${esc(b.name)}</b><span>${h.serial ? `#${h.serial} to earn it` : esc(earnedLine(h))}</span>${i === 0 ? `<span class="bt-badge bt-badge--gold">Featured</span>` : ""}</li>`;
    }).join("");

    // Held badges by collection, in catalog order.
    const groups = collections.map((c) => ({ c, list: badges.filter((b) => b.collection === c.id && held.has(b.id)) })).filter((g) => g.list.length);
    const groupHtml = groups.map(({ c, list }) => `<section class="tr-pf-group" aria-labelledby="pf-c-${esc(c.id)}">
        <h3 id="pf-c-${esc(c.id)}"><span aria-hidden="true">${esc(c.icon)}</span>${esc(c.name)} <small>${list.length}</small></h3>
        <div class="tr-grid">${list.map((b) => badgeCardHtml(b, { collName: c.name, held: held.get(b.id) as Held, comingSoon: !LIVE_SOURCES.has(b.source) })).join("")}</div>
      </section>`).join("");

    root.removeAttribute("aria-busy");
    root.innerHTML = `
      <header class="tr-prof tr-pf-head">
        <div class="tr-prof-top">
          ${avatarHtml(profile, featured)}
          <div class="tr-prof-id">
            <h1 class="tr-pf-name">${esc(name)}</h1>
            <span class="tr-pf-handle">@${esc(profile.handle)}${profile.joinedAt ? ` · joined ${profile.joinedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}</span>
            <div class="tr-tags">${tag ? roleTag(tag) : ""}${persona}<span class="bt-tag">Lv ${p.level} · ${esc(p.rank)}</span></div>
          </div>
          ${isMe ? `<a class="bt-btn bt-btn--secondary bt-btn--sm tr-pf-edit" href="/account#rewards">Edit trophy case</a>` : ""}
        </div>
        <div><div class="tr-lv-top"><b>Level ${p.level} · ${esc(p.rank)}</b><span>${p.xp.toLocaleString("en-US")} XP</span></div><div class="tr-xpbar" style="--v:${pct.toFixed(1)}%" role="img" aria-label="${Math.round(pct)}% of the way to level ${p.level + 1}"><i></i></div></div>
        <div class="tr-stats"><div><b>${held.size}</b><span>badge${held.size === 1 ? "" : "s"}</span></div><div><b>${trophies.length}</b><span>troph${trophies.length === 1 ? "y" : "ies"}</span></div><div><b>${p.level}</b><span>level</span></div>${profile.bestStreak ? `<div><b>🔥 ${profile.currentStreak}</b><span>day streak</span></div><div><b>${profile.bestStreak}</b><span>best streak</span></div>` : ""}${season ? `<a href="/shift/leaderboard"><b>#${season.rank}</b><span>${esc(season.label)}</span></a>` : ""}</div>
      </header>
      ${pins.length ? `<section class="bt-card tr-pf-sec" aria-labelledby="pf-case"><h2 class="bt-card-title" id="pf-case">Trophy case</h2><ol class="tr-pins">${pinHtml}</ol></section>` : ""}
      ${trophies.length ? `<section class="bt-card tr-pf-sec" aria-labelledby="pf-tro"><h2 class="bt-card-title" id="pf-tro">Trophies</h2><ol class="tr-pf-shelf">${trophies.map(trophyHtml).join("")}</ol></section>` : ""}
      <section class="tr-pf-sec" aria-labelledby="pf-badges">
        <h2 class="bt-card-title" id="pf-badges">Badges</h2>
        ${groupHtml || `<p class="tr-empty">${isMe ? `No badges yet. <a href="/trophies">See what you can earn</a>.` : `@${esc(profile.handle)} hasn't earned a badge yet.`}</p>`}
      </section>`;
    initFlipCards(root);
  } catch (err) {
    console.error(err);
    root.removeAttribute("aria-busy");
    root.innerHTML = `<p class="bt-notice bt-notice--error">This profile didn't load. Check your connection and refresh the page.</p>`;
  }
}
/** Where the member sits on the live Night Shift season's All board (its top 100), or null. */
async function seasonPlace(uid: string): Promise<{ rank: number; label: string } | null> {
  try {
    const { loadSummary, loadBoard } = await import("../factory/member-data");
    const s = await loadSummary();
    if (!s?.live || !s.liveSeasonId) return null;
    const row = (await loadBoard(s.liveSeasonId, "all")).rows.find((r) => r.uid === uid);
    return row ? { rank: row.rank ?? 0, label: `Season ${String(s.number ?? 0).padStart(2, "0")} rank` } : null;
  } catch { return null; }
}
void main();
