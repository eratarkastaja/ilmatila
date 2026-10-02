import * as THREE from 'three';
import { MISSILE_PROFILES } from './projectiles.js';
import {
  ENEMY_ATTACK_RUNS, constrainWaypoint, forward, getAircraftEdgeMargin,
  keepAircraftClear, leadPoint, rightOfHeading, steerAircraft, zeroVelocity,
} from './air-combat-utils.js';

/** Runs hostile fighter engagement, target selection, and defensive maneuvers. */
export class HostileFighterAI {
  updateJets(battle, dt, playerForward, playerRight, playerThreat) {
    const playerPosition = battle.player.position;

    for (const enemy of battle.enemies) {
      if (enemy.dead) continue;
      if (enemy.kind === 'attack-helicopter') {
        battle.helicopterAI.update(battle, enemy, dt, playerForward, playerRight);
        continue;
      }
      enemy.phaseClock += dt;
      enemy.gunCooldown -= dt;
      enemy.missileClock -= dt;
      enemy.effectClock += dt;
      enemy.countermeasureCooldown = Math.max(0, enemy.countermeasureCooldown - dt);
      enemy.evasiveTimer = Math.max(0, enemy.evasiveTimer - dt);
      if (enemy.evasiveTimer <= 0) enemy.evasiveDuration = 0;
      enemy.tacticalManeuverCooldown = Math.max(0, enemy.tacticalManeuverCooldown - dt);
      enemy.groundStrafeCooldown = Math.max(0, enemy.groundStrafeCooldown - dt);
      enemy.targetRefreshTimer -= dt;
      enemy.lockResponseFollowupTimer = Math.max(0, enemy.lockResponseFollowupTimer - dt);

      const range = enemy.mesh.position.distanceTo(playerPosition);
      const playerHasLock = playerThreat.lockedTarget === enemy;
      if (playerHasLock) {
        enemy.lockResponseLost = 0;
        if (enemy.lockResponseTimer === null) {
          const reactionScale = battle.difficulty.id === 'hard' ? .58 : battle.difficulty.id === 'easy' ? 1.25 : 1;
          enemy.lockResponseTimer = (0.8 + Math.random() * 0.65) * reactionScale;
          enemy.lockResponseDone = false;
          enemy.lockResponseWillDeploy = Math.random() < (battle.difficulty?.fighter?.evasion?.countermeasureChance ?? .68);
          enemy.lockResponseWillEvade = Math.random() < (battle.difficulty?.fighter?.evasion?.lockChance ?? .38);
        }
        if (!enemy.lockResponseDone) {
          enemy.lockResponseTimer -= dt;
          if (enemy.lockResponseTimer <= 0) {
            enemy.lockResponseDone = true;
            enemy.lockResponseFollowupTimer = 1.5 + Math.random();
            if (enemy.lockResponseWillDeploy && range > 1300 && range < 6200) {
              battle.deployHostileCountermeasures?.(enemy);
            }
            if (enemy.lockResponseWillEvade) {
              this.beginEvasiveManeuver(battle,
                enemy,
                playerPosition,
                battle.difficulty?.fighter?.evasion?.lockDuration ?? 3,
              );
            }
          }
        }
        if (enemy.lockResponseDone && enemy.lockResponseFollowupTimer <= 0) {
          if (range > 1300 && range < 6200 && enemy.countermeasures > 0
            && Math.random() < (battle.difficulty?.fighter?.evasion?.countermeasureFollowupChance ?? 0)) {
            battle.deployHostileCountermeasures?.(enemy);
          }
          enemy.lockResponseFollowupTimer = 1.25 + Math.random() * 1.25;
        }
      } else {
        enemy.lockResponseLost += dt;
        if (enemy.lockResponseLost > 1.4) {
          enemy.lockResponseTimer = null;
          enemy.lockResponseDone = false;
          enemy.lockResponseWillDeploy = false;
          enemy.lockResponseWillEvade = false;
          enemy.lockResponseFollowupTimer = 0;
        }
      }

      let incomingMissile=null;
      let nearestIncomingMissile=3000*3000;
      for(const missile of playerThreat.incomingMissiles??[]){
        if(missile.target!==enemy||missile.life<=0)continue;
        const distanceSquared=missile.mesh.position.distanceToSquared(enemy.mesh.position);
        if(distanceSquared<nearestIncomingMissile){nearestIncomingMissile=distanceSquared;incomingMissile=missile;}
      }
      if (
        incomingMissile &&
        enemy.lastDefendedMissile !== incomingMissile.mesh.id
      ) {
        battle.deployHostileCountermeasures?.(enemy);
        enemy.lastDefendedMissile = incomingMissile.mesh.id;
        this.beginEvasiveManeuver(battle,
          enemy,
          incomingMissile.mesh.position,
          battle.difficulty?.fighter?.evasion?.missileDuration ?? 3.6,
        );
      }

      // Break the player's gunsight proactively when a fighter is being
      // pursued. Hard opponents do this often and pull up aggressively.
      const playerToEnemy = enemy.separation.subVectors(enemy.mesh.position, playerPosition);
      const playerAspect = playerForward.dot(playerToEnemy.normalize());
      const tacticalRange = battle.difficulty?.fighter?.evasion?.tacticalManeuver?.range ?? 7000;
      if (enemy.phase !== 'staging' && enemy.tacticalManeuverCooldown <= 0
        && range < tacticalRange && playerAspect > .24
        && Math.random() < (battle.difficulty?.fighter?.evasion?.tacticalManeuver?.chance ?? .5)) {
        this.beginEvasiveManeuver(battle, enemy, playerPosition, battle.difficulty?.fighter?.evasion?.lockDuration ?? 3);
        enemy.tacticalManeuverCooldown = (battle.difficulty?.fighter?.evasion?.tacticalManeuver?.cooldown ?? 10)
          + Math.random() * (battle.difficulty?.fighter?.evasion?.tacticalManeuver?.jitter ?? 5);
      }

      const waypoint=enemy.waypoint;

      const detectionRange = battle.difficulty?.fighter?.detection?.range ?? Infinity;
      if (enemy.phase === 'staging') {
        enemy.detectedPlayerTimer = range <= detectionRange
          ? enemy.detectedPlayerTimer + dt
          : 0;
      }
      const reactionDelay = battle.difficulty?.fighter?.detection?.reactionDelay
        ?? (battle.mission.openingDelay ?? 14) * (battle.difficulty?.fighter?.openingDelayScale ?? 1);
      if (enemy.phase === 'staging' && enemy.detectedPlayerTimer >= reactionDelay) {
        enemy.phase = 'inbound';
        enemy.phaseClock = 0;
        enemy.attackForward.copy(playerForward);
        enemy.attackRight.copy(playerRight);
      }

      if (enemy.phase === 'staging') {
        const laneDrift = Math.sin(enemy.phaseClock * .22 + enemy.stagingLane) * 70;
        waypoint.copy(playerPosition)
          .addScaledVector(battle.playerVelocity, .7)
          .addScaledVector(enemy.attackForward, battle.mission.hostileStagingDistance ?? 6500)
          .addScaledVector(enemy.attackRight, enemy.stagingLateral * .32 + laneDrift);
      } else if (enemy.phase === 'inbound') {
        const attackRun = ENEMY_ATTACK_RUNS[enemy.attackPattern];
        waypoint.copy(playerPosition)
          .addScaledVector(battle.playerVelocity, .6)
          .addScaledVector(enemy.attackForward, attackRun.trail)
          .addScaledVector(enemy.attackRight, enemy.lane * attackRun.lateral);
        // Hold the attack line through cannon range, then extend after the pass.
        if (range < attackRun.passRange * (battle.difficulty?.fighter?.passRangeScale ?? 1)) {
          enemy.phase = 'extend';
          enemy.phaseClock = 0;
        }
      } else if (enemy.phase === 'extend') {
        waypoint.copy(playerPosition)
          .addScaledVector(battle.playerVelocity, .65)
          .addScaledVector(enemy.attackForward, 5000)
          .addScaledVector(enemy.attackRight, enemy.lane * 2200);
        if (waypoint.distanceTo(enemy.mesh.position) < 850 || range > 6200) {
          enemy.phase = 'rejoin';
          enemy.phaseClock = 0;
        }
      }

      if (enemy.phase === 'rejoin') {
        waypoint.copy(playerPosition)
          .addScaledVector(battle.playerVelocity, .8)
          .addScaledVector(enemy.attackForward, 8800)
          .addScaledVector(enemy.attackRight, enemy.lane * 2700);
        if (waypoint.distanceTo(enemy.mesh.position) < 1000) {
          enemy.phase = 'inbound';
          enemy.phaseClock = 0;
          enemy.attackPattern = (enemy.attackPattern + 1 + Math.floor(Math.random() * 2)) % ENEMY_ATTACK_RUNS.length;
          enemy.attackForward.copy(playerForward);
          enemy.attackRight.copy(playerRight);
        }
      }

      // Give each hostile a slightly different run line while keeping the pass legible.
      const runOffset = Math.sin(enemy.phaseClock * (.2 + enemy.attackPattern * .035) + enemy.lane * 1.8)
        * (105 + enemy.attackPattern * 45);
      waypoint.addScaledVector(enemy.attackRight, runOffset);
      if (enemy.evasiveTimer > 0) {
        const urgency = THREE.MathUtils.clamp(enemy.evasiveTimer / Math.max(2.4, enemy.evasiveDuration), 0, 1);
        waypoint.addScaledVector(rightOfHeading(enemy.heading, enemy.away), enemy.evasiveDirection * (1050 + urgency * 950));
        waypoint.y += (enemy.evasiveClimb || 300) * urgency;
      }
      keepAircraftClear(battle, enemy, waypoint, playerRight, false);
      const attackAltitude = enemy.phase === 'inbound' ? ENEMY_ATTACK_RUNS[enemy.attackPattern].altitude : 0;
      constrainWaypoint(battle, waypoint, playerPosition.y + enemy.altitudeOffset + attackAltitude, getAircraftEdgeMargin(battle));

      enemy.boosting = (enemy.phase === 'extend' && range > 2300) || enemy.evasiveTimer > 0;
      enemy.mesh.userData.boosting = enemy.boosting;
      if (enemy.mesh.userData.afterburner) {
        enemy.mesh.userData.afterburner.visible = enemy.boosting;
        const pulse = enemy.boosting
          ? 1 + Math.sin(enemy.effectClock * 18 + enemy.mesh.position.z * .015) * .065
          : 1;
        const flutter = enemy.boosting ? Math.sin(enemy.effectClock * 13 + enemy.attackPattern) * .014 : 0;
        enemy.mesh.userData.afterburner.scale.set(1 + flutter, 1 - flutter * .65, pulse);
      }

      const desiredSpeed = enemy.phase === 'staging'
        ? THREE.MathUtils.clamp(Math.max(battle.playerVelocity.length(), 285), 220, 320)
        : enemy.phase === 'extend' ? 335 : enemy.phase === 'rejoin' ? 305 : 295;
      const defensiveBreak=enemy.evasiveTimer>0;
      const handlingFactor = enemy.mesh.userData.handlingFactor ?? 1;
      const turnRate = defensiveBreak
        ? (battle.difficulty?.fighter?.handling?.defensiveTurnRate ?? .61)
        : enemy.boosting
          ? Math.max(battle.difficulty?.fighter?.handling?.attackTurnRate ?? .36, .4)
          : (battle.difficulty?.fighter?.handling?.attackTurnRate ?? .36);
      steerAircraft(
        enemy,
        waypoint,
        dt,
        turnRate * handlingFactor,
        (defensiveBreak ? (battle.difficulty?.fighter?.handling?.defensivePitchRate ?? .29) : .2) * handlingFactor,
        23 * handlingFactor,
        desiredSpeed,
        365,
      );

      const enemyNose = enemy.nose.copy(forward).applyQuaternion(enemy.mesh.quaternion).normalize();
      const canEngage = enemy.phase !== 'staging';
      if (enemy.targetRefreshTimer <= 0 || !enemy.engagementTarget || enemy.engagementTarget.dead) {
        const selected = this.selectEnemyEngagementTarget(battle, enemy, range);
        enemy.engagementTarget = selected?.target ?? null;
        enemy.engagementTargetDomain = selected?.domain ?? 'air';
        enemy.targetRefreshTimer = 1.15 + Math.random() * .8;
      }
      const engagement = enemy.burstShots > 0 && enemy.burstTarget && !enemy.burstTarget.dead
        ? { target: enemy.burstTarget, domain: enemy.burstTargetDomain }
        : { target: enemy.engagementTarget, domain: enemy.engagementTargetDomain };
      const targetPosition = engagement.target === battle.player
        ? playerPosition
        : engagement.target?.mesh?.position;
      const targetVelocity = engagement.target === battle.player
        ? battle.playerVelocity
        : engagement.target?.velocity ?? zeroVelocity;
      const engagementRange = targetPosition ? enemy.mesh.position.distanceTo(targetPosition) : Infinity;
      const gunLeadTime = battle.difficulty?.fighter?.gun?.leadTime ?? 4.5;
      const targetLead = targetPosition
        ? leadPoint(enemy.mesh.position, targetPosition, targetVelocity, 720, gunLeadTime, enemy.lead, enemy.leadOffset)
          .sub(enemy.mesh.position).normalize()
        : enemy.lead.set(0, 0, 0);
      const gunSolution = canEngage && engagement.target
        && (engagement.domain !== 'ground' || enemy.groundStrafeCooldown <= 0 || enemy.burstShots > 0)
        && engagementRange > 450
        && engagementRange < (engagement.domain === 'ground'
          ? (battle.difficulty?.fighter?.targeting?.groundStrafe?.range ?? 6500)
          : (battle.difficulty?.fighter?.gun?.maxRange ?? 2200))
        && enemyNose.dot(targetLead) > (engagement.domain === 'ground' ? .84 : (battle.difficulty?.fighter?.gun?.boresight ?? .88));

      if (enemy.burstShots > 0) {
        enemy.burstClock -= dt;
        if (enemy.burstClock <= 0) {
          if (gunSolution) {
            battle.weaponAI.fireEnemy(battle, enemy, engagement.target, engagement.domain);
            enemy.burstShots--;
            enemy.burstClock = battle.difficulty?.fighter?.gun?.burstInterval ?? .095;
            if (enemy.burstShots <= 0) enemy.burstTarget = null;
          } else {
            enemy.burstShots = 0;
          }
        }
      } else if (gunSolution && enemy.gunCooldown <= 0) {
        const burstMin = engagement.domain === 'ground' ? 3 : (battle.difficulty?.fighter?.gun?.burstMin ?? 6);
        const burstMax = engagement.domain === 'ground' ? 6 : (battle.difficulty?.fighter?.gun?.burstMax ?? 8);
        enemy.burstShots = burstMin + Math.floor(Math.random() * (burstMax - burstMin + 1));
        enemy.burstClock = 0;
        enemy.burstTarget = engagement.target;
        enemy.burstTargetDomain = engagement.domain;
        if (engagement.domain === 'ground') {
          enemy.groundStrafeCooldown = (battle.difficulty?.fighter?.targeting?.groundStrafe?.cooldown ?? 14)
            + Math.random() * ((battle.difficulty?.fighter?.targeting?.groundStrafe?.cooldown ?? 14) * .35);
        }
        enemy.gunCooldown = (engagement.domain === 'ground'
          ? (battle.difficulty?.fighter?.targeting?.groundStrafe?.cooldown ?? 14)
          : (battle.difficulty?.fighter?.gun?.cooldown ?? 1.65))
          + Math.random() * (battle.difficulty?.fighter?.gun?.cooldownJitter ?? 1.2);
      }

      const missileCapacity = battle.difficulty?.fighter?.missile?.capacity ?? 2;
      const missileMinRange = battle.difficulty?.fighter?.missile?.minRange ?? 3000;
      const missileMaxRange = battle.difficulty?.fighter?.missile?.maxRange ?? 6400;
      const missileBoresight = battle.difficulty?.fighter?.missile?.boresight ?? .93;
      const missileSpeed = battle.difficulty?.fighter?.missile?.projectile?.speed ?? MISSILE_PROFILES.hostile.speed;
      const toPlayer = leadPoint(
        enemy.mesh.position,
        playerPosition,
        battle.playerVelocity,
        missileSpeed,
        battle.difficulty?.fighter?.missile?.leadTime ?? 12,
      )
        .sub(enemy.mesh.position).normalize();
      if (
        enemy.missileClock <= 0 && enemy.missilesFired < missileCapacity && enemy.phase !== 'staging' &&
        range > missileMinRange && range < missileMaxRange && enemyNose.dot(toPlayer) > missileBoresight
      ) {
        battle.weaponAI.launchEnemyMissile(battle, enemy);
        enemy.missileClock = (battle.difficulty?.fighter?.missile?.cooldown ?? 14)
          + Math.random() * (battle.difficulty?.fighter?.missile?.cooldownJitter ?? 5);
        enemy.missilesFired++;
      }
    }
  }

