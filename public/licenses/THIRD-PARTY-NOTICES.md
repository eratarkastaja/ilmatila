# Third-party notices

ILMATILA is an independent game by ERÄGAMES. Copyright © 2026 ERÄGAMES. The project source is licensed under GNU GPL version 3 only; redistribution is permitted under that license, and the software is provided without warranty. Read the complete [GPL-3.0 license](GPL-3.0.txt) and obtain the corresponding source from the [public project repository](https://github.com/eratarkastaja/ilmatila). The ERÄGAMES name and logo are separate studio brand assets. Other assets retain their own terms below.

## Aircraft models

The bundled player visual is derived from the FlightGear F-35B model by FGMEMBERS and is used as an F-35A stand-in. The original model, source livery, license, contributors, and conversion details are in [`assets/f35/`](../assets/f35/).

Hostile flights use converted FlightGear exterior models:

- **Su-27 Flanker family**, based on [xcvb85/Su-27](https://github.com/xcvb85/Su-27), revision `30f1cb45c87d4f2443de198d7577a3a9b6b0455a`. Source, selected textures, license, and conversion details are in [`assets/aircraft/su27/`](../assets/aircraft/su27/).
- **MiG-29 Fulcrum**, based on [Mercenary-Mercury/MiG-29_9-12](https://github.com/Mercenary-Mercury/MiG-29_9-12), revision `d4a299bf88412f579b2067874989a8088b2f6d66`. The exterior and required textures are included with their license in [`assets/aircraft/mig29/`](../assets/aircraft/mig29/). The upstream optional GPL-2.0 cockpit clock is not used or included.

Both aircraft source assets and converted GLBs are provided under GNU GPL version 3. Contributor credits and conversions are recorded beside the source files. The ERÄGAMES aircraft logo is not included in these model license grants.

## Terrain data

The hosted game uses four area packages containing Maanmittauslaitos (National Land Survey of Finland) **Elevation Model 2 m** and **Colour Orthophotos** data, retrieved on 2026-09-30. The current packages cover Päijänne, Virolahti, Ilomantsi, and Kuusamo. They are published separately in the [terrain data release](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.2.0). Each archive includes metadata and attribution. Elevation was downsampled and mosaicked; orthophotos were cropped, resampled, tiled, and recompressed; the moving detail layer was JPEG-encoded; water masks were derived from imagery.

© National Land Survey of Finland. Contains Elevation Model 2 m and Colour Orthophotos open data provided by the National Land Survey of Finland on 2026-09-30. The data is licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). MML's [license and attribution terms](https://www.maanmittauslaitos.fi/avoindata-lisenssi-cc40) require the provider, dataset, and date associated with the data; package-level notices provide the same information.

## Software and typefaces

- **Three.js** is used for browser rendering under the MIT License. The full text is [`THREE-MIT.txt`](THREE-MIT.txt).
- **Vite**, **Vitest**, **ESLint**, **geotiff.js**, **assimpjs**, and **glTF Transform** are development and asset-preparation dependencies. Their package license metadata and resolved versions are in the lockfile; they are not bundled in the game runtime.
- **Sharp** is used by the optional terrain downloader. Sharp is Apache-2.0 licensed; its prebuilt libvips binaries are LGPL-3.0-or-later. It is not bundled in the game runtime.
- **Barlow Condensed** by The Barlow Project Authors and **Rajdhani** by Indian Type Foundry are loaded from Google Fonts under SIL Open Font License 1.1. See the [Barlow](https://github.com/jpt/barlow) and [Rajdhani](https://github.com/itfoundry/rajdhani) source projects and the [OFL text](https://openfontlicense.org/).

## Sound effects

Four audio effects are bundled under `assets/audio/`. Cannon fire and explosion by **qubodup**, and missile launch by **gracenew**, are published on Freesound under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The jet takeoff accent by **dklon** is published on OpenGameArt under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) and credited in [`assets/audio/ATTRIBUTION.md`](../assets/audio/ATTRIBUTION.md). The incoming-missile alert is synthesized in-game and uses no external recording.

## Original soundtrack

`fm-rankaisija.ogg`, `orbital-decay.ogg`, and `hard-lock.ogg` are original compositions and recordings by **Erätarkastaja**, the project owner. Copyright remains with Erätarkastaja, who has granted permission to include the tracks in ILMATILA. All other rights are reserved; the music is not covered by the project GPL license. See [`assets/audio/ATTRIBUTION.md`](../assets/audio/ATTRIBUTION.md).

## Procedural military visuals

Ground vehicles and the Mi-24 helicopter use project-authored procedural geometry. U.S. Army ODIN descriptions of the ZSU-23-4 Shilka and Mi-24, and Finnish Government information about ITO 90 / Crotale, informed platform roles and visible features; no source-page imagery or geometry is copied:

- [U.S. Army ODIN: ZSU-23-4](https://odin.t2com.army.mil/WEG/Asset/d4cb684d59fa9e42f8fbc8224c92972a)
- [U.S. Army ODIN: Mi-24](https://odin.t2com.army.mil/WEG/Asset/Mi-24_%28Hind%29_Russian_Attack_Helicopter)
- [Finnish Government: ground-based air defence](https://valtioneuvosto.fi/en/-/1950813/independent-finland-s-high-performance-ground-based-air-defence-celebrates-its-100-year-journey)

The game is not affiliated with or endorsed by the Finnish Air Force, Lockheed Martin, FlightGear, or the National Land Survey of Finland.
