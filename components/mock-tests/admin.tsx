"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, CircleAlert, RefreshCw } from "lucide-react";
import { EXAM_BLUEPRINTS } from "@/lib/exam-blueprints";
import { SUBJECT_META, type ExamKey } from "@/lib/subjects";

type StoredConfig = {
  question_distribution: Record<string, number>;
  marks_per_correct: number;
  negative_marking: boolean;
  marks_deducted: number;
  is_provisional: boolean;
  exam_key: ExamKey;
  category_key: string | null;
  blueprint_key: string | null;
  blueprint_source_name: string | null;
  blueprint_source_url: string | null;
  blueprint_verification_status: string;
  blueprint_verified_at: string | null;
  blueprint_verification_note: string | null;
};
type AdminData = {
  tests: { id: string; title: string; description: string | null; status: string; duration_seconds: number; config: StoredConfig | null; attempts: number; submitted: number; averagePercentage: number | null }[];
  questionAvailability: { subjectKey: string; subject: string; examKey: ExamKey; categoryKey: string | null; activeQuestions: number }[];
};

const EXAMS: { key: ExamKey; label: string }[] = [
  { key: "mdcat", label: "MDCAT" },
  { key: "ecat", label: "UET ECAT · Pre-Engineering" },
  { key: "nts_nat", label: "NTS NAT-IE" },
];

