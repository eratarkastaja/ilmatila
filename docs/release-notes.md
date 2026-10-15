# ILMATILA release notes

This file is the maintained release record. Older beta checkpoints are
summarized here instead of being kept as one document per pipeline attempt.

## 0.3.0-beta.1

The first beta of the 0.3 release line contains the current campaign, sortie,
kit-selection, weather, HUD, mission-objective, and Pages-pipeline work.

This release also adds persistent between-sortie support choices: the named
Varpunen / Sparrow reserve wingman, three friendly Sergei air-defence trucks,
one lethal 298 RSRAKH 06 MLRS battery, and an expanded ordnance package with
four additional external missile stations and 800 kg of payload capacity.
Support choices now have visible readiness costs and can be removed before
launch. The campaign kit selector reflects the active hardpoint and payload
limits, while ground artillery uses the shared projectile and destruction
systems for real area damage.

### Validation

- Vitest unit and integration suite passed.
- ESLint passed.
- Production Vite build passed.
- Desktop browser smoke passed for Chrome, Edge, Firefox, and WebKit.
- The candidate passed the deployed staging smoke, including the `/staging/`
  build identity check.
- The beta tag passed its staging preflight, Pages deployment, and deployed
  live beta smoke.

The release pipeline preserves the live root while staging a candidate, then
deploys the beta tag only after the exact tagged commit has passed staging.
The deployed site writes its version and source commit to `build-info.json`.

### Support status

Desktop Chrome, Edge, and Firefox are the verified playable browsers. WebKit is
kept as an engine compatibility check; Apple Safari still requires a macOS
run. Touch and mobile devices are not supported.

## 0.2 beta line

The 0.2 beta line established the current campaign and sortie systems,
desktop browser matrix, deterministic campaign state, kit selection, weather
and time controls, deployed staging smoke, and the Pages release gate. Its
individual pipeline notes were consolidated here when the 0.3 beta line
opened.

## Release workflow

1. Push the candidate to `master`; quality and browser smoke must pass.
2. Dispatch the Pages workflow with `target=staging`.
3. Confirm staging and preserved-live smoke results.
4. Create a `v*-beta.*` tag on the exact staged commit.
5. The tag workflow reruns checks, verifies staging, deploys Pages, and runs
   the live beta smoke.

The workflow is defined in `.github/workflows/pages.yml`; testing details live
in [testing.md](testing.md) and browser limitations in
[browser-compatibility.md](browser-compatibility.md).
