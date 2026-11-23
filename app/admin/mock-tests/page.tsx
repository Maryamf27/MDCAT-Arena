import type { Metadata } from "next";
import { MockTestAdmin } from "@/components/mock-tests/admin";
export const metadata: Metadata = { title: "Mock Test Administration" };
export default function Page() { return <MockTestAdmin />; }
