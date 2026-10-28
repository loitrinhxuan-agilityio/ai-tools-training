#!/usr/bin/env bash
set -uo pipefail

# Block Git force pushes: `--force`, `-f`, short clusters containing `f`
# (e.g. `-fu`), and force-update refspecs (`+branch`, `src:+dst`).
# `--force-with-lease` and `--force-if-includes` are allowed.
#
# This is limited shell parsing (Python shlex), not a complete Bash parser.
# Anything it cannot verify is blocked. Exit 2 blocks the tool call and shows
# stderr to Claude. Set BLOCK_FORBIDDEN_PYTHON to override the interpreter (tests).

python_bin="${BLOCK_FORBIDDEN_PYTHON:-python3}"

input=$(cat)
if ! bash_command=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null); then
  echo "Blocked by block-forbidden-command: could not read the tool input, so the command cannot be checked." >&2
  exit 2
fi

if [[ -z "$bash_command" ]]; then
  exit 0
fi

if ! command -v "$python_bin" >/dev/null 2>&1; then
  echo "Blocked by block-forbidden-command: '$python_bin' is not available, so the command cannot be checked. Run the Git command yourself or restore Python 3." >&2
  exit 2
fi

checker=$(cat <<'PY'
import re
import shlex
import sys

GIT_OPTIONS_WITH_ARG = {
    "-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env",
}
WRAPPERS = {"rtk", "sudo", "env", "command", "exec", "time", "nohup"}
SHELLS = {"sh", "bash", "zsh"}
SEPARATOR_CHARS = set(";&|()`\n")
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
SHELL_C_FLAG = re.compile(r"^-[a-zA-Z]*c[a-zA-Z]*$")
SUBSTITUTION = re.compile(r"\$\(([^()]*)\)|`([^`]*)`")
QUOTED_HEREDOC = re.compile(r"<<-?\s*(['\"])(\w+)\1")
MAX_DEPTH = 3


class Unverifiable(Exception):
    pass


def tokenize(command):
    lexer = shlex.shlex(command, posix=True, punctuation_chars="".join(SEPARATOR_CHARS))
    lexer.whitespace = " \t\r"
    lexer.whitespace_split = True
    try:
        return list(lexer)
    except ValueError as error:
        raise Unverifiable(f"could not tokenize the command ({error})")


def split_segments(tokens):
    segments = [[]]
    for token in tokens:
        if token and set(token) <= SEPARATOR_CHARS:
            segments.append([])
        else:
            segments[-1].append(token)
    return [segment for segment in segments if segment]


def check_push(args):
    for arg in args:
        if arg == "--force":
            return "'git push' with --force"
        if arg.startswith("--"):
            continue
        if arg.startswith("-"):
            if "f" in arg[1:]:
                return f"'git push' with the force flag in '{arg}'"
            continue
        if arg.startswith("+") or ":+" in arg:
            return f"'git push' with a force-update refspec '{arg}'"
    return None


def check_git(tokens):
    i = 0
    while i < len(tokens) and tokens[i].startswith("-"):
        i += 2 if tokens[i] in GIT_OPTIONS_WITH_ARG else 1
    if i >= len(tokens) or tokens[i] != "push":
        return None
    return check_push(tokens[i + 1:])


def check_segment(tokens, depth):
    i = 0
    while i < len(tokens) and (ASSIGNMENT.match(tokens[i]) or tokens[i] in WRAPPERS):
        i += 1
    if i >= len(tokens):
        return None
    head = tokens[i]
    if head in SHELLS:
        for j in range(i + 1, len(tokens) - 1):
            if SHELL_C_FLAG.match(tokens[j]):
                return check(tokens[j + 1], depth + 1)
        return None
    if head == "eval":
        return check(" ".join(tokens[i + 1:]), depth + 1)
    if head == "git":
        return check_git(tokens[i + 1:])
    return None


def strip_quoted_heredoc_bodies(command):
    # A quoted heredoc body is literal data, not run by the shell, so it is dropped.
    # Unquoted heredoc bodies are kept, since their $(...) is still executed.
    kept = []
    terminators = []
    for line in command.split("\n"):
        if terminators:
            if line.strip() == terminators[0]:
                terminators.pop(0)
            continue
        kept.append(line)
        terminators.extend(match.group(2) for match in QUOTED_HEREDOC.finditer(line))
    return "\n".join(kept)


def check(command, depth):
    if depth > MAX_DEPTH:
        raise Unverifiable("commands are nested too deeply")
    command = strip_quoted_heredoc_bodies(command)
    for match in SUBSTITUTION.finditer(command):
        inner = match.group(1) if match.group(1) is not None else match.group(2)
        reason = check(inner, depth + 1)
        if reason:
            return reason
    for segment in split_segments(tokenize(command)):
        reason = check_segment(segment, depth)
        if reason:
            return reason
    return None


def main():
    command = sys.argv[1]
    try:
        reason = check(command, 0)
    except Unverifiable as error:
        print(f"Blocked by block-forbidden-command: {error}. Run the Git command yourself if it is safe.", file=sys.stderr)
        sys.exit(2)
    if reason:
        print(f"Blocked by block-forbidden-command: {reason} rewrites remote history. Use a normal push or --force-with-lease, or ask the user for explicit approval.", file=sys.stderr)
        sys.exit(2)


main()
PY
)

if output=$("$python_bin" -c "$checker" "$bash_command" 2>&1); then
  exit 0
fi

# Any failure (block, unverifiable input, or an interpreter error) blocks the call.
if [[ -n "$output" ]]; then
  printf '%s\n' "$output" >&2
else
  echo "Blocked by block-forbidden-command: the command check failed." >&2
fi
exit 2
