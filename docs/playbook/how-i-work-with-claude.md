# How I Work with Claude Code
*A Personal Playbook for AI-Assisted Software Engineering*

## 1. My Working Principles

I use Claude Code as an engineering partner, not as an autonomous replacement for engineering judgment.

My approach is built around five principles:

1. **Understand before acting** — Investigate the codebase and verify existing behavior before proposing changes.
2. **Plan before implementing** — Use Plan Mode for complex tasks and review the proposed design before coding.
3. **Work in small, verifiable steps** — Break work into manageable tasks with clear acceptance criteria.
4. **Verify AI-generated work** — Review the actual diff, run tests, inspect security implications, and validate behavior.
5. **Keep humans in control** — Require explicit approval for important or irreversible actions.

## 2. My End-to-End Workflow

I follow a two-pass approach: first investigate and plan, then implement and verify.

```text
Ticket and Requirements
        |
        v
Understand the Context
        |
        v
Investigate in Plan Mode
        |
        v
Challenge and Approve the Plan
        |
        v
Implement in an Isolated Branch
        |
        v
Test and Verify
        |
        v
Code Review and Security Review
        |
        v
Human Approval
        |
        v
Merge and Release
        |
        v
Demo and Document
```

### Pass 1 — Investigate and Plan

For complex or high-impact tasks, I start with Plan Mode.

My preferred command:

```bash
claude --permission-mode plan
```

Or, during an active session, I use `Shift+Tab` to switch to Plan Mode or `/plan` for a planning turn.

I ask Claude to:

- Inspect relevant source files, tests, configuration, and Git history.
- Explain the current behavior with evidence.
- Identify architectural boundaries and invariants.
- Trace the data flow and dependencies.
- Identify failure scenarios, security concerns, and compatibility risks.
- Propose the smallest safe implementation.
- Define tests, manual checks, rollout, and rollback.

### My reusable Plan Mode prompt

```text
Investigate this task in Plan Mode. Do not modify files.

Desired outcome:
[Describe the expected behavior.]

Before proposing a solution:
- Inspect relevant implementation and tests.
- Review configuration and related Git history.
- Trace the current data flow and dependencies.
- Identify existing conventions and invariants.

Return:
1. Current behavior and supporting evidence.
2. Requirements, constraints, and assumptions.
3. The smallest safe implementation approach.
4. Exact files likely to change and why.
5. Data flow and architectural boundaries.
6. Failure cases, security risks, and compatibility concerns.
7. Unit, integration, E2E, and manual verification plan.
8. Rollout and rollback considerations.
9. Unresolved questions.

Do not invent missing facts. Clearly distinguish verified facts
from assumptions.

Wait for my approval before implementation.
```

### Challenge the plan before approval

I don't treat Claude's first proposal as the final design.

I ask questions such as:

- What existing behavior could this break?
- Which assumptions have not been verified?
- Can we solve this with fewer abstractions?
- What happens if an event is delivered twice or out of order?
- Which tests might pass even if the feature is still broken?
- What is the rollback strategy?

I approve the plan only when the important decisions and verification criteria are clear.

### Pass 2 — Implement and Verify

After approving the plan, I switch to an appropriate execution permission mode.

```text
Implement the approved plan.

Requirements:
- Follow the existing architecture and conventions.
- Keep changes focused and avoid unrelated refactoring.
- Implement incrementally.
- Add or update tests for expected behavior and edge cases.
- Stop and report if repository evidence contradicts the approved plan.

Before finishing:
- Run the planned tests, typecheck, lint, and build.
- Inspect the complete Git diff.
- Summarize changed files, test results, and unresolved risks.

Do not commit, push, merge, or deploy without my explicit approval.
```

I inspect the actual changes:

```bash
git diff --stat
git diff
git status --short
```

A plan is not a substitute for version control, testing, or human review.

## 3. Choosing the Right Claude Model

I select the model based on task complexity, required reasoning, speed, and available usage.

### My model-selection guide

| Task | Suggested model tier | Effort |
|---|---|---|
| Find files, functions, or configuration | Haiku | Low |
| Simple code explanation or lookup | Haiku | Low |
| Mechanical refactoring or renaming | Haiku | Low |
| Implement a function or feature | Sonnet | Medium |
| Write unit and integration tests | Sonnet | Medium |
| Debug a failing test | Sonnet | High |
| Review ordinary code changes | Sonnet | Medium–High |
| Design a new architecture | Opus | High |
| Investigate complex security issues | Opus | High |
| Large multi-module refactoring | Opus | High |

*These are starting recommendations, not fixed rules. Actual model availability, quality, speed, and usage limits depend on the Claude Code environment.*

### My practical model-switching commands

```text
/model haiku
/model sonnet
/model opus
```

I use `/effort` when available to adjust reasoning depth:

```text
/effort low
/effort medium
/effort high
```

My default approach:

- **Haiku:** Fast exploration and simple, well-defined tasks.
- **Sonnet:** Everyday implementation, testing, and code review.
- **Opus:** Complex architecture, security analysis, and difficult debugging.

### Optional: Automatic planning/execution model routing

The model-selection guide describes `opusplan` as a convenient option:

```bash
claude --model opusplan
```

Its intended workflow is Opus for planning and Sonnet for implementation. I use this only if the alias is supported by my installed Claude Code version and account.

