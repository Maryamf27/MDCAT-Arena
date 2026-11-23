import type { Metadata } from "next";
import { FileCheck2 } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Mock Tests" };

export default function Page() {
  return (
    <PlaceholderPage
      icon={FileCheck2}
      title="Mock Tests: coming soon"
      description="Full-length timed mock tests are not available yet. They need test attempts and sign-in, which are still to be built."
    />
  );
}
