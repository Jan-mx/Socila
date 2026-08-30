# Repository Agent Instructions

## PolicyOps Agent refactor

- Read `docs/refactor/policy-ops-agent/memory-bank/README.md` and `progress.md` before doing any refactor work.
- Before changing implementation code, read the current stage PRD plus `design-document.md`, `tech-stack.md`, `architecture.md`, and `implementation-plan.md` fully.
- The user authorizes Goal-mode agents to execute and verify all stages autonomously. Execute one implementation-plan step at a time; after fresh verification passes, continue automatically.
- Do not repeat steps already supported by valid evidence in `progress.md`.
- Update `progress.md` after every step. Update `architecture.md` whenever components, data ownership, interfaces, deployment, or important file responsibilities change. Record major decisions with an ADR.
- Complete every stage Definition of Done and create an acceptance report before committing.
- Create one commit per accepted stage using `英文行为: 中文简短总结`, then push the stage branch. Do not create a PR or merge `main` automatically.
- Before committing, inspect the full staged diff and scan candidate files for credentials, private keys, production data, and generated dependency directories.
- Never commit `docs/refactor/policy-ops-agent/config/*.local.env`, any API key, production backup, or user data.
- Stop and request user authority for production migrations, write freezes, entry/DNS switches, destructive actions, secret rotation, or policy meaning that cannot be derived from authoritative sources.
- Do not lower tests, schema rules, citation requirements, security controls, or acceptance thresholds to make a stage pass.
- Use `docs/refactor/policy-ops-agent/memory-bank/agent-prompts.md` for autonomous, specialist, recovery, and final-review tasks.
