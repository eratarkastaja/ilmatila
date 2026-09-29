# Combat architecture

## CombatWorld responsibility map

`CombatWorld` is created once per sortie. It owns the Three.js scene-facing lifetime and connects input, radar, battles, combat systems, HUD, and mission UI. The update order is intentional: input and radar contacts, lock update, weapon requests, air/ground AI, decoys and projectiles, effects, mission progress, then HUD.

| Responsibility | Current owner | State and key dependencies |
| --- | --- | --- |
| World setup and frame orchestration | `CombatWorld` | Scene, player, terrain, air/ground battle instances, shared velocity, radar, input |
| Weapon trigger, firing cadence, ammunition, launch gates | `WeaponSystem` | Player transform, radar lock/mode, audio/FX, scene, projectile insertion callback |
| Projectile storage, movement, guidance, and expiry | `CombatWorld.updateShots` (next extraction) | Player/hostile projectile arrays, aircraft and ground targets, terrain, decoys, audio, collision and effects callbacks |
| Player collision and swept aircraft collision | `CombatWorld.checkPlayerCollision` (planned extraction) | Player movement history, terrain bounds/heights, ground collider list, aircraft transforms and velocities, player destruction callback |
| Player and AI countermeasures, decoy lifetime | `CombatWorld` (planned extraction) | Decoy list, player/enemy transforms and velocities, projectile seekers, scene, FX and audio |
| Objective evaluation and mission completion UI | `CombatWorld` (planned extraction) | Objective config/progress, surviving target counts, destruction state, localized DOM elements and completion timer |
| Combat effects and target destruction | `CombatWorld` | Scene, FX, audio, score, shared effect list; called by weapon/projectile/collision processing |
| HUD, radar, pause/death and restart UI | `CombatWorld` | Radar, weapon/countermeasure state, mission state, DOM, localization, theater bounds |
| Air combat behavior | `AirBattle` | Player, terrain, enemy/wingmen state, shared velocity, projectile and hostile countermeasure callbacks |
| Ground combat behavior | `GroundBattle` | Player, terrain, unit/collider arrays, shared velocity and hostile projectile callback |

## Shared state and coupling

- `enemies` and `allies` alias `AirBattle` arrays. `friends`, `redUnits`, and `colliders` alias `GroundBattle` arrays.
- `playerShots` and `hostiles` are mutable queues shared with the AI systems through insertion callbacks. Projectile ownership will move to `ProjectileSystem` while preserving these insertion points.
- `playerVelocity` is sampled by `CombatWorld` and shared with air and ground AI, weapon launch, and collision calculations.
- `score` and destruction effects are still world-level because both air and ground kills update the same HUD score and effect pipeline.
- DOM nodes remain outside simulation state. Systems should receive callbacks or render adapters where they need UI feedback.

## Extraction order

1. `WeaponSystem`: weapon firing, missile gating, ammunition, cooldown, and transient launch feedback. Regression tests cover lock gates, ammunition/domain selection, cooldown, and gun cadence.
2. `ProjectileSystem`: player/hostile projectile storage, movement, guidance, impacts, and expiry. It will call narrow world adapters for collisions, kills, audio, and effects.
3. `CollisionSystem`: swept terrain, theater-boundary, vehicle, aircraft, and projectile hit tests.
4. `CountermeasureSystem`: player/hostile flare and chaff deployment, inventory/cooldowns, decoy movement and cleanup.
5. `MissionSystem`: objective progress/outcome and mission completion/failure presentation.

Each extraction keeps the existing update order and adds focused regression coverage before the next responsibility moves.
