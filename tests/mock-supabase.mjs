
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
for (const q of dataset.questions) {
  if (!unitIds.has(q.unit_id)) {
    const id = uuid(q.unit_id);
    unitIds.set(q.unit_id, id);
    nodes.push({ id, subject_id: SUBJECT_ID, node_type: "unit", parent_id: null,
      source_path: q.unit_id.replace("biology", SUBJECT_ID) });
  }
  if (!topicIds.has(q.topic_id)) {
    const id = uuid(q.topic_id);
    topicIds.set(q.topic_id, id);
    nodes.push({ id, subject_id: SUBJECT_ID, node_type: "topic", parent_id: unitIds.get(q.unit_id),
      source_path: q.topic_id.replace("biology", SUBJECT_ID) });
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
  slo_node_id: uuid(`slo:${i}`),
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
  subjects: [{ id: SUBJECT_ID, code: "BIO" }],
  syllabus_nodes: nodes,
  questions,
};

export const requests = [];

function matches(row, key, expr) {
  if (expr.startsWith("eq.")) return String(row[key]) === expr.slice(3);
  if (expr.startsWith("in.(")) return expr.slice(4, -1).split(",").includes(String(row[key]));
  throw new Error(`mock: unsupported filter ${key}=${expr}`);
}

export function startMock(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
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
