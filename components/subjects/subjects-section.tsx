import { getSubjects } from "@/lib/subjects-data";
import { Skeleton } from "@/components/ui/states";
import { SubjectCard } from "./subject-card";

const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";
const EXAM_GROUPS = [
  { key: "mdcat", title: "MDCAT", description: "Medical and dental entry test practice." },
  { key: "ecat", title: "UET ECAT · Pre-Engineering", description: "Mathematics, Physics, Chemistry, and English." },
  { key: "nts_nat", title: "NTS NAT-IE", description: "English, Analytical, Quantitative, Physics, Chemistry, and Mathematics." },
] as const;

export function SubjectsSkeleton() {
  return (
    <div className={GRID} aria-busy="true" aria-label="Loading subjects">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card flex flex-col gap-4 p-6">
          <Skeleton className="h-12 w-12" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Server component: reads real subject records (and their IDs) from Supabase. */
export async function SubjectsSection() {
  const result = await getSubjects();

  return (
    <div className="flex flex-col gap-4">
      {result.availabilityMessage ? (
        <p role="status" className="rounded-[10px] border border-line bg-white px-4 py-3 text-small text-muted">
          {result.availabilityMessage}
        </p>
      ) : null}
      {EXAM_GROUPS.map((exam) => {
        const subjects = result.subjects.filter((subject) => subject.meta.examKey === exam.key);
        return (
          <section key={exam.key} aria-labelledby={`exam-${exam.key}`}>
            <h2 id={`exam-${exam.key}`} className="text-title">{exam.title}</h2>
            <p className="mt-1 text-small text-muted">{exam.description}</p>
            <div className={`${GRID} mt-4`}>
              {subjects.map((subject) => <SubjectCard key={subject.meta.key} subject={subject} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
