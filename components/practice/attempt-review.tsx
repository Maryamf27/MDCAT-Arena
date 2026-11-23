"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";

type Review = {
  attempt: { id: string; status: string; startedAt: string; submittedAt: string | null; score: number; totalPoints: number; percentage: number; subject: { label: string } | null };
  answers: { questionId: string; selectedIndex: number | null; isCorrect: boolean; question: string; options: string[]; correctIndex: number | null; explanation: string | null; topic: string | null }[];
};

export function AttemptReview({ attemptId }: { attemptId: string }) {
  const [data, setData] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/practice/history/${encodeURIComponent(attemptId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (response.status === 401) { setUnauthorized(true); return; }
        if (!response.ok) throw new Error(body?.error?.message ?? "These saved results could not be loaded.");
        setData(body.data as Review);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "These saved results could not be loaded.");
      });
    return () => controller.abort();
  }, [attemptId]);
  if (unauthorized) return <EmptyState icon={BookOpenCheck} title="Sign in to view results" description="Saved results can only be viewed by the student who completed the attempt." action={<Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(`/practice/history/${attemptId}`)}`}>Sign in</Link>} />;
  if (error) return <ErrorState title="Results unavailable" description={error} action={<Link className="btn btn-ghost" href="/practice/history">Back to history</Link>} />;
  if (!data) return <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading saved results"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>;
  const { attempt, answers } = data;
  return <div className="mx-auto flex max-w-3xl flex-col gap-6">
    <Link className="inline-flex w-fit items-center gap-2 text-small font-bold text-primary hover:underline" href="/practice/history"><ArrowLeft size={16} aria-hidden /> Back to history</Link>
    <section className="card p-5 sm:p-7" aria-label="Saved score summary">
      <p className="text-caption">{attempt.subject?.label ?? "Practice"} · saved result</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-3"><p className="font-heading text-5xl font-extrabold text-primary">{attempt.percentage}%</p><p className="text-small text-muted">{attempt.score} of {attempt.totalPoints} correct</p></div>
      <p className="mt-3 text-small text-muted">{new Date(attempt.submittedAt ?? attempt.startedAt).toLocaleString()} · {attempt.totalPoints} questions</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-primary" style={{ width: `${Math.min(attempt.percentage, 100)}%` }} /></div>
    </section>
    <section className="flex flex-col gap-3" aria-label="Saved answer review">
      <h2 className="text-title">Answer review</h2>
      {answers.length === 0 ? <EmptyState icon={BookOpenCheck} title="No saved answers found" description="The saved score is available, but answer review is not present for this attempt." /> : answers.map((answer, index) => <article key={answer.questionId} className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-caption">Question {index + 1}{answer.topic ? ` · ${answer.topic}` : ""}</span><span className={`badge ${answer.isCorrect ? "badge-success" : "badge-error"}`}>{answer.isCorrect ? "Correct" : answer.selectedIndex === null ? "Unanswered" : "Incorrect"}</span></div>
        <h3 className="mt-3 text-base font-bold">{answer.question}</h3>
        <ol className="mt-3 flex flex-col gap-2">
          {answer.options.map((option, optionIndex) => <li key={`${answer.questionId}-${optionIndex}`} className={`rounded-[10px] border px-3 py-2 text-small ${optionIndex === answer.correctIndex ? "border-success bg-[#e6f4ed]" : optionIndex === answer.selectedIndex ? "border-error bg-[#fbeceb]" : "border-line bg-white"}`}>
            <span className="font-bold">{String.fromCharCode(65 + optionIndex)}. </span>{option}{optionIndex === answer.correctIndex ? <span className="ml-2 font-bold text-success">Correct answer</span> : null}{optionIndex === answer.selectedIndex ? <span className="ml-2 font-bold">Your answer</span> : null}
          </li>)}
        </ol>
        {answer.explanation ? <p className="mt-3 rounded-[10px] bg-mint-soft p-3 text-small text-ink"><span className="font-bold">Explanation: </span>{answer.explanation}</p> : null}
      </article>)}
    </section>
  </div>;
}
