import { requireUser } from "@/lib/auth/user";
import { errorResponse, ok } from "@/lib/practice/http";
import { getStudentAnalytics } from "@/lib/practice/history";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getStudentAnalytics(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}
