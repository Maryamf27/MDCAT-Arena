import type { Metadata } from "next";
import { MockTestHistory } from "@/components/mock-tests/history";
export const metadata: Metadata = { title: "Mock Test History" };
export default function Page() { return <MockTestHistory />; }
