#!/usr/bin/env bash
# PreToolUse gate: block `git push` / `gh pr create|edit|merge` unless the
# pr-self-review skill has passed for the current HEAD this session.
#
# The skill writes a one-shot pass token (.claude/.pr-self-review-pass)
# containing the reviewed HEAD sha after it reaches an "OK to push" verdict.
# This hook consumes that token. No valid token -> deny and tell Claude to
# run the pr-self-review skill first.
#
# Emits a PreToolUse permissionDecision on stdout. Fails open only on
# malformed input (never on a matched push command).

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
TOKEN="$PROJECT_DIR/.claude/.pr-self-review-pass"

payload="$(cat)"

tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)"
[ "$tool" = "Bash" ] || exit 0   # only gate shell commands

cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -n "$cmd" ] || exit 0

# Match the GitHub-outbound operations we want to gate.
# git push (any form)  OR  gh pr create/edit/merge  OR  gh pr ... push
is_gated=0
if printf '%s' "$cmd" | grep -Eq '(^|[;&|]|[[:space:]])git[[:space:]]+push([[:space:]]|$)'; then
  is_gated=1
fi
if printf '%s' "$cmd" | grep -Eq '(^|[;&|]|[[:space:]])gh[[:space:]]+pr[[:space:]]+(create|edit|merge)([[:space:]]|$)'; then
  is_gated=1
fi
[ "$is_gated" -eq 1 ] || exit 0

deny() {
  # $1 = reason
  jq -cn --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

head_sha="$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null)"

if [ ! -f "$TOKEN" ]; then
  deny "BLOCKED by pr-self-review gate: no self-review recorded for this push. Run the pr-self-review skill on the working diff first. Only after it reports 'OK to push' (and writes the pass token) will this command be allowed."
fi

token_sha="$(head -n1 "$TOKEN" 2>/dev/null | tr -d '[:space:]')"

if [ -n "$head_sha" ] && [ "$token_sha" != "$head_sha" ]; then
  rm -f "$TOKEN"
  deny "BLOCKED by pr-self-review gate: the pass token was issued for a different commit ($token_sha) but HEAD is now $head_sha. Re-run the pr-self-review skill on the current diff."
fi

# Valid token -> consume it (one-shot) and allow the push through.
rm -f "$TOKEN"
exit 0
