# ILMATILA

**ILMATILA 0.1.0-alpha.5** is an independent browser-based air-combat game by **ERÄGAMES**, built with Three.js. It is an early playable prototype: aircraft handling, radar, weapons, opponents, and ground battles are game simulations and are not intended for real-world training or operational use.

The interface defaults to English and also supports Finnish. See the [changelog](CHANGELOG.md) for this alpha's updates.

## Run locally

Requirements: Node.js 20.19+ or 22.12+, npm, and a modern browser with WebGL support.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Create a production build with `npm run build`; `npm run preview` serves that build locally. The app does not need an API key at runtime.

## GitHub Pages

After GitHub Pages is enabled with **Settings → Pages → Build and deployment → Source → GitHub Actions**, the site is built and deployed automatically when changes are pushed to `master`. The workflow can also be started manually from the repository's Actions tab. The project URL is <https://eratarkastaja.github.io/ilmatila/>.

Generated MML terrain packages stay out of Git history. The Pages workflow downloads the four versioned area archives from the [terrain data release](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.1.0), verifies their SHA-256 checksums, and includes them in the deployed site. The in-game terrain viewer needs no API key; the key is only required to fetch updated source data.

## Flight controls

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
| M | Fire a guided missile when the selected hostile contact is within range and locked |
| R | Switch radar between air and ground modes |
| C | Deploy flares and chaff |
| Esc | Pause the sortie |

## Weapons and radar

The heading-up radar keeps the aircraft's nose at the top of the display. Press `R` to choose air or ground mode, then `T` to select a hostile track. The cannon lead cue shows the predicted firing point for the selected aircraft or ground vehicle. The missile cue and count follow the selected radar mode: six AIM-120C AMRAAM air-to-air missiles and four AGM-65D Maverick air-to-ground missiles are carried as separate game inventories. Missile guidance ends after its powered flight phase; a missile cannot pursue a target indefinitely.

## Audio

Combat audio includes bundled CC0 samples for cannon fire, missile launch, and explosions, plus a CC BY 3.0 jet-engine accent. Their sources and attribution are listed in the in-game **Assets & licenses** panel and [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). Procedural audio remains available if a sample fails to load.

The optional soundtrack contains two original tracks by Erätarkastaja. They are encoded as stereo Ogg Vorbis and total about 4.6 MB; the WAV masters remain outside the repository. Music is loaded only after the player enables it from the menu or pause dialog, and the preference persists between visits. Copyright and use details are in [`public/assets/audio/ATTRIBUTION.md`](public/assets/audio/ATTRIBUTION.md); the soundtrack is not covered by the project GPL license.

## Terrain data

The repository contains the terrain-area index and downloader, while generated map packages are published as [versioned terrain archives](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.1.0). The Pages deployment downloads all four areas (Päijänne, Virolahti, Ilomantsi, and Kuusamo) and includes them in the site. Local source-data updates require an MML API key; see [the terrain-tool guide](tools/terrain/README.md). The game itself needs no API key.

## Aircraft and project structure

The player aircraft uses a converted FlightGear F-35B model as a visual stand-in for an F-35A. It is not an F-35A-specific model or livery. The original model source, texture, license, credits, and conversion script are included. Hostile flights use converted FlightGear Su-27 and MiG-29 exterior models; the Su-27 is a Flanker-family visual, not a Su-35-specific model. Their source files, licenses, credits, and browser-optimized conversions are included. Ground vehicles remain project-authored procedural models; vetted external candidates and license notes are in [docs/asset-sourcing.md](docs/asset-sourcing.md).

- `src/main.js` coordinates the menu, sortie, pause, and game lifecycle.
- `src/combat/` contains flight controls, radar, ballistics, hit testing, projectiles, and air and ground combat behavior.
- `src/terrain.js`, `src/clouds.js`, `src/sun.js`, and `src/fx.js` build the environment and visual effects.
- `src/hud.js`, `src/menu-radar.js`, and `src/i18n.js` implement the HUD, menu radar, and translations.
- `tools/terrain/` contains the optional MML data downloader and its guide.
- `scripts/convert-flightgear-f35.py` rebuilds the player aircraft GLB from its included source files.
- `npm run assets:aircraft` rebuilds the Su-27 and MiG-29 GLBs from their included source files.

## Licensing and attribution

The project source is licensed under [GNU GPL version 3 only](LICENSE). Copyright © 2026 ERÄGAMES. The ERÄGAMES name and logo are studio brand assets and are not covered by the source-code license. Third-party files and optional data have their own terms; see [third-party notices](THIRD-PARTY-NOTICES.md), the in-game **Assets & licenses** panel, and the aircraft [asset credits](public/assets/aircraft/ASSET-CREDITS.md). MML map data is not committed to the repository.

ILMATILA is an independent game by ERÄGAMES and is not affiliated with or endorsed by the Finnish Air Force, Lockheed Martin, FlightGear, or the National Land Survey of Finland.
