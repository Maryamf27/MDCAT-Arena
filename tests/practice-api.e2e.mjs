// End-to-end test of the practice API against a MOCK Supabase (no real DB used).
// The mock emulates Supabase Auth's /user endpoint and the two attempt RPCs; see tests/mock-supabase.mjs.
// Run: npm run test:practice
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { startMock, requests, questions, attempts, INACTIVE_ID, STUDENT } from "./mock-supabase.mjs";

const MOCK_PORT = 54399;
const APP_PORT = 3199;
const BASE = `http://127.0.0.1:${APP_PORT}`;

const mock = await startMock(MOCK_PORT);
const app = spawn("npx", ["next", "dev", "-p", String(APP_PORT)], {
  env: {
    ...process.env, // explicit values below win over any local .env file
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // own process group, so the whole dev server tree can be killed
});
let appLog = "";
app.stdout.on("data", (d) => (appLog += d));
app.stderr.on("data", (d) => (appLog += d));

const cleanup = () => {
  try { process.kill(-app.pid, "SIGKILL"); } catch { /* already gone */ }
  mock.close();
};
process.on("exit", cleanup);

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}
const get = async (path) => { const r = await fetch(BASE + path); return { status: r.status, text: await r.text(), headers: r.headers }; };
// Session cookie exactly as @supabase/ssr stores it (name derives from the Supabase URL host).
const cookieName = `sb-${new URL(`http://127.0.0.1:${MOCK_PORT}`).hostname.split(".")[0]}-auth-token`;
const session = {
  access_token: STUDENT.token, token_type: "bearer", expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "rt",
  user: { id: STUDENT.id, aud: "authenticated", role: "authenticated", email: STUDENT.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
};
const AUTH = { Cookie: `${cookieName}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}` };
const send = async (path, body, { raw = false, auth = true } = {}) => {
  const r = await fetch(BASE + path, { method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? AUTH : {}) }, body: raw ? body : JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
};
const startAttempt = async () => json(await send("/api/practice/attempts", { subject: "biology" })).data.attemptId;
// Submits to a fresh attempt unless an attemptId is given; every submit consumes its attempt.
const post = async (body, raw = false, auth = true) => {
  if (raw) return send("/api/practice/submit", body, { raw, auth });
  return send("/api/practice/submit", { attemptId: body.attemptId ?? (await startAttempt()), ...body }, { auth });
};
const json = (res) => JSON.parse(res.text);

// wait for the dev server
for (let i = 0; i < 120; i++) {
  try { await fetch(`${BASE}/api/practice/questions`); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  if (i === 119) { console.error(appLog); process.exit(1); }
}

const active = questions.filter((q) => q.is_active);
const SECRETS = ["correct_answer_index", "explanation", "source_reference", "content_hash"];

console.log("GET /api/practice/questions");
await check("rejects a request with no scope (400)", async () => {
  const r = await get("/api/practice/questions");
  assert.equal(r.status, 400); assert.equal(json(r).error.code, "validation_error");
});
await check("returns active questions and hides the answer key", async () => {
  const r = await get("/api/practice/questions?subject=biology&limit=50");
  assert.equal(r.status, 200);
  const { data } = json(r);
  assert.equal(data.count, active.length);
  assert.ok(!data.questions.some((q) => q.id === INACTIVE_ID), "inactive question served");
  for (const s of SECRETS) assert.ok(!r.text.includes(s), `response leaks ${s}`);
  for (const q of active) {
    assert.ok(!r.text.includes(q.explanation), "explanation text leaked");
  }
  assert.equal(r.headers.get("cache-control"), "no-store");
});
await check("never requests answer columns from the database", async () => {
  const selects = requests.filter((x) => x.table === "questions").map((x) => x.select ?? "");
  const listCalls = selects.filter((s) => s.includes("question,") || s.startsWith("id,subject_id"));
  assert.ok(listCalls.length > 0);
  for (const s of listCalls) {
    assert.ok(!s.includes("correct_answer_index") && !s.includes("explanation"), `select leaked: ${s}`);
  }
});
await check("filters by unit number", async () => {
  const { data } = json(await get("/api/practice/questions?subject=biology&unit=3"));
  assert.equal(data.count, active.filter((q) => q.slo_reference.startsWith("3.")).length);
});
await check("filters by topic slug", async () => {
  const { data } = json(await get("/api/practice/questions?subject=biology&unit=3&topic=structure-of-dna"));
  assert.equal(data.count, 1); assert.equal(data.questions[0].slo_reference, "3.9");
});
await check("filters by difficulty (none match hard)", async () => {
  const { data } = json(await get("/api/practice/questions?subject=biology&difficulty=hard"));
  assert.equal(data.count, 0);
});
await check("accepts UUID filters", async () => {
  const q = active[0];
  const { data } = json(await get(`/api/practice/questions?topic=${q.topic_id}`));
  assert.equal(data.count, 1);
});
await check("respects limit", async () => {
  assert.equal(json(await get("/api/practice/questions?subject=biology&limit=2")).data.count, 2);
});
await check("rejects invalid limit / difficulty / subject (400)", async () => {
  for (const p of ["limit=0", "limit=100", "difficulty=extreme", "subject=chem$"]) {
    assert.equal((await get(`/api/practice/questions?subject=biology&${p}`)).status, 400, p);
  }
  assert.equal((await get("/api/practice/questions?subject=astrology")).status, 400);
});
await check("unit number without subject is rejected (400)", async () => {
  assert.equal((await get("/api/practice/questions?unit=3")).status, 400);
});
await check("unknown subject in database returns 404", async () => {
  const r = await get("/api/practice/questions?subject=chemistry");
  assert.equal(r.status, 404); assert.equal(json(r).error.code, "subject_not_found");
});

console.log("POST /api/practice/submit");
const allCorrect = active.map((q) => ({ questionId: q.id, selectedIndex: q.correct_answer_index }));
await check("scores a perfect submission and reveals answers + explanations", async () => {
  const r = await post({ answers: allCorrect });
  assert.equal(r.status, 200);
  const { data } = json(r);
  assert.deepEqual(data.score, { total: 5, answered: 5, unanswered: 0, correct: 5, incorrect: 0, percentage: 100 });
  for (const res of data.results) {
    const q = active.find((x) => x.id === res.questionId);
    assert.equal(res.correctIndex, q.correct_answer_index);
    assert.equal(res.explanation, q.explanation);
    assert.equal(res.isCorrect, true);
  }
});
await check("scores wrong and unanswered questions server-side", async () => {
  const answers = [
    { questionId: active[0].id, selectedIndex: (active[0].correct_answer_index + 1) % 4 }, // wrong
    { questionId: active[1].id, selectedIndex: null },                                      // skipped
    { questionId: active[2].id, selectedIndex: active[2].correct_answer_index },            // right
  ];
  const { data } = json(await post({ answers }));
  assert.deepEqual(data.score, { total: 3, answered: 2, unanswered: 1, correct: 1, incorrect: 1, percentage: 33.3 });
  assert.equal(data.results[0].isCorrect, false);
  assert.equal(data.results[1].isCorrect, false);
});
await check("ignores any client-supplied score or answer key", async () => {
  const attemptId = await startAttempt();
  const r = await send("/api/practice/submit", { attemptId, answers: allCorrect, score: 999 });
  assert.equal(r.status, 400); // strict schema rejects unknown fields
  const r2 = await send("/api/practice/submit", { attemptId, answers: [{ questionId: active[0].id, selectedIndex: 0, correct_answer_index: 0 }] });
  assert.equal(r2.status, 400);
  const r3 = await send("/api/practice/submit", { attemptId, answers: [{ questionId: active[0].id, selectedIndex: 0, isCorrect: true }] });
  assert.equal(r3.status, 400);
  assert.equal(attempts.get(attemptId).status, "in_progress"); // nothing saved by rejected requests
});
await check("rejects invalid JSON (400)", async () => {
  const r = await post("{not json", true);
  assert.equal(r.status, 400); assert.equal(json(r).error.code, "invalid_json");
});
await check("rejects bad shapes (400)", async () => {
  const q = active[0].id;
  const attemptId = await startAttempt();
  for (const body of [
    {}, { attemptId }, { attemptId, answers: [] }, { answers: allCorrect },
    { attemptId, answers: [{ questionId: "nope", selectedIndex: 0 }] },
    { attemptId, answers: [{ questionId: q, selectedIndex: 4 }] },
    { attemptId, answers: [{ questionId: q, selectedIndex: -1 }] },
    { attemptId, answers: [{ questionId: q, selectedIndex: 1.5 }] },
    { attemptId, answers: [{ questionId: q, selectedIndex: "1" }] },
    { attemptId: "not-a-uuid", answers: [{ questionId: q, selectedIndex: 0 }] },
    { attemptId, answers: [{ questionId: q, selectedIndex: 0 }, { questionId: q, selectedIndex: 1 }] },
  ]) assert.equal((await send("/api/practice/submit", body)).status, 400, JSON.stringify(body));
});
await check("rejects unknown and inactive question ids (422)", async () => {
  const r = await post({ answers: [{ questionId: INACTIVE_ID, selectedIndex: 0 },
    { questionId: "11111111-1111-4111-8111-111111111111", selectedIndex: 0 }] });
  assert.equal(r.status, 422); assert.equal(json(r).error.code, "unknown_questions");
  assert.ok(!r.text.includes("explanation"));
});
await check("rejects oversized bodies (413)", async () => {
  const r = await post(JSON.stringify({ pad: "x".repeat(20000) }), true);
  assert.equal(r.status, 413);
});
console.log("Attempt persistence (auth + attempts)");
await check("anonymous callers get 401 on start, submit, history and analytics", async () => {
  assert.equal((await send("/api/practice/attempts", { subject: "biology" }, { auth: false })).status, 401);
  const r = await send("/api/practice/submit", { attemptId: "11111111-1111-4111-8111-111111111111", answers: allCorrect }, { auth: false });
  assert.equal(r.status, 401); assert.equal(json(r).error.code, "unauthorized");
  for (const path of ["/api/practice/history", "/api/practice/analytics", "/api/practice/history/11111111-1111-4111-8111-111111111111"]) {
    const response = await get(path);
    assert.equal(response.status, 401, path);
    assert.equal(json(response).error.code, "unauthorized");
  }
});
await check("start returns an attempt id owned by the signed-in student, with no answer keys", async () => {
  const r = await send("/api/practice/attempts", { subject: "biology" });
  assert.equal(r.status, 201);
  const { attemptId } = json(r).data;
  assert.equal(attempts.get(attemptId).user_id, STUDENT.id);
  for (const secret of SECRETS) assert.ok(!r.text.includes(secret), `leaked ${secret}`);
});
await check("start rejects an unknown subject and any client-supplied user_id (400)", async () => {
  assert.equal((await send("/api/practice/attempts", { subject: "astrology" })).status, 400);
  assert.equal((await send("/api/practice/attempts", { subject: "biology", user_id: "x" })).status, 400);
});
await check("submit saves the score and returns the saved attempt id", async () => {
  const attemptId = await startAttempt();
  const r = await post({ attemptId, answers: allCorrect });
  assert.equal(r.status, 200);
  const { data } = json(r);
  assert.equal(data.attemptId, attemptId); assert.equal(data.alreadySubmitted, false);
  assert.equal(attempts.get(attemptId).status, "submitted");
  assert.equal(attempts.get(attemptId).score, data.score.correct);
});
await check("a repeated submit saves nothing new and reports the ORIGINAL result", async () => {
  const attemptId = await startAttempt();
  const wrongOnes = active.map((q) => ({ questionId: q.id, selectedIndex: (q.correct_answer_index + 1) % 4 }));
  const first = json(await post({ attemptId, answers: wrongOnes })).data;
  const again = await post({ attemptId, answers: allCorrect }); // different payload must not change the saved result
  assert.equal(again.status, 200);
  const data = json(again).data;
  assert.equal(data.alreadySubmitted, true);
  assert.equal(data.score.correct, first.score.correct); assert.equal(data.score.correct, 0);
});
await check("an unknown attempt id is a 404 and writes nothing", async () => {
  const r = await post({ attemptId: "22222222-2222-4222-8222-222222222222", answers: allCorrect });
  assert.equal(r.status, 404); assert.equal(json(r).error.code, "attempt_not_found");
});
await check("GET on submit is not allowed (405)", async () => {
  assert.equal((await get("/api/practice/submit")).status, 405);
});

console.log(`\n${passed} checks passed${process.exitCode ? ", some FAILED" : ""}`);
cleanup();
process.exit(process.exitCode ?? 0);
