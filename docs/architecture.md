# Current architecture

## Source layout

```text
src/
  main.js                 app entry and lifecycle coordinator
  assets/                 runtime asset loading and disposal
  aircraft/               player and hostile aircraft visuals
  audio/                  game audio
  combat/                 sortie composition and combat systems
  effects/                flight effects
  environment/             terrain, atmosphere, clouds, and sun
    terrain/              terrain coverage and moving detail streamer
  ground/                 procedural ground vehicle visuals
  input/                  flight controls
  mission/                mission definitions and local progression
  performance/            development stress scenario
  ui/                     HUD, menu radar, translations, and styles

tests/
  combat/                 combat-system tests
  environment/terrain/    coverage tests
  input/                  control tests
```

`main.js` creates the Three.js scene and connects the menu, terrain, player, combat world, HUD, and frame loop. `CombatWorld` is the per-sortie composition root. Combat systems own focused state and behavior; they communicate through explicit references and callbacks so that the world does not duplicate system state.

## Combat responsibilities

| Responsibility | Owner | Main dependencies/state |
| --- | --- | --- |
| Frame orchestration, shared score, combat effects, HUD and sortie lifecycle | `CombatWorld` | Scene, player, terrain, AI, combat systems, HUD adapters |
| Flight input and aircraft control | `FlightControls`, `CombatInput` | Player transform, camera, pointer/keyboard state |
| Air and ground units, tactical behavior | `AirBattle`, `GroundBattle` | Player, terrain, units, velocity, projectile and countermeasure callbacks |
| Target selection and radar display data | `CombatRadar` | Player heading/position, hostile and friendly contacts |
| Weapon cadence, inventory, and launch conditions | `WeaponSystem` | Radar mode/lock, player, audio/FX, projectile insertion |
| Projectile movement, guidance, damage, and expiry | `ProjectileSystem` | Projectile queues, collision queries, decoys, destruction callbacks |
| Swept hit tests, aircraft/unit impacts, and operational boundary checks | `CollisionSystem` | Previous/current transforms, terrain coverage, collider lists |
| Decoys and countermeasure inventory/cooldowns | `CountermeasureSystem` | Player/hostile aircraft, projectile seeker state, scene/audio/FX |
| Objective progress and mission outcome | `MissionSystem` | Mission objective, remaining targets, destruction state, UI adapter |
| Sortie phases, navigation and waypoint presentation | `MissionFlowSystem` | Player position, mission settings, HUD adapter |
| Phase and wingman radio reports | `RadioSystem` | Phase changes, wingman events, audio cue, radio UI adapter |

The combat update order in `CombatWorld.update()` coordinates input, radar and lock state, weapon requests, AI, countermeasures/projectiles, effects, radio, mission flow, and HUD. The order ensures weapons and seekers use the current radar state and that mission/UI state observes the frame's combat results.

## State ownership

- `AirBattle` owns hostile aircraft and wingmen; `GroundBattle` owns friendly and hostile ground units.
- `WeaponSystem` owns gun timing and weapon stores. `ProjectileSystem` owns projectile queues and lifecycle.
- `CountermeasureSystem` owns flare/chaff inventory, deployment cooldowns, and decoys.
- `CollisionSystem` retains swept player-position history and performs terrain, boundary, vehicle, aircraft, and projectile collision queries.
- `MissionSystem` owns objective timing/progress and completion/failure outcome. `MissionFlowSystem` owns sortie phase and route state.
- `CombatWorld` owns values shared by several systems, including score, sampled player velocity, visual combat effects, and connections to the renderer/HUD.
- UI elements remain in the DOM. Simulation systems receive narrow callbacks or adapters where presentation is needed.

## Runtime lifecycle

The menu loads the selected terrain and shared aircraft assets before launch. Each sortie creates its combat systems and units. Returning to the menu disposes the sortie's units, effects, projectiles, and terrain-specific resources, then restores menu controls and audio state. Shared cached asset geometry remains alive until the app shuts down or its owner disposes it.

The development-only `?stress=1` query loads a repeatable high-entity sortie. Its profiling steps are in [performance profiling](performance-profiling.md).
