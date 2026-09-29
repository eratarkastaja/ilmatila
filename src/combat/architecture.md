# Combat architecture

## CombatWorld responsibility map

`CombatWorld` is created once per sortie. It owns the Three.js scene-facing lifetime and connects input, radar, battles, combat systems, HUD, and mission UI. The update order is intentional: input and radar contacts, lock update, weapon requests, air/ground AI, decoys and projectiles, effects, mission progress, then HUD.

| Responsibility | Current owner | State and key dependencies |
| --- | --- | --- |
| World setup and frame orchestration | `CombatWorld` | Scene, player, terrain, air/ground battle instances, shared velocity, radar, input |
| Weapon trigger, firing cadence, ammunition, launch gates | `WeaponSystem` | Player transform, radar lock/mode, audio/FX, scene, projectile insertion callback |
| Projectile storage, movement, guidance, damage application, and expiry | `ProjectileSystem` | Player/hostile queues, decoys, `CollisionSystem` queries, audio, and narrow world callbacks for destruction and effects |
| Player collision, projectile sweeps, and collision geometry queries | `CollisionSystem` | Player movement history, terrain bounds/heights, ground collider list, aircraft/unit transforms and velocities, player destruction callback |
| Player and AI countermeasures, decoy lifetime | `CountermeasureSystem` | Inventory/cooldown, decoy collection, player/enemy transforms and velocities, projectile references, scene, FX and audio |
| Objective evaluation and mission completion UI | `MissionSystem` | Objective config/progress, surviving target counts, destruction outcome, localized DOM elements and completion timer |
| Combat effects and target destruction | `CombatWorld` | Scene, FX, audio, score, shared effect list; called by weapon/projectile/collision processing |
| HUD, radar, pause/death and restart UI | `CombatWorld` | Radar, weapon/countermeasure state, mission state, DOM, localization, theater bounds |
| Air combat behavior | `AirBattle` | Player, terrain, enemy/wingmen state, shared velocity, projectile and hostile countermeasure callbacks |
| Ground combat behavior | `GroundBattle` | Player, terrain, unit/collider arrays, shared velocity and hostile projectile callback |

## CombatWorld method inventory

| Methods | Role after extraction |
| --- | --- |
| `constructor` | Builds the battle instances, systems, shared callbacks, and DOM adapters. |
| `get enemies`, `get allies`, `get friends`, `get redUnits`, `get playerShots`, `get hostiles` | Compatibility-facing getters for arrays owned by the battle/projectile systems. Existing HUD and render code can keep using the `CombatWorld` facade. |
| `getPlayerHeading` | Converts the player transform into the stable heading value needed by radar and AI. |
| `update` | Orchestrates frame order; systems keep their own update logic and state. |
| `checkPlayerCollision` | Preserves the caller-facing API and delegates to `CollisionSystem`. |
| `destroyPlayer`, `clearInput`, `dispose` | World-level sortie lifecycle, status/audio wiring, and delegation to system cleanup. |
| `killJet`, `destroyUnit` | Shared score, scene-removal, and impact-effect callbacks used by projectile resolution. |
| `addSpark`, `addExplosion`, `updateEffects` | Own the shared scene effect pool, which is rendered alongside all combat systems. |
| `updateHud` | Projects current system state and world state into the existing HUD elements. |

## Shared state and coupling

- World-owned runtime state is now limited to sortie coordination and presentation: `destroyed`, `score`, effect instances, `playerVelocity`, previous player position/heading, input, radar, scene/player/terrain references, and HUD/lifecycle nodes.
- `WeaponSystem` owns missile stores, gun cadence, cooldown and launch feedback. `ProjectileSystem` owns both projectile queues. `CollisionSystem` owns swept player history. `CountermeasureSystem` owns decoys, inventory and deployment cooldown. `MissionSystem` owns objective elapsed time and outcome.
- `enemies` and `allies` are getters over `AirBattle` arrays. `friends` and `redUnits` are getters over `GroundBattle` arrays. Projectile arrays are getters over `ProjectileSystem` storage; no combat array is copied into `CombatWorld` state.
- `ProjectileSystem` owns its player and hostile queues. Air/ground AI insert through callbacks, weapon launches use its add method, and `CountermeasureSystem` reads the queues to preserve decoys currently being tracked.
- Decoys, countermeasure inventory, cooldown, deployment and cleanup are owned by `CountermeasureSystem`; projectile seeker logic reads its shared decoy collection.
- Previous player position and velocity are sampled in `CombatWorld` because they are also inputs to flight controls and AI; swept collision history is held only by `CollisionSystem`.
- `playerVelocity` is sampled by `CombatWorld` and shared with air and ground AI, weapon launch, and collision calculations.
- `score` and destruction effects are still world-level because both air and ground kills update the same HUD score and effect pipeline.
- DOM nodes remain outside simulation state. Systems should receive callbacks or render adapters where they need UI feedback.
- Objective progress, outcome, completion state, and its UI timer are owned by `MissionSystem`; `CombatWorld` supplies remaining-target counts and reports player destruction.

## Extraction order

1. `WeaponSystem` (extracted): weapon firing, missile gating, ammunition, cooldown, and transient launch feedback. Regression tests cover lock gates, ammunition/domain selection, cooldown, and gun cadence.
2. `ProjectileSystem` (extracted): player/hostile projectile queues, movement, guidance, damage application, and expiry.
3. `CollisionSystem` (extracted): swept terrain, theater-boundary, vehicle, aircraft, and projectile hit tests. `ProjectileSystem` consumes its query results and retains damage and impact effects.
4. `CountermeasureSystem` (extracted): player/hostile flare and chaff deployment, inventory/cooldowns, decoy movement and cleanup.
5. `MissionSystem` (extracted): objective progress/outcome and mission completion/failure presentation.

Each extraction keeps the existing update order and adds focused regression coverage before the next responsibility moves. `WeaponSystem` and `ProjectileSystem` have focused tests for their launch gates, ammunition/cadence, impacts, threat indication, and projectile cleanup. `CollisionSystem` is covered for swept terrain/aircraft/boundary collisions, earliest projectile hit selection, and relative swept distance. `CountermeasureSystem` tests deployment limits and rearm timing, hostile seeker-specific response, inventory, and decoy cleanup while a missile still tracks the decoy. `MissionSystem` tests air/support/training completion and player-destruction failure outcomes.
