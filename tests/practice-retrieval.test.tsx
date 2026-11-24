// Unit tests for practice retrieval: difficulty mapping, validation, repository
// wiring and the difficulty badge. Run: npm run test:unit
// The real SQL (random sampling, filters, inactive rows, answer keys) is tested
// against Postgres in tests/sql/ (npm run test:sampling-sql).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeDifficulty,
  toApiDifficulty,
  toDbDifficulty,
} from "@/lib/practice/difficulty";
import { questionsQuerySchema } from "@/lib/practice/validation";
import { listActiveQuestions } from "@/lib/practice/repository";
import { ApiError } from "@/lib/practice/errors";
import { DifficultyBadge } from "@/components/practice/question-card";

type DbRow = {
  id: string;
  subject_id: string;
  syllabus_node_id: string;
  unit_id: string;
  topic_id: string;
  slo_node_id: string;
  slo_reference: string;
  question: string;
  options: string[];
  difficulty: string; // DATABASE vocabulary
  created_at: string;
  is_active: boolean;
  // columns the real function never returns; present here to prove nothing leaks
  correct_answer_index: number;
  explanation: string;
};

const SUBJECT = "00000000-0000-4000-8000-0000000000b1";
const OTHER_SUBJECT = "00000000-0000-4000-8000-0000000000c1";
const UNIT = "00000000-0000-4000-8000-000000000a01";
const TOPIC = "00000000-0000-4000-8000-000000000b01";
const SLO = "00000000-0000-4000-8000-000000000c01";
const DB_LEVELS = ["easy", "moderate", "difficult"] as const;

function makeRow(n: number, over: Partial<DbRow> = {}): DbRow {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    subject_id: SUBJECT,
    syllabus_node_id: TOPIC,
    unit_id: UNIT,
    topic_id: TOPIC,
    slo_node_id: SLO,
    slo_reference: "1.1",
    question: `Question ${n}`,
    options: ["a", "b", "c", "d"],
    difficulty: DB_LEVELS[n % 3],
    created_at: "2026-11-24T00:00:00Z",
    is_active: true,
    correct_answer_index: n % 4,
    explanation: `SECRET explanation ${n}`,
    ...over,
  };
}

/** 700 active Biology questions (more than the old 500 cap) + noise rows. */
function makeBank(): DbRow[] {
  const bank: DbRow[] = [];
  for (let n = 1; n <= 700; n++) bank.push(makeRow(n));
  for (let n = 701; n <= 740; n++) bank.push(makeRow(n, { is_active: false }));
  for (let n = 741; n <= 770; n++) bank.push(makeRow(n, { subject_id: OTHER_SUBJECT, unit_id: "u-other" }));
  return bank;
}

type RpcArgs = {
  p_subject_id: string | null;
  p_unit_id: string | null;
  p_topic_id: string | null;
  p_slo_node_id: string | null;
  p_difficulty: string | null;
  p_limit: number;
};

/**
 * In-memory stand-in for the sample_practice_questions RPC. It mirrors the SQL
 * semantics (active only, AND-ed filters, DB difficulty words, random, <= limit)
 * and DELIBERATELY returns rows that still carry answer-key fields, so the
 * tests can prove the repository strips them. Any table read throws: the
 * repository must never load the question bank.
 */
