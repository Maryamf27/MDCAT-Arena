import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { throwRpc } from "@/lib/practice/mock-exams";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireUser();
    const body = z.object({}).strict().parse(await request.json().catch(() => null));
    void body;
    const { attemptId } = await context.params;
    if (!z.string().uuid().safeParse(attemptId).success) throw new ApiError(400, "validation_error", "Invalid attempt id");
    const db = createAdminClient();
    const { data: attempt, error: lookupError } = await db.from("attempts").select("expires_at").eq("id", attemptId).eq("user_id", user.id).maybeSingle();
    if (lookupError) throw new ApiError(502, "database_error", "The examination could not be submitted");
    if (!attempt) throw new ApiError(404, "attempt_not_found", "This examination attempt was not found");
    const { data, error } = await db.rpc("submit_mock_attempt", {
      p_attempt_id: attemptId, p_user_id: user.id,
      p_force_expired: Date.now() >= new Date(attempt.expires_at).getTime(),
    });
    if (error) throwRpc(error);
    return ok(data);
  } catch (error) { return errorResponse(error); }
}
