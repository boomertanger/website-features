// Bug Zapper's gate (docs/specs/bug-zapper.md §2, §7): the shared board gate (scripts/boards/gate.ts) with Bug Zapper's preview data and wording.
import { makeGate, maskEmail, verifyLine, type Need } from "../boards/gate";
import previewData from "../../data/preview-bugs.json";

const gate = makeGate({ preview: previewData, feature: "bug-zapper", verifyTitle: "Verify your email to report bugs", resultClass: "bz-result" });
export const { previewAs, isPreview, preview, isStaff, isAdmin, isMember, isVerified, meOf, canDelete, needOf, requireVerified, verifyPrompt } = gate;
export { maskEmail, verifyLine };
export type { Need };
