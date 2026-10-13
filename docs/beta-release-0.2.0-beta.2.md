# ILMATILA beta 0.2.0-beta.2

## Release scope

This beta contains the completed campaign layer and the associated combat,
mission-menu, weather, time-of-day, night-vision, HUD, radio, wingman, and
debrief implementations. The campaign **Shadow at the Border** contains ten
playable chapters with deterministic retries, per-difficulty persistence,
campaign-state effects, limited sustainment choices, optional objectives, and
accept/retry debrief handling.

The release also contains the long-range ingress and staging behavior, varied
formation bearings and stand-off distances, readable contact and missile
warning sequences, wingman orders, active wingman weapon use, tactical
difficulty differences, dynamic weather and local time, menu time-of-day
preview, night-vision scene treatment, and the associated cleanup and
regression coverage.

The public game remains a desktop WebGL 2 beta. Touch and mobile devices are
unsupported, and Apple Safari is outside the verified browser list until a
macOS browser run is available. The supported-browser details and limitations
are in [browser compatibility](browser-compatibility.md).

## Release validation

The release worktree passes the repository checks below:

| Check | Result |
| --- | --- |
| Unit and integration tests | Passed: 323 tests in 58 files. |
| ESLint | Passed. |
| Production build | Passed. |
| Production browser smoke | Run with `npm run test:e2e`; the result is recorded by the release workflow. |
| Pages deployment | The `v0.2.0-beta.2` tag runs quality, production browser smoke, staging preflight, Pages deployment, and the deployed beta smoke in `.github/workflows/pages.yml`. |

The Pages workflow downloads and verifies the terrain release before its build,
checks the deployed build identity, and runs the same production browser matrix
against the public URL after deployment. A beta tag is deployable only when
the staging preflight succeeds.

## Version identity

The application version is read from `package.json`; `package-lock.json`, the
menu, startup error screen, diagnostics, and this release note use the same
`0.2.0-beta.2` version. The public Pages build writes its source commit and
version to `build-info.json` for deployed-smoke verification.

## Supported content

The standalone menu contains Combat Air Patrol, Intercept Flight, Close Air
Support, and Training. Production campaign play follows the ten authored
chapters; development mode exposes a chapter selector and campaign time
override for testing. Standalone players can choose the sortie starting time in
the normal menu. English and Finnish UI strings cover the release surface.

The scenario is fictional. Aircraft, terrain, audio, fonts, and source-code
licenses are documented in [assets and licensing](assets-and-licensing.md) and
the in-game Assets & Licenses panel.
