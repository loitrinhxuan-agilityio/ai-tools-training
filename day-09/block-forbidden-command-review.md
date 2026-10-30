# Day 09: Review of the `block-forbidden-command` hook

## Status

This is a **training prototype**, not a reliable security control. It is a
guardrail that catches some accidental force pushes. It is not a shell parser,
and it is not a boundary against a determined user or a misbehaving tool call.
The real protection for shared branches is branch protection on the remote.

## Objective

Document the hook's verified behavior and known bypasses, and record each known
gap as a regression case, without changing the hook or its settings.

## Implementation under review

- Hook: `.claude/hooks/block-forbidden-command.sh` (commit `d3ece1b`)
- Tests: `.claude/hooks/block-forbidden-command.test.sh`
- Registration: `.claude/settings.json`, `PreToolUse` on `Bash`, runs the hook
  with a 10-second timeout. Unchanged by this exercise.
- How it works: reads `.tool_input.command` with `jq`, then runs a Python 3
  `shlex` checker. It splits the command into segments at separators, looks for
  `git push` segments (after a few wrapper commands and `git` global options),
  and blocks `--force`, `-f`, short-option clusters containing `f`, and
  `+refspec` force updates. It fails closed on tokenizer errors, malformed
  input, and a missing or failing Python.

## Exercise record

Following the README exercise format.

### Prompt or implementation

Adversarial probes against the committed hook, plus the test suite. Probe
commands were built from parts so the forbidden text never appeared as a
literal Bash command in the session.

### Expected vs observed

| Area | Expected | Observed |
|---|---|---|
| Plain and combined forms (`--force`, `-f`, `-fu`, `+ref`) | blocked | blocked |
| `--force-with-lease`, `--force-if-includes`, normal push | allowed | allowed |
| Quoted commit messages and `echo` text | allowed | allowed |
| Heredoc commit messages with apostrophes (`<<'EOF'`) | allowed | allowed |
| Line continuation before the flag | blocked | **allowed** |
| Absolute path, wrappers (`timeout`, `env -i`, `nice`, `sudo`, `xargs`) | blocked | **allowed** |
| Nested `$(git -C $(pwd) push -f)` | blocked | **allowed** |
| Quoted `"&&"` splitting a push from its flag | blocked | **allowed** |
| Quoted `<<'X'` on one line hiding a later push | blocked | **allowed** |
| Unquoted heredoc with an apostrophe | allowed | **blocked** (tokenizer error) |
| Tool input with a different field name (`cmd`) | blocked, or an error | **allowed** |
| Malformed JSON, unclosed quote, missing or failing Python | blocked | blocked |

## Verified behavior

- Each row above was checked by running the hook with the stated input and
  reading its exit code and stderr. The test suite covers each row.
- The hook is wired as a `PreToolUse` hook on `Bash` in the project
  `settings.json`.
- Tooling in this environment: macOS, GNU bash 3.2.57, Python 3, `jq` 1.7.1.

### Assumptions (not verified)

- The harness sends `{"tool_input": {"command": ...}}` on stdin for Bash
  calls. The hook is working in live use, so this is consistent, but the
  harness format was not checked against its documentation here.
- Whether each allowed bypass would actually push depends on Git and the
  refspec. For example, a quoted `"&&"` may be rejected by Git as an invalid
  refspec. The hook cannot tell, so these cases are recorded as gaps.

## Known limitations

Each limitation is recorded as a case in the test file's "Known gaps" section.
Each case records the current exit code and the desired one.

| # | Limitation | Current | Desired | Test label |
|---|---|---|---|---|
| 1 | `git push`, then a backslash-newline, then the flag | allowed | block | line continuation before the force flag |
| 2 | Absolute path `/usr/bin/git` | allowed | block | absolute git path |
| 3 | `timeout 60 git push -f` | allowed | block | timeout wrapper |
| 4 | `env -i git push -f` | allowed | block | env -i wrapper |
| 5 | `nice -n 5 git push -f` | allowed | block | nice wrapper with option argument |
| 6 | `sudo -u root git push -f` | allowed | block | sudo with option argument |
| 7 | `echo x \| xargs git push -f` | allowed | block | xargs wrapper |
| 8 | `echo $(git -C $(pwd) push -f ...)` | allowed | block | nested command substitution |
| 9 | `git push "&&" -f ...` | allowed | block | quoted && before the force flag |
| 10 | `<<'X'` in a commit message hides a later push | allowed | block | quoted <<'X' in a commit message hides a later push |
| 11 | Unquoted heredoc with an apostrophe | blocked | allow | unquoted heredoc with an apostrophe (false positive) |
| 12 | Tool input without `tool_input.command` | allowed | block or error | tool input without a command field is allowed |

Two more limitations are conservative blocks, not gaps. They are covered by
regression tests:

- Single-quoted backticks containing `git push -f` are blocked, although Bash
  does not run text inside single quotes.
- Malformed input and unparseable commands are blocked, which is the intended
  fail-closed behavior.

Limitations that are not yet probed, and so not recorded as cases:

- Variables and computed commands (`P=push; git $P -f`) are not expanded.
- Git aliases defined in config are not visible.
- `--mirror` and `--delete` are not treated as force.
- Other wrappers and shells (`exec` variants, `bash -lc` with unusual flag
  order, `ssh`, `docker exec`) are not handled.
- `jq` missing is handled by the block path but has no test.

## Test results

Command: `bash .claude/hooks/block-forbidden-command.test.sh`, run from the repo root.

- Exit status: 0
- Output: 47 regression checks `ok`, 12 known gaps recorded `gap`, 0 `FAIL`
- Final line: `all tests passed (12 known gaps recorded)`
- Environment: GNU bash 3.2.57, Python 3 via the hook's `python3` lookup, `jq` 1.7.1.

The run is only evidence for the cases the suite covers. The known gaps pass by
recording current behavior, not by being fixed. The hook and its tests were not
changed for this note.

## Next steps

1. **Join line continuations** (`\` followed by a newline) before tokenizing.
   This closes gap 1 and is the simplest fix.
2. **Match `git` by basename** and extend wrapper handling to skip option
   flags and their arguments (`timeout N`, `nice -n N`, `sudo -u X`,
   `env -i`, `xargs`). This closes gaps 2–7.
3. **Replace the regex-based heredoc stripping and substitution extraction**
   with a tokenizer that knows about quoting. Stripping heredoc bodies from raw
   text is what allows gap 10, and the non-nested `$(...)` pattern is what
   allows gap 8. This is a larger change, so it should be its own task.
4. **Decide on fail-open for unexpected input shape** (gap 12). Either block
   when `tool_input.command` is missing, or log it. A deliberate choice is better
   than silently allowing.
5. **Revisit the unquoted-heredoc false positive** (gap 11). Consider a fallback
   that checks only for force-push text when the tokenizer fails, instead of
   blocking every such command.
6. For each fix, move the case from "Known gaps" to the regression section and
   add any missing negative cases, so the fix cannot block ordinary commands.

## Reflection

- A regex over raw command text is easy to read but has two structural problems:
  it does not know about quoting, and it does not know about command structure.
  Almost every gap above comes from one of those two.
- A prototype check is still worth having for accidental pushes, as long as the
  documentation says what it does not do.
- Recording gaps as tests, instead of leaving them as prose, means a fix will
  show up as a failing test that says which entry to move.
