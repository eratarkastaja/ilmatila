# Gameplay behavior to preserve

This is a compact record of the game loop and player-facing rules already present in Ilmatila. It is intended to help technical changes preserve current behavior; it is not a full design specification.

## Game identity

The implemented game is a single-player, real-time 3D air-combat sortie in a chase-camera view, with aircraft handling, radar-directed engagements, wingmen, ground support, structured mission phases, and a debrief. The available theaters are Finnish terrain packages. This describes the current game loop; it does not set a target for simulation realism.

## Player capabilities

- **Flight:** Keyboard and pointer-locked mouse steering work together. The aircraft has pitch, bank, heading, speed, afterburner, chase-camera zoom, and terrain-relative altitude feedback.
- **Radar and targeting:** The radar switches between air and ground search modes. Contacts are selected with `T`/`Y`; the selected target has separate sensor, lock-envelope, and boresight conditions. Lock acquisition and confirmation are shown to the player.
- **Weapons:** The player fires a cannon and carries air-to-air and air-to-ground missiles. Easy and Standard carry 10 missiles of each type; Hard carries 6 of each. Cannon ammunition is unlimited on Easy, 3,500 rounds on Standard, and 2,000 rounds on Hard. Missile reserve objectives scale to the selected loadout, keeping the same approximate reserve target when Hard starts with fewer missiles. Easy has unlimited fuel and hides the fuel gauge. Hard has four hours of normal-flight endurance, with afterburner burning fuel five times faster; Standard has twice the Hard reserve. Empty tanks disable afterburner and reduce the aircraft to glide speed so the player can still attempt to return. Missile launch depends on the radar-selected target, mode, lock, and launch envelope. The gun uses ballistic projectiles; missiles have finite motor/lifetime behavior and can be spoofed by decoys.
- **Countermeasures:** `F` deploys flares against infrared missiles and `C` deploys chaff against existing hostile radar tracks and radar-guided missiles. Easy carries 20 of each, Standard 15, and Hard 10. Both inventories use cooldowns. Flare decoys can distract infrared seekers when the missile can see a fresh flare ahead of its target. Each chaff burst gets one break roll against an eligible radar missile; a later burst may retry after a failed roll or once an earlier disruption ends. A successful break briefly interrupts guidance, followed by normal reacquisition.
- **Wingmen:** The player can order wingmen to attack, defend, regroup, or disengage. Wingmen have their own targeting, weapons, health, loss behavior, and radio reports. When their air-to-air missiles run out, they continue pursuing air targets for cannon attacks.
- **Objectives:** Primary objective types are clear air, support, and timed training. Missions can also define optional objectives such as returning all wingmen, avoiding damage, preserving missiles, meeting a time limit, destroying an optional ground target, protecting friendly ground forces, or intercepting an aircraft before it reaches a zone. Optional objectives appear in the briefing and debrief; failing one does not prevent primary mission completion. Mission phases guide the player through departure, navigation/ingress, contact, engagement, objective, RTB, and debrief. Clear-air and support sorties complete after the primary objective and extraction; training completes after its configured duration and then uses the return route.

## Combat philosophy

Combat is real-time and readable through radar tracks, a selected-target lock cue, a gun boresight/lead presentation, threat warnings, countermeasure feedback, radio calls, and objective/route cues. AI includes detection and reaction delays, staging/inbound behavior, weapon use, evasion, and wingman tactics; avoid replacing these interacting behaviors with isolated stat changes unless balance work is requested.

The player is not granted a confirmed hit merely by firing at a locked contact: cannon shots are ballistic and missile seekers can lose guidance or be spoofed. Collision, terrain, and the playable terrain boundary can end a sortie.

## Difficulty philosophy

The three built-in presets are `easy`, `standard`, and `hard` in `src/combat/difficulty.js`. They tune both numeric advantages and AI behavior, including player hull/incoming damage, hostile health and aim spread, detection/reaction, firing cadence and range, maneuver/evasion chances, missile properties, wingman effectiveness, and ground air-defense behavior. Hard gives hostiles a modest durability and reaction advantage; its main distinction is coordinated target selection and stronger defensive choices. Fighters divide pressure between the player and nearby wingmen, then allow more fighters to focus the player when the player's observable speed and relative altitude indicate an energy disadvantage. This energy estimate is used only while the fighter has a valid player track. Hard missile evasion uses an incoming missile's position and velocity to choose a break.

