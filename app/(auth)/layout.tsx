import type { ReactNode } from "react";
import { Brand } from "@/components/layout/brand";

/** Standalone layout for sign in / sign up: no sidebar, no app header. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-16 items-center px-4 md:px-8">
        <Brand />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 md:items-center md:pt-0">
        {children}
      </main>
    </div>
  );
}
