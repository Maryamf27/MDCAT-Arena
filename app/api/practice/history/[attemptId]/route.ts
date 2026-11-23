import { requireUser } from "@/lib/auth/user";
import { errorResponse, ok } from "@/lib/practice/http";
import { getPracticeAttempt } from "@/lib/practice/history";

export async function GET(_request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireUser();
    const { attemptId } = await context.params;
    return ok(await getPracticeAttempt(user.id, attemptId));
  } catch (error) {
    return errorResponse(error);
  }
}
