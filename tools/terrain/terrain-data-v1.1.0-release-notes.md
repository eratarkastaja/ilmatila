# ILMATILA terrain data v1.1.0

This release updates the processed Finnish National Land Survey terrain data for Päijänne, Virolahti, Ilomantsi, and Kuusamo. Each area covers approximately 16 × 16 km.

Every area archive contains a 400 × 400 elevation grid, 64 standard-resolution orthophoto tiles, 64 derived water-mask tiles, and 64 theater-wide high-detail orthophoto tiles. The high-detail layer is divided into 2 × 2 km JPEG tiles at about 2 m/pixel. The game streams a moving 3 × 3 tile window around the aircraft, so the same detail follows the player throughout each theater instead of remaining fixed around the mission start point.

Each archive includes `terrain.json` and `ATTRIBUTION.md` with source datasets, per-area retrieval dates, processing details, and license information. Orthophoto capture years can vary by tile. `SHA256SUMS.txt` lists the SHA-256 checksum for every area ZIP.

© National Land Survey of Finland. Contains its open data: Elevation Model 2 m and Colour Orthophotos (ortokuva_vari), retrieved on the dates listed in each area's `terrain.json`. Elevation samples were downsampled; orthophotos were cropped, resampled, tiled, and recompressed; the moving detail layer was JPEG-encoded; water masks were derived from orthophoto colors. Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

Source: [National Land Survey of Finland WCS](https://www.maanmittauslaitos.fi/ortokuvien-ja-korkeusmallien-kyselypalvelu/tekninen-kuvaus).
