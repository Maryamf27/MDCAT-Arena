import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { startAttempt } from "@/lib/practice/attempts";
import { startAttemptSchema } from "@/lib/practice/validation";

/**
 * POST /api/practice/attempts
 * Body: { "subject": "biology" }
 * Requires a signed-in student. Creates an `in_progress` attempt owned by that
 * student and returns its id, which the client sends back with the answers.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    let json: unknown;
    try {
      json = JSON.parse(await request.text());
    } catch {
      throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
    }
    const body = startAttemptSchema.parse(json);

    const attemptId = await startAttempt(createAdminClient(), user.id, body.subject);
    return ok({ attemptId }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
