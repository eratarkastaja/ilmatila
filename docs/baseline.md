# Release baseline — 2026-11-25

This records the completed `0.3.0-beta.9` release gate. Tag `v0.3.0-beta.9`
points to commit `ed7b75d`; GitHub Actions release run `#143` completed the
staging preflight, beta deployment, and live browser smoke on 2026-11-25.

## Source and toolchain

- Repository branch: `master`; `origin/master` points to the same commit. This checkout has no branch named `main`.
- Release: `0.3.0-beta.9`, with local checks and deployed validation complete.
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

The beta9 production-build matrix passed in Chrome, Edge, Firefox, and WebKit.
The tag workflow also passed staging preflight and deployed live-site smoke,
including build identity, launch, pause/resume, return-to-menu,
repeated-launch, and terrain-package checks documented in [testing](testing.md).
Linux WebKit exercises the recoverable Pointer Lock failure path and does not
establish Apple Safari support.
