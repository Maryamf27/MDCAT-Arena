import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="This page doesn't exist. Head back to the dashboard to pick a subject."
        action={
          <Link href="/" className="btn btn-primary">
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
