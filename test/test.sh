#!/bin/bash
# Verifier entrypoint (canonical frame). Patching and grading live in
# tests/grader.py; this script owns the task-specific part: run the suites,
# write machine-readable reports under /logs/verifier/, and apply any report
# fixups before grading. Edit ONLY between the RUN TESTS markers.
set -uo pipefail
trap 'if [ ! -f /logs/verifier/reward.json ] && [ ! -f /logs/verifier/reward.txt ]; then mkdir -p /logs/verifier; echo -1 > /logs/verifier/reward.txt; fi' EXIT
log() { echo "[verifier] $*"; }
cd /app || { mkdir -p /logs/verifier; exit 6; }

python3 /tests/grader.py prepare || exit $?
[ -f /logs/verifier/reward.json ] && exit 0   # model.patch didn't apply -> graded 0

# Canonical raw-output log: send every suite's combined stdout+stderr here
# (use run_log, or pipe through tee -a "$RUN_LOG" when feeding a reporter) so
# the reason a test failed is never lost. Never silence a test run.
export RUN_LOG=/logs/verifier/run.log
: > "$RUN_LOG" 2>/dev/null || true
run_log() { echo "+ $*" >> "$RUN_LOG" 2>/dev/null; "$@" 2>&1 | tee -a "$RUN_LOG"; return "${PIPESTATUS[0]}"; }

# >>> RUN TESTS (task-specific) <<<
set +e

jest_json_to_junit() {
  local json_path="$1"
  local xml_path="$2"
  python3 - "$json_path" "$xml_path" <<'PY'
import json, sys, html, os
src, dst = sys.argv[1], sys.argv[2]
suites = []
tests = failures = errors = skipped = 0
time_s = 0.0
try:
    with open(src, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception as e:
    data = {"testResults": [], "message": str(e)}

def esc(s):
    return html.escape(str(s) if s is not None else "", quote=True)

for tr in data.get("testResults") or []:
    suite_name = tr.get("name") or "suite"
    suite_label = os.path.basename(suite_name) if suite_name else "suite"
    cases = []
    s_tests = s_fail = s_err = s_skip = 0
    s_time = float(tr.get("endTime") or 0) - float(tr.get("startTime") or 0)
    if s_time < 0:
        s_time = 0.0
    time_s += s_time / 1000.0 if s_time > 1000 else s_time
    for a in tr.get("assertionResults") or []:
        s_tests += 1
        tests += 1
        title = a.get("title") or a.get("fullName") or "unnamed"
        status = (a.get("status") or "").lower()
        dur = float(a.get("duration") or 0) / 1000.0
        anc = a.get("ancestorTitles") or []
        classname = " ".join(anc) if anc else suite_label
        body = ""
        if status in ("failed", "failure"):
            s_fail += 1
            failures += 1
            msgs = a.get("failureMessages") or ["failed"]
            body = "<failure message=\"{}\">{}</failure>".format(
                esc(msgs[0][:200]), esc("\n".join(msgs))
            )
        elif status in ("pending", "skipped", "todo", "disabled"):
            s_skip += 1
            skipped += 1
            body = "<skipped/>"
        elif status == "error":
            s_err += 1
            errors += 1
            msgs = a.get("failureMessages") or ["error"]
            body = "<error message=\"{}\">{}</error>".format(
                esc(msgs[0][:200]), esc("\n".join(msgs))
            )
        cases.append(
            '<testcase classname="{}" name="{}" time="{:.6f}">{}</testcase>'.format(
                esc(classname), esc(title), dur, body
            )
        )
    suites.append(
        '<testsuite name="{}" tests="{}" failures="{}" errors="{}" skipped="{}" time="{:.6f}">{}</testsuite>'.format(
            esc(suite_label), s_tests, s_fail, s_err, s_skip, max(s_time / 1000.0, 0.0),
            "".join(cases),
        )
    )

xml = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<testsuites tests="{}" failures="{}" errors="{}" skipped="{}" time="{:.6f}">'
    '{}'
    '</testsuites>'
).format(tests, failures, errors, skipped, time_s, "".join(suites))
os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
with open(dst, "w", encoding="utf-8") as f:
    f.write(xml)
print("wrote", dst, "tests=", tests, "failures=", failures)
PY
}

mkdir -p /logs/verifier

# P2P: only customers.regression (green on base and with solution).
# Do NOT run the stock Nest scaffold specs — several are already red on main
# (Hello Kogi vs Hello World, missing DI mocks) and cannot be pass-to-pass.
run_log npx jest --ci --testPathPatterns='customers\.regression\.spec' --json --outputFile=/logs/verifier/base.jest.json
jest_json_to_junit /logs/verifier/base.jest.json /logs/verifier/base.xml

# F2P: public-behavior referral suite (fail on base, pass with solution)
run_log npx jest --ci --testPathPatterns='referral\.behavior\.spec' --json --outputFile=/logs/verifier/new.jest.json
jest_json_to_junit /logs/verifier/new.jest.json /logs/verifier/new.xml

set -e
# >>> END RUN TESTS <<<

# Surface raw suite output into stdout (the harness captures it) so failures
# stay debuggable even when a framework report omits the reason.
_seen=""
for _rl in "$RUN_LOG" /logs/verifier/*_run.log /logs/verifier/*-run.log /logs/verifier/*.log /logs/verifier/*.out; do
  [ -f "$_rl" ] && [ -s "$_rl" ] || continue
  case " $_seen " in *" $_rl "*) continue ;; esac
  case "${_rl##*/}" in *convert*.log|ctrf*.log|junit*.log) continue ;; esac
  _seen="$_seen $_rl"
  echo "===== raw suite output: ${_rl##*/} ====="
  cat "$_rl"
done 2>/dev/null
echo "===== grade ====="

python3 /tests/grader.py grade
log "reward.json=$(cat /logs/verifier/reward.json 2>/dev/null)"

# Uniform top level: keep only the canonical artifacts in /logs/verifier and
# move every framework-native report/log under reports/.
mkdir -p /logs/verifier/reports 2>/dev/null
for _f in /logs/verifier/*; do
  case "${_f##*/}" in
    reward.json|reward.txt|ctrf.json|run.log|test-stdout.txt|reports) continue ;;
  esac
  [ -f "$_f" ] && mv -f "$_f" /logs/verifier/reports/ 2>/dev/null
done