function fakeDb(bank: DbRow[], opts: { rawRows?: DbRow[]; error?: string } = {}) {
  const calls: Array<{ name: string; args: RpcArgs }> = [];
  const db = {
    from() {
      throw new Error("repository must not read the questions table when listing");
    },
    async rpc(name: string, args: RpcArgs) {
      calls.push({ name, args });
      if (opts.error) return { data: null, error: { message: opts.error } };
      if (opts.rawRows) return { data: opts.rawRows, error: null };
      const rows = bank
        .filter((r) => r.is_active)
        .filter((r) => !args.p_subject_id || r.subject_id === args.p_subject_id)
        .filter((r) => !args.p_unit_id || r.unit_id === args.p_unit_id)
        .filter((r) => !args.p_topic_id || r.topic_id === args.p_topic_id)
        .filter((r) => !args.p_slo_node_id || r.slo_node_id === args.p_slo_node_id)
        .filter((r) => !args.p_difficulty || r.difficulty === args.p_difficulty)
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(Math.max(args.p_limit, 1), 50));
      return { data: rows, error: null };
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

describe("difficulty mapping", () => {
  it("maps API words to database words (easy→easy, medium→moderate, hard→difficult)", () => {
    assert.equal(toDbDifficulty("easy"), "easy");
    assert.equal(toDbDifficulty("medium"), "moderate");
    assert.equal(toDbDifficulty("hard"), "difficult");
  });

  it("maps database words back to API words", () => {
    assert.equal(toApiDifficulty("easy"), "easy");
    assert.equal(toApiDifficulty("moderate"), "medium");
    assert.equal(toApiDifficulty("difficult"), "hard");
  });

  it("is a lossless round trip for every API word", () => {
    for (const d of ["easy", "medium", "hard"] as const) {
      assert.equal(toApiDifficulty(toDbDifficulty(d)), d);
    }
  });

  it("normalises either vocabulary and rejects unknown values", () => {
    assert.equal(normalizeDifficulty("moderate"), "medium");
    assert.equal(normalizeDifficulty("difficult"), "hard");
    assert.equal(normalizeDifficulty("Hard"), "hard");
    assert.equal(normalizeDifficulty("extreme"), null);
    assert.equal(normalizeDifficulty(undefined), null);
  });

  it("passes unknown stored values through unchanged instead of hiding them", () => {
    assert.equal(toApiDifficulty("legacy-tier"), "legacy-tier");
  });
});

describe("query validation", () => {
  const parse = (difficulty?: string) =>
    questionsQuerySchema.safeParse({ subject: "biology", ...(difficulty ? { difficulty } : {}) });

  it("accepts easy, medium and hard", () => {
    for (const d of ["easy", "medium", "hard"]) {
      const r = parse(d);
      assert.ok(r.success, d);
      assert.equal(r.data.difficulty, d);
    }
  });

  it("accepts database words as legacy aliases and canonicalises them", () => {
    const moderate = parse("moderate");
    const difficult = parse("difficult");
    assert.ok(moderate.success && difficult.success);
    assert.equal(moderate.data.difficulty, "medium");
    assert.equal(difficult.data.difficulty, "hard");
  });

  it("leaves difficulty undefined when omitted and rejects junk", () => {
    const none = parse();
    assert.ok(none.success);
    assert.equal(none.data.difficulty, undefined);
    assert.equal(parse("extreme").success, false);
  });
});

describe("listActiveQuestions: difficulty filtering and presentation", () => {
  for (const [api, dbWord] of [
    ["easy", "easy"],
    ["medium", "moderate"],
    ["hard", "difficult"],
  ] as const) {
    it(`difficulty=${api} queries the database for "${dbWord}" and returns only ${api} questions`, async () => {
      const { db, calls } = fakeDb(makeBank());
      const out = await listActiveQuestions(db, { scope: { subjectId: SUBJECT }, difficulty: api, limit: 50 });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].args.p_difficulty, dbWord);
      assert.equal(out.length, 50);
      assert.ok(out.every((q) => q.difficulty === api), `every question is presented as "${api}"`);
    });
  }

  it("sends no difficulty filter when none is requested, and presents API words for every level", async () => {
    const { db, calls } = fakeDb(makeBank());
    const out = await listActiveQuestions(db, { scope: { subjectId: SUBJECT }, limit: 50 });
    assert.equal(calls[0].args.p_difficulty, null);
    const levels = new Set(out.map((q) => q.difficulty));
    assert.deepEqual([...levels].sort(), ["easy", "hard", "medium"]);
    assert.ok(!out.some((q) => ["moderate", "difficult"].includes(q.difficulty)));
  });
});

