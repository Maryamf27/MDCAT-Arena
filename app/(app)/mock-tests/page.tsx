import type { Metadata } from "next";
import { MockTestCatalog } from "@/components/mock-tests/catalog";

export const metadata: Metadata = { title: "Mock Tests", description: "Take timed MDCAT mock examinations using approved question-bank content." };

export default function Page() {
  return <MockTestCatalog />;
}
