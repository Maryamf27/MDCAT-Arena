import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { ApiError } from "@/lib/practice/errors";
import { errorResponse, ok } from "@/lib/practice/http";
import { loadAttempt } from "@/lib/practice/mock-exams";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireUser();
    const { attemptId } = await context.params;
    if (!z.string().uuid().safeParse(attemptId).success) throw new ApiError(400, "validation_error", "Invalid attempt id");
    const session = await loadAttempt(createAdminClient(), attemptId, user.id, true);
    if (session.attempt.status !== "submitted") throw new ApiError(409, "not_submitted", "Results appear after final submission");
    const questionRows = session.questions as unknown as Array<Record<string, unknown>>;
    const questions: Array<Record<string, unknown> & { isCorrect: boolean }> = questionRows.map((q) => ({ ...q, isCorrect: q.selectedIndex !== null && q.selectedIndex === q.correct_answer_index }));
    const bySubject = new Map<string, { total: number; correct: number; answered: number }>();
    for (const q of questions) {
      const subjectId = String(q.subject_id);
      const item = bySubject.get(subjectId) ?? { total: 0, correct: 0, answered: 0 };
      item.total++; if (q.selectedIndex !== null) item.answered++; if (q.isCorrect) item.correct++;
      bySubject.set(subjectId, item);
    }
    const { data: subjects } = await createAdminClient().from("subjects").select("id,code,name").in("id", [...bySubject.keys()]);
    const subjectNames = new Map((subjects ?? []).map((s) => [s.id, s.name ?? s.code]));
    const subjectPerformance = [...bySubject].map(([id, stats]) => ({ subjectId: id, subject: subjectNames.get(id) ?? "Subject", ...stats, percentage: stats.total ? Math.round((stats.correct / stats.total) * 1000) / 10 : 0 }));
    const correct = questions.filter((q) => q.isCorrect).length;
    const answered = questions.filter((q) => q.selectedIndex !== null).length;
    const elapsedSeconds = Math.max(0, Math.floor((new Date(session.attempt.submitted_at).getTime() - new Date(session.attempt.started_at).getTime()) / 1000));
    return ok({ ...session, questions, subjectPerformance,
      summary: { total: questions.length, answered, unanswered: questions.length - answered, correct, incorrect: answered - correct,
        score: Number(session.attempt.score), totalPoints: Number(session.attempt.total_points),
        percentage: Number(session.attempt.total_points) ? Math.round((Number(session.attempt.score) / Number(session.attempt.total_points)) * 1000) / 10 : 0,
        accuracy: answered ? Math.round((correct / answered) * 1000) / 10 : null,
        elapsedSeconds,
      },
    });
  } catch (error) { return errorResponse(error); }
}
