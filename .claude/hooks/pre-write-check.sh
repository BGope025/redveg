#!/bin/bash
# PreToolUse hook: Block writes to sensitive files
# Returns non-zero exit code to deny the write

TOOL_INPUT="$1"

# Patterns that indicate sensitive files
SENSITIVE_PATTERNS=(
    '\.env'
    '\.key$'
    '\.pem$'
    '\.p12$'
    'id_rsa'
    'secrets'
    'password'
    'token'
    'api_key'
    'credentials'
)

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
    if echo "$TOOL_INPUT" | grep -qE "$pattern"; then
        echo "BLOCKED: Attempt to write sensitive file pattern: $pattern" >&2
        exit 1
    fi
done

exit 0