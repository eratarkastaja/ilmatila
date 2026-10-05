# Verified baseline — 2026-10-05

This records the starting point checked before sprint changes.

## Source and toolchain

- Repository branch: `master`; `origin/master` points to the same commit. This checkout has no branch named `main`.
- Commit: `d793362384a7b1d82550d7941cbc037fe69610f1` (`Release ILMATILA 0.1.0-alpha.18`). The worktree was clean before verification.
- Node.js: `v20.19.2`; npm CLI: `10.8.2`.
- The environment did not have `npm` on `PATH`, so the npm CLI was fetched to `/tmp` and used there. No package manager files or application dependencies were changed by this workaround.

## Automated checks

| Command | Result |
| --- | --- |
| `npm ci` | Passed; 156 packages installed, 0 vulnerabilities reported. npm noted that 42 packages accept funding. |
| `npm run lint` | Passed; no warnings. |
| `npm test` | Passed; 42 test files and 216 tests, 11.66 seconds; no warnings. |
| `npm run build` | Passed; Vite 7.3.6 transformed 79 modules and built in 20.90 seconds; no warnings. |

## Production browser smoke

Served the production build at `http://127.0.0.1:4173/` and exercised it in Brave Origin 152.1.94.119:

- The mission menu opened and Training could be selected.
- A Training sortie started.
- Pressing P opened pause; Resume returned to flight and reacquired pointer lock on the canvas.
- Returning to mission selection worked.
- Combat Air Patrol started from the menu.
- After returning to the menu again, another sortie started without reloading the page (one top-level navigation total).
- No browser console errors, uncaught page errors, or failed requests were observed.

No baseline failures required repair.
