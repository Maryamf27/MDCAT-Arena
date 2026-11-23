import json, psycopg2, uuid, threading, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
BASE = "http://localhost:3300"; STUB = "http://127.0.0.1:54321"
URI = open("/tmp/e2e-db-uri").read().strip(); KEYS = json.load(open("/tmp/e2e-keys.json"))
db = psycopg2.connect(URI); db.autocommit = True; cur = db.cursor()
def q(sql, *a): cur.execute(sql, a); return cur.fetchall()
def q1(sql, *a): r = q(sql, *a); return r[0][0] if r else None
passed = failed = 0
def check(name, cond, extra=""):
    global passed, failed
    if cond: passed += 1
    else: failed += 1
    print("PASS" if cond else "FAIL", name, extra)
def counts(): return q1("select count(*) from public.attempts"), q1("select count(*) from public.attempt_answers")
def http(method, url, body=None, headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read(); 
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw.decode()
CORRECT = {str(i): c for i, c in q("select id, correct_answer_index from public.questions")}

with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------------- A. logged out ----------------
    ctx0 = b.new_context(viewport={"width": 1280, "height": 900}); pg = ctx0.new_page()
    pg.goto(BASE + "/practice/biology"); pg.wait_for_selector("text=Sign in to start practicing")
    check("A1 logged-out practice shows sign-in prompt (no questions shown)", pg.locator('[role="radio"]').count() == 0)
    r = ctx0.request.post(BASE + "/api/practice/attempts", data={"subject": "biology"}); check("A2 start attempt without login -> 401", r.status == 401, str(r.status))
    r = ctx0.request.post(BASE + "/api/practice/submit", data={"attemptId": str(uuid.uuid4()), "answers": [{"questionId": str(uuid.uuid4()), "selectedIndex": 0}]})
    check("A3 submit without login -> 401", r.status == 401, str(r.status))
    check("A4 nothing written for anonymous callers", counts() == (0, 0))
    ctx0.close()

    # ---------------- B. sign up through the UI ----------------
    ctx = b.new_context(viewport={"width": 1280, "height": 900}); page = ctx.new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    log = {"attempts": [], "submit": [], "questions": []}
    def on_resp(r):
        if r.url.endswith("/api/practice/attempts") and r.request.method == "POST": log["attempts"].append(r)
        elif r.url.endswith("/api/practice/submit"): log["submit"].append(r)
        elif "/api/practice/questions" in r.url: log["questions"].append(r)
    page.on("response", on_resp)
    page.goto(BASE + "/login?next=/practice/biology"); page.wait_for_selector("text=Sign in")
    page.click("text=New here? Create an account")
    page.fill('input[name="email"]', "student1@test.dev"); page.fill('input[name="password"]', "secret123")
    page.click("button:has-text('Create account')")
    page.wait_for_url("**/practice/biology"); page.wait_for_selector('[role="radio"]')
    check("B1 signed-in header shows the student's email", page.locator("text=student1@test.dev").count() >= 1)
    uid1 = q1("select id from auth.users where email='student1@test.dev'")
    check("B2 starting practice created exactly 1 in_progress attempt for this student, 0 answers yet",
          counts() == (1, 0) and q1("select status from public.attempts") == "in_progress" and q1("select user_id from public.attempts") == uid1)
    check("B3 profile row was created for the student with role 'user'", q1("select role from public.profiles where user_id=%s", uid1) == "user")
    check("B4 a published practice test row backs the attempt", q1("select t.test_type||'/'||t.status from public.attempts a join public.tests t on t.id=a.test_id") == "practice/published")
    start_body = log["attempts"][0].text()
    check("B5 start response has attemptId and no answer keys", "attemptId" in start_body and "correct_answer_index" not in start_body and "explanation" not in start_body)
    attempt1 = json.loads(start_body)["data"]["attemptId"]
    qbody = log["questions"][0].text()
    check("B6 questions response unchanged: 5 questions, no keys", json.loads(qbody)["data"]["count"] == 5 and "correct_answer_index" not in qbody and "explanation" not in qbody)
    served = [x["id"] for x in json.loads(qbody)["data"]["questions"]]

    # ---------------- C. answer + submit via UI ----------------
    chosen = {}
    for i in range(5):
        if i < 4:
            page.locator('[role="radio"]').nth(i % 4).click(); chosen[served[i]] = i % 4
        else: chosen[served[i]] = None
        if i < 4: page.click("button:has-text('Next')")
    page.click('button[aria-label^="Go to question 5"]')
    with page.expect_response("**/api/practice/submit") as ri: page.click("button:has-text('Submit answers')")
    sresp = ri.value; sjson = sresp.json()["data"]
    page.wait_for_selector("text=Review your answers")
    req_payload = json.loads(sresp.request.post_data)
    check("C1 submit payload = attemptId + answers only (no score/correctness)", set(req_payload.keys()) == {"attemptId", "answers"} and all(set(a.keys()) == {"questionId", "selectedIndex"} for a in req_payload["answers"]))
    check("C2 response returns the saved attempt id and not-a-duplicate", sjson["attemptId"] == attempt1 and sjson["alreadySubmitted"] is False)
    expected_correct = sum(1 for qid, s in chosen.items() if s is not None and s == CORRECT[qid])
    check("C3 returned score matches independent calculation from the DB answer keys", sjson["score"]["correct"] == expected_correct and sjson["score"]["total"] == 5, f"correct={expected_correct}")
    check("C4 attempts: still exactly 1 row, now submitted, owned by the student",
          q1("select count(*) from public.attempts") == 1 and q("select status, user_id, submitted_at is not null from public.attempts")[0] == ("submitted", uid1, True))
    check("C5 attempt_answers: exactly 5 rows, all linked to that attempt", q1("select count(*) from public.attempt_answers where attempt_id=%s", attempt1) == 5 and q1("select count(*) from public.attempt_answers") == 5)
    check("C6 SAVED score == RETURNED score, total_points == 5", float(q1("select score from public.attempts")) == sjson["score"]["correct"] and float(q1("select total_points from public.attempts")) == 5)
    rows = {str(r[0]): (r[1], r[2]) for r in q("select question_id, selected_option_index, is_correct from public.attempt_answers where attempt_id=%s", attempt1)}
    check("C7 every saved selection and is_correct matches what the student chose vs DB key",
          all(rows[qid][0] == s and rows[qid][1] == (s is not None and s == CORRECT[qid]) for qid, s in chosen.items()))
    check("C8 'Attempt saved' shown with a reference", page.locator("text=Attempt saved").count() == 1 and page.locator(f"text=Reference {attempt1[:8]}").count() == 1)
    page.screenshot(path="/home/claude/shot-saved.png", full_page=False)

    # ---------------- D. duplicate submissions ----------------
    same = {"attemptId": attempt1, "answers": req_payload["answers"]}
    r = ctx.request.post(BASE + "/api/practice/submit", data=same); j = r.json()["data"]
    check("D1 replaying the same submit -> 200, alreadySubmitted, same attempt + same score", r.status == 200 and j["alreadySubmitted"] and j["attemptId"] == attempt1 and j["score"]["correct"] == expected_correct)
    allright = {"attemptId": attempt1, "answers": [{"questionId": qid, "selectedIndex": CORRECT[qid]} for qid in served]}
    r = ctx.request.post(BASE + "/api/practice/submit", data=allright); j = r.json()["data"]
    check("D2 resubmitting a DIFFERENT (all-correct) payload cannot change the saved score", r.status == 200 and j["alreadySubmitted"] and j["score"]["correct"] == expected_correct)
    check("D3 duplicates created no rows (still 1 attempt, 5 answers, same score)", counts() == (1, 5) and float(q1("select score from public.attempts")) == expected_correct)

    # ---------------- E. forged / invalid input ----------------
    r = ctx.request.post(BASE + "/api/practice/submit", data={"attemptId": attempt1, "score": 5, "answers": req_payload["answers"]}); check("E1 client-supplied score is rejected (400)", r.status == 400, str(r.status))
    forged = {"attemptId": attempt1, "answers": [dict(a, isCorrect=True) for a in req_payload["answers"]]}
    r = ctx.request.post(BASE + "/api/practice/submit", data=forged); check("E2 client-supplied correctness flag is rejected (400)", r.status == 400, str(r.status))
    r = ctx.request.post(BASE + "/api/practice/submit", data={"answers": req_payload["answers"]}); check("E3 missing attemptId rejected (400)", r.status == 400)
    r = ctx.request.post(BASE + "/api/practice/submit", data={"attemptId": str(uuid.uuid4()), "answers": req_payload["answers"]}); check("E4 unknown attemptId -> 404, nothing written", r.status == 404 and counts() == (1, 5), str(r.status))
    r = ctx.request.post(BASE + "/api/practice/attempts", data={"subject": "biology", "user_id": str(uuid.uuid4())}); check("E5 client cannot pass a user_id when starting (strict schema 400)", r.status == 400 and q1("select count(*) from public.attempts") == 1)
    r = ctx.request.post(BASE + "/api/practice/attempts", data={"subject": "astrology"}); check("E6 invalid subject rejected (400)", r.status == 400)
    # unknown question id on a fresh attempt
    r = ctx.request.post(BASE + "/api/practice/attempts", data={"subject": "biology"}); a_unk = r.json()["data"]["attemptId"]
    r = ctx.request.post(BASE + "/api/practice/submit", data={"attemptId": a_unk, "answers": [{"questionId": str(uuid.uuid4()), "selectedIndex": 0}]})
    check("E7 unknown question -> 422, no answer rows, attempt left in_progress", r.status == 422 and q1("select count(*) from public.attempt_answers where attempt_id=%s", a_unk) == 0 and q1("select status from public.attempts where id=%s", a_unk) == "in_progress", str(r.status))

    # ---------------- G. DB failure mid-submit: nothing partial, retry works (via UI) ----------------
    page.click("button:has-text('Practice again')"); page.wait_for_selector('[role="radio"]')
    attempt_g = json.loads(log["attempts"][-1].text())["data"]["attemptId"]
    served_g = [x["id"] for x in json.loads(log["questions"][-1].text())["data"]["questions"]]
    page.locator('[role="radio"]').nth(0).click(); page.click("button:has-text('Next')"); page.locator('[role="radio"]').nth(1).click()
    before = counts()
    cur.execute("revoke execute on function public.submit_practice_attempt(uuid,uuid,jsonb,integer) from service_role")
    page.click("button:has-text('Submit answers')")
    page.wait_for_selector("text=could not be saved")
    check("G1 DB failure -> user sees a retryable error, stays on the question page", page.locator('[role="radio"]').count() == 4)
    check("G2 DB failure left NO partial attempt (0 answers, attempt still in_progress, no score)",
          q1("select count(*) from public.attempt_answers where attempt_id=%s", attempt_g) == 0 and q1("select status from public.attempts where id=%s", attempt_g) == "in_progress" and q1("select score is null from public.attempts where id=%s", attempt_g))
    check("G3 the student's selections are still on screen", page.locator('button[aria-label^="Go to question 1 (answered)"]').count() == 1 and page.locator('button[aria-label^="Go to question 2 (answered)"]').count() == 1)
    cur.execute("grant execute on function public.submit_practice_attempt(uuid,uuid,jsonb,integer) to service_role")
    with page.expect_response("**/api/practice/submit") as ri2: page.click("button:has-text('Submit answers')")
    j2 = ri2.value.json()["data"]; page.wait_for_selector("text=Review your answers")
    check("G4 retrying the same attempt after recovery saves it (same attemptId, 5 answers)", j2["attemptId"] == attempt_g and q1("select count(*) from public.attempt_answers where attempt_id=%s", attempt_g) == 5 and q1("select status from public.attempts where id=%s", attempt_g) == "submitted")
    check("G5 saved score == returned score after retry", float(q1("select score from public.attempts where id=%s", attempt_g)) == j2["score"]["correct"])

    # ---------------- F. a second student ----------------
    ctx2 = b.new_context(viewport={"width": 1280, "height": 900}); p2 = ctx2.new_page()
    p2.goto(BASE + "/login"); p2.click("text=New here? Create an account"); p2.fill('input[name="email"]', "student2@test.dev"); p2.fill('input[name="password"]', "secret123")
    p2.click("button:has-text('Create account')"); p2.wait_for_url(BASE + "/"); 
    uid2 = q1("select id from auth.users where email='student2@test.dev'")
    r = ctx2.request.post(BASE + "/api/practice/submit", data={"attemptId": a_unk, "answers": [{"questionId": qid, "selectedIndex": 0} for qid in served]})
    check("F1 student 2 cannot submit student 1's attempt (404)", r.status == 404, str(r.status))
    check("F2 student 1's attempt untouched by that try", q1("select count(*) from public.attempt_answers where attempt_id=%s", a_unk) == 0 and q1("select user_id from public.attempts where id=%s", a_unk) == uid1)
    r = ctx2.request.post(BASE + "/api/practice/submit", data={"attemptId": attempt1, "answers": req_payload["answers"]})
    check("F3 student 2 cannot even replay-read student 1's submitted attempt (404)", r.status == 404, str(r.status))
    r = ctx2.request.post(BASE + "/api/practice/attempts", data={"subject": "biology"}); a2 = r.json()["data"]["attemptId"]
    check("F4 student 2's own attempt belongs to student 2", q1("select user_id from public.attempts where id=%s", a2) == uid2)

    # ---------------- J. concurrent double-submit ----------------
    r = ctx.request.post(BASE + "/api/practice/attempts", data={"subject": "biology"}); a_c = r.json()["data"]["attemptId"]
    cookie = "; ".join(f"{c['name']}={c['value']}" for c in ctx.cookies())
    body = {"attemptId": a_c, "answers": [{"questionId": qid, "selectedIndex": CORRECT[qid]} for qid in served]}
    out = []
    def fire(): out.append(http("POST", BASE + "/api/practice/submit", body, {"Content-Type": "application/json", "Cookie": cookie}))
    ts = [threading.Thread(target=fire) for _ in range(4)]; [t.start() for t in ts]; [t.join() for t in ts]
    check("J1 4 simultaneous submits: all 200, exactly one wrote", all(s == 200 for s, _ in out) and sorted(x["data"]["alreadySubmitted"] for _, x in out) == [False, True, True, True], str([s for s, _ in out]))
    check("J2 exactly 5 answer rows and score 5 for that attempt", q1("select count(*) from public.attempt_answers where attempt_id=%s", a_c) == 5 and float(q1("select score from public.attempts where id=%s", a_c)) == 5)
    b.close()

# ---------------- H. direct PostgREST attacks with a student's own token ----------------
st, tok = http("POST", STUB + "/auth/v1/token?grant_type=password", {"email": "student1@test.dev", "password": "secret123"})
H = {"Authorization": "Bearer " + tok["access_token"], "apikey": KEYS["anon"], "Content-Type": "application/json"}
st, rows_ = http("GET", STUB + "/rest/v1/attempts?select=id,user_id", headers=H)
check("H1 student 1 reads only their own attempts via the REST API (RLS)", st == 200 and {r["user_id"] for r in rows_} == {uid1} and len(rows_) == q1("select count(*) from public.attempts where user_id=%s", uid1))
st, rows_ = http("GET", STUB + f"/rest/v1/attempts?user_id=eq.{uid2}", headers=H); check("H2 student 1 cannot read student 2's attempts", st == 200 and rows_ == [])
st, rows_ = http("GET", STUB + "/rest/v1/attempt_answers?select=attempt_id", headers=H); check("H3 student 1 sees only answers of own attempts", st == 200 and len(rows_) == q1("select count(*) from public.attempt_answers a join public.attempts t on t.id=a.attempt_id where t.user_id=%s", uid1))
st, res = http("POST", STUB + "/rest/v1/rpc/submit_practice_attempt", {"p_attempt_id": a2, "p_user_id": uid2, "p_answers": [{"questionId": served[0], "selectedIndex": 0}], "p_expected_correct": 0}, H)
check("H4 student cannot call the submit RPC directly (permission denied)", st in (401, 403) and q1("select count(*) from public.attempt_answers where attempt_id=%s", a2) == 0, f"{st}")
st, res = http("POST", STUB + "/rest/v1/rpc/start_practice_attempt", {"p_user_id": uid1, "p_subject_key": "biology"}, H); check("H5 student cannot call the start RPC directly", st in (401, 403), f"{st}")
before = counts()
st, res = http("POST", STUB + "/rest/v1/attempts", {"user_id": uid1, "test_id": q1("select id from public.tests limit 1"), "status": "submitted", "score": 5, "total_points": 5}, H)
check("H6 student cannot forge an attempt by inserting directly (RLS)", st in (401, 403) and counts() == before, f"{st}")
st, res = http("PATCH", STUB + f"/rest/v1/attempts?id=eq.{attempt1}", {"score": 5}, H); check("H7 student cannot edit their saved score directly", float(q1("select score from public.attempts where id=%s", attempt1)) == expected_correct, f"{st}")
st, res = http("GET", STUB + "/rest/v1/questions?select=correct_answer_index", headers=H); check("H8 student still cannot read answer keys", st in (401, 403), f"{st}")
st, res = http("GET", STUB + "/rest/v1/attempts", headers={"Authorization": "Bearer " + KEYS["anon"], "apikey": KEYS["anon"]}); check("H9 anonymous sees no attempts", st == 200 and res == [])

check("Z no browser JS errors during the flow", not errs, str(errs[:2]))
print(f"\n{passed} passed, {failed} failed"); raise SystemExit(1 if failed else 0)
