import { LoaderCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/states";

/** Loading placeholder that mirrors the layout of PerformanceSection. */
export function PerformanceSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true" aria-live="polite">
      <p className="flex items-center gap-2 text-small font-bold text-primary">
        <LoaderCircle size={16} className="animate-spin" aria-hidden />
        Loading your performance…
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="card p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((item) => (
          <div key={item} className="card p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-4 h-36 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((item) => (
          <div key={item} className="card p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-4 h-24 w-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading performance</span>
    </div>
  );
}