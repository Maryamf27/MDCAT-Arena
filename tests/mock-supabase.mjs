
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
  difficulty: q.difficulty,
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

const tables = {
  subjects: [{ id: SUBJECT_ID, code: "BIO", name: "Biology" }],
  syllabus_nodes: nodes,
  questions,
};

export const requests = [];

// --- Auth + attempt-persistence emulation -------------------------------------
// Emulates GET /auth/v1/user and the two RPCs in
// supabase/migrations/20261123000300_practice_attempt_persistence.sql with simple
// in-memory logic. The REAL transactional behaviour (rollback, locking, RLS) is
// covered against Postgres, not here; this only lets the API routes run offline.
export const STUDENT = { id: uuid("user:student"), email: "student@test.dev", token: "test-student-token" };
export const attempts = new Map(); // id -> { user_id, status, score, total, answers: [{questionId, selectedIndex}] }
const SUBJECT_KEYS = ["biology", "chemistry", "physics", "english", "logical_reasoning"];
const rpcError = (res, message) => { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ code: "P0001", message })); };

function handleRpc(name, body, res) {
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
  if (expr.startsWith("in.(")) return expr.slice(4, -1).split(",").includes(String(row[key]));
  throw new Error(`mock: unsupported filter ${key}=${expr}`);
}

export function startMock(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/auth/v1/user") {
      const ok = req.headers.authorization === `Bearer ${STUDENT.token}`;
      res.writeHead(ok ? 200 : 401, { "Content-Type": "application/json" });
      res.end(JSON.stringify(ok ? { id: STUDENT.id, aud: "authenticated", role: "authenticated", email: STUDENT.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } : { msg: "invalid JWT" }));
      return;
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      let raw = ""; req.on("data", (d) => (raw += d));
      req.on("end", () => handleRpc(url.pathname.replace("/rest/v1/rpc/", ""), JSON.parse(raw || "{}"), res));
      return;
    }
    const table = url.pathname.replace("/rest/v1/", "");
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
