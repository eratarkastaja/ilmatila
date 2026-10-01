# Hostile aircraft model credits

This game includes converted FlightGear exterior aircraft models for hostile flights. Both source projects and included source assets are licensed under GNU General Public License version 3. ERÄGAMES adapted and converted the models for ILMATILA; the current converted assets were added on 2026-09-29. The conversion changes model axes, combines static meshes, and optimizes geometry for browser rendering. Original files, revision identifiers, selected textures, contributor credits, and the complete license are kept beside each converted model.

## Su-27 Flanker

The model is derived from xcvb85's FlightGear Su-27 family project, based on Yanes Bechir's Su-27SK model. It is used as a Flanker-family adversary. [Full attribution and conversion record](su27/ASSET-CREDITS.md).

## MiG-29 Fulcrum

The model is derived from Sergey “Mercenary_Mercury” Salov and Enrique Laso Leon's FlightGear MiG-29 (9-12) exterior. An optional GPL-2.0 cockpit clock in the upstream aircraft is not used or included. [Full attribution and conversion record](mig29/ASSET-CREDITS.md).

## Rebuilding the converted models

Run `npm run assets:aircraft`. The converter uses the source assets in these directories and writes the optimized GLB files beside them.
