# Desktop browser compatibility

## Local implementation-pass run — 2026-11-26

Command: `PATH=/home/kusivelho/.nvm/versions/node/v22.21.0/bin:$PATH npm run test:e2e`.
The production build passed before Playwright started. Firefox passed the three
available tests that were not skipped. Chrome and Edge could not launch because
their branded executables were absent (`/opt/google/chrome/chrome` and
`/opt/microsoft/msedge/msedge`). WebKit could not launch because the host lacks
`libmanette-0.2.so.0` and `libenchant-2.so.2`. This is an environment-blocked
local run, not a product failure or a Safari result.

## 0.4.0-beta.1 release candidate

The `0.4.0-beta.1` release uses the Pages workflow for final validation. The
master quality and browser-smoke run `45849738703`, staging deployment and
staging smoke run `45852843755`, and beta deployment/live-smoke run
`45859570358` all passed. The deployed root reports version `0.4.0-beta.1`
and commit `f3772503c1f1d361222267346b680e2b34951900`.

| Browser project | Release-gate result |
| --- | --- |
| Google Chrome | Passed in CI, including the full interactive input journey |
| Microsoft Edge | Passed in CI, including the full interactive input journey |
| Firefox | Launch, WebGL, accessibility, and recoverable paths passed; the full synthetic Pointer Lock journey is isolated because the hosted runner intermittently drops its input |
| WebKit | Recoverable compatibility path passed in CI; Pointer Lock is unavailable in Linux headless WebKit |
| Apple Safari | Not available on Linux; not tested |

The local environment still cannot launch Chrome or Edge and lacks WebKit host
libraries. Human campaign completion and Apple Safari remain unverified.

## 0.3.0-beta.9 release-gate run

The `0.3.0-beta.9` release uses the production browser matrix in the Pages
workflow. Playwright drives actual browser binaries against the packaged
terrain assets and aircraft GLBs. The staging and deployed beta results passed
in workflow run `#143` for tag `v0.3.0-beta.9` on 2026-11-25.

| Browser project | Browser build | Result |
| --- | --- | --- |
| Google Chrome | CI-installed stable Chrome | Passed |
| Microsoft Edge | CI-installed stable Edge | Passed |
| Firefox | Playwright Firefox | Passed |
| WebKit | Playwright Linux WebKit | Passed the recoverable compatibility path; Pointer Lock may be unavailable |
| Apple Safari | Not available on Linux | Not tested. Do not treat Safari as verified until the matrix runs on macOS. |

The beta9 candidate includes the radar workload reduction for dense ground
contact scenes. The browser gate verifies the production build and the same
launch, input, pause/resume, return-to-menu, repeated-launch, and terrain
package journeys used by prior beta releases.

## Beta8 release-gate run

The `0.3.0-beta.8` release uses the production browser matrix in the Pages
workflow. Playwright 1.63.0 drives actual browser binaries against the
Päijänne terrain assets and aircraft GLBs. The follow-up beta8 release-gate
run for commit `06b98dd` passed on 2026-11-14, including staging and deployed
live-site smoke.

| Browser project | Browser build | Result |
| --- | --- | --- |
| Google Chrome | 154.0.8037.97 | Passed |
| Microsoft Edge | 154.0.4258.53 | Passed |
| Firefox | Playwright Firefox 155 | Passed |
| WebKit | Playwright 1.63 Linux WebKit | Passed the recoverable compatibility path; Pointer Lock was not granted |
| Apple Safari | Not available on Linux | Not tested. Do not treat Safari as verified until the matrix runs on macOS. |

The machine also has Firefox ESR 140.12 installed, but Playwright used its Firefox 155 browser build. The ESR executable was not driven by this test run.

## Exercised behavior

The beta8 browser smoke checked startup, a WebGL2 context, audio unlock
after a user gesture, Pointer Lock acquisition and release, mouse-driven
heading changes, keyboard input, Escape, P pause/resume, viewport resize,
switching to a second browser tab and back, terrain and aircraft responses,
Patrol gun fire, return to menu, and another launch without a page reload. The
Chrome journey also launches every mission type: Training, Patrol, Intercept,
and Support. It also verifies the representative files of every published
terrain package.

Playwright-driven tabs report both documents as focused and visible after `bringToFront` in this environment. The test performs the browser tab switch and verifies that the sortie survives it, but automation does not expose OS window blur/visibility transitions here. `tests/integration/main-session.test.js` separately covers input clearing on blur with its browser event harness. A headed tester can include a real OS window/tab switch when validating a browser/platform combination that is not covered by automation.

## Known issues and support status

- **Chrome:** Passed the beta8 production, staging, and deployed-site journeys.
- **Edge:** Passed the beta8 production, staging, and deployed-site journeys.
- **Firefox:** Passed the beta8 production, staging, and deployed-site journeys. The installed system Firefox ESR build is not part of the Playwright matrix.
- **Safari:** Unverified because this Linux environment cannot run Apple Safari. Keep it outside the verified beta browser list until a macOS run completes.
- **Linux Playwright WebKit:** Its headless WPE build exposes the Pointer Lock API but does not grant capture. The app presents the localized launch error and keeps the menu usable; this result does not establish Apple Safari behavior.
- **Playwright bundled Chromium:** Its headless shell did not produce a heading change for the scripted mouse move, while the actual Chrome 154, Edge 154, and Firefox 155 projects did. The bundled shell is not a target beta browser, so the CI matrix tests branded Chrome and Edge directly instead of treating that shell as their substitute.

The CI browser job installs Chrome, Edge, Firefox, and WebKit and runs these
production-build tests. The release workflow also validates the deployed
staging path before a tag or manually dispatched beta release may update the
live Pages site.
