import { z } from "zod";
import { DIFFICULTIES } from "./types";

const SUBJECT_KEYS = ["biology", "chemistry", "physics", "english", "logical_reasoning"] as const;

const uuid = z.string().uuid();
const subjectKey = z.enum(SUBJECT_KEYS);
const unitNumber = z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, "unit must be a unit number such as 3 or 5.1");
const topicSlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "topic must be a slug such as structure-of-dna").max(120);

const isUuid = (v: string) => uuid.safeParse(v).success;

/** Query-string validation for GET /api/practice/questions. */
export const questionsQuerySchema = z
  .object({
    subject: z.union([uuid, subjectKey]).optional(),
    unit: z.union([uuid, unitNumber]).optional(),
    topic: z.union([uuid, topicSlug]).optional(),
    difficulty: z.enum(DIFFICULTIES).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .superRefine((q, ctx) => {
    if (!q.subject && !q.unit && !q.topic) {
      ctx.addIssue({ code: "custom", message: "Provide at least one of subject, unit or topic" });
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
  });
export type QuestionsQuery = z.infer<typeof questionsQuerySchema>;

/** Body validation for POST /api/practice/submit. */
export const submitSchema = z
  .object({
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
