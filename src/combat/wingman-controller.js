import * as THREE from 'three';
import { disposeAircraftVisual } from '../aircraft/plane.js';
import { applyAirframeCondition } from './airframe-condition.js';
import {
  constrainWaypoint, contactOffset, getAircraftEdgeMargin, keepAircraftClear,
  leadPoint, steerAircraft, zeroVelocity,
} from './air-combat-utils.js';

/** Owns wingman orders, target selection, formation flight, and damage reactions. */
export class WingmanController {
  constructor() {
    this._aft = new THREE.Vector3();
  }

  issueWingmanOrder(battle, order) {
    if (!['attack', 'defend', 'regroup', 'disengage', 'rtb'].includes(order)) return false;
    if (!battle.allies.some(ally => !ally.dead)) return false;
    if (battle.wingmanOrder === order) return true;
    battle.wingmanOrder = order;
    for (const ally of battle.allies) {
      ally.target = null;
      ally.groundTarget = null;
      if (['regroup', 'disengage', 'rtb'].includes(order)) {
        ally.threatTarget = null;
        ally.threatTimer = 0;
      }
      ally.targetRefresh = 0;
      ally.disengageTimer = order === 'disengage' ? 2.4 : 0;
      ally.phase = order === 'disengage' ? 'extend' : 'formation';
    }
    return true;
  }

