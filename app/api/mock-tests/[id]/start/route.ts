import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { throwRpc } from "@/lib/practice/mock-exams";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({}).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const raw = await request.json().catch(() => null);
    schema.parse(raw);
    const { id } = await context.params;
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) throw new ApiError(400, "validation_error", "Invalid examination id");
    const { data, error } = await createAdminClient().rpc("start_mock_attempt", { p_user_id: user.id, p_test_id: id });
    if (error) throwRpc(error);
    return ok({ attemptId: data }, 201);
  } catch (error) { return errorResponse(error); }
}
