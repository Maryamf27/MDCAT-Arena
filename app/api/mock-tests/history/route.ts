import { requireUser } from "@/lib/auth/user";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const limit = Number(url.searchParams.get("limit") ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new ApiError(400, "validation_error", "Page and limit are invalid");
    const db = createAdminClient();
    const { data: mockTests, error: testError } = await db.from("tests").select("id,title").eq("test_type", "mock");
    if (testError) throw new ApiError(502, "database_error", "History could not be loaded");
    const testMap = new Map((mockTests ?? []).map((t) => [t.id, t.title]));
    const ids = [...testMap.keys()];
    if (!ids.length) return ok({ items: [], page, limit, total: 0, totalPages: 0 });
    const { data, error, count } = await db.from("attempts").select("id,test_id,status,started_at,submitted_at,expires_at,score,total_points", { count: "exact" })
      .eq("user_id", user.id).in("test_id", ids).order("started_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
    if (error) throw new ApiError(502, "database_error", "History could not be loaded");
    const items = (data ?? []).map((row) => ({ ...row, title: testMap.get(row.test_id) ?? "Mock examination",
      percentage: row.total_points ? Math.round((Number(row.score) / Number(row.total_points)) * 1000) / 10 : null,
      timeTakenSeconds: row.submitted_at ? Math.max(0, Math.floor((new Date(row.submitted_at).getTime() - new Date(row.started_at).getTime()) / 1000)) : null,
    }));
    return ok({ items, page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) });
  } catch (error) { return errorResponse(error); }
}
