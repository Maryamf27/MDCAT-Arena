import { z } from "zod";

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 50;

/** Collapses runs of whitespace and trims the ends. */
export function normalizeDisplayName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * A person's name as shown in the app. Shared by the sign-up form, the profile
 * form and the API so all three enforce the same rule. Unicode is allowed
 * (Urdu, Arabic, etc.; zero-width joiners are legitimate in those scripts);
 * only control characters and angle brackets are rejected.
 */
export const displayNameSchema = z
  .string()
  .transform(normalizeDisplayName)
  .pipe(
    z
      .string()
      .min(DISPLAY_NAME_MIN, `Name must be at least ${DISPLAY_NAME_MIN} characters.`)
      .max(DISPLAY_NAME_MAX, `Name must be at most ${DISPLAY_NAME_MAX} characters.`)
      .regex(/^[^<>\p{Cc}]+$/u, "Name contains characters that are not allowed.")
  );

/** Body of PATCH /api/profile. */
export const updateProfileSchema = z.object({ displayName: displayNameSchema }).strict();

/** Returns a clean name, or null if the value is missing or not acceptable. */
export function sanitizeDisplayName(value: unknown): string | null {
  const parsed = displayNameSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
