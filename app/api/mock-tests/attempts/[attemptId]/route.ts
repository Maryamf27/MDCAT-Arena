import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { loadAttempt } from "@/lib/practice/mock-exams";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireUser();
    const { attemptId } = await context.params;
    if (!z.string().uuid().safeParse(attemptId).success) throw new ApiError(400, "validation_error", "Invalid attempt id");
    const session = await loadAttempt(createAdminClient(), attemptId, user.id, false);
    if (session.attempt.status === "submitted") throw new ApiError(409, "already_submitted", "This examination has already been submitted", { attemptId });
    return ok(session);
  } catch (error) { return errorResponse(error); }
}
