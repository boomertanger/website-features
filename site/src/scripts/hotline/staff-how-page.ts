// Data and small builders for /admin/inbox/how-it-works (docs/specs/talk-back.md §10). In a module rather than the page's frontmatter: Astro's
// frontmatter scanner misreads this mix of template strings (a build error), and the page stays readable as markup.
import { stripTags } from "./staff-art";
// crew/main.inbox's defaults (functions/lib/crew/logic.js DEFAULT_SETTINGS.inbox); staff-how.ts swaps in the live values
export const V = { reply: 4, fast: 2, fastHours: 24, oldest: 1, spam: 1, spamHoldDays: 7, spamDailyCap: 5, desk: 5, deskMinHandled: 3, deskStaleHours: 48, dailyCap: 30, operatorMin: 5, operatorAccuracy: 0.9 };
export const v = (k: keyof typeof V | "operatorAccuracyPct") => `<span data-v="${k}">${k === "operatorAccuracyPct" ? Math.round(V.operatorAccuracy * 100) : V[k]}</span>`;

export const NAV: [string, string][] = [["s-desk", "Your desk"], ["s-journey", "A message's journey"], ["s-answer", "Answering well"], ["s-escalate", "When to escalate"], ["s-spam", "Spam and tidying"], ["s-gears", "Gears for inbox work"], ["s-seen", "Being seen"], ["s-rules", "House rules"]];
export const chapter = (n: number, id: string, title: string, lede = "") => `<header class="bt-chapter bt-chapter--ghost" data-n="${String(n).padStart(2, "0")}"><p class="bt-chapter-eyebrow" aria-hidden="true">${String(n).padStart(2, "0")} · Chapter</p><h2 class="bt-chapter-title" id="h-${id}">${title}</h2>${lede ? `<p class="bt-chapter-lede">${lede}</p>` : ""}</header>`;

export const JOURNEY: [string, string, string][] = [
  ["new", "New", "It arrives. A question from a feature page shows where it came from, with Open the page."],
  ["pick", "Pick up", "Claim it so nobody else answers too. Picked up by shows on the row."],
  ["reply", "Reply", "Answer the person. The first reply is the part that counts."],
  ["wait", "Waiting", "The ball's in their court. \"Then mark it Waiting\" is ticked for you."],
  ["done", "Done", "Answered, or no reply needed."],
];
export const ESCALATE: [string, string, string][] = [
  ["personal", "Personal matters", "Someone going through something hard, or sharing private details."],
  ["report", "Reports about people", "How someone behaved, in chat or anywhere else."],
  ["crew", "Anything about the crew", "A question or complaint about a mod or an admin."],
  ["safety", "Safety", "Threats, or anyone who might be at risk."],
];
export const MEDALS = [
  { tone: "gold", ic: "☎️", t: "Operator of the Month", sub: "The staff award", back: [["How it's chosen", "First replies, plus ½ per spam mark that held and 1 per oldest first."], ["To qualify", `${v("operatorMin")}+ first replies, ${v("operatorAccuracyPct")}%+ spam accuracy.`]], tag: "Chosen on the 1st" },
  { tone: "teal", ic: "🧹", t: "Clear desk", sub: "A team streak", back: [["A clear day", `Nothing waiting over ${v("deskStaleHours")} h at 9 PM Central.`], ["The bonus", `7 in a row: +${v("desk")} Gears for everyone who handled ${v("deskMinHandled")}.`]], tag: "Shared by the team" },
  { tone: "primary", ic: "📮", t: "Inbox column", sub: "On /crew/board", back: [["What it counts", "Your paid first replies: month, season, all time."], ["Never shows", "Who wrote, what about, or from where."]], tag: "Counts only" },
  { tone: "blue", ic: "⚙️", t: "Top Gear", sub: "The crew award", back: [["Inbox Gears count", "They're part of your Gears total."], ["But", "Staff show in their real place and never win crew awards."]], tag: "Crew only" },
];
export const labelOf = (m: (typeof MEDALS)[number]) => `${m.t}. ${m.back.map(([k, x]) => `${k}: ${stripTags(x)}`).join(" ")}`;
export const RULES: [string, string][] = [
  ["Answer the oldest first", "It has waited longest, and it earns the oldest-first Gear."],
  ["Never mark real messages as spam", "Rude, short or confused isn't spam. Spam is ads, scams and bots."],
  ["Escalate whenever in doubt", "Owner only never costs you anything. Boomertanger would rather see it."],
  ["Private stays private", "Never repeat a message outside the inbox, not even to the crew."],
  ["Never reply to your own message", "It earns nothing, and someone else should answer it."],
  ["Check Picked up by", "If someone picked it up, leave it to them unless they let it go."],
];
