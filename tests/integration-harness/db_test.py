import pgserver, psycopg2, psycopg2.extras, json, shutil, threading, uuid, sys, os
PGDATA="/tmp/pgdata-test"; shutil.rmtree(PGDATA, ignore_errors=True)
srv = pgserver.get_server(PGDATA, cleanup_mode="delete")
URI = srv.get_uri()
def conn(): 
    c = psycopg2.connect(URI); c.autocommit = False; return c
def run_file(path):
    c = conn(); c.autocommit = True; c.cursor().execute(open(path).read()); c.close()
run_file("schema.sql"); run_file("seed.sql")
run_file("/home/claude/MDCAT-Arena-main/supabase/migrations/20261123000300_practice_attempt_persistence.sql")

passed = failed = 0
def check(name, cond, extra=""):
    global passed, failed
    if cond: passed += 1; print("PASS", name, extra)
    else: failed += 1; print("FAIL", name, extra)

adm = conn(); adm.autocommit = True; cur = adm.cursor()
def q1(sql, *a):
    cur.execute(sql, a); r = cur.fetchone(); return r[0] if r else None
def as_service(sql, *a):
    """Run a statement as service_role in its own transaction; return (ok, result_or_message)."""
    c = conn(); k = c.cursor()
    try:
        k.execute("set local role service_role"); k.execute(sql, a)
        r = k.fetchone(); c.commit(); return True, (r[0] if r else None)
    except Exception as e:
        c.rollback(); return False, str(e).strip().splitlines()[0]
    finally: c.close()

alice, bob = str(uuid.uuid4()), str(uuid.uuid4())
for u, e in ((alice, "alice@test.dev"), (bob, "bob@test.dev")):
    cur.execute("insert into auth.users (id,email) values (%s,%s)", (u, e))
qs = [r for r in (lambda: (cur.execute("select id, correct_answer_index from public.questions order by created_at, id"), cur.fetchall())[1])()]
check("seed: 5 questions", len(qs) == 5)
def answers(sel):  # sel: list of selected indexes (None allowed)
    return json.dumps([{"questionId": str(qs[i][0]), "selectedIndex": s} for i, s in enumerate(sel)])
right = [r[1] for r in qs]
wrong = lambda i: (right[i] + 1) % 4

# --- start ---
print("tests before:", q1("select count(*) from public.tests"), "profiles before:", q1("select count(*) from public.profiles"))
ok, a1 = as_service("select public.start_practice_attempt(%s, 'biology')", alice)
check("start: returns attempt id", ok and a1, str(a1))
check("start: created exactly 1 practice test", q1("select count(*) from public.tests where test_type='practice' and status='published' and title='Biology Practice'") == 1)
check("start: profile row created for alice (role user)", q1("select role from public.profiles where user_id=%s", alice) == "user")
check("start: attempt in_progress, owned by alice, no score yet",
      q1("select status||'/'||user_id::text||'/'||coalesce(score::text,'null') from public.attempts where id=%s", a1) == f"in_progress/{alice}/null")
ok, a_bob = as_service("select public.start_practice_attempt(%s, 'biology')", bob)
check("start: second student reuses the same test row", q1("select count(*) from public.tests") == 1 and ok)
ok, msg = as_service("select public.start_practice_attempt(%s, 'astrology')", alice)
check("start: invalid subject rejected", (not ok) and "invalid_subject" in msg, msg)
ok, msg = as_service("select public.start_practice_attempt(%s, 'biology')", str(uuid.uuid4()))
check("start: unknown auth user rejected (no FK crash, no rows)", (not ok) and "user_not_found" in msg, msg)

# --- submit: 3 correct, 1 wrong, 1 unanswered ---
sel = [right[0], right[1], right[2], wrong(3), None]
ok, res = as_service("select public.submit_practice_attempt(%s,%s,%s::jsonb,3)", a1, alice, answers(sel))
print("submit result:", res)
check("submit: ok, not flagged duplicate", ok and res["alreadySubmitted"] is False)
check("submit: attempts.score=3 and total_points=5", res["score"] == 3 and res["totalPoints"] == 5)
check("submit: attempts row = submitted with submitted_at",
      q1("select status from public.attempts where id=%s", a1) == "submitted" and q1("select submitted_at is not null from public.attempts where id=%s", a1))
