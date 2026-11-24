import type { Metadata } from "next";
import { Suspense } from "react";
import { SubjectsSection, SubjectsSkeleton } from "@/components/subjects/subjects-section";
import { SectionHeading } from "@/components/ui/section";

export const metadata: Metadata = { title: "Practice" };

export default function PracticeIndexPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        title="Choose a subject"
        description="Choose from Biology, Chemistry, Physics, English, or Logical Reasoning. Availability counts reflect active Supabase questions only."
      />
      <Suspense fallback={<SubjectsSkeleton />}>
        <SubjectsSection />
      </Suspense>
    </div>
  );
}
