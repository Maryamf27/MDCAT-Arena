/** Question shape as returned by GET /api/practice/questions (no answer key). */
export type PracticeQuestion = {
  id: string;
  question: string;
  options: string[];
  difficulty: string;
  sloReference: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validates the questions response without trusting its shape. */
export function parseQuestionsResponse(json: unknown): PracticeQuestion[] | null {
  if (!isRecord(json) || !isRecord(json.data) || !Array.isArray(json.data.questions)) return null;
  const out: PracticeQuestion[] = [];
  for (const raw of json.data.questions) {
    if (!isRecord(raw)) return null;
    const { id, question, options, difficulty, slo_reference } = raw;
    if (
      typeof id !== "string" ||
      typeof question !== "string" ||
      typeof difficulty !== "string" ||
      !Array.isArray(options) ||
      !options.every((o): o is string => typeof o === "string")
    ) {
      return null;
    }
    out.push({
      id,
      question,
      options,
      difficulty,
      sloReference: typeof slo_reference === "string" ? slo_reference : null,
    });
  }
  return out;
}

/** Pulls the API's error message out of { error: { message } } if present. */
export function parseApiErrorMessage(json: unknown): string | null {
  if (isRecord(json) && isRecord(json.error) && typeof json.error.message === "string") {
    return json.error.message;
  }
  return null;
}

/** Pulls the API's machine-readable error code out of { error: { code } }. */
export function parseApiErrorCode(json: unknown): string | null {
  if (isRecord(json) && isRecord(json.error) && typeof json.error.code === "string") {
    return json.error.code;
  }
  return null;
}
