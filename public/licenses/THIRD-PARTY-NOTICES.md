# Third-party notices

ILMATILA is created and published by ERÄGAMES. Copyright © 2026 ERÄGAMES. The project source is licensed under GNU GPL version 3 only and is provided without warranty; see the repository's `LICENSE` file. The ERÄGAMES name and logo are studio brand assets and are not covered by the source-code license. Components and data listed below retain their own licenses.

## Aircraft model

The bundled GLB is derived from the FlightGear F-35B model by FGMEMBERS. The original AC3D model and texture, the full GPL-3.0 license, and contributor credits are in [`public/assets/f35/source/`](public/assets/f35/source/). The conversion is described in [`public/assets/f35/ASSET-CREDITS.md`](public/assets/f35/ASSET-CREDITS.md) and implemented by `scripts/convert-flightgear-f35.py`.

Hostile aircraft also use two FlightGear exterior models:

- **Su-27 Flanker** is derived from [xcvb85/Su-27](https://github.com/xcvb85/Su-27), revision 30f1cb45c87d4f2443de198d7577a3a9b6b0455a. It is a Su-27-family exterior, not a Su-35-specific model. The original model, selected textures, GPL-3.0 license, source credits, and conversion details are in [public/assets/aircraft/su27/](public/assets/aircraft/su27/).
- **MiG-29 Fulcrum** is derived from [Mercenary-Mercury/MiG-29_9-12](https://github.com/Mercenary-Mercury/MiG-29_9-12), revision d4a299bf88412f579b2067874989a8088b2f6d66. The exterior airframe and required textures are included with the GPL-3.0 license and source credits in [public/assets/aircraft/mig29/](public/assets/aircraft/mig29/). The upstream repository also contains an optional GPL-2.0 clock; that cockpit component is not used or included.

Both converted GLBs are distributed under GNU GPL version 3 along with their corresponding model sources and license text. The offline converter is tools/assets/convert-flightgear-aircraft.mjs and uses MIT-licensed assimpjs and glTF Transform packages.

## Ground vehicle model research

Ground vehicles currently use project-authored procedural geometry. External candidates and their license checks are documented in [docs/asset-sourcing.md](docs/asset-sourcing.md); those candidate files are not bundled or used at runtime. No downloaded Sketchfab model is included. Sketchfab's download API requires account authentication and requires visible author, source, and license attribution; downloads must be obtained through an authorized account.

## Mapping data

Terrain packages use National Land Survey of Finland open data: Elevation Model 2 m and Colour Orthophotos, fetched from its WCS service. The public [terrain data release v1.2.0](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.2.0) contains four 32 × 32 km areas, retrieved 2026-09-30. Each package includes `terrain.json` and `ATTRIBUTION.md` with provider, dataset, retrieval date, source, license, and modification details. The game derives a lower-resolution elevation grid, crops and resamples standard orthophotos into tiles, streams a moving 6 × 6 km higher-detail image window in 2 km steps across each theater, and derives water masks from the imagery. The source data is licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). See the [terrain-tool guide](https://github.com/eratarkastaja/ilmatila/blob/master/tools/terrain/README.md) for details.

## Libraries and fonts

- **Three.js** is used by the browser app under the MIT License. The copyright and license text are in [`public/licenses/THREE-MIT.txt`](public/licenses/THREE-MIT.txt).
- **Vite**, **geotiff.js**, **assimpjs**, and **glTF Transform** are used for development, optional terrain downloads, and offline asset conversion. They are MIT licensed and remain development/tooling dependencies; neither their runtime code nor the converters are bundled into the browser app. Their lockfile records the resolved versions.
- **Sharp** is used only by the optional terrain downloader to encode high-detail orthophotos as JPEG. Sharp is Apache-2.0 licensed; its prebuilt libvips binaries are LGPL-3.0-or-later. Neither is bundled into the browser app.
- **Barlow Condensed** by The Barlow Project Authors and **Rajdhani** by Indian Type Foundry are loaded from Google Fonts and licensed under the SIL Open Font License 1.1. The font source projects are [Barlow](https://github.com/jpt/barlow) and [Rajdhani](https://github.com/itfoundry/rajdhani); the upstream license is available at [SIL Open Font License](https://openfontlicense.org/).

## Sound effects

The game bundles four sound effects under `public/assets/audio/`. The cannon loop and explosion by **qubodup** and the rocket launch by **gracenew** are published on Freesound under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The incoming-missile warning is synthesized in-game and uses no external audio asset. The jet takeoff sound by **dklon** is published on OpenGameArt under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) and is credited here as required. Its original mono WAV was encoded to Ogg Vorbis for the game. Source links, filenames, and use are listed in the in-game **Assets & licenses** panel and [`public/assets/audio/ATTRIBUTION.md`](public/assets/audio/ATTRIBUTION.md).

## Original soundtrack

The original soundtrack tracks `fm-rankaisija.ogg` and `orbital-decay.ogg` are composed and performed by **Erätarkastaja**, the project owner. Copyright remains with Erätarkastaja, who grants permission to include the recordings in ILMATILA. All other rights are reserved; the tracks are not covered by the project GPL license. See [`public/assets/audio/ATTRIBUTION.md`](public/assets/audio/ATTRIBUTION.md).

The in-game **Assets & licenses** panel provides user-facing attribution links. Optional terrain data is not stored in this repository; see [`tools/terrain/README.md`](tools/terrain/README.md) before redistributing generated map packages.
