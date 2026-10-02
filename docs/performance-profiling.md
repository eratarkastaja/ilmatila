# Performance profiling

The development build includes a repeatable stress scenario for projectile, combat AI, radar, particle, and resource-cleanup workloads.

1. Run `npm run dev` and open `http://localhost:5173/?stress=1&mission=intercept&area=paijanne`.
2. Choose **Launch mission**. The scenario creates hostile aircraft, wingmen, ground units, projectiles, and effects, then removes sample units to exercise their disposal paths.
3. Record 20–30 seconds in Chrome DevTools **Performance** after flight begins. Use **Memory → Allocation sampling** over the same interval to inspect allocation hot spots.
4. In any development sortie, `window.__ilmatilaTelemetry.snapshot()` reports missile launches by seeker/team, countermeasure uses and target attempts/successes, and player damage by source. In `?stress=1`, `window.__ilmatilaStress.snapshot()` includes the same data under `combatTelemetry` alongside frame-time percentiles, active entity/projectile counts, GPU resource counts, and cleanup-probe status. Take snapshots before and after a sample interval to compare runs.
5. The cleanup probe records renderer geometry counts before and after removing a live aircraft and ground vehicle, then again one second later.

The stress query is available only in development builds. Difficulty is included in stress snapshots so Easy, Standard, and Hard runs can be compared; ordinary development sorties expose the selected profile as `window.__ilmatilaTelemetry.snapshot().difficulty` too. Compare runs on the same machine, browser, viewport, and workload. Use the Chrome profile for CPU and allocation call stacks; frame-rate samples are affected by GPU and driver work as well as JavaScript.
