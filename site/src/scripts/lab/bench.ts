// The bench scene (docs/specs/feature-lab.md §7): a bubbling flask, five jars (Submitted, Under review, Planned, In progress, Shipped)
// filled by count, the mascot peeking over the bench. On the board the jars are buttons that filter; on How it works they're plain.
import { STATUS, type Status } from "./data";
import { bigFlask, mascot } from "./art";

const JARS: Status[] = ["submitted", "under_review", "planned", "in_progress", "shipped"];
const HEIGHTS = [58, 70, 64, 74, 62];

export function benchHtml(c: Record<string, number> | null, { big = false, active = "", button = true }: { big?: boolean; active?: string; button?: boolean } = {}) {
  const max = Math.max(...JARS.map((k) => c?.[k] || 0), 1);
  const jar = (k: Status, n: number) => {
    const count = c?.[k] || 0;
    const attrs = `class="fl-jar${active === k ? " is-on" : ""}" style="--c:var(--bt-${STATUS[k].tone});--h:${HEIGHTS[n] + (big ? 10 : 0)}px"`;
    const inner = `<span class="fl-jar-glass"><i style="--f:${Math.round(18 + (count / max) * 72)}%"></i></span><b>${c ? count : ""}</b><small>${STATUS[k].label}</small>`;
    return button
      ? `<button type="button" ${attrs} data-filter="${k}" aria-pressed="${active === k}" aria-label="${STATUS[k].label}: ${count} ideas. Show them">${inner}</button>`
      : `<span ${attrs} role="img" aria-label="${STATUS[k].label}: ${count} ideas">${inner}</span>`;
  };
  return `<div class="fl-bench" aria-label="Ideas by status">${bigFlask()}<div class="fl-jars">${JARS.map(jar).join("")}</div><span class="fl-bench-top"></span>${mascot()}</div>`;
}
