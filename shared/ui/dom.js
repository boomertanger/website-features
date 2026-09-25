// shared/ui/dom.js — small DOM/text helpers used by every feature.

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Accepts a Firestore Timestamp, a Date, a millisecond number, or an ISO string.
export function formatDate(value) {
  if (!value) return "";
  const date =
    typeof value.toDate === "function" ? value.toDate() :
    value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// First letter of the first two words, uppercased. "?" when empty.
export function initials(name) {
  return (
    String(name ?? "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

// Signal bars for ordered scales (severity, priority): level n of `of`.
// Put it first inside a .bt-badge in place of the status dot.
export function levelBars(n, of = 4) {
  return `<span class="bt-level" aria-hidden="true">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? "is-on" : ""}"></i>`).join("")}</span>`;
}
