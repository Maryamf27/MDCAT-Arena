
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";

const dataset = JSON.parse(
  fs.readFileSync("scraper/output/biology/authored-sample.json", "utf-8")
);

const uuid = (seed) => {
  const h = crypto.createHash("md5").update(seed).digest("hex");
  // force RFC-4122 v4 shape so strict UUID validation accepts it
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

export const SUBJECT_ID = uuid("subject:biology");
const nodes = [];
const unitIds = new Map();
const topicIds = new Map();
const sloIds = new Map();
for (const q of dataset.questions) {
  if (!unitIds.has(q.unit_id)) {
    const id = uuid(q.unit_id);
    unitIds.set(q.unit_id, id);
    nodes.push({ id, subject_id: SUBJECT_ID, node_type: "unit", parent_id: null, title: `Unit ${q.unit_id.split("/").at(-1)}`,
      source_path: q.unit_id.replace("biology", SUBJECT_ID), sort_order: nodes.length });
  }
  if (!topicIds.has(q.topic_id)) {
    const id = uuid(q.topic_id);
    topicIds.set(q.topic_id, id);
    nodes.push({ id, subject_id: SUBJECT_ID, node_type: "topic", parent_id: unitIds.get(q.unit_id),
      title: q.topic_id.split("/").at(-1), source_path: q.topic_id.replace("biology", SUBJECT_ID), sort_order: nodes.length });
  }
  const sloKey = `${q.topic_id}:${q.slo_reference}`;
  if (!sloIds.has(sloKey)) {
    const id = uuid(`slo:${sloKey}`);
    sloIds.set(sloKey, id);
    nodes.push({ id, subject_id: SUBJECT_ID, node_type: "slo", parent_id: topicIds.get(q.topic_id),
      title: `SLO ${q.slo_reference}`, source_identifier: q.slo_reference, source_path: `${q.topic_id}/slo/${q.slo_reference}`, sort_order: nodes.length });
  }
}

const DB_DIFFICULTIES = ["easy", "moderate", "difficult"];
export const questions = dataset.questions.map((q, i) => ({
  id: uuid(`question:${i}`),
  question: q.question,
  question_text: q.question,
  options: q.options,
  correct_answer_index: q.correct_answer_index,
  explanation: q.explanation,
  subject_id: SUBJECT_ID,
  unit_id: unitIds.get(q.unit_id),
  topic_id: topicIds.get(q.topic_id),
  syllabus_node_id: topicIds.get(q.topic_id),
  slo_node_id: sloIds.get(`${q.topic_id}:${q.slo_reference}`),
  slo_reference: q.slo_reference,
  // Stored in the DATABASE vocabulary (easy | moderate | difficult), spread across levels.
  difficulty: DB_DIFFICULTIES[i % 3],
  source_type: q.source_type,
  source_reference: q.source_reference,
  source_name: q.source_reference,
  content_hash: uuid(`hash:${i}`),
  status: "published",
  is_active: true,
  created_at: "2026-11-23T00:00:00Z",
}));
// An inactive question that must never be served or scored.
export const INACTIVE_ID = uuid("question:inactive");
questions.push({ ...questions[0], id: INACTIVE_ID, question: "inactive question", is_active: false, status: "draft" });

// profiles table emulation (rows: { user_id, display_name, role, created_at }).
export const profileRows = [];

const newSubjectIds = {
  ecat_mathematics: uuid("subject:ecat_mathematics"),
  ecat_physics: uuid("subject:ecat_physics"),
  ecat_chemistry: uuid("subject:ecat_chemistry"),
  ecat_english: uuid("subject:ecat_english"),
  nat_ie_english: uuid("subject:nat_ie_english"),
  nat_ie_analytical: uuid("subject:nat_ie_analytical"),
  nat_ie_quantitative: uuid("subject:nat_ie_quantitative"),
  nat_ie_physics: uuid("subject:nat_ie_physics"),
  nat_ie_chemistry: uuid("subject:nat_ie_chemistry"),
  nat_ie_mathematics: uuid("subject:nat_ie_mathematics"),
};
const newSubjectRows = [
  ["ecat_mathematics", "ECAT_MATH", "Mathematics", "ecat", "pre_engineering"],
  ["ecat_physics", "ECAT_PHY", "Physics", "ecat", "pre_engineering"],
  ["ecat_chemistry", "ECAT_CHEM", "Chemistry", "ecat", "pre_engineering"],
  ["ecat_english", "ECAT_ENG", "English", "ecat", "pre_engineering"],
  ["nat_ie_english", "NAT_IE_ENG", "English", "nts_nat", "nat_ie"],
  ["nat_ie_analytical", "NAT_IE_ANALYTICAL", "Analytical", "nts_nat", "nat_ie"],
  ["nat_ie_quantitative", "NAT_IE_QUANTITATIVE", "Quantitative", "nts_nat", "nat_ie"],
  ["nat_ie_physics", "NAT_IE_PHY", "Physics", "nts_nat", "nat_ie"],
  ["nat_ie_chemistry", "NAT_IE_CHEM", "Chemistry", "nts_nat", "nat_ie"],
  ["nat_ie_mathematics", "NAT_IE_MATH", "Mathematics", "nts_nat", "nat_ie"],
].map(([subject_key, code, name, exam_key, category_key]) => ({
  id: newSubjectIds[subject_key], subject_key, code, name, exam_key, category_key,
}));

const tables = {
  subjects: [
    { id: SUBJECT_ID, code: "BIO", subject_key: "biology", exam_key: "mdcat", category_key: null, name: "Biology" },
    ...newSubjectRows,
  ],
  syllabus_nodes: nodes,
  questions,
  profiles: profileRows,
};

export const requests = [];
export const rpcCalls = [];
const PUBLIC_COLUMNS = ["id", "subject_id", "syllabus_node_id", "unit_id", "topic_id", "slo_node_id", "slo_reference", "question", "options", "difficulty", "created_at"];

// --- Auth + attempt-persistence emulation -------------------------------------
// Emulates GET /auth/v1/user and the two RPCs in
// supabase/migrations/20261123000300_practice_attempt_persistence.sql with simple
// in-memory logic. The REAL transactional behaviour (rollback, locking, RLS) is
// covered against Postgres, not here; this only lets the API routes run offline.
export const STUDENT = { id: uuid("user:student"), email: "student@test.dev", token: "test-student-token", name: "Ayesha Khan" };
export const attempts = new Map(); // id -> { user_id, status, score, total, answers: [{questionId, selectedIndex}] }
const SUBJECT_KEYS = ["biology", "chemistry", "physics", "english", "logical_reasoning", ...Object.keys(newSubjectIds)];
const rpcError = (res, message) => { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ code: "P0001", message })); };