  beginEvasiveManeuver(battle, enemy, threatPosition, duration) {
    const offset = enemy.separation.subVectors(enemy.mesh.position, threatPosition);
    const right = rightOfHeading(enemy.heading, enemy.away);
    const side = offset.dot(right);
    enemy.evasiveDirection = Math.abs(side) > 40 ? Math.sign(side) : (Math.random() < .5 ? -1 : 1);
    enemy.evasiveTimer = Math.max(enemy.evasiveTimer, duration);
    enemy.evasiveDuration = Math.max(enemy.evasiveDuration ?? 0, duration);
    const climbMin = battle.difficulty?.fighter?.evasion?.evasiveClimb?.min ?? 350;
    const climbMax = battle.difficulty?.fighter?.evasion?.evasiveClimb?.max ?? 800;
    enemy.evasiveClimb = climbMin + Math.random() * (climbMax - climbMin);
  }

  selectEnemyEngagementTarget(battle, enemy, playerRange) {
    const priorityRange = battle.difficulty?.fighter?.targeting?.airPriorityRange ?? 13000;
    if (playerRange <= priorityRange) return { target: battle.player, domain: 'air' };

    let nearestAlly = null;
    let nearestAllyRange = priorityRange;
    for (const ally of battle.allies) {
      if (ally.dead) continue;
      const range = enemy.mesh.position.distanceTo(ally.mesh.position);
      if (range < nearestAllyRange) {
        nearestAllyRange = range;
        nearestAlly = ally;
      }
    }
    if (nearestAlly) return { target: nearestAlly, domain: 'air' };

    // Ground strafing is opportunistic: aircraft contacts always take priority.
    if (enemy.groundStrafeCooldown <= 0
      && Math.random() < (battle.difficulty?.fighter?.targeting?.groundStrafe?.chance ?? .12)) {
      let target = null;
      let nearest = battle.difficulty?.fighter?.targeting?.groundStrafe?.range ?? 6500;
      for (const unit of battle.friendlyGroundUnits) {
        if (unit.dead || unit.armed === false) continue;
        const range = enemy.mesh.position.distanceTo(unit.mesh.position);
        if (range < nearest) {
          nearest = range;
          target = unit;
        }
      }
      if (target) return { target, domain: 'ground' };
    }
    return null;
  }

  update(battle, dt, playerForward, playerRight, playerThreat) {
    this.updateJets(battle, dt, playerForward, playerRight, playerThreat);
  }
}