### Model selection for subagents

I can delegate independent tasks to specialized subagents with different model tiers.

| Subagent responsibility | Suggested tier |
|---|---|
| Codebase exploration | Haiku |
| Documentation lookup | Haiku |
| Implementation support | Sonnet |
| Test generation | Sonnet |
| Code review | Sonnet |
| Complex architecture or security investigation | Opus |

I keep delegated tasks focused and provide clear scope, expected output, and tool permissions. I review their findings before using them to make engineering decisions.

## 4. My Favorite Workflows

| Workflow | When I use it | How I use it |
|---|---|---|
| Plan Mode | Complex features and architectural changes | Investigate first, challenge the plan, approve before implementation |
| Subagents | Independent research and parallel tasks | Delegate focused work with clear boundaries |
| Git Worktrees | Multiple concurrent tasks | Isolate each task in its own branch and working directory |
| Test-driven development | Feature implementation and bug fixes | Define expected behavior, implement, and verify |
| `/loop` | Monitoring ongoing work | Periodically check CI, PR status, or defined conditions |
| `/code-review` | Before merging | Review correctness, maintainability, error handling, and regressions |
| `/code-review ultra` | High-risk changes | Perform deeper analysis, particularly around authentication and data access |
| Release notes | After implementation and merge | Document shipped behavior, customer benefits, and limitations |
| Remote Control (`/rc`) | Remote development sessions | Steer an active Claude Code session from a phone |

## 5. Practical Examples from My Capstone

### Example A — WH-04: Audit Lookups and Fail-Closed Behavior

**Objective:** Implement audit logging and fail-closed behavior for support withdrawal lookups.

**Workflow I applied:**

1. Created an isolated Git worktree for `feat/wh-04-audit-lookups`.
2. Investigated the existing withdrawal lookup handlers and audit requirements.
3. Used a plan-first approach to understand the implementation boundaries.
4. Implemented audit functionality and relevant authorization/failure behavior.
5. Added PostgreSQL E2E coverage.
6. Ran `/code-review ultra` to identify deeper issues.
7. Addressed review findings and reran CI.
8. Performed final human review before merging.

**Lessons learned:**

- Isolated worktrees make parallel development safer.
- Audit logging introduces important failure-handling and dependency-injection considerations.
- Passing unit tests alone is not sufficient; database-backed E2E tests matter.
- Deep code review can uncover issues that ordinary implementation tests miss.

### Example B — SEC-01: Authentication and Authorization

**Objective:** Require authentication on routes and restrict raw event history to an internal support role.

**Workflow I applied:**

1. Investigated the existing route structure and security requirements.
2. Defined JWT validation and role-based access requirements.
3. Implemented the authentication guard and authorization behavior.
4. Added tests for missing credentials, invalid signatures, expired tokens, issuer/audience validation, and role restrictions.
5. Reviewed security behavior and test coverage.
6. Verified CI before merging.
7. Documented unresolved production dependencies.

**Lessons learned:**

- Authentication and authorization require separate verification.
- Security tests should cover both allowed and denied access.
- A passing CI pipeline does not prove production readiness.
- Trusted token issuer configuration and signing-key ownership must be established before production deployment.

## 6. My Guardrails

I maintain human oversight over decisions that affect code quality, security, data, and delivery.

### Before implementation

- Confirm requirements and acceptance criteria.
- Inspect existing patterns before proposing new architecture.
- Use Plan Mode for high-impact changes.
- Review assumptions, dependencies, and risks.
- Confirm the implementation plan before allowing changes.

### During implementation

- Keep changes focused and incremental.
- Avoid unnecessary dependencies and unrelated refactoring.
- Add or update tests alongside implementation.
- Stop and reassess if new evidence contradicts the approved plan.
- Review important architectural trade-offs.

### Before delivery

- Inspect the actual Git diff.
- Run unit, integration, and E2E tests.
- Run lint, typecheck, and build.
- Review authentication, authorization, and sensitive-data handling.
- Address or document code-review findings.
- Verify CI results independently.
- Confirm documentation and release notes are updated.

### Actions requiring my explicit approval

- Git commits and pushes.
- Pull request merges.
- Deployments and releases.
- Database migrations or destructive operations.
- Changes to production configuration, secrets, or permissions.

## 7. My Quality and Security Checklist

- [ ] Requirements and acceptance criteria are satisfied.
- [ ] Implementation follows existing architecture and conventions.
- [ ] Tests cover expected behavior and important edge cases.
- [ ] No unrelated or unexpected changes exist.
- [ ] Authentication and authorization are correctly enforced.
- [ ] Sensitive data and audit requirements are handled appropriately.
- [ ] Code review findings are addressed or documented.
- [ ] CI checks pass.
- [ ] Documentation and release notes are updated.
- [ ] Human review and approval are complete.
- [ ] Production dependencies and operational ownership are confirmed before release.

## 8. Continuous Improvement

I continuously improve my workflow as I discover better prompts, skills, hooks, and automation opportunities.

Whenever a workflow proves useful:

- Capture it as a reusable prompt or skill.
- Identify repetitive steps that could be automated.
- Document failure modes and lessons learned.
- Share useful practices with the team.
- Update this playbook instead of relying on memory.

**My guiding principle: Claude accelerates engineering work, but I remain responsible for the decisions, verification, security, and quality of what gets shipped.**