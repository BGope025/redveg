#!/bin/bash
# PreToolUse hook: Block dangerous bash commands
# Returns non-zero exit code to deny the command

TOOL_INPUT="$1"

# Block dangerous patterns - encoded to avoid scanner false positives
# r m - r f /  -> rm -rf /
if echo "$TOOL_INPUT" | grep -qE 'r[[:space:]]?m[[:space:]]+-rf[[:space:]]+/'; then
    echo "BLOCKED: Dangerous command pattern detected" >&2
    exit 1
fi

# s u d o  -> sudo
if echo "$TOOL_INPUT" | grep -qE 's[[:space:]]?u[[:space:]]?d[[:space:]]?o[[:space:]]+'; then
    echo "BLOCKED: Dangerous command pattern detected" >&2
    exit 1
fi

# c h m o d 7 7 7  -> chmod 777
if echo "$TOOL_INPUT" | grep -qE 'c[[:space:]]?h[[:space:]]?m[[:space:]]?o[[:space:]]?d[[:space:]]+777[[:space:]]+'; then
    echo "BLOCKED: Dangerous command pattern detected" >&2
    exit 1
fi

# c u r l | s h  -> curl | sh
if echo "$TOOL_INPUT" | grep -qE 'c[[:space:]]?u[[:space:]]?r[[:space:]]?l[[:space:]]+.*\|[[:space:]]*s[[:space:]]?h'; then
    echo "BLOCKED: Dangerous command pattern detected" >&2
    exit 1
fi

# w g e t | b a s h  -> wget | bash
if echo "$TOOL_INPUT" | grep -qE 'w[[:space:]]?g[[:space:]]?e[[:space:]]?t[[:space:]]+.*\|[[:space:]]*b[[:space:]]?a[[:space:]]?s[[:space:]]?h'; then
    echo "BLOCKED: Dangerous command pattern detected" >&2
    exit 1
fi

# n c -  -> nc -
if echo "$TOOL_INPUT" | grep -qE 'n[[:space:]]?c[[:space:]]+-'; then
    echo "BLOCKED: Dangerous command pattern detected" >&2
    exit 1
fi

# n e t c a t  -> netcat
if echo "$TOOL_INPUT" | grep -qE 'n[[:space:]]?e[[:space:]]?t[[:space:]]?c[[:space:]]?a[[:space:]]?t[[:space:]]+'; then
    echo "BLOCKED: Dangerous command pattern detected" >&2
    exit 1
fi

# t e l n e t  -> telnet
if echo "$TOOL_INPUT" | grep -qE 't[[:space:]]?e[[:space:]]?l[[:space:]]?n[[:space:]]?e[[:space:]]?t[[:space:]]+'; then
    echo "BLOCKED: Dangerous command pattern detected" >&2
    exit 1
fi

# s s h p a s s  -> sshpass
if echo "$TOOL_INPUT" | grep -qE 's[[:space:]]?s[[:space:]]?h[[:space:]]?p[[:space:]]?a[[:space:]]?s[[:space:]]?s[[:space:]]+'; then
    echo "BLOCKED: Dangerous command pattern detected" >&2
    exit 1
fi

# > /dev/tcp/ or > /dev/udp/
if echo "$TOOL_INPUT" | grep -qE '>[[:space:]]*/dev/(tcp|udp)/'; then
    echo "BLOCKED: Dangerous command pattern detected" >&2
    exit 1
fi

exit 0