# ILMATILA terrain data v1.2.0

This release expands the processed Finnish National Land Survey terrain data for Päijänne, Virolahti, Ilomantsi, and Kuusamo to approximately 32 × 32 km per area. Source data was retrieved on 2026-09-30; orthophoto capture dates can vary by tile.

Each archive contains an 800 × 800 elevation grid, 256 standard-resolution orthophoto tiles, 256 derived water-mask tiles, and 256 high-detail orthophoto tiles. The high-detail layer uses 2 × 2 km JPEG tiles at about 2 m/pixel. The game streams a moving 3 × 3 tile window around the aircraft across the complete theater.

Every archive includes `terrain.json` and `ATTRIBUTION.md` with source datasets, retrieval date, processing details, and license information. `SHA256SUMS.txt` lists each area archive checksum.

© National Land Survey of Finland. Contains its open data: Elevation Model 2 m and Colour Orthophotos (ortokuva_vari), retrieved 2026-09-30. Elevation samples were downsampled and mosaicked from tiled requests; orthophotos were cropped, resampled, tiled, and recompressed; theater-wide orthophotos were downsampled for the base layer and JPEG-encoded for the moving detail layer; water masks were derived from orthophoto colors. Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

Source: [National Land Survey of Finland WCS](https://www.maanmittauslaitos.fi/ortokuvien-ja-korkeusmallien-kyselypalvelu/tekninen-kuvaus).