check("submit: exactly 5 attempt_answers for this attempt", q1("select count(*) from public.attempt_answers where attempt_id=%s", a1) == 5)
check("submit: saved score == returned score", float(q1("select score from public.attempts where id=%s", a1)) == res["score"])
check("submit: 3 correct rows", q1("select count(*) from public.attempt_answers where attempt_id=%s and is_correct", a1) == 3)
check("submit: wrong answer saved with is_correct=false and its selected index",
      q1("select count(*) from public.attempt_answers where attempt_id=%s and question_id=%s and selected_option_index=%s and is_correct=false", a1, str(qs[3][0]), wrong(3)) == 1)
check("submit: unanswered saved as selected NULL, is_correct=false, answered_at NULL",
      q1("select count(*) from public.attempt_answers where attempt_id=%s and question_id=%s and selected_option_index is null and is_correct=false and answered_at is null", a1, str(qs[4][0])) == 1)

# --- duplicate submission ---
ok, res2 = as_service("select public.submit_practice_attempt(%s,%s,%s::jsonb,5)", a1, alice, answers([right[i] for i in range(5)]))
check("duplicate submit: flagged alreadySubmitted, returns SAVED score (3), not the new payload", ok and res2["alreadySubmitted"] is True and res2["score"] == 3, str(res2 and res2.get("score")))
check("duplicate submit: still exactly 5 answer rows, score unchanged",
      q1("select count(*) from public.attempt_answers where attempt_id=%s", a1) == 5 and float(q1("select score from public.attempts where id=%s", a1)) == 3)
check("duplicate submit: saved answers returned for replay", len(res2["answers"]) == 5)

# --- ownership ---
ok, msg = as_service("select public.submit_practice_attempt(%s,%s,%s::jsonb,5)", a_bob, alice, answers(right))
check("ownership: alice cannot submit bob's attempt", (not ok) and "attempt_not_found" in msg, msg)
check("ownership: bob's attempt untouched", q1("select status from public.attempts where id=%s", a_bob) == "in_progress" and q1("select count(*) from public.attempt_answers where attempt_id=%s", a_bob) == 0)

# --- atomicity / rollback cases on bob's attempt ---
ok, msg = as_service("select public.submit_practice_attempt(%s,%s,%s::jsonb,4)", a_bob, bob, answers(right))  # true score is 5, claim 4
check("score_mismatch: rejected", (not ok) and "score_mismatch" in msg, msg)
check("score_mismatch: NO partial save (0 answers, still in_progress, no score)",
      q1("select count(*) from public.attempt_answers where attempt_id=%s", a_bob) == 0 and q1("select status from public.attempts where id=%s", a_bob) == "in_progress" and q1("select score is null from public.attempts where id=%s", a_bob))
