// One badge card for the Trophy Room (a kit .bt-flip; trophies.css .tr-card): built at build
// time on /trophies/how-it-works and in the browser on /trophies, so both pages draw badges the
// same way. Front: the medal, the name and the rarity (a secret badge you don't hold shows ???
// and its hint). Back: how to earn, the source, the collection, "Held by N%" when the nightly
// job has filled it in, and the XP ("No XP" for supporters).
//   held:        { earnedAt, serial } once the member holds it ("Earned Oct 4 · #3 to earn it")
//   member:      true on /trophies: badges you don't hold are dimmed (.is-locked)
//   comingSoon:  the badge's source isn't live yet (a Coming soon flag)
import { medalHtml, RARITY } from "../../../../shared/ui/medal.js";
import { levelBars, escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { badgeXp, progress } from "../../lib/rewards.js";

export interface BadgeDoc {
  id: string; name: string; collection: string; rarity: number; source: string; how: string;
  emoji?: string | null; art?: string | null; xp?: number | null;
  secret?: { hint?: string } | null; limited?: { label?: string } | null; crewOnly?: boolean;
  status?: string; awardableBy?: string | null; pctHeld?: number | null; holders?: number | null;
  ladder?: { id: string; step: number } | null;
}
export interface Held { earnedAt: Date | null; serial: number | null }

/** The seven ways in (How it works section 5 and every card's corner icon). */
export const SOURCES: Record<string, { ic: string; t: string }> = {
  auto: { ic: "⚙️", t: "Automatic" }, stream: { ic: "📡", t: "Stream presence" }, drop: { ic: "⚡", t: "Live drops" },
  crew: { ic: "🛡", t: "Crew awards" }, quest: { ic: "🏁", t: "Contests and hunts" }, factory: { ic: "🏭", t: "Night Shift" },
  support: { ic: "💛", t: "Support" },
};
/** Sources that can award badges today. The rest show a Coming soon flag until their feature
 *  ships (stream presence, drops, contests, Night Shift, and paid support). Keep this the one list. */
export const LIVE_SOURCES = new Set(["auto", "crew"]);

export const rarityBadge = (n: number) => `<span class="bt-badge bt-badge--${RARITY[n]?.tone ?? "gray"}">${levelBars(n, 5)}${RARITY[n]?.name ?? ""}</span>`;
const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const earnedLine = (h: Held) => [h.earnedAt && `Earned ${fmtDay(h.earnedAt)}`, h.serial && `#${h.serial} to earn it`].filter(Boolean).join(" · ") || "Earned";
/** "4%", "0.6%", "<0.1%". */
export const fmtPct = (p: number) => (p < 0.1 ? "<0.1%" : p < 10 ? `${Math.round(p * 10) / 10}%` : `${Math.round(p)}%`);

export function badgeCardHtml(b: BadgeDoc, opts: { collName?: string; held?: Held | null; member?: boolean; comingSoon?: boolean; hidden?: boolean } = {}) {
  const { collName = "", held = null, member = false, comingSoon = false, hidden = false } = opts;
  const s = SOURCES[b.source] ?? SOURCES.auto, r = Math.max(1, Math.min(5, b.rarity || 1)), tone = RARITY[r].tone;
  const hint = b.secret?.hint, secret = !!hint && !held;
  const xp = badgeXp(b);
  const flags = [
    b.status === "buried" && `<span class="bt-badge bt-badge--gray">Buried</span>`,
    b.crewOnly && `<span class="bt-badge bt-badge--teal">Crew</span>`,
    b.limited && b.status !== "buried" && `<span class="bt-badge bt-badge--gold">Limited</span>`,
    secret && `<span class="bt-badge bt-badge--gray">Secret</span>`,
    comingSoon && !held && `<span class="bt-badge bt-badge--blue">Coming soon</span>`,
  ].filter(Boolean).join("");
  const medal = medalHtml({ emoji: b.emoji ?? "", art: b.art ?? "", rarity: r, size: 72, secret });
  const front = secret
    ? `${medal}<b>???</b>${rarityBadge(r)}<span class="tr-hint">"${esc(hint)}"</span>`
    : `${medal}<b>${esc(b.name)}</b>${rarityBadge(r)}${held ? `<span class="tr-earned">${esc(earnedLine(held))}</span>` : ""}`;
  const pct = typeof b.pctHeld === "number" && b.pctHeld > 0 ? fmtPct(b.pctHeld) : "";
  const label = secret
    ? `Secret ${RARITY[r].name} badge. Hint: ${hint}`
    : `${b.name}, ${RARITY[r].name}${held ? `. ${earnedLine(held)}` : member ? ". Not earned yet" : ""}. How to earn: ${b.how} Earned by: ${s.t}.${comingSoon && !held ? " Coming soon." : ""}${pct ? ` Held by ${pct} of members.` : ""}`;
  const cls = ["bt-flip", "tr-card", member && !held && "is-locked", held && "is-held"].filter(Boolean).join(" ");
  return `<button type="button" class="${cls}" style="--c:var(--bt-${tone})" data-id="${esc(b.id)}" data-coll="${esc(b.collection)}" data-rar="${r}"${hidden ? " hidden" : ""} aria-label="${esc(label)}"><span class="bt-flip-in">
    <span class="bt-flip-face" aria-hidden="true"><span class="tr-src" title="${s.t}">${s.ic}</span><span class="tr-flags">${flags}</span>${front}</span>
    <span class="bt-flip-face bt-flip-face--back" aria-hidden="true">
      <span class="bt-flip-k">${secret ? "Secret badge" : "How to earn"}</span><span class="bt-flip-v">${secret ? "The name and how to earn it stay hidden until it's yours. Follow the hint." : esc(b.how)}</span>
      <span class="bt-flip-k">Earned by</span><span class="bt-flip-v">${s.ic} ${s.t}${comingSoon ? " · coming soon" : ""}</span>
      <span class="bt-flip-k">Collection</span><span class="bt-flip-v">${esc(collName)}${pct ? ` · held by ${pct}` : ""}</span>
      <span class="tr-card-xp">${rarityBadge(r)}<span>${xp ? `+${xp} XP` : "No XP"}</span></span>
    </span></span></button>`;
}

/** The member's level strip (/trophies links it to /account#rewards; the Rewards tab shows it as is).
 *  go: false leaves out the "Rewards" arrow. */
export function meStripHtml(xp: number, held: number, total: number, go = true) {
  const p = progress(xp);
  const pct = p.nextXp > p.levelXp ? Math.max(0, Math.min(100, ((p.xp - p.levelXp) / (p.nextXp - p.levelXp)) * 100)) : 100;
  const n = (v: number) => v.toLocaleString("en-US");
  return `<span class="tr-me-lv" aria-hidden="true"><small>Lv</small>${p.level}</span>
    <span class="tr-me-main"><span class="tr-lv-top"><b>Level ${p.level} · ${esc(p.rank)}</b><span>${n(p.xp)} / ${n(p.nextXp)} XP</span></span>
    <span class="tr-xpbar" style="--v:${pct.toFixed(1)}%"><i></i></span></span>
    <span class="tr-me-count"><b>${held}</b><small>of ${total} badges</small></span>
    ${go ? `<span class="tr-me-go">Rewards<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span>` : ""}`;
}
