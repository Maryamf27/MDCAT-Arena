import { BookX } from "lucide-react";
import { getSubjects } from "@/lib/subjects-data";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { SubjectCard } from "./subject-card";

const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";

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

  if (!result.ok) {
    return <ErrorState description={result.message} />;
  }
  if (result.subjects.length === 0) {
    return (
      <EmptyState
        icon={BookX}
        title="No subjects found"
        description="The subjects table has no MDCAT subjects yet. Run the syllabus import and check back."
      />
    );
  }

  return (
    <div className={GRID}>
      {result.subjects.map((subject) => (
        <SubjectCard key={subject.id} subject={subject} />
      ))}
    </div>
  );
}
