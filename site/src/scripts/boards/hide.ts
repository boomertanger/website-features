// The hide dialog (Feature Lab, Bug Zapper): mods and admins hide an item or one reply with a reason (1 to 200, logged by the callable). A confirmAction
// with a reason box; unhiding needs no dialog, so the caller just runs it. `run(reason)` does the call; its error text shows in the dialog.
import { confirmAction } from "../../../../shared/ui/confirm.js";

export function confirmHide({ title, message, confirmLabel, feature, run }: { title: string; message: string; confirmLabel: string; feature: string; run: (reason: string) => Promise<void> }): Promise<boolean> {
  return confirmAction({
    title, message, confirmLabel, busyLabel: "Hiding…", danger: false, feature,
    bodyHtml: `<div class="bt-field" style="margin-top:var(--bt-space-3)"><label class="bt-label" for="bd-why">Why? (required, staff see it)</label><input class="bt-input" id="bd-why" type="text" maxlength="200" placeholder="Off topic, spam, unkind…"></div>`,
    onConfirm: async (modal?: HTMLElement) => {
      const reason = (modal?.querySelector("#bd-why") as HTMLInputElement | null)?.value.trim() || "";
      if (!reason) throw new Error("Say why you are hiding it.");
      await run(reason);
    },
  });
}
