import Link from "next/link";
import { ArrowRight, Dna } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function PracticeEntry() {
  return (
    <div className="card flex flex-col gap-6 p-6 md:flex-row md:items-center">
      <span className="grid h-14 w-14 flex-none place-items-center rounded-xl bg-sun text-ink">
        <Dna size={28} aria-hidden />
      </span>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-heading">Biology practice</h3>
          <Badge tone="warning">Sample set</Badge>
        </div>
        <p className="mt-1 text-small text-muted">
          Biology is the first subject with approved questions. Work through a short
          session, submit your answers and review the explanations.
        </p>
      </div>
      <Link href="/practice/biology" className="btn btn-primary btn-lg">
        Open Biology practice
        <ArrowRight size={18} aria-hidden />
      </Link>
    </div>
  );
}
