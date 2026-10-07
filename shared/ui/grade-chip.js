// shared/ui/grade-chip.js — .bt-grade, the crew grade chip (docs/design-system.md §5 "Grade chip", §8m;
// docs/specs/mod-machina.md §3): a .bt-badge with level bars. Mod grades climb four steps and are coloured
// blue, gold, pink and red (M1 Initiate, M2 Watcher, M3 Warden, M4 Sentinel); admin grades climb three and use
// the admin green .bt-badge--admin (A1 Steward, A2 Overseer, A3 Right Hand). Admin green is for admin only.
//
//   gradeChipHtml({ track, grade, code, label })  -> markup string (the kit's convention)
//   gradeChip(opts)                               -> the same as one element (a span)
//     track: "mod" | "admin"                      (inferred from "A2" style grades when omitted)
//     grade: 1-4 for mod, 1-3 for admin; also accepts "A2", "M3", or a crewGrade claim (3, "A2")
//     code:  true to prefix the code ("M2 Watcher"); label: overrides the visible name
//   gradeInfo(track, grade) -> { track, grade, code, name, tone, of }    GRADES: the tables
//   parseGrade(value)       -> { track, grade }  for the profile's crewGrade claim (1-4, or "A1"-"A3")
import { escapeHtml } from "./dom.js";

export const GRADES = {
  mod: [null,
    { name: "Initiate", tone: "blue" }, { name: "Watcher", tone: "gold" },
    { name: "Warden", tone: "pink" }, { name: "Sentinel", tone: "red" },
  ],
  admin: [null,
    { name: "Steward", tone: "admin" }, { name: "Overseer", tone: "admin" }, { name: "Right Hand", tone: "admin" },
  ],
};
const STEPS = { mod: 4, admin: 3 };

export function parseGrade(value) {
  const s = String(value ?? "").trim().toUpperCase();
  const m = /^([MA])?\s*(\d)$/.exec(s);
  if (!m) return { track: "mod", grade: 0 };
  return { track: m[1] === "A" ? "admin" : "mod", grade: Number(m[2]) };
}

export function gradeInfo(track, grade) {
  const t = track === "admin" ? "admin" : "mod";
  const of = STEPS[t];
  const g = Math.max(1, Math.min(of, Number(grade) || 1));
  const row = GRADES[t][g];
  return { track: t, grade: g, code: `${t === "admin" ? "A" : "M"}${g}`, name: row.name, tone: row.tone, of };
}

export function gradeChipHtml({ track, grade, code = false, label } = {}) {
  if (track == null && typeof grade !== "number") ({ track, grade } = parseGrade(grade));
  const g = gradeInfo(track, grade);
  const bars = Array.from({ length: g.of }, (_, i) => `<i class="${i < g.grade ? "is-on" : ""}"></i>`).join("");
  const text = escapeHtml(label ?? `${code ? `${g.code} ` : ""}${g.name}`);
  return `<span class="bt-badge bt-grade bt-badge--${g.tone}" data-track="${g.track}" data-grade="${g.grade}" title="${escapeHtml(`${g.name}, grade ${g.code}`)}">`
    + `<span class="bt-level${g.of === 3 ? " bt-level--3" : ""}" aria-hidden="true">${bars}</span>${text}</span>`;
}

export function gradeChip(opts) {
  const t = document.createElement("template");
  t.innerHTML = gradeChipHtml(opts);
  return t.content.firstElementChild;
}
