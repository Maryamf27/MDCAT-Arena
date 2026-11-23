# Practice API

Two server-side endpoints over the existing `public.questions` table. They use the service-role key on the server only; the browser never receives it, and answers are never returned by the fetch endpoint.

Prerequisites: migrations applied, questions imported, `.env` has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Start with `npm run dev` (default http://localhost:3000).

## GET /api/practice/questions
Query params (at least one of subject, unit, topic):

| param | values |
|---|---|
| `subject` | `biology`, `chemistry`, `physics`, `english`, `logical_reasoning`, or a subject UUID |
| `unit` | unit number (`3`, `5.1`; needs a subject key) or a unit UUID |
| `topic` | topic slug (`structure-of-dna`; needs subject key + unit number) or a topic UUID |
| `difficulty` | `easy`, `medium`, `hard` |
| `limit` | 1-50, default 10 (random sample of active questions) |

```bash
curl "http://localhost:3000/api/practice/questions?subject=biology&limit=5"
curl "http://localhost:3000/api/practice/questions?subject=biology&unit=3&difficulty=easy"
curl "http://localhost:3000/api/practice/questions?subject=biology&unit=3&topic=structure-of-dna"
```
Returns `{ "data": { "count": n, "questions": [ { id, question, options, difficulty, subject_id, unit_id, topic_id, slo_node_id, slo_reference, syllabus_node_id, created_at } ] } }`. No `correct_answer_index`, no `explanation`.

## Saving attempts (sign-in required)
Practice attempts are stored in `attempts` / `attempt_answers` and belong to the signed-in student. Identity comes only from the Supabase session cookie (`supabase.auth.getUser()` on the server); it is never read from a request body. The two endpoints below return `401 unauthorized` when nobody is signed in. `GET /api/practice/questions` stays open.

Lifecycle (this is also the duplicate-submission guard): **start** creates an `in_progress` attempt, **submit** saves every answer and flips it to `submitted` in one database transaction.

## POST /api/practice/attempts
```bash
curl -X POST http://localhost:3000/api/practice/attempts -H "Content-Type: application/json" \
  -d '{"subject":"biology"}'      # needs the signed-in session cookie
```
Returns `201 { "data": { "attemptId": "<uuid>" } }`. Body is strict: only `subject`. Creates the student's `profiles` row if missing and uses/creates the published `practice` test titled "<Subject> Practice" (`attempts.test_id` is NOT NULL).

## POST /api/practice/submit
```bash
curl -X POST http://localhost:3000/api/practice/submit \
  -H "Content-Type: application/json" \
  -d '{"attemptId":"<uuid from POST /attempts>","answers":[{"questionId":"<uuid from the GET>","selectedIndex":0},{"questionId":"<uuid>","selectedIndex":null}]}'
```
`selectedIndex` is 0-3, or `null` for skipped. Max 50 answers, no duplicates, no extra fields (a client-supplied `score` or `isCorrect` is a 400).

Returns `{ "data": { "attemptId", "alreadySubmitted", "score": { total, answered, unanswered, correct, incorrect, percentage }, "results": [ { questionId, selectedIndex, correctIndex, correctOption, isCorrect, explanation } ], "submittedAt" } }`.

Submitting the same attempt again writes nothing and returns the originally saved result with `alreadySubmitted: true` (safe to retry after a network error). Submitting someone else's attempt id is a 404.

### What is saved
| table.column | value |
|---|---|
| `attempts.score` | number of correct answers |
| `attempts.total_points` | number of questions |
| `attempts.status` / `submitted_at` | `submitted` / time of save |
| `attempt_answers.selected_option_index` | the student's choice, `NULL` if skipped |
| `attempt_answers.is_correct` | decided in the database from `questions.correct_answer_index`; `false` for skipped |

`attempts` has no percentage/correct/incorrect/unanswered columns, so those are derived (correct = `score`, total = `total_points`, percentage = correct / total). The API scores with `scoreSubmission()`; the database recomputes correctness itself and aborts (saving nothing) if its count differs. Functions: `supabase/migrations/20261123000300_practice_attempt_persistence.sql`; they are executable by `service_role` only.

## Errors
`{ "error": { "code", "message", "details?" } }`

| status | code | when |
|---|---|---|
| 400 | `validation_error`, `invalid_json` | bad params or body |
| 401 | `unauthorized` | no signed-in student (attempts / submit) |
| 404 | `subject_not_found`, `unit_not_found`, `topic_not_found` | key not in database |
| 404 | `attempt_not_found` | attempt id unknown or owned by another student |
| 405 | n/a | wrong HTTP method |
| 409 | `attempt_expired`, `already_submitted` | attempt expired; or already submitted and its questions can no longer be re-read |
| 413 | `payload_too_large` | body over 16 KB |
| 422 | `unknown_questions` | id not found or question inactive |
| 502 | `database_error`, `save_failed` | Supabase failure; for `save_failed` nothing was saved and the same attempt can be retried |
| 500 | `internal_error` | unexpected error |

## Postman
Import this as a collection (Import, Raw text) and set `baseUrl`:
```json
{"info":{"name":"MDCAT Arena Practice API","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
 "variable":[{"key":"baseUrl","value":"http://localhost:3000"}],
 "item":[
  {"name":"Get questions","request":{"method":"GET","url":"{{baseUrl}}/api/practice/questions?subject=biology&limit=5"}},
  {"name":"Submit answers","request":{"method":"POST","header":[{"key":"Content-Type","value":"application/json"}],
   "url":"{{baseUrl}}/api/practice/submit",
   "body":{"mode":"raw","raw":"{\n  \"answers\": [\n    { \"questionId\": \"PASTE-UUID\", \"selectedIndex\": 0 }\n  ]\n}"}}}
 ]}
```

## Automated test
`npm run test:practice` starts a mock PostgREST server and `next dev` on port 3199 (process env overrides `.env`, so it never touches your real database) and runs 19 checks: filters, validation, scoring, error codes, and that no answer key or explanation appears in fetch responses or in the columns requested from the database.

## Known limits
- Questions are not bound to an attempt, so a signed-in student can still submit any active question id (once per attempt) and see its answer, and can start many attempts to probe keys. Binding the served question ids to the attempt (a new `attempt_questions` table) and rate limiting would close this; both need a schema change.
- Abandoned attempts stay `in_progress` forever (no cleanup job, no expiry for practice).
- No rate limiting yet; add it (for example at the edge) before public launch.
- Only `is_active = true` questions are served or scored.
