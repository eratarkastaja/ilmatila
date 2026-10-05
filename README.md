# ILMATILA

ILMATILA is an independent browser-based air-combat game by ERÄGAMES. The current release candidate is **0.2.0-beta.1**. Missions, combat, progression, aircraft handling, radar, and weapons are playable; balance and mission pacing may still change during beta. The simulation is fictional and is not intended for real-world training or operational use.

**[Play ILMATILA in your browser](https://eratarkastaja.github.io/ilmatila/).**

The interface supports English and Finnish. The game runs in a modern browser with WebGL and needs no API key at runtime.

## Supported Platforms and Browsers

This beta supports desktop play with a keyboard, mouse, WebGL 2, and Pointer Lock. The verified browser engines are Google Chrome, Microsoft Edge, and Firefox. The browser runs recorded for this release candidate used Debian Linux: Chrome 154.0.8037.97, Edge 154.0.4258.53, and Playwright Firefox 155.0. Other operating systems and browser versions are not separately certified. See the [browser compatibility report](docs/browser-compatibility.md) for the checks and limitations.

Touch and mobile devices are not supported in this beta. Apple Safari has not yet been verified and is outside the supported browser list until it passes a macOS smoke run.

## Known Issues

- Safari compatibility is unverified; use a supported desktop browser listed above.
- Automated tab-switch testing confirms that a sortie survives switching away and back, but headless browsers do not reliably expose operating-system focus/visibility transitions. Real desktop focus behavior has not been certified across operating systems.
- The `?stress=1` developer scenario intentionally exceeds the normal-mission performance target; it is a profiling tool, not a supported gameplay mode.

No open P0/P1 issue is known for the verified Chrome, Edge, and Firefox runs. See the [release candidate notes](docs/beta-release-candidate.md) for the complete validation record.

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

The mission menu and pause menu open a **Show Controls** dialog with the flight controls. Mouse steering and keyboard steering work together. The radar can switch between air and ground modes; the gun lead cue and selected radar target support combat. Air-to-air and air-to-ground missiles use separate inventories. Standard and Hard sorties have finite fuel, and afterburner use burns it faster; Easy has unlimited fuel.

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
| T | Select the next detected hostile radar target |
| Y | Select the previous detected hostile radar target |
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

To report a beta issue, use **Copy diagnostics** in the mission menu, pause dialog, debrief, aircraft-loss screen, or error screen, then open **Report beta issue** and paste the copied block. It includes the sortie seed and technical game/browser details, but no personal data.

## Terrain and GitHub Pages

The game currently serves four Finnish areas: Päijänne, Virolahti, Ilomantsi, and Kuusamo. Each terrain package covers 32 × 32 km and contains Maanmittauslaitos elevation and colour orthophoto data. The playable boundary follows the usable elevation and orthophoto coverage; terrain outside that footprint is obscured and is not part of the mission area.

Generated terrain packages are published separately from the source repository. The GitHub Pages workflow downloads the current `terrain-data-v1.2.0` release, checks its SHA-256 manifest, and adds the packages to the site build. Local terrain generation requires an MML API key; see the [terrain tool guide](tools/terrain/README.md).

## Project layout

- `src/bootstrap.js` checks browser support; `src/main.js` coordinates the menu, missions, and app lifecycle.
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
