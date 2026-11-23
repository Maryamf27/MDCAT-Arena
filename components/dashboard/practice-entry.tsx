import Link from "next/link";
import { ArrowRight, Library } from "lucide-react";

export function PracticeEntry() {
  return (
    <div className="card flex flex-col gap-6 p-6 md:flex-row md:items-center">
      <span className="grid h-14 w-14 flex-none place-items-center rounded-xl bg-sun text-ink">
        <Library size={28} aria-hidden />
      </span>
      <div className="flex-1">
        <h3 className="text-heading">Practice by subject</h3>
        <p className="mt-1 text-small text-muted">
          Choose Biology, Chemistry, Physics, English, or Logical Reasoning. Only active database questions are served, and empty subjects are clearly marked.
        </p>
      </div>
      <Link href="/practice" className="btn btn-primary btn-lg">
        Choose a subject
        <ArrowRight size={18} aria-hidden />
      </Link>
    </div>
  );
}
