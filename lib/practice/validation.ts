import { z } from "zod";
import { SUBJECT_KEYS } from "@/lib/subjects";
import { DIFFICULTIES } from "./types";

const uuid = z.string().uuid();
const subjectKey = z.enum(SUBJECT_KEYS);
const unitNumber = z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, "unit must be a unit number such as 3 or 5.1");
const topicSlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "topic must be a slug such as structure-of-dna").max(120);
const sloReference = z.string().regex(/^\d{1,2}\.\d{1,2}$/, "slo must be a syllabus outcome identifier such as 3.9");

const isUuid = (v: string) => uuid.safeParse(v).success;

/** Query-string validation for GET /api/practice/questions. */
export const questionsQuerySchema = z
  .object({
    subject: z.union([uuid, subjectKey]).optional(),
    unit: z.union([uuid, unitNumber]).optional(),
    topic: z.union([uuid, topicSlug]).optional(),
    slo: z.union([uuid, sloReference]).optional(),
    difficulty: z.enum(DIFFICULTIES).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .superRefine((q, ctx) => {
    if (!q.subject && !q.unit && !q.topic && !q.slo) {
      ctx.addIssue({ code: "custom", message: "Provide at least one of subject, unit, topic or SLO" });
    }
    if (q.unit && !isUuid(q.unit) && !q.subject) {
      ctx.addIssue({ code: "custom", path: ["subject"], message: "subject is required when unit is a unit number" });
    }
    if (q.unit && !isUuid(q.unit) && q.subject && isUuid(q.subject)) {
      ctx.addIssue({ code: "custom", path: ["subject"], message: "use a subject key (e.g. biology) with a unit number, or pass the unit UUID" });
    }
    if (q.topic && !isUuid(q.topic) && (!q.subject || !q.unit || isUuid(q.subject) || isUuid(q.unit))) {
      ctx.addIssue({ code: "custom", path: ["topic"], message: "a topic slug requires subject key and unit number; otherwise pass the topic UUID" });
    }
    if (q.slo && !isUuid(q.slo) && (!q.subject || isUuid(q.subject))) {
      ctx.addIssue({ code: "custom", path: ["slo"], message: "an SLO reference requires a subject key; otherwise pass the SLO UUID" });
    }
  });
export type QuestionsQuery = z.infer<typeof questionsQuerySchema>;

/** Body validation for POST /api/practice/submit. attemptId comes from POST /api/practice/attempts. */
export const submitSchema = z
  .object({
    attemptId: uuid,
    answers: z
      .array(
        z.object({
          questionId: uuid,
          selectedIndex: z.number().int().min(0).max(3).nullable(),
        }).strict()
      )
      .min(1, "at least one answer is required")
      .max(50, "at most 50 answers per submission"),
  })
  .strict()
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.answers.forEach((a, i) => {
      if (seen.has(a.questionId)) {
        ctx.addIssue({ code: "custom", path: ["answers", i, "questionId"], message: "duplicate questionId" });
      }
      seen.add(a.questionId);
    });
  });
export type SubmitBody = z.infer<typeof submitSchema>;

/** Body validation for POST /api/practice/attempts (start a practice attempt). */
export const startAttemptSchema = z.object({ subject: subjectKey }).strict();
export type StartAttemptBody = z.infer<typeof startAttemptSchema>;
