# ILMATILA third-party notices

ILMATILA source code is licensed under [GNU GPL version 3 only](GPL-3.0.txt). The components and data below retain their own licenses.

## Aircraft model

The aircraft model is derived from the [FGMEMBERS FlightGear F-35B project](https://github.com/FGMEMBERS/F-35B), by Petar Jedvaj, Detlef Faber, F-GTUX, Stuart Cassie, and Gary Brown. The included source model and texture, conversion details, and attribution are in [`/assets/f35/ASSET-CREDITS.md`](/assets/f35/ASSET-CREDITS.md). The source model and converted GLB are licensed under GPL-3.0.

## Terrain data (optional)

Optional packages contain open data from the National Land Survey of Finland: Elevation Model 2 m and Colour Orthophotos. The retrieval date and data transformations are recorded in each area's `terrain.json`. Orthophoto capture years can vary by location. The data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); it has been downsampled, cropped, tiled, and recompressed, and water masks have been derived from orthophoto colors. Source: [MML WCS service](https://www.maanmittauslaitos.fi/ortokuvien-ja-korkeusmallien-kyselypalvelu/tekninen-kuvaus).

## Software and fonts

- **Three.js** is used for browser rendering under the MIT License. Its copyright and license text are in [`/licenses/THREE-MIT.txt`](/licenses/THREE-MIT.txt).
- **Barlow Condensed** by The Barlow Project Authors and **Rajdhani** by Indian Type Foundry are loaded from Google Fonts. Both use the SIL Open Font License 1.1. Sources: [Barlow](https://github.com/jpt/barlow), [Rajdhani](https://github.com/itfoundry/rajdhani), [OFL 1.1](https://openfontlicense.org/).
- **Vite** (development and build) and **geotiff.js** (terrain conversion) are MIT-licensed tooling dependencies. Neither is bundled into the browser app; npm records their resolved versions in the project lockfile.

For map download instructions and a suggested attribution statement, see the source repository's `tools/terrain/README.md`.
