import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/practice/errors";
import { sanitizeDisplayName } from "./validation";

export type Profile = {
  userId: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
};

type ProfileRow = { user_id: string; display_name: string | null; created_at: string };

function dbError(context: string, error: { message: string }): ApiError {
  console.error(`[profile-api] ${context}: ${error.message}`);
  return new ApiError(502, "database_error", "Your profile could not be loaded or saved. Please try again.");
}

async function readRow(db: SupabaseClient, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await db
    .from("profiles")
    .select("user_id,display_name,created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw dbError("profile lookup", error);
  return (data as ProfileRow | null) ?? null;
}

function toProfile(row: ProfileRow, email: string | null): Profile {
  return { userId: row.user_id, email, displayName: row.display_name, createdAt: row.created_at };
}

/**
 * Returns the signed-in user's profile, creating the row on first use.
 *
 * Other flows (starting a practice attempt or a mock test) may already have
 * created an empty profile row, so a missing name is back-filled from the name
 * the user typed at sign-up (kept in auth user metadata). That metadata is
 * user-editable, so it is validated again before it is stored. `role` is never
 * read from or written by this module.
 */
export async function getOrCreateProfile(
  db: SupabaseClient,
  user: { id: string; email: string | null; displayName?: string | null }
): Promise<Profile> {
  const seed = sanitizeDisplayName(user.displayName);
  let row = await readRow(db, user.id);

  if (!row) {
    // ignoreDuplicates: if another request created the row meanwhile, keep it.
    const { error } = await db
      .from("profiles")
      .upsert({ user_id: user.id, display_name: seed }, { onConflict: "user_id", ignoreDuplicates: true });
    if (error) throw dbError("profile create", error);
    row = await readRow(db, user.id);
  } else if (!row.display_name && seed) {
    const { error } = await db
      .from("profiles")
      .update({ display_name: seed })
      .eq("user_id", user.id)
      .is("display_name", null);
    if (error) throw dbError("profile backfill", error);
    row = await readRow(db, user.id);
  }

  if (!row) throw new ApiError(502, "database_error", "Your profile could not be loaded. Please try again.");
  return toProfile(row, user.email);
}

/** Sets the display name (creating the profile row if needed). Touches no other column. */
export async function updateDisplayName(
  db: SupabaseClient,
  user: { id: string; email: string | null },
  displayName: string
): Promise<Profile> {
  const { error } = await db
    .from("profiles")
    .upsert({ user_id: user.id, display_name: displayName }, { onConflict: "user_id" });
  if (error) throw dbError("profile update", error);
  const row = await readRow(db, user.id);
  if (!row) throw new ApiError(502, "database_error", "Your profile could not be saved. Please try again.");
  return toProfile(row, user.email);
}