  updateAllies(battle, dt, playerForward, playerRight) {
    for (const ally of battle.allies) {
      if (ally.dead) continue;
      ally.defensiveTimer = Math.max(0, ally.defensiveTimer - dt);
      ally.groundMissileCooldown = Math.max(0, ally.groundMissileCooldown - dt);
      ally.airMissileCooldown = Math.max(0, ally.airMissileCooldown - dt);
      ally.threatTimer = Math.max(0, ally.threatTimer - dt);
      if (ally.threatTimer <= 0) ally.threatTarget = null;
      if (ally.target?.dead) ally.target = null;
      if (ally.groundTarget?.dead) ally.groundTarget = null;
      if (battle.wingmanOrder === 'defend' && ally.target && ally.target.mesh.position.distanceTo(battle.player.position) > 5600
        && ally.target.mesh.position.distanceTo(ally.mesh.position) > 2800) {
        ally.target = null;
        ally.targetRefresh = 0;
      }
      ally.targetRefresh -= dt;
      ally.fireCooldown -= dt;

      ally.disengageTimer = Math.max(0, ally.disengageTimer - dt);
      const holdFormation = ['regroup', 'disengage', 'rtb'].includes(battle.wingmanOrder);
      if (holdFormation) {
        ally.target = null;
        ally.groundTarget = null;
        ally.targetRefresh = .4;
      } else if ((!ally.target && !ally.groundTarget) || ally.targetRefresh <= 0) {
        if (ally.defensiveTimer <= 0) {
          // Air contacts always take precedence. The ground attack is a CAS
          // fallback once the air picture is clear (or a self-defence task
          // against a ground unit that is firing at the flight).
          ally.target = this.selectAllyTarget(battle, ally);
          ally.groundTarget = ally.target ? null : this.selectAllyGroundTarget(battle, ally);
        }
        ally.targetRefresh = ally.defensiveTimer > 0 ? .4 : 1.1 + Math.random() * .55;
        if (ally.target && ally.target.mesh.position.distanceTo(ally.mesh.position) < 7800) {
          const relative = contactOffset.subVectors(ally.target.mesh.position, battle.player.position);
          const ahead = relative.dot(playerForward);
          const side = relative.dot(playerRight);
          const scope = String(ally.target.mesh.id);
          if (ahead < -Math.abs(side) * .35) {
            battle.onWingmanRadio?.('six', ally, { scope, target: ally.target });
          } else {
            const direction = Math.abs(side) < Math.abs(ahead) * .35
              ? 'ahead'
              : side > 0 ? 'right' : 'left';
            battle.onWingmanRadio?.('contact', ally, {
              scope,
              target: ally.target,
              params: { direction: { key: `radio.direction.${direction}` } },
            });
          }
        }
      }

      const target = ally.target ?? ally.groundTarget;
      const groundTarget = Boolean(ally.groundTarget && !ally.target)
        || Boolean(target && !battle.enemies.includes(target));
      const targetVelocity = target?.velocity ?? zeroVelocity;
      const targetRange = target ? target.mesh.position.distanceTo(ally.mesh.position) : Infinity;
      const waypoint=ally.waypoint;

      if (target && targetRange < (ally.groundTarget ? 650 : 1100)) ally.phase = 'extend';
      else if (!target || (ally.phase === 'extend' && targetRange > 2050)) ally.phase = target ? 'attack' : 'formation';

      if (ally.defensiveTimer > 0) {
        waypoint.copy(ally.mesh.position).addScaledVector(ally.direction, 1450);
        waypoint.addScaledVector(playerRight, ally.evasiveDirection * 620);
        waypoint.y += 200;
      } else if (battle.wingmanOrder === 'disengage' && ally.disengageTimer > 0) {
        waypoint.copy(ally.mesh.position).addScaledVector(ally.direction, 1500);
        waypoint.y += 220;
      } else if (target && targetRange < 10500 && !holdFormation) {
        if (ally.phase === 'extend') {
          const radial = ally.separation.subVectors(ally.mesh.position,target.mesh.position);
          radial.y = 0;
          if (radial.lengthSq() < 1) radial.copy(playerRight).multiplyScalar(ally.wing);
          radial.normalize();
          waypoint.copy(target.mesh.position)
            .addScaledVector(targetVelocity, .8)
            .addScaledVector(radial, 1600);
          waypoint.y+=70+ally.wing*30;
        } else {
          waypoint.copy(leadPoint(ally.mesh.position, target.mesh.position, targetVelocity, ally.speed, 4,ally.lead,ally.leadOffset));
          waypoint.y+=45+ally.wing*28;
        }
      } else {
        ally.target = null;
        ally.phase = 'formation';
        const aft = this._aft.copy(playerForward).negate();
        waypoint.copy(battle.player.position)
          .addScaledVector(playerRight, ally.wing * 230)
          .addScaledVector(aft, 300);
        waypoint.y+=24+ally.wing*28;
      }

      keepAircraftClear(battle, ally, waypoint, playerRight, true, target);
      let preferredAltitude = battle.player.position.y + 35 + ally.wing * 25;
      if (groundTarget) {
        const ground = battle.terrain?.sampleHeight(target.mesh.position.x, target.mesh.position.z) ?? 0;
        preferredAltitude = Math.max(ground + 520, Math.min(battle.player.position.y - 260, ground + 1150));
      }
      constrainWaypoint(battle, waypoint, preferredAltitude, getAircraftEdgeMargin(battle));
      const followSpeed = THREE.MathUtils.clamp(battle.playerVelocity.length() + 24, 245, 425);
      const nose = steerAircraft(ally, waypoint, dt,target ? .39 : .43,.23,28,followSpeed,445);

      ally.mesh.userData.boosting = Boolean(battle.player.userData.boosting) || ally.defensiveTimer > 0 || (target && targetRange > 3600);
      if (ally.mesh.userData.afterburner) ally.mesh.userData.afterburner.visible = ally.mesh.userData.boosting;

      if (ally.defensiveTimer > 0 || !target) {
        if (ally.burstShots > 0) ally.burstShots = 0;
        continue;
      }

      const aim = leadPoint(ally.mesh.position, target.mesh.position, targetVelocity, groundTarget ? 880 : 680, 3,ally.lead,ally.leadOffset)
        .sub(ally.mesh.position)
        .normalize();
      const alignment = nose.dot(aim);
      const aligned = alignment > (groundTarget ? .92 : .86);
      const gunSolution = targetRange > (groundTarget ? 380 : 520) && targetRange < (groundTarget ? 1800 : 2550) && aligned;

      if (!groundTarget && ally.airMissiles > 0 && ally.airMissileCooldown <= 0
        && targetRange > (battle.difficulty?.wingman?.airMissile?.minRange ?? 2300)
        && targetRange < (battle.difficulty?.wingman?.airMissile?.maxRange ?? 7800)
        && alignment > .84) {
        battle.weaponAI.fireAllyAirMissile(battle, ally, target);
        ally.airMissiles--;
        ally.airMissileCooldown = (battle.difficulty?.wingman?.airMissile?.cooldown ?? 5.2)
          + Math.random() * 2.4;
      }

      if (groundTarget && ally.groundMissiles > 0 && ally.groundMissileCooldown <= 0
        && targetRange > 1550 && targetRange < 4400 && nose.dot(aim) > .955) {
        battle.weaponAI.fireAllyMaverick(battle, ally, target);
        ally.groundMissiles--;
        ally.groundMissileCooldown = 5.5 + Math.random() * 3.5;
      }

      if (ally.burstShots > 0) {
        ally.burstClock -= dt;
        if (ally.burstClock <= 0) {
          if (gunSolution) {
            if (groundTarget) battle.weaponAI.fireAllyGround(battle, ally, target);
            else battle.weaponAI.fireAlly(battle, ally, target);
            ally.burstShots--;
            ally.burstClock = .09;
          } else {
            ally.burstShots = 0;
          }
        }
      } else if (gunSolution && ally.fireCooldown <= 0) {
        ally.burstShots = groundTarget ? 7 + Math.floor(Math.random() * 4) : 8 + Math.floor(Math.random() * 5);
        ally.burstClock = 0;
        ally.fireCooldown = groundTarget ? 1.9 + Math.random() * 1.1 : .9 + Math.random() * .8;
      }
    }
  }

