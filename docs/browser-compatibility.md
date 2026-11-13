# Desktop browser compatibility

## Beta8 release-gate run

The `0.3.0-beta.8` release uses the production browser matrix in the Pages
workflow. Playwright 1.63.0 drives actual browser binaries against the
Päijänne terrain assets and aircraft GLBs; the beta8 release-gate result is
pending.

| Browser project | Browser build | Result |
| --- | --- | --- |
| Google Chrome | Release-gate run pending | — |
| Microsoft Edge | Release-gate run pending | — |
| Firefox | Release-gate run pending | — |
| WebKit | Release-gate run pending | — |
| Apple Safari | Not available on Linux | Not tested. Do not treat Safari as verified until the matrix runs on macOS. |

The machine also has Firefox ESR 140.12 installed, but Playwright used its Firefox 155 browser build. The ESR executable was not driven by this test run.

## Exercised behavior

The beta8 browser smoke will check startup, a WebGL2 context, audio unlock
after a user gesture, Pointer Lock acquisition and release, mouse-driven
heading changes, keyboard input, Escape, P pause/resume, viewport resize,
switching to a second browser tab and back, terrain and aircraft responses,
Patrol gun fire, return to menu, and another launch without a page reload. The
Chrome journey also launches every mission type: Training, Patrol, Intercept,
and Support. It also verifies the representative files of every published
terrain package.

Playwright-driven tabs report both documents as focused and visible after `bringToFront` in this environment. The test performs the browser tab switch and verifies that the sortie survives it, but automation does not expose OS window blur/visibility transitions here. `tests/integration/main-session.test.js` separately covers input clearing on blur with its browser event harness. A headed tester can include a real OS window/tab switch when validating a browser/platform combination that is not covered by automation.

## Known issues and support status

- **Chrome:** Beta8 release-gate result pending.
- **Edge:** Beta8 release-gate result pending.
- **Firefox:** Beta8 release-gate result pending. The installed system Firefox ESR build is not part of the Playwright matrix.
- **Safari:** Unverified because this Linux environment cannot run Apple Safari. Keep it outside the verified beta browser list until a macOS run completes.
- **Linux Playwright WebKit:** Its headless WPE build exposes the Pointer Lock API but does not grant capture. The app presents the localized launch error and keeps the menu usable; this result does not establish Apple Safari behavior.
- **Playwright bundled Chromium:** Its headless shell did not produce a heading change for the scripted mouse move, while the actual Chrome 154, Edge 154, and Firefox 155 projects did. The bundled shell is not a target beta browser, so the CI matrix tests branded Chrome and Edge directly instead of treating that shell as their substitute.

The CI browser job installs Chrome, Edge, Firefox, and WebKit and runs these
production-build tests. The release workflow also validates the deployed
staging path before the beta tag is allowed to update the live Pages site.
