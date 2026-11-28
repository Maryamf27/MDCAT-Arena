import type { Metadata } from "next";
import { AttemptReview } from "@/components/practice/attempt-review";

export const metadata: Metadata = { title: "Practice Results", description: "Review your saved practice answers and explanations." };

export default async function Page({ params }: PageProps<"/practice/history/[attemptId]">) {
  const { attemptId } = await params;
  return <AttemptReview attemptId={attemptId} />;
}
