# Verified baseline — 2026-10-15

This records the verified beta baseline for the 0.3 release line.

## Source and toolchain

- Repository branch: `master`; `origin/master` points to the same commit. This checkout has no branch named `main`.
- Release: `0.3.0-beta.1`, validated through the master, staging, and beta GitHub Actions paths.
- Node.js: `v20.19.2`; npm CLI: `10.8.2`.
- The environment did not have `npm` on `PATH`, so the npm CLI was fetched to `/tmp` and used there. No package manager files or application dependencies were changed by this workaround.

## Automated checks

| Command | Result |
| --- | --- |
| `npm ci` | Passed; 156 packages installed, 0 vulnerabilities reported. npm noted that 42 packages accept funding. |
| `npm run lint` | Passed; no warnings. |
| `npm test` | Passed in the release pipeline. |
| `npm run build` | Passed; Vite 7.3.6 transformed 79 modules and built in 20.90 seconds; no warnings. |

## Production browser smoke

The release pipeline served the production build and exercised it in the Chrome, Edge, Firefox, and WebKit matrix:

- The mission menu opened and Training could be selected.
- A Training sortie started.
- Pressing P opened pause; Resume returned to flight and reacquired pointer lock on the canvas.
- Returning to mission selection worked.
- Combat Air Patrol started from the menu.
- After returning to the menu again, another sortie started without reloading the page (one top-level navigation total).
- No browser console errors, uncaught page errors, or failed requests were observed.

No release-blocking failures remained in the verified baseline.
