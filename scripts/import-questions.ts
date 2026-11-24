
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

dotenv.config({ path: ".env" });

// ---------- types ----------
type AuthoredQuestion = {
  question: string;
  options: string[];
  correct_answer_index: number;
  explanation: string;
  subject: string;
  unit_id: string;
  topic_id: string;
  slo_reference: string;
  difficulty: string;
  source_type: string;
  source_reference: string;
};

type Dataset = { questions: AuthoredQuestion[] };

type Resolved = {
  subject_id: string;
  unit_id: string;
  topic_id: string;
  slo_node_id: string;
};

type Outcome = {
  index: number;
  hash: string;
  status: "inserted" | "skipped-duplicate" | "failed" | "unresolved";
  detail?: string;
};

// ---------- config ----------
const SUBJECT_KEYS = new Set([
  "biology",
  "chemistry",
  "physics",
  "english",
  "logical_reasoning",
]);

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const SOURCE_TYPES = new Set(["original"]);

const REQUIRED_COLUMNS = [
  "id",
  "question",
  "question_text",
  "options",
  "correct_answer_index",
  "explanation",
  "subject_id",
  "unit_id",
  "topic_id",
  "slo_node_id",
  "syllabus_node_id",
  "slo_reference",
  "difficulty",
  "source_type",
  "source_reference",
  "source_name",
  "source_url",
  "question_hash",
  "content_hash",
  "status",
  "is_active",
  "created_at",
];

// Database difficulty mapping:
// Dataset: easy, medium, hard
// Database: easy, moderate, difficult
function toDatabaseDifficulty(difficulty: string): string {
  const mapping: Record<string, string> = {
    easy: "easy",
    medium: "moderate",
    hard: "difficult",
  };

  return mapping[difficulty] ?? difficulty;
}

// ---------- cli ----------
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

function flagValue(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const datasetPath = path.resolve(
  flagValue("--dataset") ??
    "scraper/output/biology/authored-sample.json"
);

const statusOverride = flagValue("--status");

// ---------- helpers ----------
function normalizedHash(question: string): string {
  const normalized = question
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  return crypto
    .createHash("md5")
    .update(normalized, "utf8")
    .digest("hex");
}

// Smaller chunks reduce the size of PostgREST requests.
const IN_CHUNK_SIZE = 20;

function chunk<T>(
  items: T[],
  size: number = IN_CHUNK_SIZE
): T[][] {
  const parts: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    parts.push(items.slice(i, i + size));
  }

  return parts;
}

function fail(message: string): never {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function runPythonValidator(): void {
  const validator = path.resolve(
    "scraper/validate_question_dataset.py"
  );

  for (const python of ["python3", "python"]) {
    const result = spawnSync(
      python,
      [validator, datasetPath],
      { encoding: "utf-8" }
    );

    if (result.error) continue;

    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);

    if (result.status !== 0) {
      fail(
        "Python dataset validation failed; nothing imported."
      );
    }

    return;
  }

  fail(
    "No Python interpreter found to run scraper/validate_question_dataset.py."
  );
}

function validateStructure(data: Dataset): void {
  if (
    !Array.isArray(data.questions) ||
    data.questions.length === 0
  ) {
    fail("Dataset has no questions array.");
  }

  const seen = new Set<string>();
  const problems: string[] = [];

  data.questions.forEach((q, i) => {
    const label = `question[${i}]`;

    const textOk = (v: unknown) =>
      typeof v === "string" && v.trim() !== "";

    if (!textOk(q.question)) {
      problems.push(`${label}: empty question`);
    }

    if (
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      !q.options.every(textOk)
    ) {
      problems.push(
        `${label}: options must be 4 non-empty strings`
      );
    }

    if (
      !Number.isInteger(q.correct_answer_index) ||
      q.correct_answer_index < 0 ||
      q.correct_answer_index > 3
    ) {
      problems.push(
        `${label}: correct_answer_index must be an integer 0-3`
      );
    }

    if (!textOk(q.explanation)) {
      problems.push(`${label}: empty explanation`);
    }

    if (!SUBJECT_KEYS.has(q.subject)) {
      problems.push(`${label}: unknown subject`);
    }

    if (!DIFFICULTIES.has(q.difficulty)) {
      problems.push(`${label}: bad difficulty`);
    }

    if (!SOURCE_TYPES.has(q.source_type)) {
      problems.push(`${label}: bad source_type`);
    }

    if (!textOk(q.source_reference)) {
      problems.push(`${label}: empty source_reference`);
    }

    if (!textOk(q.slo_reference)) {
      problems.push(`${label}: empty slo_reference`);
    }

    if (
      !q.unit_id?.startsWith(`${q.subject}/unit/`)
    ) {
      problems.push(
        `${label}: unit_id/subject mismatch`
      );
    }

    if (
      !q.topic_id?.startsWith(`${q.unit_id}/topic/`)
    ) {
      problems.push(
        `${label}: topic_id not under unit_id`
      );
    }

    if (textOk(q.question)) {
      const hash = normalizedHash(q.question);

      if (seen.has(hash)) {
        problems.push(
          `${label}: duplicate question text within file`
        );
      }

      seen.add(hash);
    }
  });

  if (problems.length) {
    fail(
      `Structural validation failed:\n  ${problems.join("\n  ")}`
    );
  }
}