Wingmen carry 4, 6, and 8 air-to-air missiles across easy, standard, and hard; hostile fighters carry 2, 4, and 5. Mi-24s carry 4 air-to-air missiles. Hostile fighters steer toward their selected air target inside their weapon engagement range so they can continue making cannon passes after their missiles are spent. On Hard, fighters coordinate their assignments, spread attacks across available wingmen, and launch player-targeted missiles only while assigned to the player.

## Balance-sensitive values

Treat changes to damage, accuracy/dispersion, missile turn/guidance/burn/lifetime, gun cadence, detection and reaction timing, AI maneuver/evasion probabilities, weapon ranges and inventories, countermeasure supply/cooldown, spawn counts/distances, player handling/hull, ground-defense strength, objective timing, or difficulty presets as gameplay changes. Keep shared rules in their existing mission, difficulty, ballistics, or missile-profile sources when possible.

## Mission structure and progression

The four built-in missions are:

- **Combat Air Patrol (`patrol`):** clear-air sortie; initially unlocked.
- **Training (`training`):** no hostiles and a timed objective; initially unlocked.
- **Intercept Flight (`intercept`):** larger air engagement; unlocked by completing patrol.
- **Close Air Support (`support`):** ground-support objective with advancing ground forces and hostile helicopters; unlocked by completing intercept.

Definitions and their spawn/route settings are in `src/mission/missions.js`. Authored, weighted variants can make small seeded changes to spawn distance, fighter composition and entry posture, ground force composition, training duration, optional objectives, and whether a reinforcement wave arrives. Variant selection and the reinforcement roll use streams derived from the sortie seed, so the same seed and mission choose the same alternative without shifting combat RNG. The menu uses that same seed and the combat spawn-layout calculation to preview ownship, wingmen, hostile formations, and scheduled reinforcements in heading-up radar positions; it also previews the variant's optional objectives. The chosen variant is identified in the debrief. Variants retain the mission's id, unlocks, and core objective family; this is controlled replay variation rather than procedural mission generation. `MissionFlowSystem` drives the phase and ingress/return route; `MissionSystem` evaluates the primary objective; `MissionOptionalObjectives` evaluates data-configured secondary criteria; `CareerProgress` stores unlocks, selected difficulty, and best records in browser local storage. Records are separated by difficulty. Do not change unlock requirements, mission identities, or primary objective completion rules as incidental refactoring.

## Player feedback to preserve

- Radar mode, contact visibility, selected target, lock acquisition, and confirmed/lost lock state must agree with weapon eligibility.
- The gun reticle tracks the aircraft boresight, while the radar target cue can represent lock state; do not conflate those signals.
- Missile launch/inbound warnings identify infrared versus radar guidance and pair them with `F` flares or `C` chaff; a radar track warning also calls out chaff. Countermeasure availability, airframe damage/degraded handling, and boundary warnings communicate immediate threats or constraints.
- Mission phase/route/objective indicators and radio reports provide navigation, task, wingman-command, and threat context. Avoid removing cues when changing their owning system.
- The debrief reports mission result, score, air/ground and total kills, cannon rounds/accuracy, player missiles fired/hit, damage, completion time, wingmen returned, and objectives completed. “Wingmen returned” counts wingmen still alive when the sortie closes. Current mission success depends on the primary objective and player extraction; wingman losses do not block completion. It adds an A–F sortie grade with visible points and reasons for mission completion, aircraft survival, wingman survival, cannon accuracy, damage avoidance, and missile efficiency. A weapon or wingman criterion is marked not scored when the sortie had no relevant weapon use or assigned wingmen; the grade is normalized over the remaining criteria. Progression continues to use the existing mission result data.

## Future design directions (non-binding)

Ideas that could be explored in separate design work include richer AI tactics, campaign-lite progression, loadout choices, and replay playback. The simulation now uses an internal deterministic seed per sortie; this does not change the current balance rules.
