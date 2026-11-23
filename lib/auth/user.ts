import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/practice/errors";

export type AuthenticatedUser = { id: string; email: string | null };

/**
 * Resolves the signed-in student from the Supabase session cookie using the
 * existing server client. getUser() validates the token with Supabase Auth
 * (unlike getSession(), it cannot be satisfied by a forged cookie).
 * The id returned here is the ONLY source of identity for saved attempts;
 * request bodies are never trusted for it.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new ApiError(401, "unauthorized", "Sign in to save your practice attempts");
  }
  return user;
}
