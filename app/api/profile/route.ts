import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { getOrCreateProfile, updateDisplayName } from "@/lib/profile/repository";
import { updateProfileSchema } from "@/lib/profile/validation";

const MAX_BODY_BYTES = 2 * 1024;

/**
 * GET /api/profile   (requires a signed-in user)
 * Returns { profile: { userId, email, displayName, createdAt } }. The profile
 * row is created on first use. Identity comes only from the session cookie.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const profile = await getOrCreateProfile(createAdminClient(), user);
    return ok({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/profile   Body: { "displayName": "Ayesha Khan" }
 * Updates only the signed-in user's display name. Any other field is rejected,
 * so role and ownership can never be changed through this endpoint.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large", "Request body is too large");
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large", "Request body is too large");
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
    }

    const body = updateProfileSchema.parse(json);
    const profile = await updateDisplayName(createAdminClient(), user, body.displayName);
    return ok({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
