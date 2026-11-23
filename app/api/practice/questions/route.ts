import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, ok } from "@/lib/practice/http";
import { listActiveQuestions, resolveScope } from "@/lib/practice/repository";
import { questionsQuerySchema } from "@/lib/practice/validation";

/**
 * GET /api/practice/questions?subject=physics&unit=3&topic=waves&slo=3.9&limit=10
 *
 * Returns random active questions WITHOUT correct_answer_index or explanation.
 * Subject keys and SLO references resolve through the live syllabus tables;
 * unit, topic and SLO filters also accept their database UUIDs.
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
