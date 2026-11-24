import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PracticeSession } from "@/components/practice/practice-session";
import { Skeleton } from "@/components/ui/states";
import { SUBJECT_KEYS, getSubjectMetaByKey, isSubjectKey, type SubjectKey } from "@/lib/subjects";
import { getSubjects } from "@/lib/subjects-data";

export function generateStaticParams() {
  return SUBJECT_KEYS.map((subject) => ({ subject }));
}

export async function generateMetadata(props: PageProps<"/practice/[subject]">): Promise<Metadata> {
  const { subject } = await props.params;
  if (!isSubjectKey(subject)) return { title: "Practice" };
  return { title: `${getSubjectMetaByKey(subject).label} Practice` };
}

export default async function PracticeSubjectPage(props: PageProps<"/practice/[subject]">) {
  const { subject } = await props.params;
  if (!isSubjectKey(subject)) notFound();

  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-3xl flex-col gap-4" aria-busy="true" aria-label="Loading practice">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <SubjectPractice subjectKey={subject} />
    </Suspense>
  );
}

/** Reads live question counts from Supabase at request time. */
async function SubjectPractice({ subjectKey }: { subjectKey: SubjectKey }) {
  const meta = getSubjectMetaByKey(subjectKey);
  const availability = await getSubjects();
  const questionCount = availability.subjects.find((item) => item.meta.key === subjectKey)?.questionCount ?? null;
  return <PracticeSession subjectKey={meta.key} subjectLabel={meta.label} questionCount={questionCount} />;
}
