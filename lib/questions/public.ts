import { createClient } from "@/lib/supabase/server";

/**
 * The ONLY columns client-facing code may read from public.questions.
 * Never add correct_answer_index, explanation, source_*, content_hash,
 * question_hash, status or created_by here; answers are released only by a
 * server-side submission function after a test is submitted.
 */
export const PUBLIC_QUESTION_COLUMNS = [
  "id",
  "subject_id",
  "syllabus_node_id",
  "unit_id",
  "topic_id",
  "slo_node_id",
  "slo_reference",
  "question",
  "options",
  "difficulty",
  "created_at",
] as const;

export type PublicQuestion = {
  id: string;
  subject_id: string;
  syllabus_node_id: string;
  unit_id: string;
  topic_id: string;
  slo_node_id: string;
  slo_reference: string;
  question: string;
  options: string[];
  difficulty: string;
  created_at: string;
};

export async function getPublicQuestions(
  filter: { subjectId?: string; topicId?: string; limit?: number } = {}
): Promise<PublicQuestion[]> {
  const supabase = await createClient();
  let query = supabase
    .from("questions")
    .select(PUBLIC_QUESTION_COLUMNS.join(","))
    .limit(filter.limit ?? 50);
  if (filter.subjectId) query = query.eq("subject_id", filter.subjectId);
  if (filter.topicId) query = query.eq("topic_id", filter.topicId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load questions: ${error.message}`);
  return (data ?? []) as unknown as PublicQuestion[];
}
