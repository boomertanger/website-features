// Boomertang's issues for the pages (docs/specs/boomertang.md §2, §4a): the issue list from issues.json, each issue's routes and page list,
// and the page files of the public issues (built into static HTML). Sample issues are built off production only.
import data from "../../data/boomertang/issues.json";
import { isProduction } from "../env.js";

export type Trust = "off" | "ver" | "com" | "fan";
export interface Source { id: string; group: string; title: string; url: string | null; trust: Trust; checkedAt: string; note: string; version?: string }
export interface Row { n: string; page: string; nav: string; title: string; line: string; kind: string }
export interface CoverLine { head: string; line: string; big?: boolean }
export interface Issue {
  id: string; vol: number; no: number; title: string; edition: string; year: number; textInRepo?: boolean; sample?: boolean; games?: string[];
  cover: { word: string; style: string; kicker: string; dek: string; stamp?: { small: string; big: string }; linesLeft: CoverLine[]; linesRight: CoverLine[]; phoneLines: CoverLine[]; barcode: string; alt: string; art?: string };
  about: string; alive?: string; contents: Row[]; sources: Source[]; dropped?: string[];
}
export interface PageRef { slug: string; nav: string; title: string; line?: string; n?: string; kind?: string }

export const ALL: Issue[] = (data as { issues: Issue[] }).issues;
/** The issues this build makes pages for: every real one, and the samples off production. */
export const BUILT: Issue[] = ALL.filter((i) => !i.sample || !isProduction);
export const byId = (id: string) => ALL.find((i) => i.id === id) || null;

export const issueHref = (i: Pick<Issue, "vol" | "no">) => `/boomertang/vol-${i.vol}/no-${i.no}`;
export const pageHref = (i: Pick<Issue, "vol" | "no">, slug: string) => (slug === "cover" ? issueHref(i) : `${issueHref(i)}/${slug}`);
/** Every page of an issue in reading order: the cover, the contents, then the contents rows. */
export function pagesOf(i: Issue): PageRef[] {
  return [{ slug: "cover", nav: "Cover", title: "Cover" }, { slug: "contents", nav: "Contents", title: "Contents" }, ...i.contents.map((r) => ({ slug: r.page, nav: r.nav, title: r.title, line: r.line, n: r.n, kind: r.kind }))];
}
export const sourcesOf = (i: Issue) => Object.fromEntries(i.sources.map((s) => [s.id, s]));
export const issueLine = (i: Issue) => `Vol. ${i.vol} · No. ${i.no} · ${i.title}`;

// The public issues' page files, read at build time
const FILES = import.meta.glob("../../content/boomertang/*/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
export function pageFile(i: Issue, slug: string): string | null {
  return FILES[`../../content/boomertang/${i.id}/${slug}.md`] ?? null;
}
