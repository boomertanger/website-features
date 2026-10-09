// Feature Lab statuses, priorities and areas (docs/specs/feature-lab.md §3). No Firebase here, so build-time pages (How it works) can import it.
export type Status = "submitted" | "under_review" | "planned" | "in_progress" | "shipped" | "declined";
export type Priority = "low" | "medium" | "high";
export type Area = "site" | "stream" | "other";

export const STATUS_KEYS: Status[] = ["submitted", "under_review", "planned", "in_progress", "shipped", "declined"];
export const STATUS: Record<Status, { label: string; tone: string }> = {
  submitted: { label: "Submitted", tone: "blue" }, under_review: { label: "Under review", tone: "teal" }, planned: { label: "Planned", tone: "gold" },
  in_progress: { label: "In progress", tone: "green" }, shipped: { label: "Shipped", tone: "lime" }, declined: { label: "Declined", tone: "gray" },
};
export const PRIORITY: Record<Priority, { label: string; tone: string; level: number }> = {
  low: { label: "Low", tone: "blue", level: 1 }, medium: { label: "Medium", tone: "gold", level: 2 }, high: { label: "High", tone: "pink", level: 3 },
};
export const AREA: Record<Area, string> = { site: "Site", stream: "Stream", other: "Other" };
export const voteLocked = (i: { status: Status }) => i.status === "shipped" || i.status === "declined";

