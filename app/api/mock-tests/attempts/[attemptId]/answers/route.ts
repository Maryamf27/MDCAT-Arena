import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { throwRpc } from "@/lib/practice/mock-exams";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ questionId: z.string().uuid(), selectedIndex: z.number().int().min(0).max(3).nullable(), markedForReview: z.boolean().default(false), visited: z.boolean().default(true) }).strict();
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireUser();
    const body = schema.parse(await request.json().catch(() => null));
    const { attemptId } = await context.params;
    if (!z.string().uuid().safeParse(attemptId).success) throw new ApiError(400, "validation_error", "Invalid attempt id");
    const { error } = await createAdminClient().rpc("save_mock_answer", {
      p_attempt_id: attemptId, p_user_id: user.id, p_question_id: body.questionId,
      p_selected_index: body.selectedIndex, p_marked_for_review: body.markedForReview, p_visited: body.visited,
    });
    if (error) throwRpc(error);
    return ok({ saved: true });
  } catch (error) { return errorResponse(error); }
}
