import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";
import type { PublicQuestion } from "@/lib/questions/public";
import type { AnswerKey, QuestionFilters, QuestionScope } from "./types";
import type { QuestionsQuery } from "./validation";
import { toApiDifficulty, toDbDifficulty } from "./difficulty";
import { SUBJECT_META } from "@/lib/subjects";

const SUBJECT_CODES = Object.fromEntries(SUBJECT_META.map((subject) => [subject.key, subject.code]));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);

function dbError(context: string, error: { message: string }): ApiError {
  console.error(`[practice-api] ${context}: ${error.message}`);
  return new ApiError(502, "database_error", "The question database is unavailable");
}

/**
 * Turns the human-friendly filters (subject key, unit number, topic slug) into
 * database UUIDs by looking them up. Nothing is assumed or hard-coded.
 * syllabus_nodes.source_path = "<subject uuid>/unit/<n>[/topic/<slug>]".
 */
export async function resolveScope(
  db: SupabaseClient,
  query: Pick<QuestionsQuery, "subject" | "unit" | "topic" | "slo">
): Promise<QuestionScope> {
  const scope: QuestionScope = {};

  if (query.subject) {
    if (isUuid(query.subject)) {
      scope.subjectId = query.subject;
    } else {
      const { data, error } = await db
        .from("subjects")
        .select("id")
        .eq("code", SUBJECT_CODES[query.subject])
        .limit(1);
      if (error) throw dbError("subject lookup", error);
      if (!data?.length) throw new ApiError(404, "subject_not_found", `Unknown subject "${query.subject}"`);
      scope.subjectId = data[0].id as string;
    }
  }

  if (query.unit) {
    if (isUuid(query.unit)) {
      scope.unitId = query.unit;
    } else {
      const { data, error } = await db
        .from("syllabus_nodes")
        .select("id")
        .eq("subject_id", scope.subjectId!)
        .eq("node_type", "unit")
        .eq("source_path", `${scope.subjectId}/unit/${encodeURIComponent(query.unit)}`)
        .limit(1);
      if (error) throw dbError("unit lookup", error);
      if (!data?.length) throw new ApiError(404, "unit_not_found", `Unknown unit "${query.unit}"`);
      scope.unitId = data[0].id as string;
    }
  }

  if (query.topic) {
    if (isUuid(query.topic)) {
      scope.topicId = query.topic;
    } else {
      const { data, error } = await db
        .from("syllabus_nodes")
        .select("id")
        .eq("subject_id", scope.subjectId!)
        .eq("node_type", "topic")
        .eq(
          "source_path",
          `${scope.subjectId}/unit/${encodeURIComponent(query.unit!)}/topic/${query.topic}`
        )
        .limit(1);
      if (error) throw dbError("topic lookup", error);
      if (!data?.length) throw new ApiError(404, "topic_not_found", `Unknown topic "${query.topic}"`);
      scope.topicId = data[0].id as string;
    }
  }

  if (query.slo) {
    if (isUuid(query.slo)) {
      scope.sloId = query.slo;
    } else {
      const { data, error } = await db
        .from("syllabus_nodes")
        .select("id")
        .eq("subject_id", scope.subjectId!)
        .eq("node_type", "slo")
        .eq("source_identifier", query.slo)
        .limit(1);
      if (error) throw dbError("SLO lookup", error);
      if (!data?.length) throw new ApiError(404, "slo_not_found", `Unknown SLO "${query.slo}"`);
      scope.sloId = data[0].id as string;
    }
  }

  return scope;
}

/** Explicit whitelist copy: even if a row carried extra keys, they never leave. */
function toPublicQuestion(row: Record<string, unknown>): PublicQuestion {
  return {
    id: row.id as string,
    subject_id: row.subject_id as string,
    syllabus_node_id: row.syllabus_node_id as string,
    unit_id: row.unit_id as string,
    topic_id: row.topic_id as string,
    slo_node_id: row.slo_node_id as string,
    slo_reference: row.slo_reference as string,
    question: row.question as string,
    options: row.options as string[],
    // Database words (moderate/difficult) are presented as API words (medium/hard).
    difficulty: toApiDifficulty(row.difficulty as string),
    created_at: row.created_at as string,
  };
}

/**
 * Active questions only, answer-free columns only, uniform random sample of
 * `limit` drawn inside Postgres (see sample_practice_questions in
 * supabase/migrations/20261124000000_practice_question_sampling.sql).
 * Only the selected rows ever reach Node; the question bank is not loaded.
 */
export async function listActiveQuestions(
  db: SupabaseClient,
  filters: QuestionFilters
): Promise<PublicQuestion[]> {
  const { data, error } = await db.rpc("sample_practice_questions", {
    p_subject_id: filters.scope.subjectId ?? null,
    p_unit_id: filters.scope.unitId ?? null,
    p_topic_id: filters.scope.topicId ?? null,
    p_slo_node_id: filters.scope.sloId ?? null,
    p_difficulty: filters.difficulty ? toDbDifficulty(filters.difficulty) : null,
    p_limit: filters.limit,
  });
  if (error) throw dbError("question sampling", error);

  // The function already guarantees distinct rows; this keeps the invariant
  // local so a future change to the query can never serve a question twice.
  const seen = new Set<string>();
  const questions: PublicQuestion[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = row.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    questions.push(toPublicQuestion(row));
    if (questions.length === filters.limit) break;
  }
  return questions;
}

/** Server-only: loads answer keys for active questions by id. */
export async function loadAnswerKeys(
  db: SupabaseClient,
  ids: string[]
): Promise<Map<string, AnswerKey>> {
  const { data, error } = await db
    .from("questions")
    .select("id,options,correct_answer_index,explanation")
    .eq("is_active", true)
    .in("id", ids);
  if (error) throw dbError("answer key lookup", error);

  const keys = new Map<string, AnswerKey>();
  for (const row of (data ?? []) as AnswerKey[]) {
    const validShape =
      Array.isArray(row.options) &&
      Number.isInteger(row.correct_answer_index) &&
      row.correct_answer_index >= 0 &&
      row.correct_answer_index < row.options.length;
    if (!validShape) {
      console.error(`[practice-api] malformed answer key for question ${row.id}`);
      continue; // treated as unknown, never scored on bad data
    }
    keys.set(row.id, row);
  }
  return keys;
}
