// The cleanup targets the editor offers (docs/specs/cloud-stash.md §4); the server's allowlist (functions/lib/stash/targets.js) is the real check. v1: Bug Zapper screenshots on reports in a
// closed status for at least N days. [BZ] from docs/specs/bug-zapper.md: the closed statuses are Fixed, Won't fix, Can't reproduce and Duplicate. No Firebase here.
export const BUG = {
  key: "bugScreenshots",
  label: "Bug Zapper screenshots",
  statuses: ["fixed", "wont_fix", "cant_reproduce", "duplicate"],
  daysMin: 14,
  daysMax: 730,
};
/** "Fixed, Won't fix or Duplicate". */
export const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`);
