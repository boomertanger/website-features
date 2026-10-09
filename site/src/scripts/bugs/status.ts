// Bug Zapper statuses, severities and priorities (docs/specs/bug-zapper.md §3). No Firebase here, so build-time pages (How it works) can import it.
export type Status = "open" | "confirmed" | "in_progress" | "fixed" | "wont_fix" | "cant_reproduce" | "duplicate";
export type Severity = "cosmetic" | "minor" | "major" | "critical";
export type Priority = "low" | "normal" | "high" | "urgent";

export const STATUS_KEYS: Status[] = ["open", "confirmed", "in_progress", "fixed", "wont_fix", "cant_reproduce", "duplicate"];
/** Bug status badge tones (design-system §5): Open blue · Confirmed gold · In progress green · Fixed lime · the closed ones gray. */
export const STATUS: Record<Status, { label: string; tone: string }> = {
  open: { label: "Open", tone: "blue" }, confirmed: { label: "Confirmed", tone: "gold" }, in_progress: { label: "In progress", tone: "green" }, fixed: { label: "Fixed", tone: "lime" },
  wont_fix: { label: "Won't fix", tone: "gray" }, cant_reproduce: { label: "Can't reproduce", tone: "gray" }, duplicate: { label: "Duplicate", tone: "gray" },
};
export const SEVERITY: Record<Severity, { label: string; tone: string; level: number; help: string }> = {
  cosmetic: { label: "Cosmetic", tone: "blue", level: 1, help: "Looks wrong, nothing's blocked" },
  minor: { label: "Minor", tone: "gold", level: 2, help: "Annoying, there's a way round it" },
  major: { label: "Major", tone: "pink", level: 3, help: "A feature is broken" },
  critical: { label: "Critical", tone: "red", level: 4, help: "Can't use the site, or data is exposed" },
};
export const PRIORITY: Record<Priority, { label: string; tone: string; level: number }> = {
  low: { label: "Low", tone: "blue", level: 1 }, normal: { label: "Normal", tone: "gold", level: 2 }, high: { label: "High", tone: "pink", level: 3 }, urgent: { label: "Urgent", tone: "red", level: 4 },
};
/** What the Closed chip shows (Fixed has its own chip). */
export const CLOSED_VIEW: Status[] = ["wont_fix", "cant_reproduce", "duplicate"];
/** closed == true on the report: these four. */
export const CLOSED_ALL: Status[] = ["fixed", ...CLOSED_VIEW];
/** "Bit me too" is locked on these (the count is frozen). */
export const FROZEN: Status[] = ["fixed", "wont_fix", "duplicate"];
/** A report counts as confirmed from one of these on (Bug Finder, Night Shift confirmed). */
export const CONFIRMED_LIKE: Status[] = ["confirmed", "in_progress", "fixed"];
export const isFrozen = (s: Status) => FROZEN.includes(s);
