import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new ApiError(400, "validation_error", "Invalid examination id");
    const db = createAdminClient();
    const { data: test, error } = await db.from("tests").select("id,title,description,duration_seconds,status")
      .eq("id", id).eq("test_type", "mock").eq("status", "published").maybeSingle();
    if (error) throw new ApiError(502, "database_error", "Examination details could not be loaded");
    if (!test) throw new ApiError(404, "mock_not_available", "This examination is not available");
    const { data: config, error: configError } = await db.from("mock_test_configs")
      .select("question_distribution,marks_per_correct,negative_marking,marks_deducted,is_provisional,exam_key,category_key,blueprint_key,blueprint_source_name,blueprint_source_url,blueprint_verification_status,blueprint_verified_at,blueprint_verification_note").eq("test_id", id).maybeSingle();
    if (configError || !config) throw new ApiError(404, "mock_not_configured", "This examination is not configured");
    return ok({ ...test, ...config, questionCount: Object.values(config.question_distribution as Record<string, number>).reduce((sum, count) => sum + Number(count), 0) });
  } catch (error) { return errorResponse(error); }
}
