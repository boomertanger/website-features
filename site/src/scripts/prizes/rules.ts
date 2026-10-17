// /prizes/<contest>/rules (docs/specs/prize-box.md §5): the contest's official rules from its rulesMd, rendered with marked + DOMPurify (raw HTML is
// escaped first, links only to https, http, mailto and site paths, no images), the same safety rules as the Playbook. Without rules of its own the page
// shows the template, which carries its "waiting for legal review" note.
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { loadContest, contestHref, sampleAsked } from "./data";
import TEMPLATE from "../../data/prize-box/rules-template.md?raw";

const md = new Marked({ gfm: true, breaks: false });
md.use({ renderer: { html(t: { text: string }) { return esc(t.text); }, image(t: { text?: string }) { return esc(t.text || ""); } } as any });
const safe = (src: string) => DOMPurify.sanitize(md.parse(src) as string, { ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/(?!\/)|#)/i, FORBID_TAGS: ["img", "style", "script", "iframe"] });

const slugFromUrl = () => { const p = location.pathname.split("/").filter(Boolean); return p[0] === "prizes" && p[1] && p[1] !== "rules" ? decodeURIComponent(p[1]) : new URLSearchParams(location.search).get("c") || (sampleAsked() ? "draw-boomers-nightmare" : ""); };

void (async () => {
  const body = document.querySelector<HTMLElement>("[data-pz-rules-body]");
  if (!body) return;
  const template = TEMPLATE;
  const slug = slugFromUrl();
  const c = slug ? await loadContest(slug).catch(() => null) : null;
  if (!c) { body.innerHTML = `<p>This contest isn't here. <a href="/prizes">See every contest</a>.</p>`; return; }
  document.title = `Official rules: ${c.title} · Prize Box`;
  document.querySelector("[data-pz-rules-title]")!.textContent = `Official rules: ${c.title}`;
  const back = document.querySelector<HTMLAnchorElement>("[data-pz-rules-back]");
  if (back) { back.href = contestHref(c); back.textContent = `← ${c.title}`; }
  body.innerHTML = safe(c.rulesMd && c.rulesMd.trim() ? c.rulesMd : template);
})();
