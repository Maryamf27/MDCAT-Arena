import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/practice/errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBlueprint, type BlueprintVerificationStatus } from "@/lib/exam-blueprints";
import { EXAM_KEYS, SUBJECT_META, type ExamKey } from "@/lib/subjects";

export const subjectKeys = SUBJECT_META.map((subject) => subject.key);
export const configSchema = z.object({
  examKey: z.enum(EXAM_KEYS).default("mdcat"),
  categoryKey: z.string().regex(/^[a-z0-9_]+$/).nullable().optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).default(""),
  durationSeconds: z.number().int().min(60).max(8 * 60 * 60),
  distribution: z.record(z.string(), z.number().int().min(1).max(500)),
  marksPerCorrect: z.number().positive().max(100).default(1),
  negativeMarking: z.boolean().default(false),
  marksDeducted: z.number().min(0).max(100).default(0),
  provisional: z.boolean().default(true),
  publish: z.boolean().default(false),
}).strict().superRefine((config, ctx) => {
  const categoryKey = config.categoryKey ?? null;
  const supportedCategories = new Set<string>(SUBJECT_META
    .filter((subject) => subject.examKey === config.examKey)
    .flatMap((subject) => subject.categoryKey ? [subject.categoryKey] : []));
  if ((config.examKey === "mdcat" && categoryKey !== null)
    || (config.examKey !== "mdcat" && (!categoryKey || !supportedCategories.has(categoryKey)))) {
    ctx.addIssue({ code: "custom", path: ["categoryKey"], message: "Choose the category supported by this exam track" });
  }
  const allowed = new Set(SUBJECT_META
    .filter((subject) => subject.examKey === config.examKey && subject.categoryKey === categoryKey)
    .map((subject) => subject.key));
  const keys = Object.keys(config.distribution);
  if (!keys.length || keys.some((key) => !allowed.has(key as (typeof SUBJECT_META)[number]["key"]))) {
    ctx.addIssue({ code: "custom", path: ["distribution"], message: "Question distribution must use subjects from the selected examination" });
  }
});

export type MockConfigInput = z.infer<typeof configSchema>;

/** Database metadata is derived server-side so clients cannot claim verification. */
export function blueprintDbFields(config: MockConfigInput): {
  exam_key: ExamKey;
  category_key: string | null;
  blueprint_key: string | null;
  blueprint_source_name: string | null;
  blueprint_source_url: string | null;
  blueprint_verification_status: BlueprintVerificationStatus;
  blueprint_verified_at: string | null;
  blueprint_verification_note: string;
  is_provisional: boolean;
} {
  const categoryKey = config.categoryKey ?? null;
  const blueprint = getBlueprint(config.examKey, categoryKey);
  const exactOfficialConfig = Boolean(blueprint)
    && config.durationSeconds === blueprint!.durationSeconds
    && config.marksPerCorrect === blueprint!.marksPerCorrect
    && config.negativeMarking === blueprint!.negativeMarking
    && config.marksDeducted === blueprint!.marksDeducted
    && JSON.stringify(Object.fromEntries(Object.entries(config.distribution).sort()))
      === JSON.stringify(Object.fromEntries(Object.entries(blueprint!.distribution).sort()));
  return {
    exam_key: config.examKey,
    category_key: categoryKey,
    blueprint_key: blueprint?.key ?? null,
    blueprint_source_name: blueprint?.sourceName ?? null,
    blueprint_source_url: blueprint?.sourceUrl ?? null,
    blueprint_verification_status: exactOfficialConfig ? blueprint!.verificationStatus : "unverified",
    blueprint_verified_at: blueprint?.verifiedAt ?? null,
    blueprint_verification_note: blueprint
      ? exactOfficialConfig
        ? blueprint.verificationNote
        : `Saved settings differ from the referenced official blueprint. ${blueprint.verificationNote}`
      : "No official blueprint reference is configured for this examination.",
    is_provisional: !exactOfficialConfig || config.provisional || Boolean(blueprint?.provisional),
  };
}

export async function assertAdmin(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from("profiles").select("role").eq("user_id", userId).maybeSingle();
  if (error) throw new ApiError(502, "database_error", "Administrator access could not be checked");
  if (data?.role !== "admin") throw new ApiError(403, "forbidden", "Administrator access is required");
}

