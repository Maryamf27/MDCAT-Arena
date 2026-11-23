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

## POST /api/practice/submit
```bash
curl -X POST http://localhost:3000/api/practice/submit \
  -H "Content-Type: application/json" \
  -d '{"answers":[{"questionId":"<uuid from the GET>","selectedIndex":0},{"questionId":"<uuid>","selectedIndex":null}]}'
```
`selectedIndex` is 0-3, or `null` for skipped. Max 50 answers, no duplicates, no extra fields.

Returns `{ "data": { "score": { total, answered, unanswered, correct, incorrect, percentage }, "results": [ { questionId, selectedIndex, correctIndex, correctOption, isCorrect, explanation } ], "submittedAt" } }`.

## Errors
`{ "error": { "code", "message", "details?" } }`

| status | code | when |
|---|---|---|
| 400 | `validation_error`, `invalid_json` | bad params or body |
| 404 | `subject_not_found`, `unit_not_found`, `topic_not_found` | key not in database |
| 405 | n/a | wrong HTTP method |
| 413 | `payload_too_large` | body over 16 KB |
| 422 | `unknown_questions` | id not found or question inactive |
| 502 | `database_error` | Supabase failure (details only in server logs) |
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
- Stateless practice mode: there are no attempt records and no login, so anyone can submit any question id and see its answer, and a client could submit every option to learn a key. Timed or graded tests need an attempts table, authentication and one-submission-per-attempt enforcement.
- No rate limiting yet; add it (for example at the edge) before public launch.
- Only `is_active = true` questions are served or scored.