describe("listActiveQuestions: sampling", () => {
  it("supports subject-wide selection from a pool larger than 500, in one bounded database call", async () => {
    const bank = makeBank();
    assert.ok(bank.filter((r) => r.is_active && r.subject_id === SUBJECT).length > 500);
    const { db, calls } = fakeDb(bank);
    const out = await listActiveQuestions(db, { scope: { subjectId: SUBJECT }, limit: 50 });
    assert.equal(out.length, 50);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "sample_practice_questions");
    assert.equal(calls[0].args.p_limit, 50, "only the requested number of rows is fetched, never a 500-row pool");
  });

  it("can surface questions from beyond the old 500-row window", async () => {
    const { db } = fakeDb(makeBank());
    const late = new Set<string>();
    for (let i = 0; i < 200; i++) {
      for (const q of await listActiveQuestions(db, { scope: { subjectId: SUBJECT }, limit: 50 })) {
        if (Number(q.id.slice(-12)) > 500) late.add(q.id);
      }
    }
    assert.ok(late.size > 0, "questions 501-700 are selectable");
  });

  it("never returns duplicates, even if the database returned some", async () => {
    const dup = makeRow(1);
    const rows = [dup, makeRow(2), dup, makeRow(3), makeRow(2)];
    const { db } = fakeDb([], { rawRows: rows });
    const out = await listActiveQuestions(db, { scope: { subjectId: SUBJECT }, limit: 10 });
    assert.deepEqual(out.map((q) => q.id), [dup.id, makeRow(2).id, makeRow(3).id]);
  });

  it("returns no duplicates across a normal 50-question draw", async () => {
    const { db } = fakeDb(makeBank());
    const out = await listActiveQuestions(db, { scope: { subjectId: SUBJECT }, limit: 50 });
    assert.equal(new Set(out.map((q) => q.id)).size, out.length);
  });

  it("never returns more than the requested limit", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => makeRow(i + 1));
    const { db } = fakeDb([], { rawRows: rows });
    assert.equal((await listActiveQuestions(db, { scope: { subjectId: SUBJECT }, limit: 5 })).length, 5);
  });

  it("forwards unit, topic and SLO scope to the database filter", async () => {
    const { db, calls } = fakeDb(makeBank());
    await listActiveQuestions(db, {
      scope: { subjectId: SUBJECT, unitId: UNIT, topicId: TOPIC, sloId: SLO },
      difficulty: "hard",
      limit: 7,
    });
    assert.deepEqual(calls[0].args, {
      p_subject_id: SUBJECT,
      p_unit_id: UNIT,
      p_topic_id: TOPIC,
      p_slo_node_id: SLO,
      p_difficulty: "difficult",
      p_limit: 7,
    });
  });

  it("passes null for scope parts that were not requested", async () => {
    const { db, calls } = fakeDb(makeBank());
    await listActiveQuestions(db, { scope: { topicId: TOPIC }, limit: 5 });
    assert.deepEqual(calls[0].args, {
      p_subject_id: null,
      p_unit_id: null,
      p_topic_id: TOPIC,
      p_slo_node_id: null,
      p_difficulty: null,
      p_limit: 5,
    });
  });

  it("keeps subjects isolated and ANDs filters together", async () => {
    const { db } = fakeDb(makeBank());
    const own = await listActiveQuestions(db, { scope: { subjectId: SUBJECT }, limit: 50 });
    assert.ok(own.every((q) => q.subject_id === SUBJECT));
    const other = await listActiveQuestions(db, { scope: { subjectId: OTHER_SUBJECT }, limit: 50 });
    assert.equal(other.length, 30, "the other subject's 30 active questions only");
    assert.ok(other.every((q) => q.subject_id === OTHER_SUBJECT));
    const mismatch = await listActiveQuestions(db, { scope: { subjectId: OTHER_SUBJECT, unitId: UNIT }, limit: 50 });
    assert.equal(mismatch.length, 0, "a unit from a different subject matches nothing");
  });

  it("surfaces database failures as a 502 database_error without leaking details", async () => {
    const { db } = fakeDb([], { error: "function public.sample_practice_questions does not exist" });
    await assert.rejects(
      () => listActiveQuestions(db, { scope: { subjectId: SUBJECT }, limit: 10 }),
      (e: unknown) => e instanceof ApiError && e.status === 502 && e.code === "database_error" && !/sample_practice/.test(e.message)
    );
  });
});

describe("listActiveQuestions: inactive rows and answer keys", () => {
  it("only serves what the active-only database function returns (inactive rows in the bank are never reachable)", async () => {
    const bank = makeBank();
    const inactive = new Set(bank.filter((r) => !r.is_active).map((r) => r.id));
    const { db } = fakeDb(bank);
    for (let i = 0; i < 100; i++) {
      for (const q of await listActiveQuestions(db, { scope: { subjectId: SUBJECT }, limit: 50 })) {
        assert.ok(!inactive.has(q.id));
      }
    }
  });

  it("never returns correct answers or explanations, even if the database row carried them", async () => {
    const { db } = fakeDb(makeBank());
    const out = await listActiveQuestions(db, { scope: { subjectId: SUBJECT }, limit: 50 });
    const allowed = [
      "id", "subject_id", "syllabus_node_id", "unit_id", "topic_id", "slo_node_id",
      "slo_reference", "question", "options", "difficulty", "created_at",
    ].sort();
    for (const q of out) assert.deepEqual(Object.keys(q).sort(), allowed);
    const body = JSON.stringify(out);
    assert.ok(!/correct_answer|explanation|SECRET|is_active/.test(body));
  });
});

describe("DifficultyBadge", () => {
  const render = (d: string) => renderToStaticMarkup(<DifficultyBadge difficulty={d} />);

  it("easy → green 'Easy'", () => {
    const html = render("easy");
    assert.match(html, /badge-success/);
    assert.match(html, />Easy</);
  });

  it("medium → amber 'Medium'", () => {
    const html = render("medium");
    assert.match(html, /badge-warning/);
    assert.match(html, />Medium</);
  });

  it("hard → red 'Hard'", () => {
    const html = render("hard");
    assert.match(html, /badge-error/);
    assert.match(html, />Hard</);
  });

  it("database words render identically to their API equivalents", () => {
    assert.equal(render("moderate"), render("medium"));
    assert.equal(render("difficult"), render("hard"));
  });

  it("unknown values get a neutral badge and keep their text", () => {
    const html = render("legacy");
    assert.match(html, /badge-neutral/);
    assert.match(html, />Legacy</);
    assert.doesNotMatch(html, /badge-(success|warning|error)/);
  });

  it("each tone used by the badge has a style rule in globals.css", () => {
    const css = fs.readFileSync("app/globals.css", "utf-8");
    for (const cls of ["badge-success", "badge-warning", "badge-error", "badge-neutral"]) {
      assert.ok(css.includes(`.${cls}`), `${cls} is styled`);
    }
  });
});
