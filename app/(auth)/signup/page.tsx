import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getAuthenticatedUser } from "@/lib/auth/user";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  if (await getAuthenticatedUser().catch(() => null)) redirect("/");
  return (
    <Suspense fallback={null}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
