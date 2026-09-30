# Combat performance profiling

The development build has a repeatable stress scenario for profiling projectile,
combat AI, radar, particle, and cleanup workloads.

1. Run `npm run dev` and open `http://localhost:5173/?stress=1&mission=intercept&area=paijanne`.
2. Choose **Launch mission**. The stress scenario uses 36 hostile aircraft, 8 wingmen,
   14 opposing ground pairs, 24 convoy vehicles, sustained cannon fire, frequent
   guided missiles, sparks, and explosions. It removes one aircraft and one ground
   vehicle after seven seconds to exercise their disposal paths.
3. In Chrome DevTools, record the **Performance** panel for 20–30 seconds after the
   flight begins. Use **Memory → Allocation sampling** over the same interval to
   inspect allocation hot spots.
4. `window.__ilmatilaStress.snapshot()` reports frame-time percentiles, active entity
   and projectile counts, GPU resource counts, and the cleanup probe status.
5. The cleanup probe records renderer geometry counts immediately before and after
   removing one live aircraft and ground vehicle, then again one second later.

The stress query is development-only. Its built-in frame-time readings are useful
for comparing changes on the same browser and machine; the DevTools profile is the
source for CPU and allocation call stacks.

## Initial profile

One 20-second Chrome 152 run at 1280 × 720, with the same development stress mission
before and after the allocation work, produced these approximate readings:

| Measurement | Before | After |
| --- | ---: | ---: |
| Median frame time | 49.7 ms | 50.0 ms |
| Median FPS | 20.1 | 20.0 |
| 95th-percentile frame time | 52.9 ms | 66.8 ms |
| Main-thread script time | 9.12 s | 7.52 s |
| Main-thread task time | 11.41 s | 10.05 s |
| JS heap used at end | 17.46 MB | 17.37 MB |

The frame-rate change is within run-to-run noise; the 95th percentile varied more
than the median. The JS profile shifted away from hit-testing and per-frame combat
work toward Three.js/WebGL rendering and driver calls. The stress scene rendered
roughly 500 draw calls and 0.7 million triangles, so reducing draw calls, visible
detail, or particle work is the next route to a meaningful FPS increase. Treat this
as a repeatable local comparison, not a cross-machine benchmark.

In the cleanup probe, renderer geometry count was 289 immediately before and after
removing one aircraft and one vehicle, and remained 289 a second later. Three.js's
renderer counter only includes uploaded GPU geometries, so it does not count every
CPU-side resource released by those removals. The lifecycle tests separately verify
that per-instance aircraft and vehicle geometries are disposed once, while cached
aircraft geometry and shared vehicle materials are preserved.
