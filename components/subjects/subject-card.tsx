import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SubjectRecord } from "@/lib/subjects-data";
import { Badge } from "@/components/ui/badge";
import { SubjectIcon } from "./subject-icon";

export function SubjectCard({ subject }: { subject: SubjectRecord }) {
  return (
    <article className="card card-interactive flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-2">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-mint text-primary">
          <SubjectIcon name={subject.meta.icon} />
        </span>
        {subject.unitCount !== null ? (
          <Badge tone="neutral">
            {subject.unitCount} {subject.unitCount === 1 ? "unit" : "units"}
          </Badge>
        ) : null}
      </div>

      <div className="flex-1">
        <h3 className="text-heading">{subject.name}</h3>
        <p className="text-small text-muted">{subject.meta.blurb}</p>
      </div>

      <Link
        href={`/practice/${subject.meta.key}`}
        className="btn btn-secondary w-full"
        aria-label={`Practice ${subject.name}`}
      >
        Practice
        <ArrowRight size={16} aria-hidden />
      </Link>
    </article>
  );
}