export function throwRpc(error: { message: string; code?: string }): never {
  const [name, subject, available, required] = error.message.split(":");
  if (name === "mock_not_available") throw new ApiError(404, "mock_not_available", "This examination is not available");
  if (name === "mock_not_configured") throw new ApiError(409, "mock_not_configured", "This examination is not configured yet");
  if (name === "attempt_not_found") throw new ApiError(404, "attempt_not_found", "This examination attempt was not found");
  if (name === "question_not_in_attempt") throw new ApiError(404, "question_not_in_attempt", "This question is not part of the examination");
  if (name === "attempt_expired") throw new ApiError(409, "attempt_expired", "The examination deadline has passed");
  if (name === "deadline_not_reached") throw new ApiError(409, "deadline_not_reached", "The examination is still in progress");
  if (name.startsWith("insufficient_coverage")) throw new ApiError(409, "insufficient_coverage", `Not enough approved ${subject} questions: ${available} available, ${required} required`, { subject, available: Number(available), required: Number(required) });
  if (["invalid_answer", "invalid_distribution", "invalid_duration"].includes(name)) throw new ApiError(400, "validation_error", "The examination configuration or answer is invalid");
  console.error("[mock-test] database operation failed", error.code ?? "");
  throw new ApiError(502, "database_error", "The examination could not be saved. Please try again.");
}

export async function loadAttempt(db: SupabaseClient, attemptId: string, userId: string, reveal = false) {
  const { data: attempt, error } = await db.from("attempts")
    .select("id,user_id,test_id,status,started_at,expires_at,submitted_at,score,total_points")
    .eq("id", attemptId).eq("user_id", userId).maybeSingle();
  if (error) throw new ApiError(502, "database_error", "The examination session could not be loaded");
  if (!attempt) throw new ApiError(404, "attempt_not_found", "This examination attempt was not found");
  const [{ data: test }, { data: config }, { data: selections, error: selectionError }] = await Promise.all([
    db.from("tests").select("id,title,description,duration_seconds").eq("id", attempt.test_id).maybeSingle(),
    db.from("mock_test_configs").select("question_distribution,marks_per_correct,negative_marking,marks_deducted,is_provisional,exam_key,category_key,blueprint_key,blueprint_source_name,blueprint_source_url,blueprint_verification_status,blueprint_verified_at,blueprint_verification_note").eq("test_id", attempt.test_id).maybeSingle(),
    db.from("mock_attempt_questions").select(reveal ? "question_id,position,visited,marked_for_review,correct_answer_index_at_submit,explanation_at_submit,question_snapshot_at_submit" : "question_id,position,visited,marked_for_review").eq("attempt_id", attemptId).order("position"),
  ]);
  if (selectionError) throw new ApiError(502, "database_error", "The examination questions could not be loaded");
  const selectionRows = (selections ?? []) as unknown as Array<Record<string, unknown>>;
  const ids = selectionRows.map((s) => String(s.question_id));
  if (!test || !config) throw new ApiError(404, "attempt_not_found", "The examination configuration is unavailable");
  const columns = reveal
    ? "id,subject_id,slo_node_id,slo_reference,question,options,difficulty,correct_answer_index,explanation"
    : "id,subject_id,slo_node_id,slo_reference,question,options,difficulty";
  const { data: questions, error: questionError } = ids.length
    ? await db.from("questions").select(columns).in("id", ids)
    : { data: [], error: null };
  if (questionError) throw new ApiError(502, "database_error", "The examination questions could not be loaded");
  const questionRows = (questions ?? []) as unknown as Array<Record<string, unknown>>;
  const questionMap = new Map<string, Record<string, unknown>>(questionRows.map((q) => [String(q.id), q]));
  const { data: savedAnswers, error: answersError } = await db.from("attempt_answers")
    .select("question_id,selected_option_index").eq("attempt_id", attemptId);
  if (answersError) throw new ApiError(502, "database_error", "Saved answers could not be loaded");
  const answerMap = new Map((savedAnswers ?? []).map((a) => [a.question_id, a.selected_option_index]));
  return {
    attempt, test, config,
    questions: selectionRows.flatMap((selection) => {
      const questionId = String(selection.question_id);
      const question = questionMap.get(questionId);
      if (!question) return [];
      const snapshot = selection.question_snapshot_at_submit as Record<string, unknown> | null;
      const savedQuestion = reveal
        ? { ...question, ...(snapshot ?? {}), correct_answer_index: selection.correct_answer_index_at_submit, explanation: selection.explanation_at_submit }
        : question;
      return [{ ...savedQuestion, position: selection.position, visited: selection.visited, markedForReview: selection.marked_for_review, selectedIndex: answerMap.get(questionId) ?? null }];
    }),
  };
}
