# ILMATILA

**ILMATILA 0.1.0-alpha.1** is an unofficial browser-based air-combat game built with Three.js. It is an early playable prototype: aircraft handling, radar, weapons, opponents, and ground battles are game simulations and are not intended for real-world training or operational use.

The interface defaults to English and also supports Finnish. See [the Finnish README](README.fi.md) for Finnish setup instructions.

## Run locally

Requirements: Node.js 20.19+ or 22.12+, npm, and a modern browser with WebGL support.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Create a production build with `npm run build`; `npm run preview` serves that build locally. The app does not need an API key at runtime.

## GitHub Pages

After GitHub Pages is enabled with **Settings → Pages → Build and deployment → Source → GitHub Actions**, the site is built and deployed automatically when changes are pushed to `master`. The workflow can also be started manually from the repository's Actions tab. The project URL is <https://eratarkastaja.github.io/ilmatila/>.

Generated MML terrain packages stay out of Git history. The Pages workflow downloads the four versioned area archives from the [terrain data release](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.0.0), verifies their SHA-256 checksums, and includes them in the deployed site. The in-game terrain viewer needs no API key; the key is only required to fetch updated source data.

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
| Ctrl | Fire a guided missile; aim at a hostile contact while the HUD searches for a lock |
| R | Switch radar between air and ground modes |
| C | Deploy flares and chaff |
| Esc | Pause the sortie |

## Terrain data

The repository contains the terrain-area index and downloader, while generated map packages are published as [versioned terrain archives](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.0.0). The Pages deployment downloads all four areas (Päijänne, Virolahti, Ilomantsi, and Kuusamo) and includes them in the site. Local source-data updates require an MML API key; see [the terrain-tool guide](tools/terrain/README.md). The game itself needs no API key.

## Aircraft and project structure

The player aircraft uses a converted FlightGear F-35B model as a visual stand-in for an F-35A. It is not an F-35A-specific model or livery. The original model source, texture, license, credits, and conversion script are included.

- `src/main.js` coordinates the menu, sortie, pause, and game lifecycle.
- `src/combat/` contains the flight controls, radar, weapons, and combat behavior.
- `src/terrain.js`, `src/clouds.js`, `src/sun.js`, and `src/fx.js` build the environment and visual effects.
- `src/hud.js`, `src/menu-radar.js`, and `src/i18n.js` implement the HUD, menu radar, and translations.
- `tools/terrain/` contains the optional MML data downloader and its guide.
- `scripts/convert-flightgear-f35.py` rebuilds the aircraft GLB from the included source files.

## Licensing and attribution

The project source is licensed under [GNU GPL version 3 only](LICENSE). Third-party files and optional data have their own terms; see [third-party notices](THIRD-PARTY-NOTICES.md), the in-game **Assets & licenses** panel, and the aircraft's [asset credits](public/assets/f35/ASSET-CREDITS.md). MML map data is not committed to the repository.

ILMATILA is an independent community project and is not affiliated with or endorsed by the Finnish Air Force, Lockheed Martin, FlightGear, or the National Land Survey of Finland.
