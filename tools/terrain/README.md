# Finland terrain packages

The game uses Maanmittauslaitos (MML) elevation and color orthophoto data for Päijänne, Virolahti, Ilomantsi, and Kuusamo. The Pages deployment downloads the public [terrain data release](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.2.0). This tool fetches updated source data from MML's WCS API, converts it to game-ready files, and writes it under `public/terrain/areas/`.

Requirements: Node.js 20.19+, 22.13.x, or 24+, an MML API key, and network access. Sharp is installed as a development dependency and encodes the detailed image tiles as JPEG. The API key is used only by this local Node.js tool. It is never part of the browser app or the generated terrain files.

## Download

Create an API key through MML's account service, then pass it in the shell environment. Do not put a real key in source code, a `VITE_` environment variable, or a committed file.

```sh
# macOS, Linux, or WSL
export NLS_API_KEY="your-key"
npm run terrain:fetch
```

```powershell
# Windows PowerShell
$env:NLS_API_KEY = "your-key"
npm run terrain:fetch
```

The tool requests all four areas. It writes the available-area list to `public/terrain/index.json` and stores package metadata in each area's `terrain.json`. Generated area directories are ignored by Git. A local build includes the packages if present; without them the game uses preview terrain. To stage a download without replacing active local maps, set `TERRAIN_OUTPUT_DIR` to a temporary directory:

```sh
TERRAIN_OUTPUT_DIR="/tmp/ilmatila-terrain-32km" npm run terrain:fetch
```

The full download creates 32 × 32 km packages. `--detail-only` refreshes imagery only for the extent in existing metadata; use a full download to expand older packages.

To refresh detailed imagery without redownloading elevation and standard-resolution data, run `npm run terrain:fetch -- --detail-only`. The moving detail window is generated across the complete theater and follows the aircraft at runtime.

To populate a local checkout with the published package without an MML API key, download the five assets from the [terrain data release](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.2.0), verify them with `SHA256SUMS.txt`, and extract each area ZIP into `public/terrain/areas/`.

## Resolution and processing

- Each published and locally generated area covers 32 × 32 km.
- The 2 m source elevation model is requested as sixteen 8 × 8 km tiles and mosaicked into an 800 × 800 grid, about 40 m between samples.
- Color orthophotos are requested as a 16 × 16 grid of 2 × 2 km tiles. Each 1000 × 1000 source tile is saved as a roughly 2 m/pixel JPEG detail tile and resampled to 256 × 256 pixels (about 7.8 m/pixel) for the base atlas.
- A 6 × 6 km high-detail window follows the aircraft and shifts in 2 km steps. Its tiles cover the complete 32 × 32 km theater. Only the current 3 × 3 tiles are active; tile geometry and decoded images are cached across transitions.
- The same detail level follows the aircraft throughout the theater. No area receives a permanently higher resolution because it contains the mission start point.
- Moving-window JPEG tiles use quality 84 with 4:2:0 chroma subsampling to limit package size and stay aligned to the standard orthophoto tile grid.
- Water masks are derived from orthophoto colors for ground-unit placement.

MML documents the WCS products as the 2 m Elevation Model and 0.5 m color orthophoto. If no date is requested, WCS returns the latest available orthophoto; the imagery's capture year can therefore vary by area and tile. `downloadedAt` records the latest package fetch, while `retrievalDates` records the dates represented in a refreshed package; neither field is the capture date of every image.

## Attribution and redistribution

MML's open data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). MML asks distributors to identify the provider, dataset, and date associated with the delivered data. Keep each package's `terrain.json` with its files. It records the retrieval date and dataset names; the WCS may combine orthophotos captured in different years.

Suggested attribution for a generated area:

> © National Land Survey of Finland. Contains its open data: Elevation Model 2 m and Colour Orthophotos, retrieved on **[retrieval dates from terrain.json]**. Modified by reducing elevation resolution, cropping, resampling, and tiling orthophotos, JPEG-encoding the moving detail layer, and deriving water masks. Licensed under CC BY 4.0.

Package sizes depend on the imagery returned by MML. Keep generated packages out of Git history and publish them as a versioned GitHub Release instead. The package builder validates the base and moving tile sets, writes one archive per area with an `ATTRIBUTION.md` file, and creates a SHA-256 manifest:

```sh
python3 tools/terrain/package-release.py
```

It writes ignored release files to `release-assets/`. The current packages are published as `terrain-data-v1.2.0`; the [Pages workflow](../../.github/workflows/pages.yml) verifies their hashes and copies them into the site build. Generating or validating local data does not publish a package or change which terrain release Pages uses.

The current terrain archives are available at <https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.2.0>. Each archive includes `terrain.json` with its retrieval date and source metadata plus an attribution notice. The in-game asset and license panel also links to the source and CC BY 4.0 terms.

Sources: [MML WCS service description](https://www.maanmittauslaitos.fi/ortokuvien-ja-korkeusmallien-kyselypalvelu/tekninen-kuvaus) · [MML open-data license and attribution requirements](https://www.maanmittauslaitos.fi/avoindata-lisenssi-cc40).
