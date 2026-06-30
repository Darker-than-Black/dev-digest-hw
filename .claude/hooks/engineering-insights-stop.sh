#!/usr/bin/env bash
# Stop hook — make the engineering-insights wrap-up automatic (L06 upgrade).
#
# Fires when the agent finishes a turn. Blocks the stop ONCE per session (when
# there is substantive uncommitted work) to force the insights wrap-up, then
# gets out of the way. Guards against infinite loops three ways:
#   1. stop_hook_active → we already re-entered from this hook; never re-block.
#   2. per-session sentinel → fire at most once per session_id.
#   3. insights.md already dirty → capture already happened this round; skip.
set -euo pipefail

input=$(cat)
get() { printf '%s' "$input" | jq -r "$1"; }

stop_active=$(get '.stop_hook_active // false')
session=$(get '.session_id // "unknown"')
cwd=$(get '.cwd // "."')

# 1. Loop guard: this stop was itself produced by a hook-continue.
[ "$stop_active" = "true" ] && exit 0

# 2. Once per session.
sentinel="${TMPDIR:-/tmp}/insights-done-${session}"
[ -f "$sentinel" ] && exit 0

# Only meaningful with a git tree.
command -v git >/dev/null 2>&1 || exit 0
status=$(git -C "$cwd" status --porcelain 2>/dev/null || true)

# No uncommitted work → nothing was done → nothing to capture.
[ -z "$status" ] && exit 0

# 3. insights.md already edited this round → capture already done.
if printf '%s\n' "$status" | grep -q 'insights\.md'; then
  exit 0
fi

# Arm the guard, then ask the model to run the wrap-up before stopping.
touch "$sentinel"
cat <<'JSON'
{"decision":"block","reason":"Before stopping: run the engineering-insights wrap-up. Review what this session changed (git diff) and silently append any NON-OBVIOUS lessons to the touched module's insights.md — route by path: client/** → client/insights.md, server/src/modules/repo-intel/** → that module's file, other server/** → server/insights.md, reviewer-core/** → reviewer-core/insights.md. Dedup against existing entries (extend/skip, never duplicate), use the 7 fixed section headings, then report one line per file written. If every change was trivial (typo/format/no non-obvious lesson), say so in one line and stop — do not invent entries."}
JSON
exit 0
