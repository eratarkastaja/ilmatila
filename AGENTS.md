# Agent instructions

## Project overview

Ilmatila is a single-player, real-time Three.js air-combat game served by Vite. `src/main.js` is the browser entry point and long-lived application coordinator. A sortie creates a `CombatWorld`, which composes combat systems; `SortieController` prepares, starts, pauses, finishes, and disposes that sortie. Mission and difficulty data live in source modules, not in a remote service.

Read [the architecture](docs/architecture.md) before changing system boundaries or lifecycle. Read [testing](docs/testing.md) for the real test setup and [game design](docs/game-design.md) before changing player-facing or balance behavior. `README.md` remains the human-facing run and game guide.

## Before making changes

- Read the implementation you intend to change, its callers, adjacent systems, and nearby tests. Names alone do not establish ownership or behavior.
- Trace the relevant path through `main.js`, `SortieController`, and/or `CombatWorld`; these classes coordinate much of the application and session lifecycle.
- For asynchronous loading or Three.js changes, identify who owns the result, who can cancel it, and who releases it. Follow current generation checks, abort handling, and terrain lease behavior.
- Check whether the behavior is already provided by an existing system. Extend it before adding a parallel path.
- Preserve the existing behavior unless the task explicitly changes it. Treat requests for a feature as permission for that feature, not for unrelated redesign.

## Architecture and scope

- Keep changes focused. Do not make drive-by cleanup, broad renames, unrelated refactors, or architectural rewrites.
- `main.js` is the application composition root: it owns the page-level scene, renderer, frame loop, menu wiring, and the long-lived app objects. Keep unrelated combat rules out of it.
- `SortieController` owns launch preparation and the active sortie's start/pause/finish/dispose transitions. Preserve its async cancellation and stale-result protections.
- `CombatWorld` composes combat systems and coordinates their frame order. It still has substantial HUD, debrief, and gameplay orchestration responsibilities; do not add unrelated responsibilities without considering a focused system extraction. Do not refactor it merely because it is large.
- `AirBattle` and `GroundBattle` own their unit collections and coordinate smaller spawn/AI/weapon helpers. Prefer those existing boundaries when changing air or ground behavior.
- Keep gameplay systems independently testable where the current design allows it. Use explicit references and callbacks for new cross-system behavior; avoid duplicate state and hidden global lookups.
- Some presentation systems still query or receive DOM elements directly. Do not assume the UI boundary is fully separated; avoid spreading additional DOM coupling when a local adapter or callback fits the existing design.
- Do not modify production gameplay code during a documentation-only task.

Keep the existing subsystem boundaries clear when working across gameplay:

- `CombatRadar` owns contact tracks, target selection, and lock state; `WeaponSystem` consumes that state for launch eligibility.
- `WeaponSystem` owns cadence and stores; `ProjectileSystem` owns active projectile movement, guidance, expiry, and damage resolution through `CollisionSystem`.
- `MissionSystem` evaluates objective progress/outcome; `MissionFlowSystem` owns phase, ingress/RTB routing, and extraction. Keep those state machines coordinated rather than duplicating them.
- `DestructionSystem` applies shared kill consequences, while `ScoreSystem` owns score/statistics. Avoid separate kill accounting in AI or projectile code.
- `RadioSystem` owns message priority, queueing, and cooldowns; gameplay systems emit semantic event names instead of managing radio timing themselves.

## Gameplay and configuration

- Preserve mission balance and handling unless the task asks for a gameplay change. Damage, accuracy, missile guidance, AI detection/reaction, weapon ranges/cadence/ammunition, countermeasures, spawn counts, and difficulty values are balance-sensitive.
- Treat a change to those values as a gameplay change, even when it appears to be a cleanup. Prefer behavioral AI changes over arbitrary numeric advantages only when the requested design supports that choice.
- Mission definitions are in `src/mission/missions.js`; difficulty presets are in `src/combat/difficulty.js`. Reuse these sources rather than duplicating their values in gameplay code.
- `src/config/validate-config.js` validates the built-in mission and difficulty shapes, but it is currently called by tests only; it is not a runtime guard or external configuration loader. Update its schema and tests when the data shape changes.
- Progression and per-difficulty records are stored locally by `CareerProgress` in `src/mission/progression.js`. Preserve its tolerant behavior when browser storage is unavailable.

