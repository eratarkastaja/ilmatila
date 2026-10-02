# ILMATILA

ILMATILA is an independent browser-based air-combat game by ERÄGAMES. The current source version is **0.1.0-alpha.14**. It is an alpha build: missions, combat, progression, aircraft handling, radar, and weapons are playable, while balance and mission pacing remain under development. The simulation is fictional and is not intended for real-world training or operational use.

**[Play ILMATILA in your browser](https://eratarkastaja.github.io/ilmatila/).**

The interface supports English and Finnish. The game runs in a modern browser with WebGL and needs no API key at runtime.

## Run locally

Requirements: Node.js 20.19+, 22.13.x, or 24+, and npm.

```sh
npm ci
npm run dev
```

Use `npm run build` to create the production site and `npm run preview` to serve it locally. Run the automated checks with `npm test` and `npm run lint`; `npm run test:watch` runs Vitest in watch mode.

## Current game

The available sorties are Combat Air Patrol, Intercept Flight, Close Air Support, and Training. Combat missions use a briefing, departure, navigation, contact, engagement, objective, return-to-base, extraction, and debrief flow. The briefing lists each sortie's optional objectives, and the debrief reports which were completed; optional objectives do not determine primary mission success. Intercept Flight is an air-only mission; Close Air Support pits Finnish defenders against advancing armor and two Mi-24 gunships. Difficulty affects hostile detection, combat behavior, and damage. Mission records and unlocks are stored locally in the browser.

The player flies an F-35A representation using an included FlightGear F-35B visual model. Hostile flights use FlightGear Su-27-family and MiG-29 exterior models. Ground vehicles and the Mi-24 helicopter are low-detail, project-authored procedural models. These models are visual game assets, not exact engineering replicas.

Flight controls are shown in the mission menu and in the pause menu's **Show Controls** view. Mouse steering and keyboard steering work together. The radar can switch between air and ground modes; the gun lead cue and selected radar target support combat. Air-to-air and air-to-ground missiles use separate inventories.

## Controls

| Input | Action |
| --- | --- |
| W / Up | Lower the nose |
| S / Down | Raise the nose |
| A / Left | Bank and turn left |
| D / Right | Bank and turn right |
| Q / E | Roll around the aircraft's longitudinal axis |
| Shift | Afterburner |
| Space | Fire cannon |
| T | Cycle detected hostile radar tracks |
| M | Fire a missile when the selected target is in range and locked |
| R | Switch radar between air and ground modes |
| F | Deploy flares against infrared threats |
| C | Deploy chaff against radar tracking and radar-guided missiles |
| 1 / 2 / 3 / 4 | Order wingmen: attack / defend / regroup / disengage |
| Move mouse | Steer the aircraft |
| Left / right mouse button | Fire cannon / launch a missile |
| Mouse wheel or + / − | Zoom the chase camera |
| Esc | Release mouse capture; flight continues |
| P | Pause or resume flight |

After pressing Esc, click the flight view to capture the mouse again.

## Terrain and GitHub Pages

The game currently serves four Finnish areas: Päijänne, Virolahti, Ilomantsi, and Kuusamo. Each terrain package covers 32 × 32 km and contains Maanmittauslaitos elevation and colour orthophoto data. The playable boundary follows the usable elevation and orthophoto coverage; terrain outside that footprint is obscured and is not part of the mission area.

Generated terrain packages are published separately from the source repository. The GitHub Pages workflow downloads the current `terrain-data-v1.2.0` release, checks its SHA-256 manifest, and adds the packages to the site build. Local terrain generation requires an MML API key; see the [terrain tool guide](tools/terrain/README.md).

## Project layout

- `src/main.js` starts the app and coordinates menu, mission, and lifecycle.
- `src/aircraft/`, `src/ground/`, and `src/assets/` contain aircraft, procedural ground units, and asset loading.
- `src/combat/` contains `CombatWorld` and the flight, weapon, projectile, collision, radar, mission, radio, and AI systems.
- `src/environment/` contains terrain, terrain coverage and streaming, atmosphere, clouds, and sun effects.
- `src/audio/`, `src/effects/`, `src/input/`, `src/mission/`, and `src/ui/` contain audio, effects, controls, mission data/progression, HUD, menu, translations, and styles.
- `tests/` contains the Vitest suite, grouped by area.
- `tools/terrain/` contains the optional MML downloader and terrain package builder.
- `tools/assets/` and `scripts/` contain the aircraft conversion tools.
- `docs/architecture.md`, `docs/performance-profiling.md`, and `docs/assets-and-licensing.md` describe the current implementation.

## Licensing

Project source code is licensed under [GNU GPL version 3 only](LICENSE). The interactive **Assets & Licenses** panel links to the project source, the complete GPL text, and the third-party notices. Aircraft source files include their own license copies and attribution. Terrain, sound, typefaces, and original music retain their respective terms. The ERÄGAMES name and logo are studio brand assets and are excluded from the source-code license.

See [current asset and license information](docs/assets-and-licensing.md) and the complete [third-party notices](public/licenses/THIRD-PARTY-NOTICES.md). ILMATILA is not affiliated with or endorsed by the Finnish Air Force, Lockheed Martin, FlightGear, or the National Land Survey of Finland.
