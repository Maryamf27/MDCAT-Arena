import type { Metadata } from "next";
import { MockExamSession } from "@/components/mock-tests/exam-session";
export const metadata: Metadata = { title: "Timed Examination" };
export default async function Page({ params }: PageProps<"/mock-tests/attempt/[attemptId]">) {
  const { attemptId } = await params;
  return <MockExamSession attemptId={attemptId} />;
}