function handleRpc(name, body, res) {
  rpcCalls.push({ name, body });
  // Emulates public.sample_practice_questions (see supabase/migrations/20261124000000_*.sql):
  // active rows only, AND-ed filters, DB difficulty words, random order, <= 50 rows,
  // answer-free columns only. Real SQL behaviour is tested against Postgres in tests/sql/.
  if (name === "sample_practice_questions") {
    const rows = questions
      .filter((q) => q.is_active)
      .filter((q) => !body.p_subject_id || q.subject_id === body.p_subject_id)
      .filter((q) => !body.p_unit_id || q.unit_id === body.p_unit_id)
      .filter((q) => !body.p_topic_id || q.topic_id === body.p_topic_id)
      .filter((q) => !body.p_slo_node_id || q.slo_node_id === body.p_slo_node_id)
      .filter((q) => !body.p_difficulty || q.difficulty === body.p_difficulty)
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(Math.max(body.p_limit ?? 10, 1), 50))
      .map((q) => Object.fromEntries(PUBLIC_COLUMNS.map((c) => [c, q[c]])));
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(rows));
  }
  if (name === "start_practice_attempt") {
    if (!SUBJECT_KEYS.includes(body.p_subject_key)) return rpcError(res, "invalid_subject");
    if (body.p_user_id !== STUDENT.id) return rpcError(res, "user_not_found");
    const id = uuid(`attempt:${attempts.size}`);
    attempts.set(id, { user_id: body.p_user_id, status: "in_progress", score: null, total: null, answers: [] });
    res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(id));
  }
  if (name === "submit_practice_attempt") {
    const a = attempts.get(body.p_attempt_id);
    if (!a || a.user_id !== body.p_user_id) return rpcError(res, "attempt_not_found");
    if (a.status === "submitted") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ alreadySubmitted: true, attemptId: body.p_attempt_id, submittedAt: "2026-11-23T00:00:00Z", score: a.score, totalPoints: a.total, answers: a.answers }));
    }
    const correct = body.p_answers.filter((x) => x.selectedIndex !== null &&
      x.selectedIndex === questions.find((q) => q.id === x.questionId)?.correct_answer_index).length;
    if (correct !== body.p_expected_correct) return rpcError(res, "score_mismatch");
    Object.assign(a, { status: "submitted", score: correct, total: body.p_answers.length, answers: body.p_answers });
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ alreadySubmitted: false, attemptId: body.p_attempt_id, submittedAt: "2026-11-23T00:00:00Z", score: correct, totalPoints: body.p_answers.length }));
  }
  res.writeHead(404).end("{}");
}

