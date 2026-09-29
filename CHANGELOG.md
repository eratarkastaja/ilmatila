# Changelog

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
