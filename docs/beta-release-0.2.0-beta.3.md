# ILMATILA beta 0.2.0-beta.3

## Release scope

This beta expands the campaign into a consequence-driven ten-sortie arc. A
mission can now end in a decisive success, ordinary success, recovered setback,
or aircraft/pilot loss, with accepted setbacks allowing the campaign to
continue. Campaign metrics, flags, mission history, stores, support choices,
and objective-specific outcomes now feed later briefings and mission
resolution.

The mission menu has been reorganized around a readable campaign briefing and
standalone sortie setup. Kit selection is available in both modes with
recommended and custom loadouts, fuel planning, weapon-station and mass
limits, aircraft-weight handling, and support forecasts. Standalone sorties
retain their own area, weather, and time controls; campaign chapters use their
authored operational conditions.

The release also adds objective waypoint guidance for ground objectives,
improves campaign history and debrief detail, hides nonessential menu panels
behind dialogs, fixes the low-altitude cloud presentation, and gives the menu
and modal scrollbars a themed visual treatment.

## Release validation

The release workflow validates the following before deploying the beta:

| Check | Result |
| --- | --- |
| Unit and integration tests | Recorded by the release workflow. |
| ESLint | Recorded by the release workflow. |
| Production build | Recorded by the release workflow. |
| Production browser smoke | Chrome, Edge, Firefox, and WebKit matrix in GitHub Actions. |
| Staging preflight | Deployed build identity and browser smoke before beta promotion. |
| Pages deployment | The `v0.2.0-beta.3` tag runs the complete beta pipeline. |

The Pages workflow downloads and verifies the terrain release before its build,
checks the deployed build identity, and runs the production browser matrix
against the public URL after deployment.

## Version identity

The application version is read from `package.json`; `package-lock.json`, the
menu, startup error screen, diagnostics, and this release note use the same
`0.2.0-beta.3` version. The public Pages build writes its source commit and
version to `build-info.json` for deployed-smoke verification.

The scenario remains fictional and the public game remains a desktop WebGL 2
beta. Touch and mobile devices are unsupported, and Apple Safari remains
outside the verified browser list until a macOS smoke run is available.
