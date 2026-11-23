#!/bin/bash
cd /home/claude/MDCAT-Arena-main
rm -f /tmp/e2e-ready
python3 /home/claude/harness/stack.py > /tmp/stack.log 2>&1 &
STACK=$!
for i in $(seq 1 60); do [ -f /tmp/e2e-ready ] && break; sleep 1; done
[ -f /tmp/e2e-ready ] || { echo "stack failed"; tail /tmp/stack.log; exit 2; }
export NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/font-mock.js NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(python3 -c "import json;print(json.load(open('/tmp/e2e-keys.json'))['anon'])")
export SUPABASE_SERVICE_ROLE_KEY=$(python3 -c "import json;print(json.load(open('/tmp/e2e-keys.json'))['service'])")
echo "== build"; npm run build > /home/claude/build.log 2>&1; echo "build exit: $?"; grep -E "error|Error" /home/claude/build.log | grep -v NEXT_PRERENDER | head -5
npx next start -p 3300 > /home/claude/app.log 2>&1 &
APP=$!; sleep 5
echo "== integration e2e"; python3 /home/claude/harness/e2e_persist.py 2>&1 | grep -v "Warning\|return Path"
RC=$?
kill $APP $STACK 2>/dev/null; pkill -x postgrest 2>/dev/null; pkill -x postgres 2>/dev/null; pkill -f next-server 2>/dev/null; exit $RC
