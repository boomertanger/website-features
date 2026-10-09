// Small helpers the Control Room scripts share: escaping, the run-a-callable wrapper (busy button, error text), dialogs that announce
// themselves with the site's bt:overlay-open event (as the header nav and the account menu do), and the mascot for empty states.
import { escapeHtml } from "../../../../shared/ui/dom.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { messageFor } from "../../lib/errors";

export const esc: (t: unknown) => string = escapeHtml;
export const $ = <T extends HTMLElement = HTMLElement>(sel: string, from: ParentNode = document) => from.querySelector<T>(sel)!;
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const FEATURE = "live";

/** Tells the header's nav panels, the account menu and the More sheet to close: an overlay is opening. */
export const announceOverlay = (source = "live") => document.dispatchEvent(new CustomEvent("bt:overlay-open", { detail: { source } }));

/** openModal for the Control Room: announces the overlay and tags the portal data-feature="live". */
export function openLive(opts: Record<string, unknown>) {
  announceOverlay("live-dialog");
  return openModal({ feature: FEATURE, ...opts } as any) as { modal: HTMLElement; close: () => void; requestClose: () => void; setBeforeClose: (fn: () => boolean) => void; setDismissible: (v: boolean) => void };
}
export const askLive = (opts: Record<string, unknown>) => { announceOverlay("live-dialog"); return confirmAction({ feature: FEATURE, danger: false, ...opts } as any) as Promise<boolean>; };
export { modalHeader, toast, messageFor };

/** Disables a button and swaps its text while a promise runs; restores it after. */
export async function withBusy<T>(btn: HTMLButtonElement | null, label: string, fn: () => Promise<T>): Promise<T> {
  const was = btn?.textContent ?? "";
  if (btn) { btn.disabled = true; btn.textContent = label; btn.setAttribute("aria-busy", "true"); }
  try { return await fn(); }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = was; btn.removeAttribute("aria-busy"); } }
}

/** The mascot from the page's template (BaseLayout), sized by CSS; "" when the template is missing. */
export function mascotHtml() {
  const t = document.getElementById("bt-mascot-tpl") as HTMLTemplateElement | null;
  return t?.content.firstElementChild?.outerHTML || "";
}

export const copyText = async (text: string) => {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
};
