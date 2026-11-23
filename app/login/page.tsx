import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
