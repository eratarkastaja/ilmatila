# Third-party notices

The ILMATILA project source is licensed under GNU GPL version 3 only. Components and data listed below retain their own licenses.

## Aircraft model

The bundled GLB is derived from the FlightGear F-35B model by FGMEMBERS. The original AC3D model and texture, the full GPL-3.0 license, and contributor credits are in [`public/assets/f35/source/`](public/assets/f35/source/). The conversion is described in [`public/assets/f35/ASSET-CREDITS.md`](public/assets/f35/ASSET-CREDITS.md) and implemented by `scripts/convert-flightgear-f35.py`.

## Mapping data (optional download)

The optional terrain packages use National Land Survey of Finland open data: Elevation Model 2 m and Colour Orthophotos, fetched from its WCS service. The downloader records the retrieval date in each area's `terrain.json`; orthophoto acquisition years can vary by location. The game derives a lower-resolution elevation grid, crops and resamples orthophotos into tiles, and derives water masks from the imagery. The source data is licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). The in-game attribution panel and `tools/terrain/README.md` provide the source, modification details, and download-date convention.

## Libraries and fonts

- **Three.js** is used by the browser app under the MIT License. The copyright and license text are in [`public/licenses/THREE-MIT.txt`](public/licenses/THREE-MIT.txt).
- **Vite** is used for development and builds, and **geotiff.js** is used by the optional terrain downloader. Both are MIT licensed and remain development/tooling dependencies; neither is bundled into the browser app. Their lockfile records the resolved versions.
- **Barlow Condensed** by The Barlow Project Authors and **Rajdhani** by Indian Type Foundry are loaded from Google Fonts and licensed under the SIL Open Font License 1.1. The font source projects are [Barlow](https://github.com/jpt/barlow) and [Rajdhani](https://github.com/itfoundry/rajdhani); the upstream license is available at [SIL Open Font License](https://openfontlicense.org/).

The in-game **Assets & licenses** panel provides user-facing attribution links. Optional terrain data is not stored in this repository; see [`tools/terrain/README.md`](tools/terrain/README.md) before redistributing generated map packages.
