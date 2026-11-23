import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "./errors";
import { SUBJECT_META, type SubjectKey } from "@/lib/subjects";

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 50;
const titleBySubject = new Map(SUBJECT_META.map((subject) => [`${subject.label} Practice`, subject]));
const keyByTitle = (title: unknown) => typeof title === "string" ? titleBySubject.get(title) : undefined;

type AttemptRow = {
  id: string;
  test_id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  total_points: number | null;
};
type TestRow = { id: string; title: string };
type AnswerRow = {
  attempt_id: string;
  question_id: string;
  selected_option_index: number | null;
  is_correct: boolean | null;
};

function dbFailure(context: string, error: { message: string }): never {
  console.error(`[practice-history] ${context}: ${error.message}`);
  throw new ApiError(502, "database_error", "Practice history is temporarily unavailable");
}

async function loadTests() {
  const db = createAdminClient();
  const { data, error } = await db.from("tests").select("id,title").eq("test_type", "practice");
  if (error) dbFailure("load practice tests", error);
  return (data ?? []) as TestRow[];
}

function mapAttempt(row: AttemptRow, tests: Map<string, TestRow>) {
  const subject = keyByTitle(tests.get(row.test_id)?.title);
  return {
    id: row.id,
    status: row.status,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    score: Number(row.score ?? 0),
    totalPoints: Number(row.total_points ?? 0),
    percentage: Number(row.total_points) > 0 ? Math.round((Number(row.score ?? 0) / Number(row.total_points)) * 1000) / 10 : 0,
    subject: subject ? { key: subject.key, label: subject.label } : null,
  };
}

