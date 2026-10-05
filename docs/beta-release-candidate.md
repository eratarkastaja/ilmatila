# Beta release candidate 0.2.0-beta.1

## Release scope

This is a release candidate for the existing game and beta-hardening work. No additional gameplay feature is included in this version bump. The app displays its version from `package.json`; `package-lock.json` and the README are kept in sync.

Supported beta targets and known limitations are listed in the [README](../README.md) and detailed in the [browser compatibility report](browser-compatibility.md).

## Validation

Run against the release-candidate worktree on 2026-10-05:

| Check | Result |
| --- | --- |
| Clean install (`npm ci`) | Passed with npm 10.8.2 on Node 20.19.2. |
| Lint | Passed. |
| Unit and integration tests | Passed: 252 tests in 51 files. |
| Production build | Passed. |
| Production browser E2E | Passed: 13 passed, 7 intentional skips across Chrome, Edge, Firefox, and Linux WebKit. The full run took 19.2 minutes with SwiftShader. |
| Version UI smoke | Passed: 8 checks across all 4 browser projects; menu and startup-error screens show the package version. |
| GitHub Actions CI | First `quality` run passed. The first browser run found that headless Firefox on the GPU-less runner needed software WebGL 2 explicitly enabled; this is fixed in the Playwright-only profile and awaiting rerun. No Pages deploy occurred. |
| Staging package and smoke | Passed locally: preserved the current Pages root, served the candidate at `/staging/`, verified the build commit, and passed the full Chrome journey (10.6 minutes). Remote Pages deployment and four-browser staging smoke remain pending. |
| Beta deploy and public smoke | Pending staging sign-off. |

The full browser run produced no uncaught page or browser-console errors in the verified browser journeys. Playwright reported that `NO_COLOR` was ignored because `FORCE_COLOR` is set in this shell; this did not affect the run.

## Deployment gates

The Pages workflow now keeps `master` pushes validation-only. Its manual `staging` target preserves the current live root and publishes this candidate at <https://eratarkastaja.github.io/ilmatila/staging/>. A `v*` tag is accepted only if that exact commit is already at staging and the full browser matrix passes there; the workflow then publishes the beta at <https://eratarkastaja.github.io/ilmatila/> and runs the same matrix again. These remote deploy jobs remain pending until the workflow is run.
