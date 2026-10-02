# Testing in Ilmatila

## Test stack

The repository uses Vitest (`vitest run`) with the Node environment. `vitest.config.js` discovers `tests/**/*.test.js` and clears mock call history between tests. Tests are ES modules and import the same source systems used by the browser game.

Most combat and data tests run system logic directly in Node. They use Three.js objects where useful and small hand-written DOM/browser stubs for APIs a system touches. The main-session integration test mocks the renderer and major app dependencies; the combat-world integration test constructs the real combat world with mock DOM and event targets. These tests do not run a real browser, WebGL renderer, pointer lock, or browser audio stack.

## Running checks

```sh
npm ci
npm test
npm run lint
npm run build
```

For focused work, Vitest accepts a test path, for example `npm test -- tests/combat/radar.test.js`. `npm run test:watch` starts Vitest in watch mode. The Pages workflow installs dependencies, runs lint and tests, then downloads and verifies the terrain release before building the site with the `/ilmatila/` base path. Deployment waits for both the quality job and build job.

## Existing coverage

The suite covers ballistics, boundary warnings, collision and hit tests, countermeasures, mission objectives/flow, projectile lifecycle and pooling, radar, radio, weapon behavior, asset sharing/abort/disposal, terrain coverage, controls, configuration validation, and local progression. Resource tests protect instance-owned versus shared Three.js resources.

There are two useful lifecycle integration tests:

- `tests/integration/combat-world-session.test.js` runs a real `CombatWorld` through training, RTB, debrief, disposal, and ten consecutive world instances. It checks listener cleanup, fresh unit/radar/mission state, active pool cleanup, missile-audio stop, and progression persistence.
- `tests/integration/main-session.test.js` exercises ten app-level launch → debrief → return cycles, checks pointer-lock release, telemetry-handle cleanup and menu-timer cancellation, and covers Escape unlock, canvas-click recapture, P pause/resume, pointer-lock denial, and pause → quit confirmation → cleanup with browser APIs mocked. Resume remains paused until canvas ownership is confirmed.

`tests/integration/combat-scenarios.test.js` runs seeded 45-second air and ground engagements without a renderer, then follows a player missile from launch through guidance, impact, cleanup, and pool reuse. It checks target selection and ownership, ammunition use, once-only destruction, destroyed-unit inactivity, objective progress, and projectile cleanup across the real combat systems.

The scenario tests give wingman and ground-unit AI direct combat integration coverage; helicopter behavior and wider tactical choices still have focused unit coverage. The highest-value broader integration boundary remains a real-browser run that combines actual terrain and aircraft loading, pointer lock/audio, WebGL rendering, and the second-launch lifecycle. No browser automation stack is configured in the repository. Repository-level tests do cover shared-load cancellation and terrain leases; the `SortieController`'s timeout and preparation race behavior is a narrower remaining boundary.

## What to test

- **Pure gameplay logic:** Test transitions, input/output, and edge cases without DOM where the logic permits it. Keep mission objective, ballistics, configuration, and progression tests deterministic.
- **Collision and projectiles:** Cover swept movement, near misses, impacts, ground/air/friendly targets, expiry, decoys, missile guidance, and exactly-once destruction/score effects. Include fast movement across boundaries and collisions.
- **Radar and weapons:** Test air/ground mode, contact loss, selected targets, lock acquisition/loss, launch envelopes, ammunition, and feedback. Keep radar sensor range distinct from weapon launch range.
- **Mission flow:** Cover phase ordering, delayed/deferred contact, objective activation, objective completion, RTB extraction, destruction, and abort behavior.
- **Optional objectives:** Cover every configured condition's success, failure, and not-applicable cases; verify that the shared briefing/debrief renderer handles multiple definitions and that optional failures never change the primary outcome.
- **AI behavior:** Assert visible state transitions, target choice, command response, and projectile outcomes. When randomness affects a case, control it locally rather than relying on one lucky draw.
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

The repository has no browser automation stack, so the pointer-lock security behavior still needs manual validation in Chrome or Chromium:

1. Start a mission and verify the cursor is locked.
2. Press Escape and verify the cursor becomes visible, the pause dialog stays closed, and flight continues.
3. Click the flight canvas and verify mouse capture returns, the cursor hides, and the sortie keeps running.
4. Press P and verify the pause dialog opens. Press P again and verify pointer lock returns before the sortie resumes. Repeat, and also verify Resume Flight still works with one click.
5. Deny pointer lock during launch or resume and verify launch stays in the menu or the sortie stays paused until a successful request.

## Randomness and determinism

Each planned sortie gets one 32-bit seed when its mission is selected. The menu uses it to preview the authored variant and optional objectives; launch passes the same seed to `SortieController` and `CombatWorld`. `CombatWorld` creates the gameplay random stream from it and shares that stream with AI, spawns, weapons, countermeasures, and projectiles. Visual effects, audio variation, menu radar, and the stress workload use separate presentation randomness so their activity cannot change later gameplay rolls. Pass an explicit seed to `CombatWorld` in deterministic integration tests; inject a random function when testing one system's specific branch.

Mission variants and their reinforcement probability use a separate stream derived from the sortie seed and mission id, so choosing a variant does not consume simulation rolls. The same seed and mission therefore select the same authored variant and reinforcement outcome. The same seed, mission setup, frame steps, and player inputs should produce the same simulation state. Test observable state such as selected variant, spawned composition/positions, weapon use, projectiles, and damage. Do not stub global `Math.random()` to control gameplay randomness.

## Test quality

Favor tests that would catch a realistic regression: user-visible state, simulation invariants, ownership, cancellation, or ordering. Avoid tests that mirror implementation line-by-line, assert private details without protecting an invariant, or pad coverage without meaningful failure detection.
