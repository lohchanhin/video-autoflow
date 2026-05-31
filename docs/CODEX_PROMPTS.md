# CODEX_PROMPTS.md

## Generate Module Prompt

Read `AGENTS.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, and relevant docs before making changes.

Implement the requested module only.

Requirements:
- Do not change unrelated modules.
- Add tests.
- Use provider interfaces for external APIs.
- Mock external paid APIs.
- Run type-check, lint, and relevant tests.

Summarize:
- Files changed.
- Tests added.
- Assumptions.
- Remaining risks.

## Review Prompt

Review this branch against main.

Check:
1. Security issues.
2. Secret leakage.
3. Incorrect external API usage.
4. Missing cost logging.
5. Missing job status updates.
6. Missing tests.
7. Race conditions in workers.
8. Broken retry logic.
9. Upload privacy risk.

Return actionable issues only.

## Worker Prompt

Implement the worker for `[worker-name]`.

Requirements:
- Consume jobs from BullMQ.
- Validate input.
- Load job from database.
- Call the correct provider interface.
- Store output asset or document.
- Log cost if provider call occurs.
- Update job status.
- Handle errors.
- Support retry.
- Add tests with mocked provider.
