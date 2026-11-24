import type { Metadata } from "next";
import { MockTestResult } from "@/components/mock-tests/results";
export const metadata: Metadata = { title: "Mock Test Result" };
export default async function Page({ params }: PageProps<"/mock-tests/results/[attemptId]">) {
  const { attemptId } = await params;
  return <MockTestResult attemptId={attemptId} />;
}
