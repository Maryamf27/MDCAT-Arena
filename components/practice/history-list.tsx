"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, History, ListFilter } from "lucide-react";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Select } from "@/components/ui/select";
import { SUBJECT_META } from "@/lib/subjects";

type Attempt = {
  id: string; status: string; startedAt: string; submittedAt: string | null; score: number; totalPoints: number;
  percentage: number; subject: { key: string; label: string } | null;
};
type HistoryResponse = { attempts: Attempt[]; page: number; totalPages: number; total: number };

export function HistoryList() {
  const [subject, setSubject] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const query = new URLSearchParams({ page: String(page), limit: "10" });
      if (subject) query.set("subject", subject);
      const response = await fetch(`/api/practice/history?${query}`, { cache: "no-store", signal });
      setError(null);
      if (response.status === 401) { setSignedOut(true); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Your practice history could not be loaded.");
      setSignedOut(false);
      setData(body.data as HistoryResponse);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Your practice history could not be loaded.");
    }
  }, [page, subject]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  if (signedOut) return <EmptyState icon={History} title="Sign in to view your history" description="Your saved practice results are private to your account." action={<Link className="btn btn-primary" href={`/login?next=${encodeURIComponent("/practice/history")}`}>Sign in</Link>} />;
  if (error) return <ErrorState title="History unavailable" description={error} action={<button className="btn btn-primary" onClick={() => void load()}>Try again</button>} />;
  if (!data) return <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading practice history">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 w-full" />)}</div>;

  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <Select
        className="min-w-52"
        label="Filter by subject"
        labelIcon={<ListFilter size={16} aria-hidden />}
        labelClassName="text-small font-bold text-ink"
        value={subject}
        onChange={(value) => { setPage(1); setSubject(value); }}
        options={[{ value: "", label: "All subjects" }, ...SUBJECT_META.map((item) => ({ value: item.key, label: item.label }))]}
      />
      <p className="text-small text-muted" aria-live="polite">{data.total} completed {data.total === 1 ? "attempt" : "attempts"}</p>
    </div>
    {data.attempts.length === 0 ? <EmptyState icon={History} title="No completed practice yet" description="Finish a practice session and your saved results will appear here." action={<Link className="btn btn-primary" href="/practice">Start practicing</Link>} /> : <>
      <ol className="flex flex-col gap-3">
        {data.attempts.map((attempt) => <li key={attempt.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-heading">{attempt.subject?.label ?? "Practice"}</h2><span className="badge badge-success">Completed</span></div>
            <p className="mt-1 text-small text-muted">{new Date(attempt.submittedAt ?? attempt.startedAt).toLocaleString()}</p>
            <p className="mt-2 text-small text-ink">{attempt.score} correct of {attempt.totalPoints} questions <span className="text-muted">· {attempt.percentage}%</span></p>
          </div>
          <Link className="btn btn-secondary shrink-0" href={`/practice/history/${attempt.id}`}>View results</Link>
        </li>)}
      </ol>
      <nav className="flex items-center justify-between gap-3" aria-label="History pages">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft size={16} aria-hidden /> Previous</button>
        <p className="text-small text-muted" aria-live="polite">Page {data.page} of {Math.max(data.totalPages, 1)}</p>
        <button className="btn btn-ghost" disabled={page >= data.totalPages} onClick={() => setPage((current) => current + 1)}>Next <ArrowRight size={16} aria-hidden /></button>
      </nav>
    </>}
  </div>;
}
