// Academy progress: the passed module ids ('m1'...) from crewMe().academy.passed, or, for the ?as= preview
// (non-production, signed out only), the sample in data/preview-crew-academy.json. A real signed-in account
// always uses real data.
import type { AuthState } from "../../../lib/auth";
import { previewAs } from "../layout";
import { crewMe } from "../api";
import sample from "../../../data/preview-crew-academy.json";

export const isPreview = (s: AuthState) => !s.user && !!previewAs();

export async function loadPassed(s: AuthState): Promise<string[]> {
  if (isPreview(s)) return sample.passed.slice();
  try { return (await crewMe()).academy?.passed ?? []; } catch { return []; }
}
