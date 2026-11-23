"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Library, LogIn, Send } from "lucide-react";
import type { SubmissionResult } from "@/lib/practice/types";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { QuestionCard } from "./question-card";
import { ResultsView } from "./results-view";
import {
  parseApiErrorCode,
  parseApiErrorMessage,
  parseQuestionsResponse,
  type PracticeQuestion,
} from "./types";

const SESSION_SIZE = 5;

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "signin" }
  | { name: "empty" }
  | { name: "answering" }
  | { name: "submitting" }
  | { name: "submitted"; result: SubmissionResult; attemptId: string };

function isSubmissionResult(value: unknown): value is SubmissionResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { score?: unknown; results?: unknown };
  return typeof v.score === "object" && v.score !== null && Array.isArray(v.results);
}

export function PracticeSession({
  subjectKey,
  subjectLabel,
}: {
  subjectKey: string;
  subjectLabel: string;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadId, setLoadId] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  // Fetch a fresh set of questions whenever loadId changes.
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        // 1) Start a saved attempt for the signed-in student.
        const started = await fetch("/api/practice/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: subjectKey }),
          signal: controller.signal,
        });
        const startedJson: unknown = await started.json().catch(() => null);
        if (started.status === 401) {
          setPhase({ name: "signin" });
          return;
        }
        const newAttemptId =
          typeof startedJson === "object" && startedJson !== null
            ? ((startedJson as { data?: { attemptId?: unknown } }).data?.attemptId ?? null)
            : null;
        if (!started.ok || typeof newAttemptId !== "string") {
          setPhase({
            name: "error",
            message: parseApiErrorMessage(startedJson) ?? "Your practice session could not be started.",
          });
          return;
        }
        setAttemptId(newAttemptId);

        // 2) Fetch the questions (unchanged endpoint).
        const res = await fetch(
          `/api/practice/questions?subject=${encodeURIComponent(subjectKey)}&limit=${SESSION_SIZE}`,
          { signal: controller.signal, cache: "no-store" }
        );
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          setPhase({
            name: "error",
            message: parseApiErrorMessage(json) ?? "The questions could not be loaded.",
          });
          return;
        }
        const parsed = parseQuestionsResponse(json);
        if (!parsed) {
          setPhase({ name: "error", message: "The server sent questions in an unexpected format." });
          return;
        }
        setQuestions(parsed);
        setPhase(parsed.length === 0 ? { name: "empty" } : { name: "answering" });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPhase({ name: "error", message: "Could not reach the server. Check your connection and try again." });
      }
    }

    void load();
    return () => controller.abort();
  }, [subjectKey, loadId]);

  const restart = useCallback(() => {
    setPhase({ name: "loading" });
    setQuestions([]);
    setAnswers({});
    setCurrent(0);
    setSubmitError(null);
    setAttemptId(null);
    setLoadId((n) => n + 1);
  }, []);

  async function submit() {
    if (!attemptId) return;
    setSubmitError(null);
    setPhase({ name: "submitting" });
    try {
      const res = await fetch("/api/practice/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          answers: questions.map((q) => ({
            questionId: q.id,
            selectedIndex: q.id in answers ? answers[q.id] : null,
          })),
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      const data =
        typeof json === "object" && json !== null ? (json as { data?: unknown }).data : undefined;
      if (res.status === 401) {
        setPhase({ name: "signin" });
        return;
      }
      const code = parseApiErrorCode(json);
      if (code === "attempt_expired" || code === "attempt_not_found") {
        setPhase({ name: "error", message: parseApiErrorMessage(json) ?? "This practice attempt is no longer valid." });
        return;
      }
      const savedId =
        typeof data === "object" && data !== null ? (data as { attemptId?: unknown }).attemptId : undefined;
      if (!res.ok || !isSubmissionResult(data) || typeof savedId !== "string") {
        setSubmitError(parseApiErrorMessage(json) ?? "Your answers could not be submitted. Please try again.");
        setPhase({ name: "answering" });
        return;
      }
      setPhase({ name: "submitted", result: data, attemptId: savedId });
    } catch {
      setSubmitError("Could not reach the server. Your answers are still saved on this page, so try again.");
      setPhase({ name: "answering" });
    }
  }

  if (phase.name === "loading") {
    return (
      <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading questions">
        <Skeleton className="mb-4 h-4 w-40" />
        <div className="card flex flex-col gap-4 p-8">
          <Skeleton className="h-6 w-1/4" />
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (phase.name === "error") {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState
          title="Couldn't load questions"
          description={phase.message}
          action={
            <button type="button" className="btn btn-primary" onClick={restart}>
              Try again
            </button>
          }
        />
      </div>
    );
  }

  if (phase.name === "signin") {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={LogIn}
          title="Sign in to start practicing"
          description="Your attempts and scores are saved to your account, so you need to be signed in."
          action={
            <Link href={`/login?next=${encodeURIComponent(`/practice/${subjectKey}`)}`} className="btn btn-primary">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  if (phase.name === "empty") {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={Library}
          title={`No ${subjectLabel} questions yet`}
          description="There are no approved questions for this subject yet. Try Biology, or check back once more questions are added."
          action={
            <Link href="/practice/biology" className="btn btn-primary">
              Practice Biology
            </Link>
          }
        />
      </div>
    );
  }

  if (phase.name === "submitted") {
    return (
      <div className="mx-auto max-w-3xl">
        <ResultsView
          subjectLabel={subjectLabel}
          questions={questions}
          result={phase.result}
          attemptId={phase.attemptId}
          onPracticeAgain={restart}
        />
      </div>
    );
  }

  // answering | submitting
  const submitting = phase.name === "submitting";
  const question = questions[current];
  const answeredCount = Object.keys(answers).length;
  const unanswered = questions.length - answeredCount;
  const isLast = current === questions.length - 1;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center justify-between text-small">
          <span className="font-bold text-ink">
            Question {current + 1} of {questions.length}
          </span>
          <span className="text-muted">{answeredCount} answered</span>
        </div>
        <ProgressBar value={current + 1} max={questions.length} label="Question progress" />
      </div>

      <QuestionCard
        question={question}
        number={current + 1}
        total={questions.length}
        selectedIndex={question.id in answers ? answers[question.id] : null}
        onSelect={(index) => setAnswers((prev) => ({ ...prev, [question.id]: index }))}
      />

      <nav aria-label="Question navigator" className="mt-4 flex flex-wrap gap-2">
        {questions.map((q, i) => {
          const answered = q.id in answers;
          const here = i === current;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setCurrent(i)}
              aria-label={`Go to question ${i + 1}${answered ? " (answered)" : ""}`}
              aria-current={here ? "step" : undefined}
              className={`grid h-10 w-10 place-items-center rounded-[10px] border font-heading text-sm font-bold transition-colors ${
                here
                  ? "border-primary bg-primary text-white"
                  : answered
                    ? "border-primary bg-mint-soft text-primary"
                    : "border-line bg-white text-muted hover:border-primary"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>

      {submitError ? (
        <p role="alert" className="mt-4 rounded-[10px] border border-[#efc4c2] bg-[#fdf5f4] px-4 py-2 text-small text-ink">
          {submitError}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0 || submitting}
        >
          <ArrowLeft size={16} aria-hidden />
          Previous
        </button>

        <div className="flex flex-wrap items-center gap-3">
          {isLast ? null : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
              disabled={submitting}
            >
              Next
              <ArrowRight size={16} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className={`btn ${isLast ? "btn-primary" : "btn-secondary"}`}
            onClick={submit}
            disabled={submitting}
          >
            <Send size={16} aria-hidden />
            {submitting ? "Submitting…" : "Submit answers"}
          </button>
        </div>
      </div>

      {unanswered > 0 ? (
        <p className="mt-3 text-right text-small text-muted">
          {unanswered} unanswered question{unanswered === 1 ? "" : "s"} will count as incorrect.
        </p>
      ) : null}
    </div>
  );
}
