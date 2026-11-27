# RMT development

RMT is an independent discovery and application launcher. Preserve the graphite/lime brand, mobile usability, free listings and claims. The current release links to external project experiences. Do not enable paid placement, checkout, holder paywalls, or execution of real trades or transfers as part of routine engineering.

## Start a task

- Read [engineering status](docs/engineering/status.md) and the applicable [architecture](docs/engineering/architecture.md), [release runbook](docs/engineering/releases.md), and subsystem documentation. Treat historical release notes as history, not current configuration.
- Record the latest successful Sites version and SHA and GitHub `main` SHA. Until the two sources are reconciled, base application changes on the verified Sites release and GitHub-collector changes on reviewed GitHub `main`. Never assume one is a deployable copy of the other.
- Use one topic branch or worktree per task. Compare against the current base again before committing, opening a PR, or publishing. Preserve concurrent changes. No force push or unattended production release. Use fixtures and isolated local storage, not production data or credentials. Follow the [Codex setup](docs/engineering/codex.md).
- Keep publication and reviewer authorization server-side. Pending applications and private contact/evidence must not appear in the catalog. Keep administrator identities and credentials in runtime secrets. Preserve original attribution and use evidence for official URLs, eligibility, and coverage.
- Applied database migrations are immutable. Keep lockfiles. Do not change hosting, permissions, secrets, production data, or financial controls unless the task explicitly authorizes the specific change. Do not use production collector endpoints or dispatch operational Actions workflows to test a branch.
- Run `npm run typecheck`, `npm test`, and `npm run build` for substantial application changes. For UI releases also run the visual acceptance checks in `docs/ui-release-checks.md` on the application source in English and Spanish on desktop and mobile. A passing build is not visual acceptance.
- Finish with the base and candidate SHA, what ran, failures or unverified paths, and the operator’s next decision. Follow the [recovery runbook](docs/engineering/recovery.md) before any schema or storage work.
