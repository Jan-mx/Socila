# Repository Agent Instructions

## PolicyOps Agent refactor

- Before PolicyOps work, read `docs/refactor/policy-ops-agent/README.md` and `PROGRESS.md`.
- Follow the README routing table and read only the active PRD or Work Item plus the relevant `ARCHITECTURE.md`, `TESTING.md`, or `OPERATIONS.md`.
- Do not read `reports/` or `archive/` wholesale. Open only the evidence needed for the current task.
- Classify work before implementation: small bugs/internal refactors use an existing requirement; medium tasks use a Work Item; large features use a Feature or Stage PRD.
- Before implementing a feature or bug fix, derive tests from requirement and acceptance IDs, add or update the smallest relevant tests first, and confirm the missing behavior fails before implementation when a meaningful Red phase is possible.
- After implementation, run targeted tests, the affected module suite, and applicable project gates. Existing passing tests do not replace dedicated coverage for new behavior.
- Record actual implementation and test paths in `docs/refactor/policy-ops-agent/reports/traceability.md`; record execution results only in `PROGRESS.md` or an acceptance report.
- TDD skills may guide execution but are not project facts; repository PRDs, Work Items, tests, reports, and Git history are authoritative.
- Update `PROGRESS.md` after every accepted task. Update `ARCHITECTURE.md` when components, ownership, interfaces, deployment, or important file responsibilities change. Record major decisions with an ADR.
- Set affected README files to `Updating` during work. After fresh acceptance, synchronize them to `Active`, `Superseded`, or `Archived` and update the date; never leave a completed task at `Draft` or `Updating`.
- Complete the active PRD or Work Item Definition of Done and create acceptance evidence before committing.
- Create one commit per accepted task using `英文行为: 中文简短总结`, then push its selected upstream branch. Do not create a PR or merge `main` automatically.
- Before committing, inspect the full staged diff and scan candidate files for credentials, private keys, production data, and generated dependency directories.
- Never commit `docs/**/config/*.local.env`, any API key, production backup, or user data.
- Stop and request user authority for production migrations, write freezes, entry/DNS switches, destructive actions, secret rotation, or policy meaning that cannot be derived from authoritative sources.
- Do not lower tests, schema rules, citation requirements, security controls, or acceptance thresholds to make a task pass.