export function MockTestAdmin() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [examKey, setExamKey] = useState<ExamKey>("mdcat");
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [minutes, setMinutes] = useState("");
  const [distribution, setDistribution] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState("1");
  const [negative, setNegative] = useState(false);
  const [deduction, setDeduction] = useState("0");
  const [provisional, setProvisional] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/mock-tests/admin", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Admin view is unavailable");
      setData(json.data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Admin view is unavailable");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function chooseExam(nextExam: ExamKey) {
    const blueprint = EXAM_BLUEPRINTS.find((item) => item.examKey === nextExam);
    setExamKey(nextExam);
    setCategoryKey(blueprint?.categoryKey ?? null);
    setMinutes(blueprint ? String(blueprint.durationSeconds / 60) : "");
    setDistribution(blueprint ? Object.fromEntries(Object.entries(blueprint.distribution).map(([key, value]) => [key, String(value)])) : {});
    setMarks(blueprint ? String(blueprint.marksPerCorrect) : "1");
    setNegative(blueprint?.negativeMarking ?? false);
    setDeduction(String(blueprint?.marksDeducted ?? 0));
    setProvisional(blueprint?.provisional ?? true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const normalized = Object.fromEntries(
      Object.entries(distribution).filter(([, value]) => Number(value) > 0).map(([key, value]) => [key, Number(value)])
    );
    const config = {
      examKey, categoryKey, title, description, durationSeconds: Number(minutes) * 60,
      distribution: normalized, marksPerCorrect: Number(marks), negativeMarking: negative,
      marksDeducted: negative ? Number(deduction) : 0, provisional,
    };
    try {
      const response = await fetch(editingId ? `/api/mock-tests/admin/${editingId}` : "/api/mock-tests", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { config } : { ...config, publish: false }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Configuration could not be saved");
      setMessage(editingId ? "Configuration updated." : "Draft configuration created. Check coverage before publishing.");
      setEditingId(null);
      setTitle(""); setDescription(""); setMinutes(""); setDistribution({}); setMarks("1");
      setNegative(false); setDeduction("0"); setProvisional(true); setExamKey("mdcat"); setCategoryKey(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Configuration could not be saved");
    } finally {
      setBusy(false);
    }
  }

  function edit(test: AdminData["tests"][number]) {
    if (!test.config || test.attempts > 0) return;
    setEditingId(test.id);
    setExamKey(test.config.exam_key);
    setCategoryKey(test.config.category_key);
    setTitle(test.title);
    setDescription(test.description ?? "");
    setMinutes(String(test.duration_seconds / 60));
    setDistribution(Object.fromEntries(Object.entries(test.config.question_distribution).map(([key, value]) => [key, String(value)])));
    setMarks(String(test.config.marks_per_correct));
    setNegative(test.config.negative_marking);
    setDeduction(String(test.config.marks_deducted));
    setProvisional(test.config.is_provisional);
    document.getElementById("mock-config-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function publish(id: string, status: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/mock-tests/admin/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status === "published" ? "draft" : "published" }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Status could not be changed");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status could not be changed");
    } finally {
      setBusy(false);
    }
  }

  const blueprint = EXAM_BLUEPRINTS.find((item) => item.examKey === examKey && item.categoryKey === categoryKey);
  const examSubjects = SUBJECT_META.filter((subject) => subject.examKey === examKey && subject.categoryKey === categoryKey);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-caption">Authorized administrators</p><h1 className="mt-2 text-display">Mock test management</h1><p className="mt-2 text-muted">Configure an examination track, its blueprint, and verified question coverage.</p></div>
        <Link href="/mock-tests" className="btn btn-ghost">Student view</Link>
      </header>
      {error ? <p role="alert" className="rounded-control border border-[#efc4c2] bg-[#fdf5f4] p-4 text-small text-error">{error}</p> : null}
      {message ? <p role="status" className="rounded-control border border-line bg-mint-soft p-4 text-small text-primary">{message}</p> : null}

      <section className="card p-5 md:p-7">
        <h2 className="text-title">Active question availability</h2>
        <p className="mt-1 text-small text-muted">Counts are scoped to each examination and category.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data?.questionAvailability.map((subject) => <div className="rounded-control border border-line bg-canvas p-4" key={subject.subjectKey}>
            <p className="text-caption">{EXAMS.find((exam) => exam.key === subject.examKey)?.label}</p>
            <p className="text-small text-muted">{subject.subject}</p><p className="font-heading text-2xl font-bold">{subject.activeQuestions}</p>
          </div>)}
        </div>
      </section>

      <section id="mock-config-form" className="card scroll-mt-24 p-5 md:p-7">
        <h2 className="text-title">{editingId ? "Edit examination configuration" : "Create draft configuration"}</h2>
        <form className="mt-5 flex flex-col gap-4" onSubmit={save}>
          <label className="flex flex-col gap-1 text-small font-bold">Examination track
            <select className="field" value={examKey} disabled={Boolean(editingId)} onChange={(event) => chooseExam(event.target.value as ExamKey)}>
              {EXAMS.map((exam) => <option key={exam.key} value={exam.key}>{exam.label}</option>)}
            </select>
          </label>
          {blueprint ? <div className="rounded-control border border-line bg-canvas p-3 text-small">
            <p><strong>{blueprint.label}</strong> · {blueprint.verificationStatus} blueprint</p>
            <a className="text-primary underline" href={blueprint.sourceUrl} target="_blank" rel="noreferrer">{blueprint.sourceName}</a>
            <p className="mt-1 text-muted">{blueprint.verificationNote}</p>
          </div> : <p className="text-small text-warning">No official MDCAT blueprint is stored here. Custom MDCAT rules remain unverified and provisional.</p>}
          <label className="flex flex-col gap-1 text-small font-bold">Exam title<input required maxLength={120} className="field" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="flex flex-col gap-1 text-small font-bold">Description<textarea maxLength={1000} className="field min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-small font-bold">Duration (minutes)<input required type="number" min="1" max="480" className="field" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
            <label className="flex flex-col gap-1 text-small font-bold">Arena points per correct answer<input required type="number" min="0.01" max="100" step="0.25" className="field" value={marks} onChange={(event) => setMarks(event.target.value)} /></label>
          </div>
          <fieldset className="rounded-control border border-line p-4">
            <legend className="px-1 font-heading font-bold">Questions per subject</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {examSubjects.map((subject) => <label key={subject.key} className="flex flex-col gap-1 text-small">{subject.label}
                <input type="number" min="0" max="500" className="field" value={distribution[subject.key] ?? ""} placeholder="0 / omit" onChange={(event) => setDistribution((old) => ({ ...old, [subject.key]: event.target.value }))} />
              </label>)}
            </div>
          </fieldset>
          <label className="flex items-center gap-3 text-small"><input type="checkbox" checked={negative} onChange={(event) => setNegative(event.target.checked)} />Enable negative marking only when verified by an approved blueprint</label>
          {negative ? <label className="flex flex-col gap-1 text-small font-bold">Points deducted per incorrect answer<input required type="number" min="0" max="100" step="0.25" className="field" value={deduction} onChange={(event) => setDeduction(event.target.value)} /></label> : null}
          <label className="flex items-center gap-3 text-small"><input type="checkbox" checked={provisional} onChange={(event) => setProvisional(event.target.checked)} />Mark scoring/configuration as provisional</label>
          <p className="text-small text-warning">Changing an official blueprint setting marks the saved configuration unverified. Publishing also requires the full configured question count for every subject.</p>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Save as draft"}</button>
            {editingId ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditingId(null)}>Cancel editing</button> : null}
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-title">Configured examinations</h2>
        {!data ? <p className="mt-3 text-muted" role="status">Loading configurations…</p> : data.tests.length ? <div className="mt-4 flex flex-col gap-3">
          {data.tests.map((test) => <article className="card flex flex-wrap items-center justify-between gap-4 p-5" key={test.id}>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-heading">{test.title}</h3><span className={`badge ${test.status === "published" ? "badge-success" : "badge-neutral"}`}>{test.status}</span>
                {test.config ? <span className={`badge ${test.config.blueprint_verification_status === "verified" ? "badge-success" : "badge-warning"}`}>{test.config.blueprint_verification_status} blueprint</span> : null}
              </div>
              <p className="text-small text-muted">{Math.round(test.duration_seconds / 60)} min · {Object.values(test.config?.question_distribution ?? {}).reduce((sum, count) => sum + Number(count), 0)} questions · {test.attempts} attempts · {test.submitted} submitted{test.averagePercentage === null ? "" : ` · ${test.averagePercentage}% average`}</p>
              {test.config?.blueprint_source_url ? <a className="text-small text-primary underline" href={test.config.blueprint_source_url} target="_blank" rel="noreferrer">{test.config.blueprint_source_name}</a> : null}
              {test.config?.blueprint_verification_note ? <p className="text-small text-muted">{test.config.blueprint_verification_note}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || !test.config || test.attempts > 0} className="btn btn-ghost btn-sm" onClick={() => edit(test)}>{test.attempts ? "Locked after attempt" : "Edit"}</button>
              <button type="button" disabled={busy || !test.config} className="btn btn-secondary btn-sm" onClick={() => void publish(test.id, test.status)}>{test.status === "published" ? "Deactivate" : "Publish"}<Check aria-hidden="true" /></button>
            </div>
          </article>)}
        </div> : <div className="state-box mt-4"><CircleAlert aria-hidden="true" /><p>No mock test configurations have been created.</p></div>}
      </section>
      <button type="button" onClick={() => void refresh()} className="btn btn-ghost self-start"><RefreshCw aria-hidden="true" />Refresh data</button>
    </main>
  );
}
