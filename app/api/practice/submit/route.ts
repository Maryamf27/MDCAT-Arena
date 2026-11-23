import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { loadAnswerKeys } from "@/lib/practice/repository";
import { scoreSubmission } from "@/lib/practice/scoring";
import { submitSchema } from "@/lib/practice/validation";

const MAX_BODY_BYTES = 16 * 1024;

/**
 * POST /api/practice/submit
 * Body: { "answers": [{ "questionId": "<uuid>", "selectedIndex": 0-3 | null }] }
 *
 * Scores on the server and returns, for each submitted question only, the
 * correct answer and explanation. Answers are never available before this call.
 */
export async function POST(request: NextRequest) {
  try {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) {
      throw new ApiError(413, "payload_too_large", "Request body is too large");
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      throw new ApiError(413, "payload_too_large", "Request body is too large");
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
    }

    const body = submitSchema.parse(json);

    const db = createAdminClient();
    const keys = await loadAnswerKeys(db, body.answers.map((a) => a.questionId));

    const unknown = body.answers.filter((a) => !keys.has(a.questionId)).map((a) => a.questionId);
    if (unknown.length) {
      throw new ApiError(422, "unknown_questions", "Some questions were not found or are not active", {
        questionIds: unknown,
      });
    }

    const result = scoreSubmission(body.answers, keys);
    return ok({ ...result, submittedAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}
