# Changelog

## 0.1.0-alpha.6 — 2026-09-30

### English

- Reordered sortie progression so Combat Air Patrol is the first combat mission, followed by Intercept Flight and Close Air Support. Training remains available from the start; combat missions unlock after a successful objective and extraction.
- Added persistent best-score records per mission and difficulty, plus a debrief with score, cannon accuracy, air and ground targets destroyed, damage taken, sortie time, and objectives completed.
- Added Easy, Standard, and Hard settings that tune player durability, countermeasures, incoming damage, hostile aircraft durability and aim, and wingman effectiveness.
- Improved player missile guidance with smoother terminal steering and proximity-fuze damage on close passes. Missile fuel and seeker countermeasures remain part of the flight model.
- Added structured departure, navigation, contact, engagement, objective, return, extraction, and debrief phases, with wingman attack, defend, and regroup orders.
- Split combat responsibilities into weapon, projectile, collision, countermeasure, mission, and feedback systems. Added projectile reuse and cleanup coverage for combat entities and visual resources.
- Added a development stress scenario and documented its Chrome Performance and Memory profiling workflow and measurements.
- Added regression coverage for ballistic math, hit testing, radar targeting, mission outcomes, system behavior, projectile reuse, and Three.js resource cleanup; added `npm test`, `npm run test:watch`, and `npm run lint`.

Alpha 6 is still an early playable prototype. The mission structure is in place, but combat balance and pacing need broader player testing before the project is ready for beta.

## 0.1.0-alpha.5 — 2026-09-29

### English

- Added distinct air and ground missile inventories, with AIM-120C AMRAAM and AGM-65D Maverick designations shown for the active radar mode.
- Limited missile powered flight and guidance, with a coast phase after motor burnout.
- Reworked the cannon lead cue around the actual aircraft boresight and gun muzzle; it now supports air and ground targets and accounts for target motion, aircraft velocity, and projectile drop.
- Smoothed pitch input and screen-space gunsight motion for more gradual nose-up and nose-down control.
- Tuned cannon damage and hit tolerance, including a forgiving near-hit envelope against ground vehicles.
- Corrected heading-up radar contact orientation so left and right match the aircraft's perspective, and added warnings near the theater boundary.
- Refined atmospheric haze, afterburner wakes, and missile smoke appearance.

Alpha 5 remains an early prototype. Flight, radar, weapons, AI, and battlefield behavior are simplified game systems, not real-world training or operational tools.

## 0.1.0-alpha.4 — 2026-09-29

### English

- Added a moving 6 × 6 km high-detail terrain window that follows the aircraft across every theater, with cached tile geometry and imagery to reduce transition stutter.
- Reworked theater-wide terrain packages and Pages delivery; the 2 m/pixel orthophoto tiles now cover the full map area instead of favoring the mission start point.
- Improved air-combat opening distance and pacing, ground-unit movement and engagements, and low-altitude anti-aircraft fire.
- Made missile smoke trails fuller and more continuous, and refined cannon projectile hit handling and Finnish roundel placement.
- Updated terrain data attribution, release documentation, and terrain processing dependencies.

Alpha 4 remains an early prototype. Flight, radar, weapons, AI, and battlefield behavior are simplified game systems, not real-world training or operational tools.

## 0.1.0-alpha.3 — 2026-09-29

### English

- Refined the GAU-22/A cannon as a rotary weapon, with a 55-round-per-second firing cadence, heavier sound, and directional tracer rounds.
- Improved cannon hit detection and collision checks at high speed, and tuned projectile behavior.
- Improved combat pacing, aircraft behavior, asset loading, and terrain handling.
- Added an optional soundtrack with two original Erätarkastaja tracks. The menu and pause dialog share a persistent music toggle; Ogg Vorbis delivery reduces the two WAV masters from about 46.2 MB to 4.6 MB combined.
- Replaced the missile-without-lock feedback tone with a lower, filtered cockpit warning.
- Updated release metadata and audio ownership and license documentation.

Alpha 3 remains an early prototype. Flight, radar, weapons, AI, and battlefield behavior are simplified game systems, not real-world training or operational tools.

## 0.1.0-alpha.2 — 2026-09-29

### English

- Made air engagements more active: aircraft AI now holds tighter combat patterns in the mission area, wingmen engage hostile aircraft, and hostile pilots can deploy countermeasures against incoming missiles.
- Clarified radar target selection and missile locking, added a target cue in the flight view, and introduced a subtle cannon lead cue with tuned hit detection.
- Added mission completion objectives and clear notices when an objective is met.
- Improved clouds, aircraft trails, missile smoke, countermeasures, gun tracers, explosions, and combat audio.
- Refined the mission menu, added ERÄGAMES branding, and improved English and Finnish copy and responsive readability.
- Updated aircraft, audio, terrain, and source-code attribution. Terrain packages remain versioned separately and are fetched by the Pages workflow.

Alpha 2 remains an early prototype. Flight, radar, weapons, AI, and battlefield behavior are simplified game systems, not real-world training or operational tools.

## 0.1.0-alpha.1 — 2026-09-29

Initial public alpha with the browser game, F-35 visual model, English and Finnish interface, four mission profiles, and optional Finnish terrain packages for the hosted game.
