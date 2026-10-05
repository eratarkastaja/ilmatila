# Performance profiling

The development build includes a repeatable stress scenario for projectile, combat AI, radar, particle, and resource-cleanup workloads.

1. Run `npm run dev` and open `http://localhost:5173/?stress=1&mission=intercept&area=paijanne`.
2. Choose **Launch mission**. The scenario creates hostile aircraft, wingmen, ground units, projectiles, and effects, then removes sample units to exercise their disposal paths.
3. Record 20–30 seconds in Chrome DevTools **Performance** after flight begins. Use **Memory → Allocation sampling** over the same interval to inspect allocation hot spots.
4. In any development sortie, `window.__ilmatilaTelemetry.snapshot()` reports missile launches by seeker/team, countermeasure uses and target attempts/successes, and player damage by source. In `?stress=1`, `window.__ilmatilaStress.snapshot()` includes the same data under `combatTelemetry` alongside frame-time percentiles, active entity/projectile counts, GPU resource counts, and cleanup-probe status. Take snapshots before and after a sample interval to compare runs.
5. The cleanup probe records renderer geometry counts before and after removing a live aircraft and ground vehicle, then again one second later.

The stress query is available only in development builds. Difficulty is included in stress snapshots so Easy, Standard, and Hard runs can be compared; ordinary development sorties expose the selected profile as `window.__ilmatilaTelemetry.snapshot().difficulty` too. Compare runs on the same machine, browser, viewport, and workload. Use the Chrome profile for CPU and allocation call stacks; frame-rate samples are affected by GPU and driver work as well as JavaScript.

## Repeatable Chromium profile

`npm run profile:browser -- training` runs a headed Chromium profile at 1920 × 1080, device scale factor 1. It starts Vite, warms the sortie for three seconds, records 25 seconds of `requestAnimationFrame` intervals, then captures an eight-second DevTools CPU sample. Available scenarios are `training`, `patrol`, `support`, `stress`, and `cycles`; comma-separated scenario names can share one browser process. Set `ILMATILA_PROFILE_SAMPLE_MS` or `ILMATILA_PROFILE_CPU_MS` to change the sample lengths. On Linux, run it in a graphical session so Chromium uses the installed GPU driver; the report includes the actual WebGL renderer.

The `cycles` scenario launches, pauses, and disposes ten Support sorties in one page, holding each active for 12 seconds so ground models enter the 8 km render range. It uses a development-only `SortieController` hook to avoid Chromium's pointer-lock request throttle during this resource measurement. The browser smoke test separately exercises the real click, Pointer Lock, resume, quit, and second-launch path. Cycle snapshots include renderer geometry/texture/program counts and live entity, projectile, and effect counts before, during, and after each sortie.

## Measured beta profile — 2026-10-05

Machine: Intel Core i7-860 (4 cores / 8 threads), NVIDIA GeForce GTX 1060 6 GB, Debian 13, Chromium 153.0.8010.12, WebGL 2 through ANGLE/NVIDIA, 1920 × 1080 at device scale factor 1. Normal sorties used Standard difficulty and Päijänne terrain. Each final frame sample contains about 1,450 intervals over 25 seconds after warm-up. Times below are milliseconds; the reported frame interval includes browser scheduling and GPU/driver pacing, while the CPU profile is sampled separately.

| Scenario | Mean | p95 | Worst | Top five worst intervals | Gate |
| --- | ---: | ---: | ---: | --- | --- |
| Training · standard course | 17.0 | 21.5 | 97.0 | 97.0, 94.8, 94.6, 92.0, 91.2 | Pass |
| Patrol · routine patrol | 17.0 | 20.3 | 104.1 | 104.1, 99.0, 96.3, 96.0, 92.9 | Pass |
| Support · flank pressure | 17.1 | 20.6 | 109.1 | 109.1, 101.8, 95.7, 93.6, 82.0 | Pass |
| `?stress=1` · Intercept | 49.6 | 57.1 | 125.0 | 125.0, 123.4, 117.0, 111.4, 67.7 | Capacity scenario; normal-mission gate does not apply |

