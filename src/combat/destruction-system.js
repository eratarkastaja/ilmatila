import { disposeAircraftVisual } from '../aircraft/plane.js';
import { disposeGroundVehicleVisual } from '../ground/vehicles.js';

/** Applies the shared consequences of destroying aircraft and ground units. */
export class DestructionSystem {
  constructor({ scene, fx, score, effects, feedback, reportWingmanRadio }) {
    this.scene = scene;
    this.fx = fx;
    this.score = score;
    this.effects = effects;
    this.feedback = feedback;
    this.reportWingmanRadio = reportWingmanRadio;
  }

  destroyAircraft(aircraft, credited = true, details = {}) {
    if (!aircraft || aircraft.dead) return false;

    aircraft.dead = true;
    this.scene.remove(aircraft.mesh);
    this.fx?.forgetAircraft(aircraft.mesh);
    disposeAircraftVisual(aircraft.mesh);
    this.score.recordAircraftDestroyed(credited);
    this.effects.addExplosion(aircraft.mesh.position, 1.12);
    this.feedback.notify(
      credited ? 'combat.enemyAircraftDestroyed' : 'combat.enemyAircraftLost',
      1.8,
      credited ? 'success' : 'info',
    );

    if (details.sourceUnit) {
      this.reportWingmanRadio('targetDestroyed', details.sourceUnit, { scope: String(aircraft.mesh.id) });
    }
    return true;
  }

  destroyGroundUnit(unit, credited = true, details = {}) {
    if (!unit || unit.dead) return false;

    unit.dead = true;
    this.scene.remove(unit.mesh);
    disposeGroundVehicleVisual(unit.mesh);
    this.score.recordGroundUnitDestroyed(unit.team, credited);
    this.effects.addExplosion(unit.mesh.position, .82);

    if (unit.team === 'red' && credited) {
      this.feedback.notify('combat.enemyGroundDestroyed', 1.65, 'success');
    }
    if (unit.team === 'red' && details.sourceUnit) {
      this.reportWingmanRadio('targetDestroyed', details.sourceUnit, { scope: String(unit.mesh.id) });
    }
    return true;
  }
}