  damageWingman(battle, ally, damage, sourceUnit = null) {
    if (!ally || ally.dead) return;
    ally.hp = Math.max(0, ally.hp - Math.max(0, damage));
    applyAirframeCondition(ally.mesh, ally.hp, ally.maxHp);
    if (ally.hp <= 0) {
      ally.dead = true;
      battle.onWingmanRadio?.('lost', ally);
      battle.scene.remove(ally.mesh);
      battle.fx?.forgetAircraft(ally.mesh);
      disposeAircraftVisual(ally.mesh);
      return;
    }
    if (ally.defensiveTimer <= 0) {
      if (sourceUnit?.mesh) battle.hostileFighterAI.beginEvasiveManeuver(battle, ally, sourceUnit.mesh.position, 2.4);
      else ally.evasiveDirection = ally.wing;
    }
    if ((sourceUnit?.team === 'red' || sourceUnit?.mesh?.userData.faction === 'red') && !sourceUnit.dead) {
      ally.threatTarget = sourceUnit;
      ally.threatTimer = 12;
      ally.target = sourceUnit;
      ally.groundTarget = null;
      ally.targetRefresh = 0;
    }
    ally.defensiveTimer = Math.max(ally.defensiveTimer, 2.4);
    battle.onWingmanRadio?.('hit', ally);
  }

  selectAllyTarget(battle, ally) {
    if (['regroup', 'disengage', 'rtb'].includes(battle.wingmanOrder)) return null;
    if (ally.threatTimer > 0 && ally.threatTarget && !ally.threatTarget.dead) return ally.threatTarget;
    let selected = null;
    let bestScore = Infinity;
    for (const enemy of battle.enemies) {
      if (enemy.dead || enemy.phase === 'staging' || enemy.mesh.position.distanceTo(battle.player.position) > 9400) continue;
      if (battle.wingmanOrder === 'defend' && enemy.mesh.position.distanceTo(battle.player.position) > 5200) continue;
      const range = enemy.mesh.position.distanceTo(ally.mesh.position);
      if (range > 10200) continue;
      let otherAttackers=0;
      for(const other of battle.allies)if(other!==ally&&other.target===enemy)otherAttackers++;
      const score = range + otherAttackers * 2300;
      if (score < bestScore) {
        bestScore = score;
        selected = enemy;
      }
    }
    return selected;
  }

  setGroundUnits(battle, units) {
    battle.groundUnits = units ?? [];
  }

  selectAllyGroundTarget(battle, ally) {
    if (['regroup', 'disengage', 'rtb'].includes(battle.wingmanOrder)) return null;
    const liveAirThreats = battle.enemies.some(enemy => !enemy.dead);
    let selected = null;
    let bestScore = Infinity;
    for (const unit of battle.groundUnits) {
      if (unit.dead || unit.armed === false || unit.team !== 'red' || !unit.mesh?.parent) continue;
      if (battle.wingmanOrder === 'defend') {
        const activelyThreatening = unit.aaThreatTimer > 0
          && (unit.aaTarget === battle.player || unit.aaTarget === ally.mesh);
        if (!activelyThreatening) continue;
      } else if (liveAirThreats) {
        continue;
      }
      const range = unit.mesh.position.distanceTo(ally.mesh.position);
      if (range > 8200) continue;
      let otherAttackers = 0;
      for (const other of battle.allies) if (other !== ally && other.groundTarget === unit) otherAttackers++;
      const score = range + otherAttackers * 1700;
      if (score < bestScore) {
        bestScore = score;
        selected = unit;
      }
    }
    return selected;
  }

  closestWingmanTo(battle, position) {
    let closest = null;
    let closestDistance = Infinity;
    for (const ally of battle.allies) {
      if (ally.dead) continue;
      const distance = ally.mesh.position.distanceToSquared(position);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = ally;
      }
    }
    return closest;
  }

  update(battle, dt, playerForward, playerRight) {
    this.updateAllies(battle, dt, playerForward, playerRight);
  }
}