## Three.js, async work, and resource lifecycle

- Removing an `Object3D` from a scene does not dispose its GPU resources. Dispose only resources owned by the object being removed.
- Do not dispose shared geometry, materials, or textures from an individual instance. Imported aircraft share model geometry; `disposeAircraftVisual` skips that shared geometry and releases instance-owned resources. Ground vehicles use `disposeGroundVehicleVisual`.
- Terrain obtained through `AssetRepository` is a caller-owned lease. Release it with `disposeTerrain`; the shared terrain resources are disposed after the final lease is released. Do not bypass the lease by directly disposing its shared mesh resources.
- A `CombatWorld` owns per-sortie systems, combat effects, units, projectiles, and its session listeners. Call their existing `dispose()` paths when ending a session; remove listeners and clear timers added to a session-owned system.
- `FlightFX`, `AssetRepository`, the installed menu terrain, controls, audio, and module-level missile/effect resources live across sorties. `FlightFX` is reset between sorties and disposed at page teardown; shared missile/effect pools have explicit page teardown functions. Do not release app-lifetime resources during a normal return to menu.
- `AssetRepository` shares in-flight loads among callers. A caller's abort signal unsubscribes that caller; shared work is cancelled when no subscribers remain. Preserve that behavior and ensure late or superseded results are either installed or released.
- Aircraft assets are cached for the app session. `AssetRepository` has no general shutdown/dispose method today; do not invent ownership for that cache as part of an unrelated change. Treat app-wide listener/resource teardown as an existing incomplete boundary and document it if your change depends on it.
- Launch requests mouse capture in the user's click before awaiting terrain or aircraft loads. Keep browser-gesture-sensitive calls synchronous with their initiating gesture.

## Real-time performance

The hot paths are the active-frame work in `main.js`, `FlightControls.update`, `CombatWorld.update`, air/ground AI, radar contact and lock updates, projectile/collision queries, `FlightFX.update`, and tactical HUD presentation. In those paths:

- Reuse scratch `Vector3`/`Quaternion`/array state where practical; avoid per-unit or per-projectile temporary allocations without evidence they are harmless.
- Avoid scene-wide traversal, DOM node churn, or repeated expensive searches inside a frame loop. Preserve swept collision checks and projectile target filtering unless changing their correctness deliberately.
- Keep high-frequency projectiles, missile meshes, combat effects, and render buffers pooled or reused where the current subsystem does so. Dispose pools at their current owner boundary.
- Avoid unnecessary DOM writes; several HUD/radar paths already skip unchanged text or classes.
- Profile before optimizing. Preserve the development `?stress=1` scenario and follow [performance profiling](docs/performance-profiling.md) for repeatable measurements.

These rules target real-time paths. Do not add pooling or complexity to ordinary setup code without a measured need.

## Tests and verification

Use the commands that exist in `package.json`:

```sh
npm test
npm run lint
npm run build
```

`npm run test:watch` is available for an interactive Vitest session. Run `npm ci` when reproducing a clean install or CI environment. Add or update focused regression tests for bug fixes and gameplay logic; include lifecycle, abort, or disposal assertions when those paths change. See [testing](docs/testing.md) for coverage and determinism guidance.

Do not add tests that only increase coverage numbers. Test observable behavior, edge cases, and important invariants. Do not claim verification that was not run, and report unrelated failures from the existing worktree clearly.

## Documentation and definition of done

Update documentation when a change alters ownership, subsystem responsibilities, session lifecycle, mission/difficulty configuration shape, or an important developer workflow. Do not document trivial implementation details or duplicate the detailed docs in this file.

Before declaring a code task complete, check that:

- The requested behavior is implemented and existing gameplay is preserved outside the requested change.
- Relevant tests cover the changed behavior and the applicable test suite passes.
- Lint and production build pass when the change can affect them.
- Async cancellation, listeners, timers, Three.js ownership, and cleanup are correct for the touched lifecycle.
- No balance-sensitive values changed unintentionally.
- Architecture, testing, or game-design docs were updated when their documented facts changed.
