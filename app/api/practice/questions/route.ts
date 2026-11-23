import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, ok } from "@/lib/practice/http";
import { listActiveQuestions, resolveScope } from "@/lib/practice/repository";
import { questionsQuerySchema } from "@/lib/practice/validation";

/**
 * GET /api/practice/questions?subject=biology&unit=3&topic=structure-of-dna&difficulty=easy&limit=10
 *
 * Returns random active questions WITHOUT correct_answer_index or explanation.
 * Subject/unit/topic accept either human keys (biology, 3, structure-of-dna)
 * or database UUIDs. At least one of subject, unit, topic is required.
 */
export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = questionsQuerySchema.parse(params);

    const db = createAdminClient();
    const scope = await resolveScope(db, query);
    const questions = await listActiveQuestions(db, {
      scope,
      difficulty: query.difficulty,
      limit: query.limit,
    });

    return ok({ count: questions.length, questions });
  } catch (error) {
    return errorResponse(error);
  }
}
