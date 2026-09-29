# Optional Finland terrain packages

The game can use locally generated Maanmittauslaitos (MML) data for Päijänne, Virolahti, Ilomantsi, and Kuusamo. This tool downloads elevation and color orthophoto data from MML's WCS API, converts it to game-ready files, and writes the files under `public/terrain/areas/`.

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

The tool requests all four areas. It writes the available-area list to `public/terrain/index.json` and stores package metadata in each area's `terrain.json`. Generated area directories are ignored by Git. A local production build includes them if they are present; a clean checkout without them uses the game's preview terrain and needs no key.

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

The four current packages total about 89 MB uncompressed. Keep generated packages out of Git history. For a public hosted build, either publish each region as a separately versioned archive attached to a GitHub Release or store it with the deployment's static assets; include the attribution and metadata with the archive. The repository itself contains the downloader and area list, not the imagery.

Sources: [MML WCS service description](https://www.maanmittauslaitos.fi/ortokuvien-ja-korkeusmallien-kyselypalvelu/tekninen-kuvaus) · [MML open-data license and attribution requirements](https://www.maanmittauslaitos.fi/avoindata-lisenssi-cc40).
