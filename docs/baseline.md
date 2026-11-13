# Release candidate baseline — 2026-11-13

This records the `0.3.0-beta.8` release candidate. The GitHub Actions staging
and tagged beta browser evidence is added after the release gate completes.

## Source and toolchain

- Repository branch: `master`; `origin/master` points to the same commit. This checkout has no branch named `main`.
- Release: `0.3.0-beta.8`, with local checks complete and deployed browser validation pending.
- Local Node.js: `v20.19.2`; the release jobs use Node.js 22 and install with `npm ci`.
- Local verification uses the npm CLI supplied through Corepack. No package manager files or application dependencies were changed by that setup.

## Automated checks

| Command | Result |
| --- | --- |
| `npm ci` | Pending the beta8 release quality job. |
| `npm run lint` | Passed locally; no warnings. |
| `npm test` | Passed locally with 397 tests. |
| `npm run build` | Passed locally; Vite 7.3.6 transformed 98 modules with no warnings. |

## Production browser smoke

The beta8 staging and tagged beta browser matrix is pending. It must exercise
the production build in Chrome, Edge, Firefox, and WebKit, including the
launch, pause/resume, RTB, return-to-menu, repeated-launch, and terrain-package
checks documented in [testing](testing.md).
