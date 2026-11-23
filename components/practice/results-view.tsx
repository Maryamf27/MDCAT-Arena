import Link from "next/link";
import { RotateCcw } from "lucide-react";
import type { SubmissionResult } from "@/lib/practice/types";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { QuestionCard } from "./question-card";
import type { PracticeQuestion } from "./types";

export function ResultsView({
  subjectLabel,
  questions,
  result,
  attemptId,
  onPracticeAgain,
}: {
  subjectLabel: string;
  questions: PracticeQuestion[];
  result: SubmissionResult;
  attemptId: string;
  onPracticeAgain: () => void;
}) {
  const { score } = result;
  const byId = new Map(result.results.map((r) => [r.questionId, r]));

  return (
    <div className="flex flex-col gap-6">
      <section className="card p-6 md:p-8" aria-label="Score summary">
        <p className="text-caption">{subjectLabel} practice result</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className="font-heading text-5xl font-extrabold text-primary">{score.percentage}%</p>
          <p className="pb-1 text-base text-muted">
            {score.correct} of {score.total} correct
          </p>
        </div>
        <div className="mt-4">
          <ProgressBar value={score.correct} max={score.total} label="Correct answers" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="success">{score.correct} correct</Badge>
          <Badge tone="error">{score.incorrect} incorrect</Badge>
          <Badge tone="neutral">{score.unanswered} unanswered</Badge>
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-small text-muted">
          <Badge tone="success">Attempt saved</Badge>
          <span>Reference {attemptId.slice(0, 8)}</span>
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={onPracticeAgain}>
            <RotateCcw size={16} aria-hidden />
            Practice again
          </button>
          <Link href="/" className="btn btn-ghost">
            Back to dashboard
          </Link>
        </div>
      </section>

      <section aria-label="Answer review" className="flex flex-col gap-4">
        <h2 className="text-title">Review your answers</h2>
        {questions.map((q, i) => {
          const r = byId.get(q.id);
          return (
            <QuestionCard
              key={q.id}
              question={q}
              number={i + 1}
              total={questions.length}
              selectedIndex={r ? r.selectedIndex : null}
              review={r ? { correctIndex: r.correctIndex, explanation: r.explanation } : undefined}
            />
          );
        })}
      </section>
    </div>
  );
}
