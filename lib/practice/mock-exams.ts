import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/practice/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

export const subjectKeys = ["biology", "chemistry", "physics", "english", "logical_reasoning"] as const;
export const configSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).default(""),
  durationSeconds: z.number().int().min(60).max(8 * 60 * 60),
  distribution: z.record(z.string(), z.number().int().min(1).max(500)).refine((d) => Object.keys(d).length > 0 && Object.keys(d).every((key) => subjectKeys.includes(key as (typeof subjectKeys)[number]))),
  marksPerCorrect: z.number().positive().max(100).default(1),
  negativeMarking: z.boolean().default(false),
  marksDeducted: z.number().min(0).max(100).default(0),
  provisional: z.boolean().default(true),
  publish: z.boolean().default(false),
}).strict();

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
    db.from("mock_test_configs").select("question_distribution,marks_per_correct,negative_marking,marks_deducted,is_provisional").eq("test_id", attempt.test_id).maybeSingle(),
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
