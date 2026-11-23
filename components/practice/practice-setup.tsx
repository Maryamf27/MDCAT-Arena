"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, Filter, LoaderCircle } from "lucide-react";

type SyllabusTree = { units: { id: string; label: string; topics: { id: string; label: string; slos: { id: string; label: string }[] }[] }[] };
export type PracticeSelection = { unitId?: string; topicId?: string; sloId?: string };

export function PracticeSetup({
  subjectKey,
  subjectLabel,
  questionCount,
  busy,
  emptyMessage,
  onStart,
}: {
  subjectKey: string;
  subjectLabel: string;
  questionCount: number | null;
  busy: boolean;
  emptyMessage?: string;
  onStart: (filters: PracticeSelection) => void;
}) {
  const [tree, setTree] = useState<SyllabusTree | null>(null);
  const [treeError, setTreeError] = useState("");
  const [unitId, setUnitId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [sloId, setSloId] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/practice/structure?subject=${encodeURIComponent(subjectKey)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? "Syllabus filters are unavailable");
        if (active) setTree(body.data as SyllabusTree);
      })
      .catch((error: unknown) => {
        if (active) setTreeError(error instanceof Error ? error.message : "Syllabus filters are unavailable");
      });
    return () => { active = false; };
  }, [subjectKey]);

  const selectedUnit = tree?.units.find((unit) => unit.id === unitId);
  const selectedTopic = selectedUnit?.topics.find((topic) => topic.id === topicId);
  const noSubjectQuestions = questionCount === 0;
  const availabilityUnavailable = questionCount === null;

  return (
    <section className="card flex flex-col gap-5 p-5 md:p-7" aria-labelledby="practice-setup-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption">MDCAT practice</p>
          <h1 id="practice-setup-title" className="mt-1 text-title">{subjectLabel}</h1>
          <p className="mt-1 text-small text-muted">Questions are selected from active database rows only.</p>
        </div>
        <span className={`badge ${questionCount === null ? "badge-neutral" : questionCount === 0 ? "badge-warning" : "badge-success"}`}>
          {questionCount === null ? "Availability unavailable" : `${questionCount} active questions`}
        </span>
      </div>
      {emptyMessage ? <p role="status" className="rounded-[10px] border border-line bg-canvas p-3 text-small text-muted">{emptyMessage}</p> : null}
      {noSubjectQuestions ? <div className="rounded-[10px] border border-[#ead9ad] bg-[#fff8e8] p-4 text-small text-ink"><strong>Questions coming soon.</strong> There are currently no active {subjectLabel} questions in the database.</div> : null}
      {availabilityUnavailable ? <p role="status" className="rounded-[10px] border border-line bg-canvas p-3 text-small text-muted">Live question availability could not be verified. No questions are shown or generated while the database is unavailable.</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-small font-bold">Unit
          <select className="select" value={unitId} disabled={!tree || busy} onChange={(event) => { setUnitId(event.target.value); setTopicId(""); setSloId(""); }}>
            <option value="">All units</option>
            {tree?.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small font-bold">Topic
          <select className="select" value={topicId} disabled={!selectedUnit || busy} onChange={(event) => { setTopicId(event.target.value); setSloId(""); }}>
            <option value="">All topics</option>
            {selectedUnit?.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small font-bold">Syllabus learning outcome (SLO)
          <select className="select" value={sloId} disabled={!selectedTopic || busy} onChange={(event) => setSloId(event.target.value)}>
            <option value="">All SLOs</option>
            {selectedTopic?.slos.map((slo) => <option key={slo.id} value={slo.id}>{slo.label}</option>)}
          </select>
        </label>
      </div>
      {treeError ? <p role="status" className="text-small text-warning">{treeError} You can still practice with no syllabus filter.</p> : null}
      <button type="button" className="btn btn-primary self-start" disabled={busy || noSubjectQuestions || availabilityUnavailable} onClick={() => onStart({ unitId: unitId || undefined, topicId: topicId || undefined, sloId: sloId || undefined })}>
        {busy ? <><LoaderCircle className="animate-spin" aria-hidden="true"/>Loading questions…</> : <><BookOpenCheck aria-hidden="true"/>{emptyMessage ? "Try these filters" : "Start practice"}</>}
        {!busy && !emptyMessage ? <Filter aria-hidden="true"/> : null}
      </button>
    </section>
  );
}
