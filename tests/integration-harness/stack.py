"""Postgres (real) + PostgREST (real) + minimal GoTrue stub on :54321. Runs until killed."""
import pgserver, subprocess, threading, http.server, json, hmac, hashlib, base64, time, uuid, os, shutil, sys, http.client
from urllib.parse import urlparse, parse_qs
import psycopg2

SECRET = "super-secret-jwt-key-with-at-least-32-characters-long"
PGDATA = "/tmp/pgdata-e2e"; shutil.rmtree(PGDATA, ignore_errors=True)
srv = pgserver.get_server(PGDATA, cleanup_mode="delete")
URI = srv.get_uri()
def conn(): 
    c = psycopg2.connect(URI); c.autocommit = True; return c
for f in ("/home/claude/harness/schema.sql", "/home/claude/harness/seed.sql", "/home/claude/MDCAT-Arena-main/supabase/migrations/20261123000300_practice_attempt_persistence.sql"):
    c = conn(); c.cursor().execute(open(f).read()); c.close()
sock_dir = PGDATA
open("/tmp/e2e-db-uri", "w").write(URI)

b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
def jwt(payload):
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()); p = b64(json.dumps(payload).encode())
    sig = b64(hmac.new(SECRET.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()); return f"{h}.{p}.{sig}"
def verify(tok):
    try:
        h, p, s = tok.split(".")
        if not hmac.compare_digest(s, b64(hmac.new(SECRET.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())): return None
        d = json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))
        return d if d.get("exp", 0) > time.time() else None
    except Exception: return None
far = int(time.time()) + 10 * 365 * 86400
ANON = jwt({"role": "anon", "iss": "supabase", "exp": far}); SERVICE = jwt({"role": "service_role", "iss": "supabase", "exp": far})
json.dump({"anon": ANON, "service": SERVICE, "secret": SECRET}, open("/tmp/e2e-keys.json", "w"))

env = dict(os.environ, PGRST_DB_URI=f"postgresql://authenticator:pw@/postgres?host={sock_dir}", PGRST_DB_SCHEMAS="public",
           PGRST_DB_ANON_ROLE="anon", PGRST_JWT_SECRET=SECRET, PGRST_SERVER_HOST="127.0.0.1", PGRST_SERVER_PORT="54320", PGRST_DB_POOL="5")
pgrst = subprocess.Popen(["/tmp/pgrest/postgrest"], env=env, stdout=open("/tmp/postgrest.log", "w"), stderr=subprocess.STDOUT)

USERS = {}  # email -> (id, password)
def session_for(uid, email):
    now = int(time.time())
    tok = jwt({"sub": uid, "email": email, "role": "authenticated", "aud": "authenticated", "iss": "stub", "iat": now, "exp": now + 3600})
    return {"access_token": tok, "token_type": "bearer", "expires_in": 3600, "expires_at": now + 3600, "refresh_token": "rt-" + uid,
            "user": {"id": uid, "aud": "authenticated", "role": "authenticated", "email": email, "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}}

class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*")); self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,accept-profile,content-profile")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
    def send_json(self, code, obj):
        body = json.dumps(obj).encode(); self.send_response(code); self.cors()
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def body(self):
        n = int(self.headers.get("Content-Length") or 0); return self.rfile.read(n) if n else b""
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.send_header("Content-Length", "0"); self.end_headers()
    def proxy(self):
        data = self.body(); c = http.client.HTTPConnection("127.0.0.1", 54320, timeout=30)
        hdrs = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "content-length", "connection", "origin")}
        c.request(self.command, self.path[len("/rest/v1"):] or "/", body=data or None, headers=hdrs)
        r = c.getresponse(); out = r.read(); self.send_response(r.status); self.cors()
        for k, v in r.getheaders():
            if k.lower() in ("content-type", "content-range", "preference-applied"): self.send_header(k, v)
        self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)
    def do_GET(self): self.route()
    def do_POST(self): self.route()
    def do_PATCH(self): self.route()
    def do_DELETE(self): self.route()
    def route(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path.startswith("/rest/v1"): return self.proxy()
        if u.path == "/auth/v1/signup" and self.command == "POST":
            d = json.loads(self.body() or b"{}"); em, pw = d.get("email"), d.get("password")
            if not em or not pw or len(pw) < 6: return self.send_json(422, {"code": 422, "msg": "Invalid signup"})
            if em in USERS: return self.send_json(422, {"code": 422, "error_code": "user_already_exists", "msg": "User already registered"})
            uid = str(uuid.uuid4()); USERS[em] = (uid, pw)
            c = conn(); c.cursor().execute("insert into auth.users (id,email) values (%s,%s)", (uid, em)); c.close()
            return self.send_json(200, session_for(uid, em))
        if u.path == "/auth/v1/token" and self.command == "POST":
            d = json.loads(self.body() or b"{}"); gt = (q.get("grant_type") or [""])[0]
            if gt == "password":
                rec = USERS.get(d.get("email"))
                if not rec or rec[1] != d.get("password"): return self.send_json(400, {"code": 400, "error_code": "invalid_credentials", "msg": "Invalid login credentials"})
                return self.send_json(200, session_for(rec[0], d["email"]))
            if gt == "refresh_token":
                uid = str(d.get("refresh_token", ""))[3:]; em = next((e for e, (i, _) in USERS.items() if i == uid), None)
                if not em: return self.send_json(400, {"code": 400, "msg": "Invalid refresh token"})
                return self.send_json(200, session_for(uid, em))
        if u.path == "/auth/v1/user" and self.command == "GET":
            tok = (self.headers.get("Authorization") or "").replace("Bearer ", ""); d = verify(tok)
            if not d or d.get("role") != "authenticated": return self.send_json(401, {"code": 401, "msg": "invalid JWT"})
            return self.send_json(200, session_for(d["sub"], d["email"])["user"])
        if u.path == "/auth/v1/logout": self.body(); self.send_response(204); self.cors(); self.send_header("Content-Length", "0"); self.end_headers(); return
        self.send_json(404, {"msg": "stub: not found " + u.path})

class S(http.server.ThreadingHTTPServer): daemon_threads = True; request_queue_size = 64
threading.Thread(target=S(("127.0.0.1", 54321), H).serve_forever, daemon=True).start()
open("/tmp/e2e-ready", "w").write("1")
print("stack ready", flush=True)
try:
    while True: time.sleep(1)
finally:
    pgrst.terminate()
