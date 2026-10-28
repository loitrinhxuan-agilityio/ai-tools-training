#!/usr/bin/env bash
set -uo pipefail

# Feed the hook the PreToolUse JSON shape Claude Code sends for Bash calls.
# Run from the repo root: bash .claude/hooks/block-forbidden-command.test.sh

hook=".claude/hooks/block-forbidden-command.sh"
failures=0

# Build the forbidden text from parts so this file never contains it as a
# literal Bash command when the hook runs over the repo's own tooling.
push="git pu""sh"
force="--""force"

report() {
  local status=$1 label=$2
  if [[ "$status" == "ok" ]]; then
    echo "ok   $label"
  else
    echo "FAIL $label"
    failures=$((failures + 1))
  fi
}

# expect_exit <expected-exit> <command>
# For blocked cases, also checks that stderr carries the block message.
expect_exit() {
  local expected=$1 command=$2 actual stderr
  stderr=$(jq -n --arg command "$command" '{tool_name: "Bash", tool_input: {command: $command}}' \
    | bash "$hook" 2>&1 >/dev/null)
  actual=$?
  local label="(exit $actual, expected $expected): $command"
  if [[ "$actual" -ne "$expected" ]]; then
    report fail "$label"
  elif [[ "$expected" -eq 2 && "$stderr" != *"Blocked by block-forbidden-command"* ]]; then
    report fail "$label (missing block message)"
  else
    report ok "$label"
  fi
}

# expect_raw_exit <expected-exit> <label> <raw-stdin> [VAR=value ...]
# Feeds raw stdin (not a normal tool-input JSON) and optional env overrides.
expect_raw_exit() {
  local expected=$1 label=$2 raw=$3 actual
  shift 3
  printf '%s' "$raw" | env "$@" bash "$hook" >/dev/null 2>&1
  actual=$?
  if [[ "$actual" -ne "$expected" ]]; then
    report fail "(exit $actual, expected $expected): $label"
  else
    report ok "(exit $actual): $label"
  fi
}

echo "# Forbidden: force pushes in each common form."
expect_exit 2 "$push $force"
expect_exit 2 "git push -f"
expect_exit 2 "git push origin main $force"
expect_exit 2 "git push -f origin feat/x"
expect_exit 2 "rtk git push $force origin feat/x"
expect_exit 2 "git fetch && $push $force"

echo "# Forbidden: Git global options, combined short flags, and force refspecs."
expect_exit 2 "git -C . push $force origin feat/x"
expect_exit 2 "git -c user.name=x push -f origin feat/x"
expect_exit 2 "git --no-pager push $force"
expect_exit 2 "git push -fu origin feat/x"
expect_exit 2 "git push -uf origin feat/x"
expect_exit 2 "git push origin +feat/x"
expect_exit 2 "git push origin HEAD:+main"

echo "# Forbidden: multiple segments, newlines, wrappers, and nested commands."
expect_exit 2 "git status; $push -f origin feat/x"
expect_exit 2 "git status && $push $force origin feat/x"
expect_exit 2 "git status | cat; $push -f"
printf -v multiline 'git status\n%s %s' "$push" "$force"
expect_exit 2 "$multiline"
expect_exit 2 "env GIT_TRACE=0 $push -f"
expect_exit 2 "sh -c '$push -f origin feat/x'"
expect_exit 2 "bash -c 'git push origin +feat/x'"
expect_exit 2 "eval '$push $force'"
expect_exit 2 "echo \"\$($push -f)\""
expect_exit 2 "echo \"\`$push -f\`\""

echo "# Permitted: guarded forces, normal pushes, and unrelated commands."
expect_exit 0 "git push"
expect_exit 0 "git push origin feat/hooks"
expect_exit 0 "git push $force-with-lease origin feat/hooks"
expect_exit 0 "git push $force-if-includes origin feat/hooks"
expect_exit 0 "git push --set-upstream origin feat/hooks"
expect_exit 0 "git -C . push --set-upstream origin feat/hooks"
expect_exit 0 "git push origin HEAD:main"
expect_exit 0 "git status"
expect_exit 0 "git log -f --oneline"
expect_exit 0 "npm test"
expect_exit 0 "git status && git log --oneline && npm test"
expect_exit 0 "echo '$push $force' is just text"
expect_exit 0 "echo \"$push -f is just text\""

echo "# Permitted: forbidden text inside commit messages is not an executed command."
expect_exit 0 "git commit -m \"note: $push $force is blocked\""
expect_exit 0 "git commit -m \"$(printf 'fix: prose about %s' "$push")\""
expect_exit 0 "git commit -m \"\$(cat <<'EOF'
fix: don't break the hook
EOF
)\""
expect_exit 0 "git commit -F - <<'EOF'
fix: don't break the hook
EOF"
expect_exit 0 "cat <<'EOF'
$push $force
EOF"

echo "# Known conservative block: backticks in single quotes are not run by Bash, but the check still flags them."
expect_exit 2 "git commit -m 'use \`$push -f\` carefully'"

echo "# Fail closed: unparseable commands, bad input, and missing or failing interpreter."
expect_exit 2 "git commit -m \"unclosed"
expect_raw_exit 2 "malformed JSON input" "not json"
expect_raw_exit 0 "empty command" '{"tool_input":{"command":""}}'
expect_raw_exit 2 "python3 missing" '{"tool_input":{"command":"git status"}}' BLOCK_FORBIDDEN_PYTHON=/nonexistent/python3
expect_raw_exit 2 "python3 failing" '{"tool_input":{"command":"git status"}}' BLOCK_FORBIDDEN_PYTHON=/usr/bin/false

if [[ "$failures" -gt 0 ]]; then
  echo "$failures test(s) failed"
  exit 1
fi
echo "all tests passed"
