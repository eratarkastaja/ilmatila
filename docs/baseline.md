# 0.4.0-beta.1 release baseline — 2026-11-26

The implementation work started from commit `1ca1e33` (`docs: record beta9
release gate`) with a clean worktree. Node.js was `v20.19.2`, npm was invoked
through `/home/kusivelho/.nvm/versions/node/v22.21.0/bin/npm`, and the lockfile
was present. `npm ci` completed successfully in 6 seconds. The baseline unit
suite passed with 70 files and 412 tests in 19.07 seconds; lint passed; and the
production build passed after transforming 100 modules in 23.46 seconds.
The implementation result passed 70 files and 421 tests in 16.82 seconds,
lint, and the production build after transforming 100 modules in 8.96 seconds.
The final browser matrix ran for 53.1 seconds: Firefox passed 3 tests, while
Chrome and Edge binaries were absent and WebKit lacked host libraries. Six
tests were skipped by project conditions.

The initial install reported six npm audit findings (five moderate, one high).
The security follow-up updated the locked development toolchain and a final
audit reports zero vulnerabilities. The baseline findings addressed by this pass
were temporary campaign persistence during development/replay, retry consuming
readiness/support, loadout scaling after kit selection, briefing/flying reserve
divergence, and the missing distinct StormBreaker profile.

- Release: `0.4.0-beta.1`; tag `v0.4.0-beta.1` points to `3616d1c`.
  GitHub Actions master quality/browser smoke passed in `45849738703`, staging
  deployment and live smoke passed in `45852843755`, and beta deployment/live
  smoke passed in `45859570358`. The live `build-info.json` reports version
  `0.4.0-beta.1` and deployed commit `f3772503c1f1d361222267346b680e2b34951900`.

## Historical beta9 release gate

This records the completed `0.3.0-beta.9` release gate. Tag `v0.3.0-beta.9`
points to commit `ed7b75d`; GitHub Actions release run `#143` completed the
staging preflight, beta deployment, and live browser smoke on 2026-11-25.

## 0.4.0-beta.1 release gate

The release tag was published after the local checks passed. The Pages workflow
first validated the corrected master build in staging, then ran the beta
deployment and the deployed live smoke. The tag identifies the release content;
the final Pages deployment also includes the post-tag workflow and test-runner
stabilization commits, without changing the application behavior or version.

## Source and toolchain

- Repository branch: `master`; `origin/master` points to the same commit. This checkout has no branch named `main`.
- Release: `0.4.0-beta.1`, with local checks and deployed validation complete.
- Local Node.js: `v20.19.2`; the release jobs use Node.js 22 and install with `npm ci`.
- Local verification uses the npm CLI supplied through Corepack. No package manager files or application dependencies were changed by that setup.

## Automated checks

| Command | Result |
| --- | --- |
| `npm ci` | Passed locally in 5 seconds after the security lockfile update. |
| `npm audit` | Passed with 0 vulnerabilities after the lockfile update. |
| `npm run lint` | Passed locally; no warnings. |
| `npm test` | Passed locally with 421 tests in 16.82 seconds. |
| `npm run build` | Passed locally in 8.96 seconds; Vite transformed 100 modules with no warnings. |

## Production browser smoke

The historical beta9 production-build matrix passed in Chrome, Edge, Firefox,
and WebKit. The implementation-pass matrix could only launch Firefox locally;
Chrome/Edge executables and WebKit host libraries were unavailable. Linux
WebKit therefore remains an environment-blocked check here and does not
establish Apple Safari support. The historical tag workflow still records its
separate staging and deployed-site smoke in the release section above.
