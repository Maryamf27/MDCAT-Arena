import type {
  AnswerKey,
  QuestionResult,
  SubmissionResult,
  SubmittedAnswer,
} from "./types";

/**
 * Pure server-side scoring. Every submitted question must have a key; the
 * caller is responsible for rejecting unknown ids before calling this.
 * Unanswered questions (selectedIndex === null) count as incorrect.
 */
export function scoreSubmission(
  answers: SubmittedAnswer[],
  keys: Map<string, AnswerKey>
): SubmissionResult {
  const results: QuestionResult[] = answers.map((answer) => {
    const key = keys.get(answer.questionId);
    if (!key) throw new Error(`No answer key for ${answer.questionId}`);
    const isCorrect =
      answer.selectedIndex !== null && answer.selectedIndex === key.correct_answer_index;
    return {
      questionId: answer.questionId,
      selectedIndex: answer.selectedIndex,
      correctIndex: key.correct_answer_index,
      correctOption: key.options[key.correct_answer_index],
      isCorrect,
      explanation: key.explanation,
    };
  });

  const total = results.length;
  const answered = results.filter((r) => r.selectedIndex !== null).length;
  const correct = results.filter((r) => r.isCorrect).length;
  return {
    score: {
      total,
      answered,
      unanswered: total - answered,
      correct,
      incorrect: answered - correct,
      percentage: total === 0 ? 0 : Math.round((correct / total) * 1000) / 10,
    },
    results,
  };
}