bad = json.loads(answers(right)); bad[4]["questionId"] = str(uuid.uuid4())
ok, msg = as_service("select public.submit_practice_attempt(%s,%s,%s::jsonb,4)", a_bob, bob, json.dumps(bad))
check("unknown question: rejected", (not ok) and "unknown_questions" in msg, msg)
check("unknown question: NO partial save (4 valid answers rolled back)", q1("select count(*) from public.attempt_answers where attempt_id=%s", a_bob) == 0 and q1("select status from public.attempts where id=%s", a_bob) == "in_progress")
dup = json.loads(answers(right)); dup[1]["questionId"] = dup[0]["questionId"]
ok, msg = as_service("select public.submit_practice_attempt(%s,%s,%s::jsonb,5)", a_bob, bob, json.dumps(dup))
check("duplicate question ids in payload: rejected by unique(attempt_id,question_id), rolled back", (not ok) and "attempt_answers_attempt_id_question_id_key" in msg and q1("select count(*) from public.attempt_answers where attempt_id=%s", a_bob) == 0, msg[:90])
badidx = json.loads(answers(right)); badidx[0]["selectedIndex"] = 7
ok, msg = as_service("select public.submit_practice_attempt(%s,%s,%s::jsonb,5)", a_bob, bob, json.dumps(badidx))
check("selectedIndex out of range: rejected", (not ok) and "invalid_answers" in msg, msg)
ok, msg = as_service("select public.submit_practice_attempt(%s,%s,'[]'::jsonb,0)", a_bob, bob)
check("empty answers: rejected", (not ok) and "invalid_answers" in msg, msg)
ok, msg = as_service("select public.submit_practice_attempt(%s,%s,%s::jsonb,5)", str(uuid.uuid4()), bob, answers(right))
check("unknown attempt id: rejected", (not ok) and "attempt_not_found" in msg, msg)
cur.execute("update public.attempts set expires_at = now() - interval '1 minute' where id=%s", (a_bob,))
ok, msg = as_service("select public.submit_practice_attempt(%s,%s,%s::jsonb,5)", a_bob, bob, answers(right))
check("expired attempt: rejected, nothing saved", (not ok) and "attempt_expired" in msg and q1("select count(*) from public.attempt_answers where attempt_id=%s", a_bob) == 0, msg)
cur.execute("update public.attempts set expires_at = null where id=%s", (a_bob,))

# --- concurrency: two simultaneous submits of the same attempt ---
ok, a_c = as_service("select public.start_practice_attempt(%s, 'biology')", bob)
results = []
def go():
    results.append(as_service("select public.submit_practice_attempt(%s,%s,%s::jsonb,5)", a_c, bob, answers(right)))
ts = [threading.Thread(target=go) for _ in range(2)]; [t.start() for t in ts]; [t.join() for t in ts]
flags = sorted([r[1]["alreadySubmitted"] for r in results if r[0]])
check("concurrent double-submit: both succeed, exactly one wrote, one replayed", len(flags) == 2 and flags == [False, True], str(flags))
check("concurrent double-submit: exactly 5 answer rows", q1("select count(*) from public.attempt_answers where attempt_id=%s", a_c) == 5)

# --- privilege: students cannot call the functions directly ---
for role in ("anon", "authenticated"):
    c = conn(); k = c.cursor()
    try:
        k.execute(f"set local role {role}"); k.execute("select public.submit_practice_attempt(%s,%s,%s::jsonb,5)", (a_c, bob, answers(right))); denied = False
    except Exception as e: denied = "permission denied" in str(e)
    c.rollback(); c.close()
    check(f"privilege: {role} cannot execute submit_practice_attempt", denied)
    c = conn(); k = c.cursor()
    try:
        k.execute(f"set local role {role}"); k.execute("select public.start_practice_attempt(%s,'biology')", (bob,)); denied = False
    except Exception as e: denied = "permission denied" in str(e)
    c.rollback(); c.close()
    check(f"privilege: {role} cannot execute start_practice_attempt", denied)

# --- RLS unchanged: students see only their own rows ---
def as_user(uid, sql, *a):
    c = conn(); k = c.cursor(); k.execute("set local role authenticated"); k.execute("select set_config('request.jwt.claim.sub', %s, true)", (uid,)); k.execute(sql, a)
    r = k.fetchall(); c.rollback(); c.close(); return r
check("RLS: alice sees only her 1 attempt", len(as_user(alice, "select id from public.attempts")) == 1)
check("RLS: alice sees only her 5 answers", len(as_user(alice, "select id from public.attempt_answers")) == 5)
check("RLS: bob cannot see alice's attempt", str(a1) not in [str(r[0]) for r in as_user(bob, "select id from public.attempts")])
c = conn(); k = c.cursor()
try: k.execute("set local role authenticated"); k.execute("select correct_answer_index from public.questions"); leak = True
except Exception as e: leak = False
c.rollback(); c.close(); check("RLS/grants: authenticated still cannot select correct_answer_index", not leak)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
