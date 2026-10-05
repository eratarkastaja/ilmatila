# Testing in Ilmatila

## Test stack

The repository uses Vitest (`vitest run`) with the Node environment and Playwright Test for production-build browser smokes in Google Chrome, Microsoft Edge, Firefox, and WebKit. `vitest.config.js` discovers `tests/**/*.test.js` and clears mock call history between tests. The Playwright config keeps browser specs in `e2e/`, separate from the Node suite. Unit tests are ES modules and import the same source systems used by the browser game.

Most combat and data tests run system logic directly in Node. They use Three.js objects where useful and small hand-written DOM/browser stubs for APIs a system touches. The main-session integration test mocks the renderer and major app dependencies; the combat-world integration test constructs the real combat world with mock DOM and event targets. These tests do not run a real browser, WebGL renderer, pointer lock, or browser audio stack.

## Running checks

```sh
npm ci
npm test
npm run lint
npm run build
npm run test:e2e
```

For focused work, Vitest accepts a test path, for example `npm test -- tests/combat/radar.test.js`. `npm run test:watch` starts a Vitest watch session. `npm run test:e2e` builds the production site, starts Vite Preview, and runs the browser matrix. Install the local browser set with `npx playwright install --with-deps chrome msedge firefox webkit`. On machines where Chrome or Edge are already installed at nonstandard paths, set `ILMATILA_CHROME_EXECUTABLE` and/or `ILMATILA_EDGE_EXECUTABLE` before running Playwright.

The tested versions and browser-specific limitations are recorded in [browser compatibility](browser-compatibility.md).

The Pages workflow runs lint and unit/integration tests in `quality`, then installs Chrome, Edge, Firefox, and WebKit and runs production browser smokes in `browser-smoke`. That job downloads and verifies the real Päijänne terrain release package before building. Each supported browser runs Training, exercises WebGL2, audio unlock, Pointer Lock, mouse and keyboard input, Escape, P pause/resume, viewport resize and tab switching, then launches Patrol combat, fires the gun, returns to the menu, and launches again without reloading. The Chrome project also launches Intercept and Support, so every mission type receives a real browser launch/menu pass. In CI, Firefox runs headed inside Xvfb with software WebGL enabled; its headless profile cannot create WebGL on the GPU-less runner. Tests fail on asset errors, uncaught page errors, or console errors. WebKit is included as an engine check; it is not Apple Safari. Pull requests run quality and browser checks but never deploy Pages. Pushes to `master` run checks without publishing; the `workflow_dispatch` staging target preserves the live root under `/staging/`, and beta deployment is gated by a passing staging smoke for the same commit. A `v*-beta.*` tag deploys to beta only after that staging preflight and is followed by the same browser matrix at the live URL.

## Existing coverage

The suite covers ballistics, boundary warnings, collision and hit tests, countermeasures, mission objectives/flow, projectile lifecycle and pooling, radar, radio, weapon behavior, asset sharing/abort/disposal, terrain coverage, controls, configuration validation, and local progression. `tests/ui/i18n-coverage.test.js` keeps EN/FI keys aligned and checks every static source and HTML translation reference. `tests/ui/diagnostics.test.js` checks copied context and both clipboard paths. Startup tests cover WebGL2 and Pointer Lock capability checks, unsupported touch/mobile devices, the fatal startup boundary, and EN/FI error messages. Resource tests protect instance-owned versus shared Three.js resources.

There are two useful lifecycle integration tests:

- `tests/integration/combat-world-session.test.js` runs a real `CombatWorld` through training, RTB, debrief, disposal, and ten consecutive world instances. It checks listener cleanup, fresh unit/radar/mission state, active pool cleanup, missile-audio stop, and progression persistence.
- `tests/integration/main-session.test.js` exercises ten app-level launch → debrief → return cycles, checks pointer-lock release, telemetry-handle cleanup and menu-timer cancellation, and covers Escape unlock, canvas-click recapture, P pause/resume, pointer-lock denial, and pause → quit confirmation → cleanup with browser APIs mocked. Resume remains paused until canvas ownership is confirmed.

`tests/integration/combat-scenarios.test.js` runs seeded 45-second air and ground engagements without a renderer, then follows a player missile from launch through guidance, impact, cleanup, and pool reuse. It checks target selection and ownership, ammunition use, once-only destruction, destroyed-unit inactivity, objective progress, and projectile cleanup across the real combat systems.

`tests/combat/fuel-system.test.js` verifies difficulty fuel reserves, cruise and afterburner consumption, and afterburner lockout at empty. The flight-control test checks that an exhausted sortie loses afterburner and continues at glide speed; the world-session test checks HUD visibility and green/yellow/red gauge states.

The scenario tests give wingman and ground-unit AI direct combat integration coverage; helicopter behavior and wider tactical choices still have focused unit coverage. The real-browser smoke covers actual terrain and aircraft loading, WebGL rendering, pointer lock during launch/resume, pointer-lock release/reacquisition, audio unlock, desktop input, focus/resize changes, all mission types, the second-launch lifecycle, and the localized compatibility view when WebGL2 is unavailable. `tests/game/sortie-controller.test.js`, `tests/assets/asset-repository.test.js`, and `tests/integration/main-session.test.js` cover load timeouts, failure and retry, cancellation during preparation, late-result disposal, competing menu terrain requests, and launch recovery including retry and return to the usable menu.

## What to test

