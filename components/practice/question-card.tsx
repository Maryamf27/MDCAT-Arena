import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DIFFICULTY_LABEL, DIFFICULTY_TONE, normalizeDifficulty } from "@/lib/practice/difficulty";
import type { PracticeQuestion } from "./types";

const LETTERS = ["A", "B", "C", "D"] as const;

type Review = { correctIndex: number; explanation: string };


export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const level = normalizeDifficulty(difficulty);
  if (!level) {
    return <Badge tone="neutral">{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</Badge>;
  }
  return <Badge tone={DIFFICULTY_TONE[level]}>{DIFFICULTY_LABEL[level]}</Badge>;
}


export function QuestionCard({
  question,
  number,
  total,
  selectedIndex,
  onSelect,
  review,
}: {
  question: PracticeQuestion;
  number: number;
  total: number;
  selectedIndex: number | null;
  onSelect?: (index: number) => void;
  review?: Review;
}) {
  const groupLabel = `Answer options for question ${number}`;

  return (
    <div className="card p-6 md:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {review ? (
          <span className="text-caption">
            Question {number} of {total}
          </span>
        ) : null}
        <DifficultyBadge difficulty={question.difficulty} />
      </div>

      <h2 className="font-heading text-xl font-bold leading-8 text-ink">{question.question}</h2>

      <div role="radiogroup" aria-label={groupLabel} className="mt-6 flex flex-col gap-3">
        {question.options.map((option, index) => {
          const checked = selectedIndex === index;
          let stateClass = "";
          let marker = null;
          if (review) {
            if (index === review.correctIndex) {
              stateClass = "option-correct";
              marker = <Check size={18} className="text-success" aria-label="Correct answer" />;
            } else if (checked) {
              stateClass = "option-wrong";
              marker = <X size={18} className="text-error" aria-label="Your answer was incorrect" />;
            }
          }
          return (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={Boolean(review)}
              onClick={() => onSelect?.(index)}
              className={`option ${stateClass}`}
            >
              <span className="option-letter">{LETTERS[index] ?? index + 1}</span>
              <span className="flex-1 pt-1 text-base text-ink">{option}</span>
              {marker ? <span className="pt-1">{marker}</span> : null}
            </button>
          );
        })}
      </div>

      {review ? (
        <div className="mt-6 rounded-control border border-line bg-canvas p-4">
          <p className="text-caption">Explanation</p>
          <p className="mt-1 text-base text-ink">{review.explanation}</p>
        </div>
      ) : null}
    </div>
  );
}
