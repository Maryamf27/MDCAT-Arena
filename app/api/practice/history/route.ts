import { requireUser } from "@/lib/auth/user";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { listPracticeHistory } from "@/lib/practice/history";
import { SUBJECT_KEYS, type SubjectKey } from "@/lib/subjects";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? "1");
    const limit = Number(params.get("limit") ?? "10");
    const subject = params.get("subject") ?? undefined;
    const includeIncomplete = params.get("status") === "incomplete";
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new ApiError(400, "validation_error", "Page and limit must be positive integers; limit cannot exceed 50");
    }
    if (subject && !(SUBJECT_KEYS as readonly string[]).includes(subject)) {
      throw new ApiError(400, "validation_error", "Unknown subject filter");
    }
    return ok(await listPracticeHistory(user.id, { page, limit, subject: subject as SubjectKey | undefined, includeIncomplete }));
  } catch (error) {
    return errorResponse(error);
  }
}
