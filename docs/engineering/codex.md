# Isolated Codex workflow

## Set up once

Use the current Codex Cloud experience, subject to account and workspace availability. In ChatGPT on the web or desktop, select **Work in → Cloud**, then **Create environment** to reuse settings for RMT. Connect GitHub and select only `LandoCrissian/RMT`. Use the default Cloud environment for a one-off task if it is available. Save a reusable **RMT Engineering** environment after reviewing the setup report.

- Use **Node 24**, at least **24.12.0**, and `npm run install:ci` from the repository root. Use registry access only as needed for dependencies. Start without production secrets, outbound workload identity, deployment credentials, or service bindings.
- Until source reconciliation is explicitly approved, GitHub Cloud can work on GitHub-based tasks and this documentation only. Do not assume GitHub main contains release 131. For production application tasks use an isolated worktree based on the latest verified Sites source in an authorized Sites checkout, or wait for the reviewed reconciliation. Do not copy Site write credentials to Cloud.
- In the ChatGPT iOS app, open **Codex → Cloud**, choose the environment, and start or continue the task. A Cloud task does not need the Legion online. **Remote** is a different option and needs a paired, awake computer. Verify that the Cloud picker is available on the owner’s account before treating mobile as ready.

## Run each task

1. Specify the repository, branch and base SHA, the task boundary and what not to touch. Use a new topic branch or a new isolated cloud task. Do not point a dev preview or test harness at live storage. Use the existing isolated Worker/fixtures in `tests/browser/` when relevant.
2. Run the checks below for application changes. Before opening a PR, report current pins, changed files, test results, and unverified items. App changes are not accepted merely because the Docs PR or GitHub’s older code passed. Use [release acceptance](releases.md) for browser and migration criteria.

   ```sh
   npm run install:ci
   npm run typecheck
   npm test
   npm run build
   git diff --check
   ```

3. Review the diff from the phone or GitHub. A PR is not a deploy. No merge into either production-linked branch, production dispatch, deploy, financial execution, or access change is part of the test task.

First phone task: “Open the Foundation review branch, report the GitHub base and current Sites source pins from the repository notes, run `git diff --check` against the stated base, and show the changed files. Do not edit, merge, deploy or dispatch workflows.” A follow-up clean Cloud install/build on the reconciled source is the application-readiness test.

[OpenAI Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments) · [Codex on mobile](https://learn.chatgpt.com/docs/mobile) · [Codex plan availability](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan).