The provisional beta gate is p95 ≤ 33 ms for normal missions. All three normal scenarios passed after the change. The occasional 80–109 ms worst frames remain visible in the tail, but were infrequent enough to leave the normal-mission p95 below the gate. No browser page errors or console errors occurred in the measured runs.

| Scenario | Live aircraft | Ground vehicles | Player / hostile projectiles | Combat effects / particles | Geometries / textures / programs | Render calls / triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Training | 3 | 0 | 0 / 0 | 0 / 0 | 58 / 18 / 22 | 40 / 1,472,027 |
| Patrol | 3 | 0 | 0 / 0 | 0 / 0 | 58 / 18 / 22 | 40 / 1,472,027 |
| Support | 3 | 44 (26 rendered within 8 km) | 0 / 0 | 0 / 0 | 420 / 18 / 23 | 306 / 1,495,951 |
| Stress | 45 (25 hostile active) | 52 | 159 / 0 | 10 / 173 | 415 / 24 / 30 | 627 / 1,966,168 |

### Measured change

Support was the normal-mission bottleneck. Before the change, repeated profiles measured p95 at 33.2–37.6 ms, with 44 active ground vehicles, about 542 vehicle meshes, and 486 render calls. Chrome's CPU samples repeatedly put Three.js `projectObject`, `renderBufferDirect`, and `updateMatrixWorld` among the busiest game-side functions. At the measured player position, 26 vehicles were within 8 km and 18 were farther away; at 1080p those distant vehicle models project to roughly a pixel or less.

`GroundBattle` now hides vehicle models beyond 8 km and checks visibility four times per second. It leaves the units and their combat simulation active, and restores their models as the player approaches. In the final Support profile, calls fell from 486 to 306 (37%), renderer-tracked geometries from 600 to 420 (30%), and p95 from the 33.2–37.6 ms baseline range to 20.6 ms. A repeat after the instrumentation-only snapshot change measured p95 at 21.5 ms, consistent with that result. This distance cull is the only gameplay-rendering optimization made from these measurements.

The stress case remained around 57–58 ms p95. Its eight-second CPU sample was led by Three.js `getParameters` (515 ms), `getProgram` (361 ms), and `buildMissileTrailGeometry` (348 ms); it also rendered over 600 calls with 36 hostile aircraft, 52 ground vehicles, and about 160 projectiles. This is the deliberately overloaded developer scenario, not a normal mission, so it remains outside the 33 ms beta gate. The stress cleanup probe recorded 316 geometries before and after removing sample units (316 one second later); peak geometry count during the active workload was 415.

### Ten-sortie resource check

Ten Support · flank pressure sorties ran in the same Chromium page, each active for 12 seconds, with no navigation and no page or console errors. The initial menu had 38 geometries, 6 textures, and 20 programs. Each active sortie stabilized at 229 geometries, 17 textures, and 23 programs, with 44 ground units and 15 vehicle models rendered. After each return to menu, counts returned to 52 geometries, 17 textures, and 23 programs; those active and post-return counts were identical across all ten cycles. After each return there were no wingmen, ground units, projectiles, or combat effects left active; the shared particle pool remained at its fixed capacity of 1,800. Counts plateaued after the first sortie, with no continuing resource growth.

These values come from `renderer.info` and are resource counts rather than GPU byte totals. The browser profiles and per-cycle JSON reports are generated under `/tmp` by the profiling command and are not checked into the repository.

Verification for this change: Vitest passed 252 tests in 51 files, ESLint passed, the production build passed, and all four Playwright smoke tests passed. The production browser smoke completed in 4.5 minutes; Playwright emitted a non-failing environment warning that `NO_COLOR` is ignored because `FORCE_COLOR` is set. The headed performance profiles had no page errors or browser console errors.
