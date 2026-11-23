import { getSubjects } from "@/lib/subjects-data";
import { Skeleton } from "@/components/ui/states";
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

  return (
    <div className="flex flex-col gap-4">
      {result.availabilityMessage ? (
        <p role="status" className="rounded-[10px] border border-line bg-white px-4 py-3 text-small text-muted">
          {result.availabilityMessage}
        </p>
      ) : null}
      <div className={GRID}>
        {result.subjects.map((subject) => (
          <SubjectCard key={subject.meta.key} subject={subject} />
        ))}
      </div>
    </div>
  );
}
