import type { Metadata } from "next";
import { Suspense } from "react";
import { SubjectsSection, SubjectsSkeleton } from "@/components/subjects/subjects-section";
import { SectionHeading } from "@/components/ui/section";

export const metadata: Metadata = { title: "Subjects" };

export default function SubjectsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading title="Subjects" description="Choose a subject to practice." />
      <Suspense fallback={<SubjectsSkeleton />}>
        <SubjectsSection />
      </Suspense>
    </div>
  );
}
