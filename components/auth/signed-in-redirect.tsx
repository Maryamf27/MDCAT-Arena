import { redirect, unstable_rethrow } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/user";

/** Renders nothing; sends already-signed-in visitors to the dashboard. Place inside <Suspense>. */
export async function SignedInRedirect() {
  let signedIn = false;
  try {
    signedIn = Boolean(await getAuthenticatedUser());
  } catch (error) {
    unstable_rethrow(error);
  }
  if (signedIn) redirect("/");
  return null;
}
