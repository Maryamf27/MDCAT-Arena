import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl p-8" aria-label="Loading application" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
