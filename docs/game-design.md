# Gameplay behavior to preserve

This is a compact record of the game loop and player-facing rules already present in Ilmatila. It is intended to help technical changes preserve current behavior; it is not a full design specification.

## Game identity

The implemented game is a single-player, real-time 3D air-combat sortie in a chase-camera view, with aircraft handling, radar-directed engagements, wingmen, ground support, structured mission phases, and a debrief. The available theaters are Finnish terrain packages. This describes the current game loop; it does not set a target for simulation realism.

## Player capabilities

- **Flight:** Keyboard and pointer-locked mouse steering work together. The aircraft has pitch, bank, heading, speed, afterburner, chase-camera zoom, and terrain-relative altitude feedback.
- **Radar and targeting:** The radar switches between air and ground search modes. Contacts are selected with `T`/`Y`; the selected target has separate sensor, lock-envelope, and boresight conditions. Lock acquisition and confirmation are shown to the player.
- **Weapons:** The player fires a cannon and carries separate air-to-air and air-to-ground missile stores. Missile launch depends on the radar-selected target, mode, lock, and launch envelope. The gun uses ballistic projectiles; missiles have finite motor/lifetime behavior and can be spoofed by decoys.
- **Countermeasures:** `F` deploys flares from a shared inventory, subject to a deployment cooldown. Flares can distract infrared seekers when the missile can see a fresh flare ahead of its target; radar-guided missiles are not affected.
- **Wingmen:** The player can order wingmen to attack, defend, regroup, or disengage. Wingmen have their own targeting, weapons, health, loss behavior, and radio reports.
- **Objectives:** Current objective types are clear air, support, and timed training. Mission phases guide the player through departure, navigation/ingress, contact, engagement, objective, RTB, and debrief. Clear-air and support sorties complete after the objective and extraction; training completes after its configured duration and then uses the return route.

## Combat philosophy

Combat is real-time and readable through radar tracks, a selected-target lock cue, a gun boresight/lead presentation, threat warnings, countermeasure feedback, radio calls, and objective/route cues. AI includes detection and reaction delays, staging/inbound behavior, weapon use, evasion, and wingman tactics; avoid replacing these interacting behaviors with isolated stat changes unless balance work is requested.

The player is not granted a confirmed hit merely by firing at a locked contact: cannon shots are ballistic and missile seekers can lose guidance or be spoofed. Collision, terrain, and the playable terrain boundary can end a sortie.

## Difficulty philosophy

The three built-in presets are `easy`, `standard`, and `hard` in `src/combat/difficulty.js`. They currently tune both numeric advantages and AI behavior parameters, including player hull/incoming damage, hostile health and aim spread, detection/reaction, firing cadence and range, maneuver/evasion chances, missile properties, wingman effectiveness, and ground air-defense behavior. Do not silently change those relationships or presume difficulty is already behavior-only.

**Non-binding recommendation:** If future difficulty work needs more distinction, consider adding tactical choices, coordination, or reaction patterns alongside numeric tuning rather than relying only on accuracy, damage, or health multipliers. This is a direction to evaluate, not a requirement for technical changes.

## Balance-sensitive values

Treat changes to damage, accuracy/dispersion, missile turn/guidance/burn/lifetime, gun cadence, detection and reaction timing, AI maneuver/evasion probabilities, weapon ranges and inventories, countermeasure supply/cooldown, spawn counts/distances, player handling/hull, ground-defense strength, objective timing, or difficulty presets as gameplay changes. Keep shared rules in their existing mission, difficulty, ballistics, or missile-profile sources when possible.

## Mission structure and progression

The four built-in missions are:

- **Combat Air Patrol (`patrol`):** clear-air sortie; initially unlocked.
- **Training (`training`):** no hostiles and a timed objective; initially unlocked.
- **Intercept Flight (`intercept`):** larger air engagement; unlocked by completing patrol.
- **Close Air Support (`support`):** ground-support objective with advancing ground forces and hostile helicopters; unlocked by completing intercept.

Definitions and their spawn/route settings are in `src/mission/missions.js`. `MissionFlowSystem` drives the phase and ingress/return route; `MissionSystem` evaluates objective progress; `CareerProgress` stores unlocks, selected difficulty, and best records in browser local storage. Records are separated by difficulty. Do not change unlock requirements, mission counts, timings, or objective completion rules as incidental refactoring.

## Player feedback to preserve

- Radar mode, contact visibility, selected target, lock acquisition, and confirmed/lost lock state must agree with weapon eligibility.
- The gun reticle tracks the aircraft boresight, while the radar target cue can represent lock state; do not conflate those signals.
- Missile launch/inbound warnings, countermeasure availability, airframe damage/degraded handling, and boundary warnings communicate immediate threats or constraints.
- Mission phase/route/objective indicators and radio reports provide navigation, task, wingman-command, and threat context. Avoid removing cues when changing their owning system.
- The debrief reports outcome, score, kills, gun use/accuracy, missiles, damage, and objective result; progression uses this result data.

## Future design directions (non-binding)

Ideas that could be explored in separate design work include richer AI tactics, optional objectives, sortie grading, campaign-lite progression, loadout choices, wingman survival objectives, and deterministic sortie seeds/replays. None is a current requirement or an implied balance target.
