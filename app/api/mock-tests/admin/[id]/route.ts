import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { assertAdmin, blueprintDbFields, configSchema } from "@/lib/practice/mock-exams";
import { SUBJECT_META } from "@/lib/subjects";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  status: z.enum(["draft", "published", "archived"]).optional(),
  config: configSchema.optional(),
}).strict().refine((body) => body.status !== undefined || body.config !== undefined);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const body = schema.parse(await request.json().catch(() => null));
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new ApiError(400, "validation_error", "Invalid examination id");
    const db = createAdminClient();
    await assertAdmin(db, user.id);
    const { data: existing, error: lookupError } = await db.from("tests").select("id").eq("id", id).eq("test_type", "mock").maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) throw new ApiError(404, "mock_not_found", "Mock examination not found");
    if (body.config) {
      const { count: attemptCount, error: attemptError } = await db.from("attempts").select("id", { count: "exact", head: true }).eq("test_id", id);
      if (attemptError) throw new ApiError(502, "database_error", "Existing examination attempts could not be checked");
      if ((attemptCount ?? 0) > 0) throw new ApiError(409, "configuration_locked", "This configuration has attempts and can no longer be edited");
      const config = body.config;
      const { error: testError } = await db.from("tests").update({ title: config.title, description: config.description || null, duration_seconds: config.durationSeconds }).eq("id", id);
      if (testError) throw testError;
      const { error: configError } = await db.from("mock_test_configs").update({
        question_distribution: config.distribution, marks_per_correct: config.marksPerCorrect,
        negative_marking: config.negativeMarking, marks_deducted: config.negativeMarking ? config.marksDeducted : 0,
        ...blueprintDbFields(config), updated_at: new Date().toISOString(),
      }).eq("test_id", id);
      if (configError) throw configError;
    }
    if (body.status === "published") {
      const { data: configRow, error: configLookupError } = await db.from("mock_test_configs").select("question_distribution,exam_key,category_key").eq("test_id", id).maybeSingle();
      if (configLookupError || !configRow) throw new ApiError(409, "mock_not_configured", "Complete the mock test configuration before publishing");
      const shortages: Array<{ subject: string; available: number; required: number }> = [];
      for (const [subject, requested] of Object.entries(configRow.question_distribution as Record<string, number>)) {
        const meta = SUBJECT_META.find((item) => item.key === subject);
        if (!meta || meta.examKey !== configRow.exam_key || meta.categoryKey !== configRow.category_key) {
          throw new ApiError(409, "validation_error", "The examination distribution includes a subject from another track");
        }
        let subjectQuery = db.from("subjects").select("id").eq("subject_key", subject).eq("exam_key", configRow.exam_key);
        subjectQuery = configRow.category_key === null ? subjectQuery.is("category_key", null) : subjectQuery.eq("category_key", configRow.category_key);
        const { data: row, error: subjectError } = await subjectQuery.maybeSingle();
        if (subjectError) throw new ApiError(502, "database_error", "Question availability could not be checked");
        const { count, error: countError } = row ? await db.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", row.id).eq("is_active", true) : { count: 0, error: null };
        if (countError) throw new ApiError(502, "database_error", "Question availability could not be checked");
        if ((count ?? 0) < requested) shortages.push({ subject, available: count ?? 0, required: requested });
      }
      if (shortages.length) throw new ApiError(409, "insufficient_coverage", "Question bank coverage is insufficient to publish this assessment", shortages);
    }
    if (body.status) {
      const { error } = await db.from("tests").update({ status: body.status }).eq("id", id);
      if (error) throw error;
    }
    return ok({ updated: true, id });
  } catch (error) { return errorResponse(error); }
}
