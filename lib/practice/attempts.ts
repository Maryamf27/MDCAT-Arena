import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";
import type { SubmittedAnswer } from "./types";

type RpcError = { message: string; code?: string };

/** Maps the database functions' error codes to API errors. Never leaks SQL text. */
function mapRpcError(context: string, error: RpcError): ApiError {
  switch (error.message) {
    case "attempt_not_found":
      return new ApiError(404, "attempt_not_found", "This practice attempt was not found");
    case "attempt_expired":
      return new ApiError(409, "attempt_expired", "This practice attempt has expired");
    case "unknown_questions":
      return new ApiError(422, "unknown_questions", "Some questions were not found");
    case "invalid_answers":
    case "invalid_subject":
      return new ApiError(400, "validation_error", "Request validation failed");
    case "user_not_found":
      return new ApiError(401, "unauthorized", "Sign in to save your practice attempts");
    default:
      console.error(`[practice-api] ${context}: ${error.code ?? ""} ${error.message}`);
      return new ApiError(502, "save_failed", "Your attempt could not be saved. Please try again.");
  }
}

/** Creates an `in_progress` attempt for the student (service role, via RPC). */
export async function startAttempt(
  db: SupabaseClient,
  userId: string,
  subject: string
): Promise<string> {
  const { data, error } = await db.rpc("start_practice_attempt", {
    p_user_id: userId,
    p_subject_key: subject,
  });
  if (error) throw mapRpcError("start attempt", error);
  if (typeof data !== "string") {
    console.error("[practice-api] start attempt: unexpected RPC result");
    throw new ApiError(502, "save_failed", "Your attempt could not be saved. Please try again.");
  }
  return data;
}

export type SavedSubmission =
  | { alreadySubmitted: false; attemptId: string; submittedAt: string; score: number; totalPoints: number }
  | {
      alreadySubmitted: true;
      attemptId: string;
      submittedAt: string;
      score: number;
      totalPoints: number;
      answers: SubmittedAnswer[];
    };

/**
 * Saves the attempt and ALL its answers in one database transaction. The
 * database recomputes correctness itself and aborts (saving nothing) if its
 * count differs from `expectedCorrect`, the server-side score computed by
 * scoreSubmission(). A repeated submit saves nothing and returns what was saved.
 */
export async function submitAttempt(
  db: SupabaseClient,
  params: { attemptId: string; userId: string; answers: SubmittedAnswer[]; expectedCorrect: number }
): Promise<SavedSubmission> {
  const { data, error } = await db.rpc("submit_practice_attempt", {
    p_attempt_id: params.attemptId,
    p_user_id: params.userId,
    p_answers: params.answers,
    p_expected_correct: params.expectedCorrect,
  });
  if (error) throw mapRpcError("submit attempt", error);

  const row = data as Record<string, unknown> | null;
  if (!row || typeof row.attemptId !== "string") {
    console.error("[practice-api] submit attempt: unexpected RPC result");
    throw new ApiError(502, "save_failed", "Your attempt could not be saved. Please try again.");
  }
  return row as unknown as SavedSubmission;
}
