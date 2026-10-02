import * as THREE from 'three';
import { clampToTheater, getAircraftEdgeMargin, leadPoint, steerAircraft } from './air-combat-utils.js';
import { createSeededRandom, DEFAULT_RANDOM_SEED } from './random.js';

/** Controls Mi-24 target selection, orbiting, and attack timing. */
export class HelicopterAI {
  constructor(random = createSeededRandom(DEFAULT_RANDOM_SEED)) {
    this.random = random;
  }

  updateAttackHelicopter(battle, enemy, dt, playerForward, playerRight) {
    enemy.phaseClock += dt;
    enemy.orbitPhase += dt * 0.075;
    enemy.targetRefreshTimer -= dt;
    enemy.rocketCooldown -= dt;
    enemy.airMissileCooldown = Math.max(0, enemy.airMissileCooldown - dt);
    const playerPosition = battle.player.position;
    if (enemy.targetRefreshTimer <= 0 || !enemy.groundTarget || enemy.groundTarget.dead) {
      let nearest = 10500;
      let target = null;
      for (const unit of battle.friendlyGroundUnits) {
        if (unit.dead || unit.armed === false || unit.role === 'logistics') continue;
        const distance = enemy.mesh.position.distanceTo(unit.mesh.position);
        if (distance < nearest) {
          nearest = distance;
          target = unit;
        }
      }
      enemy.groundTarget = target;
      enemy.targetRefreshTimer = 3.5 + this.random() * 2.5;
    }

    const target = enemy.groundTarget;
    const center = target?.mesh.position ?? playerPosition;
    const orbitRadius = target ? 1450 : 3200;
    const waypoint = enemy.waypoint.set(
      center.x + Math.cos(enemy.orbitPhase) * orbitRadius,
      center.y,
      center.z + Math.sin(enemy.orbitPhase) * orbitRadius,
    );
    waypoint.y = (battle.terrain?.sampleHeight(waypoint.x, waypoint.z) ?? center.y - 300) + 285;
    clampToTheater(battle, waypoint, getAircraftEdgeMargin(battle));
    const handlingFactor = enemy.mesh.userData.handlingFactor ?? 1;
    steerAircraft(enemy, waypoint, dt, 0.18 * handlingFactor, 0.075 * handlingFactor, 10 * handlingFactor, 70, 92);
    enemy.mesh.userData.mainRotor.rotation.y += dt * 15.5;
    enemy.mesh.userData.tailRotor.rotation.z += dt * 17;
    enemy.mesh.rotation.z = THREE.MathUtils.clamp(enemy.mesh.rotation.z, -0.4, 0.4);

    const playerRange = enemy.mesh.position.distanceTo(playerPosition);
    if (enemy.airToAirMissilesRemaining > 0 && enemy.airMissileCooldown <= 0
      && playerRange > 1600 && playerRange < 4700) {
      const missileSpeed = 455;
      const playerLead = leadPoint(
        enemy.mesh.position, playerPosition, battle.playerVelocity, missileSpeed, 8,
        enemy.lead, enemy.leadOffset,
      ).sub(enemy.mesh.position).normalize();
      const nose = enemy.direction.set(0, 0, 1).applyQuaternion(enemy.mesh.quaternion).normalize();
      if (nose.dot(playerLead) > .68) {
        battle.weaponAI.fireHelicopterAirMissile(battle, enemy);
        enemy.airToAirMissilesRemaining--;
        enemy.airMissileCooldown = 10 + this.random() * 4;
      }
    }

    if (!target || enemy.rocketCooldown > 0) return;
    const range = enemy.mesh.position.distanceTo(target.mesh.position);
    const toTarget = enemy.lead.subVectors(target.mesh.position, enemy.mesh.position).normalize();
    const nose = enemy.direction.set(0, 0, 1).applyQuaternion(enemy.mesh.quaternion).normalize();
    if (range < 800 || range > 4700 || nose.dot(toTarget) < 0.45) return;
    battle.weaponAI.fireHelicopterRocketSalvo(battle, enemy, target, range);
    enemy.rocketCooldown = 13 + this.random() * 5;
  }

  update(battle, enemy, dt, playerForward, playerRight) {
    this.updateAttackHelicopter(battle, enemy, dt, playerForward, playerRight);
  }
}