function matches(row, key, expr) {
  if (expr.startsWith("eq.")) return String(row[key]) === expr.slice(3);
  if (expr === "is.null") return row[key] === null || row[key] === undefined;
  if (expr.startsWith("in.(")) return expr.slice(4, -1).split(",").includes(String(row[key]));
  throw new Error(`mock: unsupported filter ${key}=${expr}`);
}

export function startMock(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/auth/v1/user") {
      const ok = req.headers.authorization === `Bearer ${STUDENT.token}`;
      res.writeHead(ok ? 200 : 401, { "Content-Type": "application/json" });
      res.end(JSON.stringify(ok ? { id: STUDENT.id, aud: "authenticated", role: "authenticated", email: STUDENT.email, app_metadata: {}, user_metadata: { display_name: STUDENT.name }, created_at: "2026-01-01T00:00:00Z" } : { msg: "invalid JWT" }));
      return;
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      let raw = ""; req.on("data", (d) => (raw += d));
      req.on("end", () => handleRpc(url.pathname.replace("/rest/v1/rpc/", ""), JSON.parse(raw || "{}"), res));
      return;
    }
    const table = url.pathname.replace("/rest/v1/", "");
    if (table === "profiles" && req.method !== "GET") {
      let raw = ""; req.on("data", (d) => (raw += d));
      req.on("end", () => {
        const body = JSON.parse(raw || "{}");
        const prefer = String(req.headers.prefer ?? "");
        if (req.method === "POST") {
          for (const row of Array.isArray(body) ? body : [body]) {
            const existing = profileRows.find((p) => p.user_id === row.user_id);
            if (!existing) profileRows.push({ role: "user", display_name: null, created_at: "2026-11-24T00:00:00Z", ...row });
            else if (!prefer.includes("ignore-duplicates")) Object.assign(existing, row);
          }
        } else if (req.method === "PATCH") {
          let targets = profileRows;
          for (const [key, expr] of url.searchParams) targets = targets.filter((r) => matches(r, key, expr));
          targets.forEach((r) => Object.assign(r, body));
        }
        res.writeHead(req.method === "POST" ? 201 : 204).end();
      });
      return;
    }
    requests.push({ table, select: url.searchParams.get("select") });
    const rows = tables[table];
    if (!rows) { res.writeHead(404).end("{}"); return; }
    let out = rows;
    for (const [key, expr] of url.searchParams) {
      if (["select", "limit", "order", "offset"].includes(key)) continue;
      out = out.filter((r) => matches(r, key, expr));
    }
    const limit = Number(url.searchParams.get("limit") ?? out.length);
    const cols = (url.searchParams.get("select") ?? "*").split(",");
    out = out.slice(0, limit).map((r) =>
      cols[0] === "*" ? r : Object.fromEntries(cols.map((c) => [c, r[c]]))
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
