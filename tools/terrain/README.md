# Finland terrain packages

The game uses Maanmittauslaitos (MML) elevation and color orthophoto data for Päijänne, Virolahti, Ilomantsi, and Kuusamo. The Pages deployment downloads the public [terrain data release](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.0.0). This tool fetches updated source data from MML's WCS API, converts it to game-ready files, and writes it under `public/terrain/areas/`.

Requirements: Node.js 20.19+ or 22.12+, an MML API key, and network access. The API key is used only by this local Node.js tool. It is never part of the browser app or the generated terrain files.

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

The tool requests all four areas. It writes the available-area list to `public/terrain/index.json` and stores package metadata in each area's `terrain.json`. Generated area directories are ignored by Git. A local build includes the packages if present; without them the game uses preview terrain.

To populate a local checkout with the published package without an MML API key, download the five assets from the [terrain data release](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.0.0), verify them with `SHA256SUMS.txt`, and extract each area ZIP into `public/terrain/areas/`.

## Resolution and processing

- Each area covers about 16 × 16 km.
- The 2 m source elevation model is sampled to a 400 × 400 grid, about 40 m between samples.
- Color orthophotos are fetched as 8 × 8 tiles per area, then resampled to 320 × 320 pixels per tile (about 6.25 m per pixel).
- Water masks are derived from orthophoto colors for ground-unit placement.

MML documents the WCS products as the 2 m Elevation Model and 0.5 m color orthophoto. If no date is requested, WCS returns the latest available orthophoto; the imagery's capture year can therefore vary by area and tile. `downloadedAt` records when the package was fetched, not the capture date of every image.

## Attribution and redistribution

MML's open data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). MML asks distributors to identify the provider, dataset, and date associated with the delivered data. Keep each package's `terrain.json` with its files. It records the retrieval date and dataset names; the WCS may combine orthophotos captured in different years.

Suggested attribution for a generated area:

> © National Land Survey of Finland. Contains its open data: Elevation Model 2 m and Colour Orthophotos, retrieved on **[downloadedAt date from terrain.json]**. Modified by reducing elevation resolution, cropping and resampling orthophotos, and deriving water masks. Licensed under CC BY 4.0.

The four current packages total about 92 MB (88 MiB) uncompressed. Keep them out of Git history and publish them as a versioned GitHub Release instead. The package builder validates the tile sets, writes one archive per area with an `ATTRIBUTION.md` file, and creates a SHA-256 manifest:

```sh
python3 tools/terrain/package-release.py
```

It writes ignored release files to `release-assets/`. Release the four ZIP files and `SHA256SUMS.txt` under tag `terrain-data-v1.0.0`. The [Pages workflow](../../.github/workflows/pages.yml) downloads the pinned release, checks the hashes, and copies the data into the site build. To publish updated map data, create a new terrain-data release and update `TERRAIN_DATA_RELEASE` in the workflow.

The published terrain archives are available at <https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.0.0>. Each includes `terrain.json` with its retrieval date and source metadata plus an attribution notice. The in-game asset and license panel also links to the source, CC BY 4.0 terms, and the terrain release.

Sources: [MML WCS service description](https://www.maanmittauslaitos.fi/ortokuvien-ja-korkeusmallien-kyselypalvelu/tekninen-kuvaus) · [MML open-data license and attribution requirements](https://www.maanmittauslaitos.fi/avoindata-lisenssi-cc40).
