# Verified baseline — 2026-10-16

This records the verified beta baseline for the 0.3 release line.

## Source and toolchain

- Repository branch: `master`; `origin/master` points to the same commit. This checkout has no branch named `main`.
- Release: `0.3.0-beta.7`, validated through the master, staging, and beta GitHub Actions paths.
- Local Node.js: `v20.19.2`; the release jobs use Node.js 22 and install with `npm ci`.
- Local verification uses the npm CLI supplied through Corepack. No package manager files or application dependencies were changed by that setup.

## Automated checks

| Command | Result |
| --- | --- |
| `npm ci` | Passed in the release quality job. |
| `npm run lint` | Passed; no warnings. |
| `npm test` | Passed locally with 394 tests; the beta7 release pipeline must pass the same suite. |
| `npm run build` | Passed; Vite 7.3.6 transformed 98 modules and built in 9.86 seconds locally; no warnings. |

## Production browser smoke

The beta7 release pipeline served the production build and exercised it in the Chrome, Edge, Firefox, and WebKit matrix:

- The mission menu opened and Training could be selected.
- A Training sortie started.
- Pressing P opened pause; Resume returned to flight and reacquired pointer lock on the canvas.
- Returning to mission selection worked.
- Combat Air Patrol started from the menu.
- After returning to the menu again, another sortie started without reloading the page (one top-level navigation total).
- No browser console errors, uncaught page errors, or failed requests were observed.

The staging candidate and tagged beta deployment both passed their deployed smoke gates. No release-blocking failures remained in the verified baseline.
