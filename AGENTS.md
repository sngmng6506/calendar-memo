# Agent Contribution Policy

Daymark Ops Console is an Electron-first desktop app. The active product direction is a terminal-style calendar dashboard with future pages for signals, logs, and later AI.

This file applies to every coding agent working in this repository.

## Product rules

- Keep changes small and directly tied to the request.
- Preserve the terminal dashboard direction unless the user explicitly pivots again.
- Do not reintroduce Python/Tkinter UI paths.
- Do not add AI features until the base UX and extension pages are stable.
- Keep new product areas as separate pages in the `web/app.js` page registry.
- Do not commit unless the user explicitly asks.

## Commit boundaries

Each commit must represent exactly one logical change.

- Separate behavior changes, refactors, tests, documentation, CI, and dependency changes unless they are inseparable parts of the same decision.
- Use partial staging when a working tree contains more than one logical change.
- Do not create catch-all commits such as `update files`, `misc fixes`, or `cleanup`.
- A commit must be independently reviewable and leave the repository in a valid state.
- Before committing, inspect the staged diff and split it again when the title cannot precisely describe the entire diff.

## Required commit message

Every non-merge commit must use this structure:

```text
<concise summary of one logical change>

Why:
- <the problem, risk, or user need that made the change necessary>

Decision:
- <the chosen implementation and the important trade-off or rejected alternative>

Verification:
- <tests or checks performed; optional but strongly recommended>
```

`Why` and `Decision` must contain concrete, repository-specific reasoning. Placeholder text such as `TBD`, `N/A`, `none`, or a restatement of the title is invalid.

## Mandatory workflow

1. Read the relevant code and documentation before editing.
2. Plan the logical commit units before making commits.
3. Implement and verify one unit at a time.
4. Review `git diff --staged` before every commit.
5. Use the repository commit template; do not submit a one-line commit message.
6. Never use `--no-verify` to bypass the commit hook.
7. Run `npm run verify` before opening or updating a pull request.
8. Ensure the PR commit-policy CI check passes before merge.

`npm install` configures `.gitmessage` and `.githooks/commit-msg` automatically. To repair a local setup manually, run:

```powershell
npm run setup:git
```

## Verification

```powershell
npm run verify
```

For local launch:

```powershell
npm run start
```

For the Windows desktop helper after the .NET SDK is installed:

```powershell
npm run build:desktop-host
```

## Commit example

```text
fix: preserve newer local tasks during deletion sync

Why:
- An older remote tombstone could delete a task that had been edited more recently on another device.

Decision:
- Compare the local record timestamp with deletedAt and apply the tombstone only when the deletion is not older than the local edit.

Verification:
- Added conflict tests for both stale and newer tombstones.
```
