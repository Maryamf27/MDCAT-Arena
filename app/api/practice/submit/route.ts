import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { submitAttempt } from "@/lib/practice/attempts";
import { loadAnswerKeys } from "@/lib/practice/repository";
import { scoreSubmission } from "@/lib/practice/scoring";
import { submitSchema } from "@/lib/practice/validation";

const MAX_BODY_BYTES = 16 * 1024;

/**
 * POST /api/practice/submit   (requires a signed-in student)
 * Body: { "attemptId": "<uuid from POST /api/practice/attempts>",
 *         "answers": [{ "questionId": "<uuid>", "selectedIndex": 0-3 | null }] }
 *
 * Scores on the server, saves the attempt and every answer in one database
 * transaction, then returns the saved attempt id plus, for each submitted
 * question only, the correct answer and explanation. Repeating a submit never
 * creates rows: it returns the already-saved attempt with `alreadySubmitted: true`.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

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

    // Existing server-side scoring; only the answers (never a client score or
    // correctness flag) are accepted from the request.
    const result = scoreSubmission(body.answers, keys);

    const saved = await submitAttempt(db, {
      attemptId: body.attemptId,
      userId: user.id,
      answers: body.answers,
      expectedCorrect: result.score.correct,
    });

    if (!saved.alreadySubmitted) {
      return ok({
        attemptId: saved.attemptId,
        alreadySubmitted: false,
        ...result,
        submittedAt: saved.submittedAt,
      });
    }

    // Repeat submit: nothing was written. Report what was saved originally,
    // not what this second request contained.
    const savedKeys = await loadAnswerKeys(db, saved.answers.map((a) => a.questionId));
    if (saved.answers.some((a) => !savedKeys.has(a.questionId))) {
      throw new ApiError(409, "already_submitted", "This attempt was already submitted", {
        attemptId: saved.attemptId,
        correct: saved.score,
        total: saved.totalPoints,
      });
    }
    // Preserve the order the student saw: reuse the order of this request.
    const order = new Map(body.answers.map((a, i) => [a.questionId, i]));
    const savedAnswers = [...saved.answers].sort(
      (a, b) => (order.get(a.questionId) ?? 0) - (order.get(b.questionId) ?? 0)
    );
    return ok({
      attemptId: saved.attemptId,
      alreadySubmitted: true,
      ...scoreSubmission(savedAnswers, savedKeys),
      submittedAt: saved.submittedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