- **Pure gameplay logic:** Test transitions, input/output, and edge cases without DOM where the logic permits it. Keep mission objective, ballistics, configuration, and progression tests deterministic.
- **Collision and projectiles:** Cover swept movement, near misses, impacts, ground/air/friendly targets, expiry, decoys, missile guidance, and exactly-once destruction/score effects. Include fast movement across boundaries and collisions.
- **Radar and weapons:** Test air/ground mode, contact loss, selected targets, lock acquisition/loss, launch envelopes, ammunition, and feedback. Keep radar sensor range distinct from weapon launch range. Pop-up contact coverage should preserve the uncertain return across search modes, prevent targeting before identification, and verify the warning-to-identification delay.
- **Mission flow:** Cover phase ordering, delayed/deferred contact, objective activation, objective completion, RTB extraction, destruction, and abort behavior.
- **Optional objectives:** Cover every configured condition's success, failure, and not-applicable cases; verify that the shared briefing/debrief renderer handles multiple definitions and that optional failures never change the primary outcome.
- **AI behavior:** Assert visible state transitions, target choice, command response, and projectile outcomes. When randomness affects a case, control it locally rather than relying on one lucky draw.
- **Threat escalation:** Verify uncertain contacts remain non-targetable until identification, RWR lock/tracking states precede weapons fire for their full warning interval, and the warning clears when the firing solution is lost. For wingman rescue cases, verify the hostile missile tracks and damages its assigned wingman, lock/inbound calls identify the threat, both radar tracks highlight, and the rescue window expires without applying damage or forcing a loss.
- **Threat pacing:** Verify hostile missile locks and missiles share a single commitment, active missile/rescue/ground-tracking/critical-fuel complications hold authored encounter warnings, a warning pauses during a new complication, and the preselected encounter executes when pressure clears.
- **World-state pressure:** Verify the Support HUD force meter aggregates only friendly `defender` units, reflects their current hit points and losses, and stays hidden in missions without that Support force.
- **Partial mission outcomes:** Verify an Intercept Strike aircraft entering the protected zone permanently fails only that secondary objective, emits one impact report, and still allows the clear-air objective and successful extraction to complete.
- **Async loading and aborts:** Test shared in-flight requests, one caller aborting while another remains, all callers aborting, failures, timeouts, and stale results. Verify that a result that is no longer current is released instead of installed or leaked.
- **Resource cleanup:** Verify scene removal and disposal of owned geometry/materials/textures, while proving shared aircraft/terrain resources remain valid until their owner releases them. Check listeners, timers, pools, and late async completions.
- **Progression and persistence:** Test missing/corrupt/unavailable storage, normalization, per-difficulty records, unlock ordering, failed mission results, and the fact that manually quitting from the pause menu disposes the sortie without recording a debrief result.
- **Session lifecycle:** Preserve launch → play → finish/fail → debrief → cleanup → menu → second launch. Test both app orchestration and combat-world disposal where their ownership differs.

## Regression workflow

For a reproducible bug, prefer this sequence:

1. Reproduce it in a focused test where practical.
2. Confirm the test fails for the reported behavior.
3. Implement the smallest fix that addresses the cause.
4. Confirm the regression test passes.
5. Run the broader test suite, lint, and build when applicable.

If the bug depends on browser, rendering, or audio behavior that the Node harness cannot represent, record the manual/browser reproduction steps and add a test at the closest useful boundary rather than creating a misleading mock.

## Manual Pointer Lock validation

Playwright exercises pointer lock during launch and resume across its desktop browser projects. Keep this manual pass for browser security behavior and any browser-specific regression:

1. Start a mission and verify the cursor is locked.
2. Press Escape and verify the cursor becomes visible, the pause dialog stays closed, and flight continues.
3. Click the flight canvas and verify mouse capture returns, the cursor hides, and the sortie keeps running.
4. Press P and verify the pause dialog opens. Press P again and verify pointer lock returns before the sortie resumes. Repeat, and also verify Resume Flight still works with one click.
5. Deny pointer lock during launch or resume and verify launch stays in the menu or the sortie stays paused until a successful request.

## Randomness and determinism

Each planned sortie gets one 32-bit seed when its mission is selected. The menu uses it to preview the authored variant and optional objectives; launch passes the same seed to `SortieController` and `CombatWorld`. `CombatWorld` creates the gameplay random stream from it and shares that stream with AI, spawns, weapons, countermeasures, and projectiles. Visual effects, audio variation, menu radar, and the stress workload use separate presentation randomness so their activity cannot change later gameplay rolls. Pass an explicit seed to `CombatWorld` in deterministic integration tests; inject a random function when testing one system's specific branch.

Mission variants and encounter probability, response, and warning delay use a separate stream derived from the sortie seed and mission id, so choosing a plan does not consume simulation rolls. The same seed and mission therefore select the same authored variant and encounter plan. Encounter tests should cover unmet conditions, one-time warning, the full preselected delay, cancellation before warning (including destroying Support's marked reinforcement relay), and execution after warning; include objective accounting for pending and cancelled groups. The same seed, mission setup, frame steps, and player inputs should produce the same simulation state. Test observable state such as selected variant, encounter response, spawned composition/positions, weapon use, projectiles, and damage. Do not stub global `Math.random()` to control gameplay randomness.

## Test quality

Favor tests that would catch a realistic regression: user-visible state, simulation invariants, ownership, cancellation, or ordering. Avoid tests that mirror implementation line-by-line, assert private details without protecting an invariant, or pad coverage without meaningful failure detection.
