import { requireUser } from "@/lib/auth/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, ok } from "@/lib/practice/http";
import { blueprintDbFields } from "@/lib/practice/mock-exams";

export async function GET() {
  try {
    await requireUser();
    const db = createAdminClient();
    const { data: tests, error } = await db.from("tests").select("id,title,description,duration_seconds")
      .eq("test_type", "mock").eq("status", "published").order("created_at", { ascending: true });
    if (error) throw error;
    const ids = (tests ?? []).map((t) => t.id as string);
    const { data: configs, error: configError } = ids.length
      ? await db.from("mock_test_configs").select("test_id,question_distribution,marks_per_correct,negative_marking,marks_deducted,is_provisional,exam_key,category_key,blueprint_key,blueprint_source_name,blueprint_source_url,blueprint_verification_status,blueprint_verified_at,blueprint_verification_note").in("test_id", ids)
      : { data: [], error: null };
    if (configError) throw configError;
    const configMap = new Map((configs ?? []).map((c) => [c.test_id, c]));
    return ok({ tests: (tests ?? []).flatMap((test) => configMap.has(test.id) ? [{ ...test, ...configMap.get(test.id) }] : []) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { configSchema, assertAdmin } = await import("@/lib/practice/mock-exams");
    const config = configSchema.parse(body);
    const db = createAdminClient();
    await assertAdmin(db, user.id);
    const { data: profile } = await db.from("profiles").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!profile) {
      const { error: profileError } = await db.from("profiles").insert({ user_id: user.id });
      if (profileError) throw profileError;
    }
    const { data: test, error } = await db.from("tests").insert({
      title: config.title, description: config.description || null, test_type: "mock",
      duration_seconds: config.durationSeconds, status: "draft", created_by: user.id,
    }).select("id,title,status").single();
    if (error) throw error;
    const { error: configError } = await db.from("mock_test_configs").insert({
      test_id: test.id, question_distribution: config.distribution,
      marks_per_correct: config.marksPerCorrect, negative_marking: config.negativeMarking,
      marks_deducted: config.negativeMarking ? config.marksDeducted : 0,
      ...blueprintDbFields(config),
    });
    if (configError) {
      await db.from("tests").delete().eq("id", test.id);
      throw configError;
    }
    return ok({ test }, 201);
  } catch (error) { return errorResponse(error); }
}
