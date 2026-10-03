# Current assets and licenses

This inventory describes files used by the current game build. Full license texts and required attributions are linked from the in-game **Assets & Licenses** panel and collected in [`public/licenses/THIRD-PARTY-NOTICES.md`](../public/licenses/THIRD-PARTY-NOTICES.md).

| Asset | Current use | Source and terms | Included evidence |
| --- | --- | --- | --- |
| Project source | Game code and procedural models | GNU GPL-3.0-only | [`LICENSE`](../LICENSE), served GPL text, public source repository |
| Player aircraft | Converted FlightGear F-35B visual stand-in for an F-35A | FlightGear model under GNU GPL-3.0 | Original source, GPL text, and conversion record in `public/assets/f35/` |
| Hostile aircraft | Converted FlightGear Su-27-family and MiG-29 exterior models | GNU GPL-3.0 | Source, license copies, revision IDs, and attributions in `public/assets/aircraft/` |
| Ground units and Mi-24 | Project-authored procedural low-detail geometry | Project source license; public military references inform visible features and role only | `src/ground/vehicles.js` and `src/aircraft/rotorcraft.js` |
| Terrain | Four Finnish 32 × 32 km area packages | Maanmittauslaitos Elevation Model 2 m and Colour Orthophotos, CC BY 4.0 | Attribution, data names, retrieval date, and modification record travel with each terrain package |
| Combat sound effects | Cannon, missile launch, explosion, jet takeoff | Three Freesound CC0 clips; one OpenGameArt CC BY 3.0 clip | Source links and creator credits in `public/assets/audio/ATTRIBUTION.md` |
| Original soundtrack | Three Erätarkastaja recordings, Ogg Vorbis | Rights retained by Erätarkastaja; permission supplied for inclusion in ILMATILA; not covered by GPL | Track/source-file details and rights statement in `public/assets/audio/ATTRIBUTION.md` |
| Interface fonts | Barlow Condensed and Rajdhani loaded from Google Fonts | SIL Open Font License 1.1 | Upstream project and license links in third-party notices |
| 3D rendering | Three.js | MIT | Full license in `public/licenses/THREE-MIT.txt` |

## Build and tooling dependencies

`three` is the browser application's runtime dependency and is bundled into the site. Vite, Vitest, ESLint, GeoTIFF, assimpjs, glTF Transform, and Sharp support local development, checks, terrain preparation, or offline model conversion; they are not imported by the browser app. Their resolved versions and package license metadata are recorded in `package-lock.json`. The optional Sharp binary distribution uses libvips, whose license is also noted in the third-party notices.

## Distribution notes

The source files and converted FlightGear aircraft are distributed with their license texts and attribution. The GitHub Pages interface provides links to this source repository, the GPL text, and the full third-party notices. MML data is published separately from the source repository; its area archives carry the attribution required for redistribution. The ERÄGAMES name and logo are separate studio brand assets and are not licensed under the project GPL.

The procedural vehicle and helicopter geometry does not use downloaded model meshes or reference-page images. Its military references are cited in the third-party notices; gameplay damage, range, and firing behavior are fictional tuning values.
