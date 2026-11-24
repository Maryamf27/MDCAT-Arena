import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <Suspense fallback={null}>
        <SignedInRedirect />
      </Suspense>
      <Suspense fallback={null}>
        <AuthForm mode="signin" />
      </Suspense>
    </>
  );
}
