import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/states";

export function PlaceholderPage({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  );
}
