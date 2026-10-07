// A Crew Academy module page: the Try it widget loader (the contract C2a and C2b share), the quiz and the
// passed state. Nothing here holds a quiz answer: the server grades (callable academySubmitQuiz), and in the
// ?as= preview a stub answers every question neutrally.
import { initHowItWorks } from "../../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../../shared/ui/flip-card.js";
import { initQuiz } from "../../../../../shared/ui/quiz.js";
import { crewCall } from "../api";
import { onAccess } from "../layout";
import { isPreview, loadPassed } from "./progress";

initHowItWorks(document);
initFlipCards();

const root = document.querySelector<HTMLElement>("[data-academy-module]");
const moduleId = root?.dataset.academyModule ?? "";

// Try it widgets: scripts/crew/academy/tryit/<slug>.ts, each `export default function init(root: HTMLElement): void`.
// The widget draws its own card into the container; the container stays hidden when there is no file.
const tryits = import.meta.glob("./tryit/*.ts");
document.querySelectorAll<HTMLElement>("[data-tryit]").forEach(async (box) => {
  const load = tryits[`./tryit/${box.dataset.tryit}.ts`];
  if (!load) return;
  try {
    const mod = (await load()) as { default: (root: HTMLElement) => void };
    mod.default(box);
    box.hidden = false;
  } catch (e) { console.error("tryit failed", e); }
});

let preview = false;
const markPassed = () => {
  document.querySelectorAll<HTMLElement>("[data-passed-only]").forEach((el) => { el.hidden = false; });
  document.querySelectorAll<HTMLElement>("[data-notpassed-only]").forEach((el) => { el.hidden = true; });
  document.querySelector<HTMLElement>(".bt-flip")?.classList.add("is-earned");
};

onAccess(async (s) => {
  preview = isPreview(s);
  if (!moduleId) return;
  if ((await loadPassed(s)).includes(moduleId)) markPassed();
});

interface Submit { ok: boolean; passed: boolean; score: number; passMark: number; results: { correct: boolean; say: string }[]; paid?: boolean }
const quizBox = document.querySelector<HTMLElement>("[data-academy-quiz]");
if (quizBox && moduleId) {
  initQuiz(quizBox, {
    submit: async (answers: number[]) => {
      if (preview) {
        // Harmless stub: grading runs on the server, so the preview never has (or ships) the key.
        return { results: answers.map(() => ({ correct: false, say: "(preview: grading runs on the server)" })), passed: false, say: "Preview only: sign in with a crew account to take the quiz for real." };
      }
      const r = await crewCall<Submit>("academySubmitQuiz", { moduleId, answers });
      const say = r.passed
        ? (r.paid ? "Passed! That's +5 Gears for finishing this module." : "Passed again. You already earned this module's Gears.")
        : `You need ${r.passMark} right to pass. Re-read the chapters and try again.`;
      return { results: r.results, passed: r.passed, say };
    },
    onResult: (o: { passed: boolean }) => { if (o.passed && !preview) markPassed(); },
  });
}
