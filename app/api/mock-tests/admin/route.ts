import { requireUser } from "@/lib/auth/user";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { assertAdmin, subjectKeys } from "@/lib/practice/mock-exams";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await requireUser();
    const db = createAdminClient();
    await assertAdmin(db, user.id);
    const [{ data: tests, error }, { data: subjects, error: subjectsError }] = await Promise.all([
      db.from("tests").select("id,title,description,duration_seconds,status,created_at").eq("test_type", "mock").order("created_at", { ascending: false }),
      db.from("subjects").select("id,code,name,subject_key,exam_key,category_key").in("subject_key", subjectKeys),
    ]);
    if (error || subjectsError) throw new ApiError(502, "database_error", "Mock test administration could not be loaded");
    const ids = (tests ?? []).map((test) => test.id as string);
    const [{ data: configs, error: configError }, { data: attempts, error: attemptsError }] = await Promise.all([
      ids.length ? db.from("mock_test_configs").select("test_id,question_distribution,marks_per_correct,negative_marking,marks_deducted,is_provisional,exam_key,category_key,blueprint_key,blueprint_source_name,blueprint_source_url,blueprint_verification_status,blueprint_verified_at,blueprint_verification_note").in("test_id", ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? db.from("attempts").select("test_id,status,score,total_points").in("test_id", ids) : Promise.resolve({ data: [], error: null }),
    ]);
    if (configError || attemptsError) throw new ApiError(502, "database_error", "Mock test statistics could not be loaded");
    const configMap = new Map((configs ?? []).map((c) => [c.test_id, c]));
    const items = (tests ?? []).map((test) => {
      const rows = (attempts ?? []).filter((attempt) => attempt.test_id === test.id);
      const submitted = rows.filter((attempt) => attempt.status === "submitted");
      return { ...test, config: configMap.get(test.id) ?? null, attempts: rows.length, submitted: submitted.length,
        averagePercentage: submitted.length ? Math.round(submitted.reduce((sum, a) => sum + (Number(a.total_points) ? Number(a.score) / Number(a.total_points) * 100 : 0), 0) / submitted.length * 10) / 10 : null };
    });
    const subjectIds = (subjects ?? []).map((subject) => subject.id as string);
    const counts = await Promise.all(subjectIds.map(async (subjectId) => {
      const { count, error: countError } = await db.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", subjectId).eq("is_active", true);
      if (countError) throw new ApiError(502, "database_error", "Question availability could not be checked");
      return [subjectId, count ?? 0] as const;
    }));
    const countMap = new Map(counts);
    return ok({ tests: items, questionAvailability: (subjects ?? []).map((s) => ({
      subjectKey: s.subject_key, subject: s.name ?? s.code, examKey: s.exam_key, categoryKey: s.category_key,
      activeQuestions: countMap.get(s.id as string) ?? 0,
    })) });
  } catch (error) { return errorResponse(error); }
}
