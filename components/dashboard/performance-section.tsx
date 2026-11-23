import { ChartNoAxesColumn } from "lucide-react";
import { EmptyState } from "@/components/ui/states";

/**
 * No analytics exist yet (no attempts table, no authentication), so nothing is
 * shown but an honest empty state. No numbers are invented.
 */
export function PerformanceSection() {
  return (
    <EmptyState
      icon={ChartNoAxesColumn}
      title="No performance data yet"
      description="Your accuracy, attempts and subject-wise progress will appear here after you complete practice sessions."
    />
  );
}
