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
| GitHub Actions validation | Passed on candidate commit `8b5dbe9` (run [37317010452](https://github.com/eratarkastaja/ilmatila/actions/runs/37317010452)): clean install, lint, unit/integration tests, and the four-project browser matrix. |
| Staging deploy and URL smoke | Passed (run [37323452795](https://github.com/eratarkastaja/ilmatila/actions/runs/37323452795)). The deployed identity matched `8b5dbe9`; the four-project browser matrix passed against `/staging/` in 16m 13s. |
| Beta deploy and public URL smoke | Passed (run [37327450294](https://github.com/eratarkastaja/ilmatila/actions/runs/37327450294)). Staging preflight passed in 17m 37s, the beta was deployed to the root URL, and the same browser matrix passed against the public URL in 13m 58s. Root `build-info.json` reports version `0.2.0-beta.1` and commit `8b5dbe9e73499809f7d728d11acdf1ffd8ee2bde`. |

The verified browser journeys produced no uncaught page or browser-console errors. The CI runner emitted a benign `ubuntu-latest` image migration notice for October 19, 2026. Local Playwright also reported that `NO_COLOR` was ignored because `FORCE_COLOR` is set in the shell; neither notice affected the checks. Safari on macOS remains unverified, and touch/mobile is unsupported; see the [known issues and supported browsers](../README.md#supported-platforms-and-browsers).

## Deployment gates

The Pages workflow keeps `master` pushes validation-only. The manual `staging` target preserves the current live root and publishes the candidate at <https://eratarkastaja.github.io/ilmatila/staging/>. After its deployed smoke passes, the manual `beta` target runs a staging preflight for the same commit, deploys the beta at <https://eratarkastaja.github.io/ilmatila/>, and runs the same matrix against the public URL. Both deployment targets completed successfully for `0.2.0-beta.1`.

The first staging attempt exposed a workflow condition bug that skipped its post-deploy smoke when the staging preflight job was skipped. The workflow now checks the deploy result explicitly with `always()`; the successful staging run above confirms the post-deploy smoke executes.