// ---------- schema ----------
async function probeSchema(
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from("questions")
    .select(REQUIRED_COLUMNS.join(","))
    .limit(0);

  if (error) {
    fail(
      `public.questions does not expose the expected columns (${error.message}). ` +
        "Was the migration applied to this project?"
    );
  }

  console.log(
    `Schema probe OK: ${REQUIRED_COLUMNS.length} required columns present.`
  );
}

// ---------- syllabus resolution ----------
async function resolveRefs(
  supabase: SupabaseClient,
  q: AuthoredQuestion
): Promise<Resolved | string> {
  const { data, error } = await supabase.rpc(
    "resolve_question_syllabus_refs",
    {
      p_subject_key: q.subject,
      p_unit_path: q.unit_id,
      p_topic_path: q.topic_id,
      p_slo: q.slo_reference,
    }
  );

  if (error) {
    return `resolver error: ${error.message}`;
  }

  const rows = (data ?? []) as Resolved[];

  if (rows.length !== 1) {
    return (
      `resolver returned ${rows.length} rows for ` +
      `${q.topic_id} / SLO ${q.slo_reference} (expected 1)`
    );
  }

  return rows[0];
}

// ---------- row mapping ----------
function toRow(
  q: AuthoredQuestion,
  r: Resolved,
  hash: string
) {
  return {
    question: q.question,
    options: q.options,
    correct_answer_index: q.correct_answer_index,
    explanation: q.explanation,

    subject_id: r.subject_id,
    unit_id: r.unit_id,
    topic_id: r.topic_id,
    slo_node_id: r.slo_node_id,
    slo_reference: q.slo_reference,

    // Convert to values accepted by database constraint.
    difficulty: toDatabaseDifficulty(q.difficulty),

    source_type: q.source_type,
    source_reference: q.source_reference,
    question_hash: hash,

    // Legacy columns.
    question_text: q.question,
    syllabus_node_id: r.topic_id,
    source_name: q.source_reference,
    source_url: null,
    content_hash: hash,

    ...(statusOverride
      ? { status: statusOverride }
      : {}),
  };
}

// ---------- verification ----------
async function verify(
  supabase: SupabaseClient,
  questions: AuthoredQuestion[],
  resolved: Resolved[],
  hashes: string[]
): Promise<boolean> {
  const rows = new Map<
    string,
    Record<string, unknown>
  >();

  for (const part of chunk(hashes)) {
    const { data, error } = await supabase
      .from("questions")
      .select(REQUIRED_COLUMNS.join(","))
      .in("question_hash", part);

    if (error) {
      console.error(
        `Verification query failed: ${error.message}`
      );
      return false;
    }

    for (const row of (data ?? []) as unknown as Record<
      string,
      unknown
    >[]) {
      rows.set(
        row.question_hash as string,
        row
      );
    }
  }

  let ok = true;

  questions.forEach((q, i) => {
    const row = rows.get(hashes[i]);

    if (!row) {
      console.error(`  [${i}] MISSING in database`);
      ok = false;
      return;
    }

    const r = resolved[i];

    const checks: Record<string, boolean> = {
      question: row.question === q.question,
      question_text: row.question_text === q.question,
      options:
        JSON.stringify(row.options) ===
        JSON.stringify(q.options),
      answer_key_preserved:
        row.correct_answer_index ===
        q.correct_answer_index,
      explanation_preserved:
        row.explanation === q.explanation,
      subject_id: row.subject_id === r.subject_id,
      unit_id: row.unit_id === r.unit_id,
      topic_id: row.topic_id === r.topic_id,
      syllabus_node_id:
        row.syllabus_node_id === r.topic_id,
      slo_node_id:
        row.slo_node_id === r.slo_node_id,
      slo_reference:
        row.slo_reference === q.slo_reference,
      difficulty:
        row.difficulty ===
        toDatabaseDifficulty(q.difficulty),
      source_type:
        row.source_type === q.source_type,
    };

    const bad = Object.entries(checks)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (bad.length) {
      ok = false;
    }

    console.log(
      `  [${i}] ${
        bad.length
          ? `MISMATCH: ${bad.join(", ")}`
          : "verified"
      } (status=${String(row.status)}, is_active=${String(row.is_active)})`
    );
  });

  console.log(
    `Verified rows found: ${rows.size}/${questions.length}`
  );

  return ok && rows.size === questions.length;
}

// ---------- anonymous answer-key protection ----------
async function checkAnonExposure(
  url: string
): Promise<boolean> {
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    console.log(
      "Exposure check skipped: NEXT_PUBLIC_SUPABASE_ANON_KEY not set."
    );
    return true;
  }

  const anon = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let safe = true;

  for (const column of [
    "correct_answer_index",
    "explanation",
  ]) {
    const { data, error } = await anon
      .from("questions")
      .select(column)
      .limit(1);

    if (error) {
      console.log(
        `  anon cannot select ${column}: PROTECTED (${error.code ?? "error"})`
      );
    } else {
      console.error(
        `  anon CAN select ${column} (${(data ?? []).length} row(s) visible): NOT PROTECTED`
      );
      safe = false;
    }
  }

  return safe;
}

