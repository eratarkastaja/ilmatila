# F-35 model asset credits

The aircraft mesh is derived from the FlightGear F-35B model in [FGMEMBERS/F-35B](https://github.com/FGMEMBERS/F-35B), revision `2726b3bdf3c7c54ea09a5d4a248e86a739604ca7`.

ERÄGAMES adapted the included model for ILMATILA. The current converted GLB was added on 2026-09-29; its axes and geometry were changed for the game's chase camera and flight model.

The FlightGear project credits Petar Jedvaj, Detlef Faber, F-GTUX, Stuart Cassie, and Gary Brown. The source model and this converted GLB are provided under the [GNU General Public License, version 3](https://www.gnu.org/licenses/gpl-3.0.html). The GLB uses the source pack's low-visibility Royal Norwegian Air Force texture as its base, then adds Finnish roundels in the game. The original AC3D model, source livery texture, and complete license are included in this directory's `source/` folder. `scripts/convert-flightgear-f35.py` documents the conversion.

The GLB conversion aligns the aircraft with the game's flight axes and omits external pylons and internal lift-fan geometry. The game adds Finnish roundels and its own afterburner effect. The source airframe is the F-35B variant and the texture retains some Norwegian markings, so it is a visual stand-in rather than a Finnish F-35A livery.
