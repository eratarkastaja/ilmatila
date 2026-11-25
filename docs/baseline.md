# Release baseline — 2026-11-25

This records the `0.3.0-beta.9` release candidate prepared on `master`. The
local checks are complete; the Pages staging and beta workflows are the
authoritative deployed release gate.

## Source and toolchain

- Repository branch: `master`; `origin/master` points to the same commit. This checkout has no branch named `main`.
- Release: `0.3.0-beta.9`, with local checks complete and deployed validation gated by the release workflow.
- Local Node.js: `v20.19.2`; the release jobs use Node.js 22 and install with `npm ci`.
- Local verification uses the npm CLI supplied through Corepack. No package manager files or application dependencies were changed by that setup.

## Automated checks

| Command | Result |
| --- | --- |
| `npm ci` | Passed in the beta8 release quality and browser jobs. |
| `npm run lint` | Passed locally; no warnings. |
| `npm test` | Passed locally with 412 tests. |
| `npm run build` | Passed locally; Vite transformed 100 modules with no warnings. |

## Production browser smoke

The beta9 production-build matrix is run by the Pages workflow in Chrome,
Edge, Firefox, and WebKit. The workflow also performs staging preflight and
deployed live-site smoke before the beta tag is considered complete, including
build-identity, launch, pause/resume, return-to-menu, repeated-launch, and
terrain-package checks documented in [testing](testing.md). Linux WebKit
exercises the recoverable Pointer Lock failure path and does not establish
Apple Safari support.
