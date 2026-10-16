# ILMATILA release notes

This file is the maintained release record. Older beta checkpoints are
summarized here instead of being kept as one document per pipeline attempt.

## 0.3.0-beta.6

This follow-up release fixes a WebGL compatibility regression in the night
vision particle shader. The night-vision uniform is now declared in the
fragment shader as well as the vertex shader, so tracer, flare, and other
particle glow effects compile correctly in Chrome, Edge, Firefox, and WebKit.

### Validation

- Vitest unit and integration suite passed: 391 tests.
- ESLint passed.
- Production Vite build passed.
- The release pipeline must pass the full browser smoke matrix before Pages
  deployment.

## 0.3.0-beta.4

This beta makes campaign support operational and readable in the sortie. Sergei
23 mm batteries now route friendly air-defense fire correctly, Crotale launches
guide and resolve more reliably, and support batteries remain visible farther
across the battlefield. Support firing now has visible muzzle/tracer/missile
feedback, radio calls, and truthful Sergei HUD status.

Countermeasure and night presentation were also refined: flare deployment now
shows paired eight-flare strings with smaller individual flares, clear night
skies contain stars only above the horizon, and night vision intensifies
cannon tracers, air-defense fire, explosions, particles, and afterburners.
The MLRS salvo targeting and ballistic release fixes are included in this
release.

### Validation

- Vitest unit and integration suite passed: 391 tests.
- ESLint passed.
- Production Vite build passed.
- The tag pipeline provides the staging preflight and deployed Chrome, Edge,
  Firefox, and WebKit smoke gate.

## 0.3.0-beta.3

This beta completes the next campaign support pass. Air Control and Defense
Integrity now unlock the documented AWACS/battlespace-link and ITO 90 support
windows, while the RSRAKH 06 artillery support can be called as a player
fire mission with ground-target validation, delay, and limited salvos. Support
availability is shown consistently in the campaign UI, briefing, HUD, and
radio messages.

The campaign metrics now use the current strategic rules without the removed
legacy readiness-cost path. The campaign menu uses the available desktop space
more effectively, and support names are localized cleanly: English shows
Sparrow and Finnish shows Varpunen.

### Validation

- Vitest unit and integration suite passed: 387 tests.
- ESLint passed.
- Production Vite build passed.
- Firefox browser smoke passed locally; the release workflow provides the full
  Chrome, Edge, Firefox, and WebKit matrix in CI.

## 0.3.0-beta.1

The first beta of the 0.3 release line contains the current campaign, sortie,
kit-selection, weather, HUD, mission-objective, and Pages-pipeline work.

This release also adds persistent between-sortie support choices: the named
Sparrow reserve wingman, three friendly Sergei air-defence trucks,
one lethal 298 RSRAKH 06 MLRS battery, and an expanded ordnance package with
four additional external missile stations and 800 kg of payload capacity.
The current support rules add metric-gated AWACS and ITO 90 windows, keep
support selection free of strategic-metric charges, and consume a selected
window on retry. The campaign kit selector reflects the active hardpoint and
payload limits, while ground artillery uses the shared projectile and
destruction systems for real area damage.

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

## 0.3.0-beta.2

This beta makes the Shadow at the Border campaign's optional objectives
mission-specific and mechanically meaningful. Chapters now track authored target
groups, force preservation, and protected-zone denial, including sustainment
objectives for Varpunen, Sergei air defence, RSRAKH 06, and expanded ordnance.
The decisive objective is now visible in the campaign result, while ordinary
successes and recoverable setbacks remain valid ways to continue the campaign.

The sortie HUD now shows optional-objective progress during flight, with the
same results carried into the briefing and debrief. Target roles and live force
collections are preserved through campaign variant resolution. The player
cannon also receives a moderate damage and hit-envelope improvement so careful
aiming no longer burns through finite ammunition at an unreasonable rate.

### Validation

- Vitest unit and integration suite passed: 356 tests.
- ESLint passed.
- Production Vite build passed.

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
