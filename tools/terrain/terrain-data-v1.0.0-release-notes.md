# ILMATILA terrain data v1.0.0

This release contains processed Finnish National Land Survey terrain data for four 16 × 16 km operating areas: Päijänne, Virolahti, Ilomantsi, and Kuusamo. The source data was retrieved on 2026-09-28. Orthophoto capture years can vary by tile.

Each area ZIP contains a 400 × 400 elevation grid, 64 color orthophoto tiles, 64 derived water-mask tiles, `terrain.json` metadata, and an `ATTRIBUTION.md` notice. `SHA256SUMS.txt` lists the SHA-256 checksum for every area ZIP.

© National Land Survey of Finland. Contains its open data: Elevation Model 2 m and Colour Orthophotos (ortokuva_vari), retrieved 2026-09-28. The elevation samples were downsampled; orthophotos were cropped, resampled, tiled, and recompressed; water masks were derived from orthophoto colors. Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

Source: [National Land Survey of Finland WCS](https://www.maanmittauslaitos.fi/ortokuvien-ja-korkeusmallien-kyselypalvelu/tekninen-kuvaus).

These generated archives are kept outside the Git source history. The GitHub Pages workflow downloads this version, verifies its checksums, and includes the packages in the hosted game.
