import type { Metadata } from "next";
import { HistoryList } from "@/components/practice/history-list";
import { SectionHeading } from "@/components/ui/section";

export const metadata: Metadata = { title: "Practice History", description: "Review your completed exam practice attempts and saved answers." };

export default function Page() {
  return <div className="mx-auto flex max-w-5xl flex-col gap-6">
    <SectionHeading title="Practice history" description="Your completed practice sessions and saved results." />
    <HistoryList />
  </div>;
}
