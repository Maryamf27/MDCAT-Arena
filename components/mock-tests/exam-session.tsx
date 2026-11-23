"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bookmark, Check, Clock3, Send } from "lucide-react";

type Question = { id: string; question: string; options: string[]; difficulty: string; position: number; visited: boolean; markedForReview: boolean; selectedIndex: number | null; subject_id: string; slo_reference: string };
type Session = { attempt: { id: string; started_at: string; expires_at: string; status: string }; test: { title: string; duration_seconds: number }; questions: Question[] };
type SaveState = "saved" | "saving" | "failed";
type PendingAnswer = { questionId: string; selectedIndex: number | null; markedForReview: boolean; visited: boolean };

function formatTime(seconds: number) { const safe = Math.max(0, seconds); return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`; }

export function MockExamSession({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [review, setReview] = useState<Record<string, boolean>>({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requestLocks = useRef(new Map<string, boolean>());
  const latestPayload = useRef(new Map<string, PendingAnswer>());
  const submitLock = useRef(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/mock-tests/attempts/${attemptId}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (response.status === 409 && body?.error?.code === "already_submitted") {
        router.replace(`/mock-tests/results/${attemptId}`);
        return;
      }
      if (!response.ok) throw new Error(body?.error?.message ?? "The session could not be restored");
      if (!active) return;
      const data = body.data as Session;
      setSession(data);
      setRemaining(Math.max(0, Math.ceil((new Date(data.attempt.expires_at).getTime() - Date.now()) / 1000)));
      const nextAnswers: Record<string, number | null> = {};
      const nextVisited: Record<string, boolean> = {};
      const nextReview: Record<string, boolean> = {};
      data.questions.forEach((q) => { nextAnswers[q.id] = q.selectedIndex; nextVisited[q.id] = q.visited; nextReview[q.id] = q.markedForReview; });
      setAnswers(nextAnswers); setVisited(nextVisited); setReview(nextReview);
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "The session could not be restored"); });
    return () => { active = false; };
  }, [attemptId, router]);

  const save = useCallback(async (payload: PendingAnswer) => {
    if (!session) return;
    latestPayload.current.set(payload.questionId, payload);
    if (requestLocks.current.get(payload.questionId)) return;
    requestLocks.current.set(payload.questionId, true);
    setSaveState("saving");
    try {
      while (latestPayload.current.has(payload.questionId)) {
        const newest = latestPayload.current.get(payload.questionId)!;
        latestPayload.current.delete(payload.questionId);
        const response = await fetch(`/api/mock-tests/attempts/${attemptId}/answers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newest) });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? "Answer could not be saved");
      }
      setSaveState("saved"); setError("");
    } catch (e) { setSaveState("failed"); setError(e instanceof Error ? e.message : "Answer could not be saved. Retry your connection."); }
    finally { requestLocks.current.delete(payload.questionId); }
  }, [attemptId, session]);

  const finish = useCallback(async () => {
    if (submitLock.current) return;
    if (requestLocks.current.size > 0 || latestPayload.current.size > 0) {
      setError("Please wait for your latest answers to finish saving before submitting.");
      return;
    }
    submitLock.current = true; setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/mock-tests/attempts/${attemptId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Submission failed");
      router.replace(`/mock-tests/results/${attemptId}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Submission failed. Retry when connected."); submitLock.current = false; setSubmitting(false); }
  }, [attemptId, router]);

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((new Date(session.attempt.expires_at).getTime() - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) void finish();
    }, 1000);
    return () => window.clearInterval(id);
  }, [finish, session]);

  const question = session?.questions[current];
  const counts = useMemo(() => ({ answered: Object.values(answers).filter((value) => value !== null && value !== undefined).length, review: Object.values(review).filter(Boolean).length }), [answers, review]);
  function updateQuestion(patch: Partial<PendingAnswer>) {
    if (!question || !session || submitting) return;
    const value = { questionId: question.id, selectedIndex: answers[question.id] ?? null, markedForReview: review[question.id] ?? false, visited: true, ...patch };
    if ("selectedIndex" in patch) setAnswers((state) => ({ ...state, [question.id]: value.selectedIndex }));
    if ("markedForReview" in patch) setReview((state) => ({ ...state, [question.id]: value.markedForReview }));
    setVisited((state) => ({ ...state, [question.id]: true }));
    void save(value);
  }
  function navigate(index: number) {
    if (!session || !question) return;
    updateQuestion({ visited: true });
    const target = session.questions[index];
    setCurrent(index);
    if (target && !visited[target.id]) {
      setVisited((state) => ({ ...state, [target.id]: true }));
      void save({ questionId: target.id, selectedIndex: answers[target.id] ?? null, markedForReview: review[target.id] ?? false, visited: true });
    }
  }

  if (error && !session) return <div className="mx-auto max-w-3xl"><div className="state-box state-box-error"><h1 className="text-title">Could not restore your exam</h1><p>{error}</p><Link className="btn btn-primary" href="/mock-tests">Back to mock tests</Link></div></div>;
  if (!session || !question) return <div className="mx-auto max-w-4xl card p-6" role="status">Restoring your examination session…</div>;
  const left = session.questions.length - counts.answered;
  const urgent = remaining <= 300;
  return <main className="mx-auto flex max-w-6xl flex-col gap-4">
    <header className="card flex flex-wrap items-center justify-between gap-4 p-4 md:px-6">
      <div className="min-w-0"><p className="text-caption">MDCAT Arena · Timed examination</p><h1 className="truncate text-heading">{session.test.title}</h1><p className="text-small text-muted">{counts.answered} of {session.questions.length} answered</p></div>
      <div className={`flex items-center gap-2 rounded-[10px] border px-4 py-2 font-heading text-lg font-bold tabular-nums ${urgent ? "border-[#e4b6b4] bg-[#fdf5f4] text-error" : "border-line bg-canvas text-ink"}`} role="timer" aria-live="off"><Clock3 aria-hidden="true"/>{formatTime(remaining)}<span className="sr-only">remaining</span></div>
    </header>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between text-small"><span className="font-bold">Question {current + 1} of {session.questions.length}</span><span role="status" aria-live="polite" className={saveState === "failed" ? "text-error" : "text-muted"}>{saveState === "saving" ? "Saving…" : saveState === "failed" ? "Save failed" : "All changes saved"}</span></div>
        <article className="card p-5 md:p-8"><div className="mb-5 flex flex-wrap items-center gap-2"><span className="badge">{question.difficulty}</span><span className="badge badge-neutral">SLO {question.slo_reference}</span></div><h2 className="whitespace-pre-wrap text-lg font-bold leading-8 text-ink md:text-xl">{question.question}</h2><div role="radiogroup" aria-label={`Answer options for question ${current + 1}`} className="mt-6 flex flex-col gap-3">{question.options.map((option, index) => <button key={index} type="button" role="radio" aria-checked={answers[question.id] === index} disabled={submitting} onClick={() => updateQuestion({ selectedIndex: index })} className="option"><span className="option-letter">{String.fromCharCode(65 + index)}</span><span className="flex-1 pt-1 text-left">{option}</span>{answers[question.id] === index ? <Check aria-hidden="true" className="text-primary"/> : null}</button>)}</div>
          <button type="button" className={`btn mt-5 ${review[question.id] ? "btn-accent" : "btn-ghost"}`} aria-pressed={Boolean(review[question.id])} disabled={submitting} onClick={() => updateQuestion({ markedForReview: !review[question.id] })}><Bookmark aria-hidden="true"/>{review[question.id] ? "Marked for review" : "Mark for review"}</button>
        </article>
        <div className="flex flex-wrap justify-between gap-3"><button type="button" className="btn btn-ghost" disabled={current === 0 || submitting} onClick={() => navigate(current - 1)}><ArrowLeft aria-hidden="true"/>Previous</button><div className="flex gap-3">{current < session.questions.length - 1 ? <button type="button" className="btn btn-primary" disabled={submitting} onClick={() => navigate(current + 1)}>Next<ArrowRight aria-hidden="true"/></button> : null}<button type="button" className="btn btn-secondary" disabled={submitting} onClick={() => setConfirm(true)}><Send aria-hidden="true"/>Submit</button></div></div>
      </section>
      <aside className="card p-4 md:p-5"><h2 className="text-heading">Question palette</h2><p className="mt-1 text-small text-muted">Choose a number to jump to that question.</p><div className="mt-4 grid grid-cols-5 gap-2">{session.questions.map((item, index) => {
        const answered = answers[item.id] !== null && answers[item.id] !== undefined;
        const marked = review[item.id]; const active = index === current;
        const style = active ? "border-primary bg-primary text-white" : marked ? answered ? "border-warning bg-[#fff3d7] text-ink" : "border-warning bg-white text-warning" : answered ? "border-primary bg-mint-soft text-primary" : visited[item.id] ? "border-muted bg-canvas text-muted" : "border-line bg-white text-muted";
        return <button type="button" key={item.id} aria-label={`Question ${index + 1}${answered ? ", answered" : visited[item.id] ? ", visited unanswered" : ", not visited"}${marked ? ", marked for review" : ""}`} aria-current={active ? "step" : undefined} className={`grid aspect-square place-items-center rounded-[8px] border font-heading text-sm font-bold ${style}`} onClick={() => navigate(index)}>{index + 1}</button>;
      })}</div><ul className="mt-5 flex flex-col gap-2 text-xs text-muted"><li className="flex items-center gap-2"><span className="size-3 rounded-sm border border-line bg-white"/>Not visited</li><li className="flex items-center gap-2"><span className="size-3 rounded-sm border border-muted bg-canvas"/>Visited unanswered</li><li className="flex items-center gap-2"><span className="size-3 rounded-sm border border-primary bg-mint-soft"/>Answered</li><li className="flex items-center gap-2"><span className="size-3 rounded-sm border border-warning bg-white"/>Marked for review</li><li className="flex items-center gap-2"><span className="size-3 rounded-sm border border-warning bg-[#fff3d7]"/>Answered + review</li></ul><div className="mt-5 border-t border-line pt-4 text-small text-muted">{left} unanswered · {counts.review} for review</div></aside>
    </div>
    {error ? <p role="alert" className="rounded-[10px] border border-[#efc4c2] bg-[#fdf5f4] p-3 text-small text-error">{error} {saveState === "failed" ? <button className="underline" onClick={() => question && updateQuestion({})}>Retry save</button> : null}</p> : null}
    {confirm ? <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="submit-title" className="card w-full max-w-lg p-6"><h2 id="submit-title" className="text-title">Submit examination?</h2><p className="mt-2 text-small text-muted">Your answers cannot be changed after submission.</p><dl className="mt-5 grid grid-cols-2 gap-3 text-small"><dt>Total questions</dt><dd className="text-right font-bold">{session.questions.length}</dd><dt>Answered</dt><dd className="text-right font-bold">{counts.answered}</dd><dt>Unanswered</dt><dd className="text-right font-bold">{left}</dd><dt>Marked for review</dt><dd className="text-right font-bold">{counts.review}</dd><dt>Time remaining</dt><dd className="text-right font-bold">{formatTime(remaining)}</dd></dl>{saveState !== "saved" ? <p className="mt-3 text-small text-warning">Some answers may still be saving. Wait for the saved indicator before continuing.</p> : null}<div className="mt-6 flex justify-end gap-3"><button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)} disabled={submitting}>Continue exam</button><button type="button" className="btn btn-primary" onClick={() => { setConfirm(false); void finish(); }} disabled={submitting || saveState !== "saved"}>{submitting ? "Submitting…" : "Confirm submission"}</button></div></section></div> : null}
  </main>;
}