// ---------- main ----------
async function main(): Promise<void> {
  console.log(`Dataset: ${datasetPath}`);

  if (!fs.existsSync(datasetPath)) {
    fail("Dataset file not found.");
  }

  runPythonValidator();

  const data = JSON.parse(
    fs.readFileSync(datasetPath, "utf-8")
  ) as Dataset;

  validateStructure(data);

  const questions = data.questions;
  const hashes = questions.map((q) =>
    normalizedHash(q.question)
  );

  console.log(
    `Structural validation OK: ${questions.length} questions.`
  );

  if (dryRun) {
    console.log(
      "\nDry run: no database access. Planned rows:"
    );

    questions.forEach((q, i) => {
      console.log(
        `  [${i}] ${q.topic_id} | SLO ${q.slo_reference} | ` +
          `${q.difficulty} -> ${toDatabaseDifficulty(q.difficulty)} | hash ${hashes[i]}`
      );
    });

    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    fail(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env"
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await probeSchema(supabase);

  // Resolve every question before inserting anything.
  console.log(
    "\nResolving syllabus UUIDs via resolve_question_syllabus_refs..."
  );

  const resolved: Resolved[] = [];
  const unresolved: Outcome[] = [];

  for (let i = 0; i < questions.length; i++) {
    const result = await resolveRefs(
      supabase,
      questions[i]
    );

    if (typeof result === "string") {
      unresolved.push({
        index: i,
        hash: hashes[i],
        status: "unresolved",
        detail: result,
      });
    } else {
      resolved.push(result);
    }
  }

  if (unresolved.length) {
    unresolved.forEach((item) => {
      console.error(
        `  [${item.index}] UNRESOLVED: ${item.detail}`
      );
    });

    fail(
      "Some syllabus references could not be resolved; nothing inserted."
    );
  }

  console.log(
    `Resolved ${resolved.length}/${questions.length}.`
  );

  // Duplicate pre-check.
  const existingHashes = new Set<string>();

  for (const part of chunk(hashes)) {
    const { data: existing, error: existingError } =
      await supabase
        .from("questions")
        .select("question_hash")
        .in("question_hash", part);

    if (existingError) {
      fail(
        `Duplicate pre-check failed: ${existingError.message}`
      );
    }

    (existing ?? []).forEach((row) => {
      existingHashes.add(row.question_hash as string);
    });
  }

  // Insert one row at a time.
  console.log("\nInserting...");

  const outcomes: Outcome[] = [];

  for (let i = 0; i < questions.length; i++) {
    if (existingHashes.has(hashes[i])) {
      outcomes.push({
        index: i,
        hash: hashes[i],
        status: "skipped-duplicate",
      });

      continue;
    }

    const { error } = await supabase
      .from("questions")
      .insert(
        toRow(questions[i], resolved[i], hashes[i])
      );

    if (!error) {
      outcomes.push({
        index: i,
        hash: hashes[i],
        status: "inserted",
      });
    } else if (error.code === "23505") {
      outcomes.push({
        index: i,
        hash: hashes[i],
        status: "skipped-duplicate",
        detail: error.message,
      });
    } else {
      outcomes.push({
        index: i,
        hash: hashes[i],
        status: "failed",
        detail:
          `${error.code ?? ""} ${error.message}` +
          (error.details ? ` | ${error.details}` : ""),
      });
    }
  }

  outcomes.forEach((outcome) => {
    console.log(
      `  [${outcome.index}] ${outcome.status}` +
        (outcome.detail ? `: ${outcome.detail}` : "")
    );
  });

  const count = (status: Outcome["status"]) =>
    outcomes.filter(
      (outcome) => outcome.status === status
    ).length;

  console.log(
    `\nInserted ${count("inserted")}, ` +
      `skipped duplicates ${count("skipped-duplicate")}, ` +
      `failed ${count("failed")}.`
  );

  // Verify all questions, including previously inserted ones.
  console.log(
    "\nVerifying rows directly in Supabase..."
  );

  const verified = await verify(
    supabase,
    questions,
    resolved,
    hashes
  );

  console.log(
    "\nChecking public (anon) access to answer keys..."
  );

  const protectedKeys = await checkAnonExposure(url);

  const failed = count("failed") > 0;

  console.log(
    `\nSummary: insert ${failed ? "HAD FAILURES" : "ok"}, ` +
      `verification ${verified ? "PASS" : "FAIL"}, ` +
      `answer-key exposure ${protectedKeys ? "none detected" : "DETECTED"}.`
  );

  if (failed || !verified) {
    process.exit(1);
  }

  if (!protectedKeys) {
    process.exit(2);
  }
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.message
      : String(error)
  );
});
