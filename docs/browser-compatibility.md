# Desktop browser compatibility

## Test run

The `0.2.0-beta.1` production build was served with Vite Preview on Debian Linux on 2026-10-05. Playwright 1.63.0 drove actual browser binaries against the Päijänne terrain assets and aircraft GLBs; no browser implementations were mocked in the passing runs.

| Browser project | Browser build | Result |
| --- | --- | --- |
| Google Chrome | 154.0.8037.97 | Passed the full journey, including Training, Patrol combat, Intercept, Support, and repeated launches. |
| Microsoft Edge | 154.0.4258.53 | Passed the full two-sortie journey and browser UI/error smokes. |
| Firefox | Playwright Firefox 155.0 | Passed the full two-sortie journey and browser UI/error smokes. |
| WebKit | Playwright WebKit 26.6 (Linux WPE) | WebGL2 and startup UI passed. Headless Pointer Lock was denied; the launch error, Retry, and Return to menu path passed. Full flight was skipped. |
| Apple Safari | Not available on Linux | Not tested. Do not treat Safari as verified until the matrix runs on macOS. |

The machine also has Firefox ESR 140.12 installed, but Playwright used its Firefox 155 browser build. The ESR executable was not driven by this test run.

## Exercised behavior

The RC rerun passed 13 tests with 7 intentional skips. The Chrome, Edge, and Firefox journeys checked startup, a WebGL2 context, audio unlock after a user gesture, Pointer Lock acquisition and release, mouse-driven heading changes, keyboard input, Escape, P pause/resume, viewport resize, switching to a second browser tab and back, terrain and aircraft responses, Patrol gun fire, return to menu, and another launch without a page reload. The Chrome journey also launched every mission type: Training, Patrol, Intercept, and Support. Eight additional version/UI checks passed in all four Playwright browser projects.

The Pages-style `/staging/` composition also passed the full Chrome journey against the locally served candidate path while retaining the current live root and its hashed bundles.

All local terrain and aircraft requests returned successfully in the full journey. Page exceptions and browser console errors failed the tests; none were observed in the passing Chrome, Edge, or Firefox runs.

Playwright-driven tabs report both documents as focused and visible after `bringToFront` in this environment. The test performs the browser tab switch and verifies that the sortie survives it, but automation does not expose OS window blur/visibility transitions here. `tests/integration/main-session.test.js` separately covers input clearing on blur with its browser event harness. A headed tester should include a real OS window/tab switch before release.

## Known issues and support status

- **Chrome:** No P0/P1 issue observed in this run.
- **Edge:** No P0/P1 issue observed in this run.
- **Firefox:** No P0/P1 issue observed in the Playwright Firefox build. The installed system Firefox ESR build was not tested.
- **Safari:** Unverified because this Linux environment cannot run Apple Safari. Keep it outside the verified beta browser list until a macOS run completes.
- **Linux Playwright WebKit:** Its headless WPE build exposes the Pointer Lock API but does not grant capture. The app presents the localized launch error and keeps the menu usable; this result does not establish Apple Safari behavior.
- **Playwright bundled Chromium:** Its headless shell did not produce a heading change for the scripted mouse move, while the actual Chrome 154, Edge 154, and Firefox 155 projects did. The bundled shell is not a target beta browser, so the CI matrix tests branded Chrome and Edge directly instead of treating that shell as their substitute.

The CI browser job installs Chrome, Edge, Firefox, and WebKit and runs these production-build tests. The GitHub Actions workflow itself was not triggered during this local test run.