export async function listPracticeHistory(userId: string, params: {
  page: number;
  limit?: number;
  subject?: SubjectKey;
  includeIncomplete?: boolean;
}) {
  const db = createAdminClient();
  const tests = await loadTests();
  const testMap = new Map(tests.map((test) => [test.id, test]));
  const filteredTests = params.subject
    ? tests.filter((test) => keyByTitle(test.title)?.key === params.subject)
    : tests.filter((test) => keyByTitle(test.title));
  const testIds = filteredTests.map((test) => test.id);
  const limit = Math.min(Math.max(params.limit ?? PAGE_SIZE_DEFAULT, 1), PAGE_SIZE_MAX);
  const from = (params.page - 1) * limit;
  if (testIds.length === 0) return { attempts: [], page: params.page, limit, total: 0, totalPages: 0 };

  let query = db.from("attempts").select("id,test_id,status,started_at,submitted_at,score,total_points", { count: "exact" })
    .eq("user_id", userId).in("test_id", testIds).order("started_at", { ascending: false });
  query = params.includeIncomplete
    ? query.in("status", ["submitted", "in_progress", "expired"])
    : query.eq("status", "submitted");
  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) dbFailure("list attempts", error);
  const total = count ?? 0;
  return {
    attempts: ((data ?? []) as AttemptRow[]).map((row) => mapAttempt(row, testMap)),
    page: params.page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPracticeAttempt(userId: string, attemptId: string) {
  const db = createAdminClient();
  const { data: attempt, error } = await db.from("attempts")
    .select("id,test_id,status,started_at,submitted_at,score,total_points")
    .eq("id", attemptId).eq("user_id", userId).eq("status", "submitted").maybeSingle();
  if (error) dbFailure("get attempt", error);
  if (!attempt) throw new ApiError(404, "attempt_not_found", "This practice attempt was not found");
  const { data: test, error: testError } = await db.from("tests").select("id,title").eq("id", attempt.test_id).maybeSingle();
  if (testError) dbFailure("get attempt subject", testError);
  const subject = keyByTitle((test as TestRow | null)?.title);
  const { data: answers, error: answerError } = await db.from("attempt_answers")
    .select("question_id,selected_option_index,is_correct")
    .eq("attempt_id", attemptId).order("answered_at", { ascending: true, nullsFirst: true });
  if (answerError) dbFailure("get saved answers", answerError);
  const answerRows = (answers ?? []) as Pick<AnswerRow, "question_id" | "selected_option_index" | "is_correct">[];
  const questionIds = [...new Set(answerRows.map((answer) => answer.question_id))];
  const { data: questions, error: questionError } = questionIds.length
    ? await db.from("questions").select("id,question,options,correct_answer_index,explanation,topic_id").in("id", questionIds)
    : { data: [], error: null };
  if (questionError) dbFailure("get answer explanations", questionError);
  const questionRows = (questions ?? []) as { id: string; question: string; options: string[]; correct_answer_index: number; explanation: string; topic_id: string | null }[];
  const questionMap = new Map(questionRows.map((question) => [question.id, question]));
  const topicIds = [...new Set(questionRows.map((question) => question.topic_id).filter((id): id is string => Boolean(id)))];
  const { data: topics, error: topicError } = topicIds.length
    ? await db.from("syllabus_nodes").select("id,title").in("id", topicIds)
    : { data: [], error: null };
  if (topicError) dbFailure("get topic names", topicError);
  const topicMap = new Map(((topics ?? []) as { id: string; title: string }[]).map((topic) => [topic.id, topic.title]));
  const totalPoints = Number(attempt.total_points ?? 0);
  const score = Number(attempt.score ?? 0);
  return {
    attempt: {
      id: attempt.id as string,
      status: attempt.status as string,
      startedAt: attempt.started_at as string,
      submittedAt: attempt.submitted_at as string | null,
      score,
      totalPoints,
      percentage: totalPoints ? Math.round((score / totalPoints) * 1000) / 10 : 0,
      subject: subject ? { key: subject.key, label: subject.label } : null,
    },
    answers: answerRows.map((answer) => {
      const question = questionMap.get(answer.question_id);
      return {
        questionId: answer.question_id,
        selectedIndex: answer.selected_option_index,
        isCorrect: answer.is_correct === true,
        question: question?.question ?? "This question is no longer available.",
        options: question?.options ?? [],
        correctIndex: question?.correct_answer_index ?? null,
        explanation: question?.explanation ?? null,
        topic: question?.topic_id ? topicMap.get(question.topic_id) ?? null : null,
      };
    }),
  };
}

export async function getStudentAnalytics(userId: string) {
  const db = createAdminClient();
  const tests = await loadTests();
  const testsById = new Map(tests.map((test) => [test.id, test]));
  const testIds = tests.filter((test) => keyByTitle(test.title)).map((test) => test.id);
  if (!testIds.length) return emptyAnalytics();
  const { data: attempts, error } = await db.from("attempts")
    .select("id,test_id,status,started_at,submitted_at,score,total_points")
    .eq("user_id", userId).eq("status", "submitted").in("test_id", testIds)
    .order("submitted_at", { ascending: false });
  if (error) dbFailure("load analytics attempts", error);
  const rows = (attempts ?? []) as AttemptRow[];
  if (!rows.length) return emptyAnalytics();
  const attemptsById = new Map(rows.map((attempt) => [attempt.id, attempt]));
  const answerRows: AnswerRow[] = [];
  for (let offset = 0; offset < rows.length; offset += 200) {
    const batch = rows.slice(offset, offset + 200).map((attempt) => attempt.id);
    const { data, error: answerError } = await db.from("attempt_answers")
      .select("attempt_id,question_id,selected_option_index,is_correct").in("attempt_id", batch);
    if (answerError) dbFailure("load analytics answers", answerError);
    answerRows.push(...((data ?? []) as AnswerRow[]));
  }
  const uniqueAnswers = new Map<string, AnswerRow>();
  for (const answer of answerRows) uniqueAnswers.set(`${answer.attempt_id}:${answer.question_id}`, answer);
  const subjectStats = new Map<SubjectKey, { questions: number; correct: number; answered: number }>();
  const topicStats = new Map<string, { total: number; incorrect: number }>();
  const questionIds = [...new Set([...uniqueAnswers.values()].map((answer) => answer.question_id))];
  const questionTopic = new Map<string, string>();
  for (let offset = 0; offset < questionIds.length; offset += 500) {
    const { data, error: questionError } = await db.from("questions").select("id,topic_id").in("id", questionIds.slice(offset, offset + 500));
    if (questionError) dbFailure("load analytics topic data", questionError);
    for (const question of (data ?? []) as { id: string; topic_id: string | null }[]) {
      if (question.topic_id) questionTopic.set(question.id, question.topic_id);
    }
  }
  for (const attempt of rows) {
    const subject = keyByTitle(testsById.get(attempt.test_id)?.title);
    if (!subject) continue;
    const existing = subjectStats.get(subject.key) ?? { questions: 0, correct: 0, answered: 0 };
    existing.questions += Number(attempt.total_points ?? 0);
    existing.correct += Number(attempt.score ?? 0);
    subjectStats.set(subject.key, existing);
  }
  for (const answer of uniqueAnswers.values()) {
    const attempt = attemptsById.get(answer.attempt_id);
    const subject = attempt ? keyByTitle(testsById.get(attempt.test_id)?.title) : undefined;
    if (!subject) continue;
    const stats = subjectStats.get(subject.key)!;
    if (answer.selected_option_index !== null) stats.answered += 1;
    const topicId = questionTopic.get(answer.question_id);
    if (!topicId || answer.selected_option_index === null) continue;
    const topic = topicStats.get(topicId) ?? { total: 0, incorrect: 0 };
    topic.total += 1;
    if (answer.is_correct !== true) topic.incorrect += 1;
    topicStats.set(topicId, topic);
  }
  const weakTopicIds = [...topicStats.entries()].filter(([, value]) => value.total > 0)
    .sort((a, b) => b[1].incorrect / b[1].total - a[1].incorrect / a[1].total)
    .slice(0, 5).map(([id]) => id);
  const { data: weakTopics, error: weakTopicError } = weakTopicIds.length
    ? await db.from("syllabus_nodes").select("id,title").in("id", weakTopicIds)
    : { data: [], error: null };
  if (weakTopicError) dbFailure("load weak topics", weakTopicError);
  const topicNames = new Map(((weakTopics ?? []) as { id: string; title: string }[]).map((topic) => [topic.id, topic.title]));
  const totalQuestions = rows.reduce((sum, attempt) => sum + Number(attempt.total_points ?? 0), 0);
  const correctAnswers = rows.reduce((sum, attempt) => sum + Number(attempt.score ?? 0), 0);
  const answeredQuestions = [...uniqueAnswers.values()].filter((answer) => answer.selected_option_index !== null).length;
  const overall = {
    completedAttempts: rows.length,
    totalQuestions,
    correctAnswers,
    answeredQuestions,
    accuracy: answeredQuestions ? Math.round(correctAnswers / answeredQuestions * 1000) / 10 : 0,
    averageScore: rows.length ? Math.round(rows.reduce((sum, attempt) => {
      const total = Number(attempt.total_points ?? 0);
      return sum + (total ? Number(attempt.score ?? 0) / total * 100 : 0);
    }, 0) / rows.length * 10) / 10 : 0,
  };
  return {
    overall,
    subjects: SUBJECT_META.flatMap((subject) => {
      const stats = subjectStats.get(subject.key);
      if (!stats) return [];
      return [{ key: subject.key, label: subject.label, totalQuestions: stats.questions, correctAnswers: stats.correct,
        answeredQuestions: stats.answered, accuracy: stats.answered ? Math.round(stats.correct / stats.answered * 1000) / 10 : 0 }];
    }),
    recentAttempts: rows.slice(0, 5).map((attempt) => mapAttempt(attempt, testsById)),
    progress: rows.slice(0, 12).reverse().map((attempt) => ({
      date: attempt.submitted_at ?? attempt.started_at,
      score: Number(attempt.score ?? 0), total: Number(attempt.total_points ?? 0),
      percentage: Number(attempt.total_points) ? Math.round(Number(attempt.score ?? 0) / Number(attempt.total_points) * 1000) / 10 : 0,
      subject: keyByTitle(testsById.get(attempt.test_id)?.title)?.label ?? "Practice",
    })),
    weakTopics: weakTopicIds.map((id) => ({ name: topicNames.get(id) ?? "Topic", incorrect: topicStats.get(id)!.incorrect, total: topicStats.get(id)!.total })),
  };
}

function emptyAnalytics() {
  return { overall: { completedAttempts: 0, totalQuestions: 0, correctAnswers: 0, answeredQuestions: 0, accuracy: 0, averageScore: 0 }, subjects: [], recentAttempts: [], progress: [], weakTopics: [] };
}
