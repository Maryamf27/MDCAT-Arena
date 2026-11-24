import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getAuthenticatedUser } from "@/lib/auth/user";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Already signed in: no reason to show the form.
  if (await getAuthenticatedUser().catch(() => null)) redirect("/");
  return (
    <Suspense fallback={null}>
      <AuthForm mode="signin" />
    </Suspense>
  );
}
