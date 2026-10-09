// Feature Lab's gate (docs/specs/feature-lab.md §2, §7): the shared board gate (scripts/boards/gate.ts) with the Lab's preview data and wording.
import { makeGate, maskEmail, verifyLine, type Need } from "../boards/gate";
import previewData from "../../data/preview-lab.json";

const gate = makeGate({ preview: previewData, feature: "feature-lab", verifyTitle: "Verify your email to post, vote and comment", resultClass: "fl-result" });
export const { previewAs, isPreview, preview, isStaff, isAdmin, isMember, isVerified, meOf, canDelete, needOf, requireVerified, verifyPrompt } = gate;
export { maskEmail, verifyLine };
export type { Need };
