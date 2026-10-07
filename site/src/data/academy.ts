// Crew Academy content (docs/specs/crew-academy.md): the module text is site/src/content/academy/<slug>.md,
// read at build time. Frontmatter has no quiz answers (the server grades: academySubmitQuiz), and none of
// this file's output ever carries one. Chapters come from the Markdown's own ## and ### headings.
interface Frontmatter {
  order: number; id: string; slug: string; title: string; minutes: number; requiredFor: string; optional: boolean;
  soon: boolean; unlocks: string; hero: string; tryIt?: string; quiz: { q: string; options: string[] }[];
}
export interface Chapter { id: string; title: string; html: string }
export interface AcademyModule extends Frontmatter { chapters: Chapter[]; num: number }

const files = import.meta.glob("../content/academy/*.md", { eager: true }) as Record<string, { frontmatter: Frontmatter; compiledContent: () => string | Promise<string> }>;

const HEAD = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/g;
function split(html: string): Chapter[] {
  const out: Chapter[] = [];
  const marks = [...html.matchAll(HEAD)];
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index! : html.length;
    const title = m[2].replace(/<[^>]+>/g, "").replace(/^Ch \d+ · /, "").trim();
    out.push({ id: `ch${i + 1}`, title, html: html.slice(m.index! + m[0].length, end).trim() });
  });
  return out;
}

export const modules: AcademyModule[] = (await Promise.all(Object.values(files).map(async (f) => {
  const html = await f.compiledContent();
  return { ...f.frontmatter, chapters: split(html), num: f.frontmatter.order };
}))).sort((a, b) => a.order - b.order);

export const bySlug = (slug: string) => modules.find((m) => m.slug === slug)!;
/** The 9 modules that count toward progress (Chat Games is Soon). */
export const COUNTED = modules.filter((m) => !m.soon);
/** The next module after this one that isn't Soon, or null. */
export const nextAfter = (m: AcademyModule) => modules.find((x) => x.order > m.order && !x.soon) ?? null;
export const GRADE_NAME: Record<string, string> = { initiate: "Initiate", watcher: "Watcher", warden: "Warden", captain: "Stream Captain" };
export const requiredLabel = (m: AcademyModule) => m.soon ? "Opens with Chat Games" : m.optional ? "Optional" : `Required for ${GRADE_NAME[m.requiredFor] ?? m.requiredFor}`;
