"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Clock3, History, ShieldAlert } from "lucide-react";
import { SUBJECT_META } from "@/lib/subjects";

type TestConfig = { id: string; title: string; description: string | null; duration_seconds: number; question_distribution: Record<string, number>; marks_per_correct: number; negative_marking: boolean; marks_deducted: number; is_provisional: boolean; exam_key: string; category_key: string | null; blueprint_source_name: string | null; blueprint_source_url: string | null; blueprint_verification_status: string; blueprint_verification_note: string | null };
const labels = Object.fromEntries(SUBJECT_META.map((subject) => [subject.key, subject.label]));
const examLabels: Record<string, string> = { mdcat: "MDCAT", ecat: "UET ECAT · Pre-Engineering", nts_nat: "NTS NAT-IE" };

export function MockTestCatalog() {
  const router = useRouter();
  const [tests, setTests] = useState<TestConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<TestConfig | null>(null);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    fetch("/api/mock-tests", { cache: "no-store" }).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error?.message ?? "Examinations could not be loaded");
      setTests(body.data.tests);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Examinations could not be loaded")).finally(() => setLoading(false));
  }, []);
  async function start() {
    if (!selected) return;
    setStarting(true); setError("");
    try {
      const response = await fetch(`/api/mock-tests/${selected.id}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Examination could not start");
      router.push(`/mock-tests/attempt/${body.data.attemptId}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Examination could not start"); setStarting(false); }
  }
  if (loading) return <div className="card p-6 text-muted" role="status">Loading available examinations…</div>;
  return <div className="mx-auto flex max-w-6xl flex-col gap-8">
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div><p className="text-caption">MDCAT Arena · Assessments</p><h1 className="mt-2 text-display">Mock examinations</h1><p className="mt-2 max-w-2xl text-muted">Timed assessments grouped by examination track.</p></div>
      <Link className="btn btn-secondary" href="/mock-tests/history"><History aria-hidden="true"/>Your history</Link>
    </header>
    <div className="rounded-card border border-[#ead9ad] bg-[#fff8e8] p-4 text-sm text-ink"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 shrink-0 text-warning" aria-hidden="true"/><p><strong>Blueprint status is shown per examination.</strong> NAT-IE section counts and duration are verified; its Arena scoring scale remains provisional. Active question counts describe available rows, not syllabus completion.</p></div></div>
    {error ? <p role="alert" className="rounded-card border border-[#efc4c2] bg-[#fdf5f4] p-4 text-error">{error}</p> : null}
    {tests.length ? <div className="grid gap-4 md:grid-cols-2">{tests.map((test) => {
      const count = Object.values(test.question_distribution).reduce((sum, n) => sum + Number(n), 0);
      return <article className="card flex flex-col gap-5 p-6" key={test.id}>
        <div><div className="flex flex-wrap items-center gap-2"><span className="badge">{examLabels[test.exam_key] ?? test.exam_key}</span><span className="badge">{count} questions</span>{test.is_provisional ? <span className="badge badge-warning">Provisional rules</span> : null}<span className={`badge ${test.blueprint_verification_status === "verified" ? "badge-success" : "badge-warning"}`}>{test.blueprint_verification_status} blueprint</span></div><h2 className="mt-3 text-title">{test.title}</h2><p className="mt-2 text-small text-muted">{test.description || `Configured ${examLabels[test.exam_key] ?? "exam"} mock examination.`}</p>{test.blueprint_source_url ? <a className="mt-1 inline-block text-small text-primary underline" href={test.blueprint_source_url} target="_blank" rel="noreferrer">{test.blueprint_source_name}</a> : null}</div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-small text-muted"><span className="inline-flex items-center gap-2"><Clock3 aria-hidden="true"/>{Math.round(test.duration_seconds / 60)} min</span><span className="inline-flex items-center gap-2"><BookOpenCheck aria-hidden="true"/>{Object.entries(test.question_distribution).map(([key, value]) => `${labels[key] ?? key} ${value}`).join(" · ")}</span><span>{test.marks_per_correct} mark per correct{test.negative_marking ? ` · −${test.marks_deducted} incorrect` : " · no negative marking"}</span></div>
        <button type="button" className="btn btn-primary mt-auto self-start" onClick={() => setSelected(test)}>Review instructions</button>
      </article>;
    })}</div> : <div className="state-box"><BookOpenCheck className="text-primary" aria-hidden="true"/><h2 className="text-heading">No mock exams published yet</h2><p className="max-w-xl text-small text-muted">Your question bank and student practice are available, but an administrator must configure and publish a mock examination. No sample exam or fabricated questions are shown here.</p></div>}
    {selected ? <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !starting) setSelected(null); }}><section role="dialog" aria-modal="true" aria-labelledby="mock-instructions-title" className="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6 md:p-8">
      <p className="text-caption">Before you begin</p><h2 id="mock-instructions-title" className="mt-2 text-title">{selected.title}</h2><ul className="mt-5 flex list-disc flex-col gap-2 pl-5 text-small text-muted"><li>Duration: {Math.round(selected.duration_seconds / 60)} minutes. The deadline is enforced using the server session timestamp.</li><li>Choose one option per question. Your answer is saved to your account as you work.</li><li>Use the question palette to navigate and mark questions for review.</li><li>Final submission is scored on the server. You cannot change answers afterward.</li><li>The examination submits automatically when its deadline expires.</li><li>Rules: {selected.marks_per_correct} mark for a correct answer; {selected.negative_marking ? `${selected.marks_deducted} marks deducted for an incorrect answer` : "no negative marking"}. {selected.is_provisional ? "These settings are provisional." : ""}</li></ul>
      {selected.blueprint_verification_note ? <p className="mt-3 text-small text-muted">{selected.blueprint_verification_note}</p> : null}{error ? <p role="alert" className="mt-4 text-small text-error">{error}</p> : null}<div className="mt-6 flex justify-end gap-3"><button type="button" className="btn btn-ghost" disabled={starting} onClick={() => setSelected(null)}>Cancel</button><button type="button" className="btn btn-primary" disabled={starting} onClick={start}>{starting ? "Starting…" : "Start examination"}</button></div>
    </section></div> : null}
  </div>;
}
