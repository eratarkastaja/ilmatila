import * as THREE from 'three';
import { createSeededRandom, DEFAULT_RANDOM_SEED } from './random.js';
import { MISSILE_PROFILES } from './projectiles.js';
import {
  ENEMY_ATTACK_RUNS, constrainWaypoint, forward, getAircraftEdgeMargin,
  keepAircraftClear, leadPoint, rightOfHeading, steerAircraft, zeroVelocity,
} from './air-combat-utils.js';

const EMPTY_MISSILES = [];
const MISSILE_LOCK_WARNING_SECONDS = 2.5;

/** Runs hostile fighter engagement, target selection, and defensive maneuvers. */
export class HostileFighterAI {
  constructor(random = createSeededRandom(DEFAULT_RANDOM_SEED)) {
    this.random = random;
    this._engagementSelection = { target: null, domain: 'air' };
    this._missileRelativePosition = new THREE.Vector3();
    this._missileRelativeVelocity = new THREE.Vector3();
    this._evasionRight = new THREE.Vector3();
  }

  updateJets(battle, dt, playerForward, playerRight, playerThreat) {
    const playerPosition = battle.player.position;

    for (const enemy of battle.enemies) {
      if (enemy.dead || enemy.identified === false) continue;
      if (enemy.kind === 'attack-helicopter') {
        battle.helicopterAI.update(battle, enemy, dt, playerForward, playerRight);
        continue;
      }
      enemy.phaseClock += dt;
      enemy.gunCooldown -= dt;
      enemy.missileClock -= dt;
      enemy.effectClock += dt;
      enemy.countermeasureCooldown = Math.max(0, enemy.countermeasureCooldown - dt);
      enemy.radarTrackDisruptionRemaining = Math.max(0, (enemy.radarTrackDisruptionRemaining ?? 0) - dt);
      enemy.chaffTrackReevaluationRemaining = Math.max(0, (enemy.chaffTrackReevaluationRemaining ?? 0) - dt);
      enemy.evasiveTimer = Math.max(0, enemy.evasiveTimer - dt);
      if (enemy.evasiveTimer <= 0) enemy.evasiveDuration = 0;
      enemy.tacticalManeuverCooldown = Math.max(0, enemy.tacticalManeuverCooldown - dt);
      enemy.groundStrafeCooldown = Math.max(0, enemy.groundStrafeCooldown - dt);
      enemy.targetRefreshTimer -= dt;
      enemy.lockResponseFollowupTimer = Math.max(0, enemy.lockResponseFollowupTimer - dt);

      const range = enemy.mesh.position.distanceTo(playerPosition);
      if (enemy.radarTrackDisruptionRemaining > 0) {
        if (enemy.engagementTarget === battle.player) enemy.engagementTarget = null;
        if (enemy.burstTarget === battle.player) {
          enemy.burstTarget = null;
          enemy.burstShots = 0;
        }
        enemy.targetRefreshTimer = 0;
      }
      const playerHasLock = playerThreat.lockedTarget === enemy;
      if (playerHasLock) {
        enemy.lockResponseLost = 0;
        if (enemy.lockResponseTimer === null) {
          const reactionScale = battle.difficulty.id === 'hard' ? .58 : battle.difficulty.id === 'easy' ? 1.25 : 1;
          enemy.lockResponseTimer = (0.8 + this.random() * 0.65) * reactionScale;
          enemy.lockResponseDone = false;
          enemy.lockResponseWillDeploy = this.random() < (battle.difficulty?.fighter?.evasion?.countermeasureChance ?? .68);
          enemy.lockResponseWillEvade = this.random() < (battle.difficulty?.fighter?.evasion?.lockChance ?? .38);
        }
        if (!enemy.lockResponseDone) {
          enemy.lockResponseTimer -= dt;
          if (enemy.lockResponseTimer <= 0) {
            enemy.lockResponseDone = true;
            enemy.lockResponseFollowupTimer = 1.5 + this.random();
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
            && this.random() < (battle.difficulty?.fighter?.evasion?.countermeasureFollowupChance ?? 0)) {
            battle.deployHostileCountermeasures?.(enemy);
          }
          enemy.lockResponseFollowupTimer = 1.25 + this.random() * 1.25;
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
      for(const missile of playerThreat.incomingMissiles??EMPTY_MISSILES){
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
          battle.difficulty?.id === 'hard' ? incomingMissile.velocity : null,
        );
      }

      // Break the player's gunsight proactively when a fighter is being
      // pursued. Hard opponents do this often and pull up aggressively.
      const playerToEnemy = enemy.separation.subVectors(enemy.mesh.position, playerPosition);
      const playerAspect = playerForward.dot(playerToEnemy.normalize());
      const tacticalRange = battle.difficulty?.fighter?.evasion?.tacticalManeuver?.range ?? 7000;
      if (enemy.phase !== 'staging' && enemy.tacticalManeuverCooldown <= 0
        && range < tacticalRange && playerAspect > .24
        && this.random() < (battle.difficulty?.fighter?.evasion?.tacticalManeuver?.chance ?? .5)) {
        this.beginEvasiveManeuver(battle, enemy, playerPosition, battle.difficulty?.fighter?.evasion?.lockDuration ?? 3);
        enemy.tacticalManeuverCooldown = (battle.difficulty?.fighter?.evasion?.tacticalManeuver?.cooldown ?? 10)
          + this.random() * (battle.difficulty?.fighter?.evasion?.tacticalManeuver?.jitter ?? 5);
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

      const canEngage = enemy.phase !== 'staging';
      if (enemy.targetRefreshTimer <= 0 || !enemy.engagementTarget || enemy.engagementTarget.dead) {
        const selected = this.selectEnemyEngagementTarget(battle, enemy, range, this._engagementSelection);
        enemy.engagementTarget = selected?.target ?? null;
        enemy.engagementTargetDomain = selected?.domain ?? 'air';
        enemy.targetRefreshTimer = 1.15 + this.random() * .8;
      }
      const engagementTarget = enemy.burstShots > 0 && enemy.burstTarget && !enemy.burstTarget.dead
        ? enemy.burstTarget
        : enemy.engagementTarget;
      const engagementDomain = enemy.burstShots > 0 && enemy.burstTarget && !enemy.burstTarget.dead
        ? enemy.burstTargetDomain
        : enemy.engagementTargetDomain;
      const strikeTargetPosition = enemy.missionRole === 'strike'
        ? (battle.strikeTarget ?? playerPosition)
        : null;
      const targetPosition = engagementTarget === battle.player
        ? playerPosition
        : engagementTarget?.mesh?.position ?? strikeTargetPosition;
      const targetVelocity = engagementTarget === battle.player
        ? battle.playerVelocity
        : engagementTarget?.velocity ?? zeroVelocity;
      const engagementRange = targetPosition ? enemy.mesh.position.distanceTo(targetPosition) : Infinity;
      const gunLeadTime = battle.difficulty?.fighter?.gun?.leadTime ?? 4.5;
      const gunMaxRange = battle.difficulty?.fighter?.gun?.maxRange ?? 2200;
      const missileMaxRange = battle.difficulty?.fighter?.missile?.maxRange ?? 6400;

      if (enemy.missionRole === 'strike') {
        waypoint.copy(targetPosition ?? strikeTargetPosition ?? playerPosition);
      } else if (enemy.phase === 'staging') {
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
          enemy.attackPattern = (enemy.attackPattern + 1 + Math.floor(this.random() * 2)) % ENEMY_ATTACK_RUNS.length;
          enemy.attackForward.copy(playerForward);
          enemy.attackRight.copy(playerRight);
        }
      }

      // Give each hostile a slightly different run line while keeping the pass legible.
      const runOffset = Math.sin(enemy.phaseClock * (.2 + enemy.attackPattern * .035) + enemy.lane * 1.8)
        * (105 + enemy.attackPattern * 45);
      if (enemy.missionRole !== 'strike') waypoint.addScaledVector(enemy.attackRight, runOffset);
      const pursuitRange = Math.max(gunMaxRange * 2, missileMaxRange);
      if (canEngage && engagementDomain === 'air' && engagementTarget
        && engagementRange < pursuitRange && enemy.evasiveTimer <= 0) {
        const gunLead = leadPoint(
          enemy.mesh.position,
          targetPosition,
          targetVelocity,
          720,
          gunLeadTime,
          enemy.lead,
          enemy.leadOffset,
        );
        enemy.separation.subVectors(gunLead, enemy.mesh.position).normalize();
        waypoint.copy(gunLead).addScaledVector(enemy.separation, 1300);
      }
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
      const targetLead = targetPosition
        ? leadPoint(enemy.mesh.position, targetPosition, targetVelocity, 720, gunLeadTime, enemy.lead, enemy.leadOffset)
          .sub(enemy.mesh.position).normalize()
        : enemy.lead.set(0, 0, 0);
      const gunSolution = canEngage && engagementTarget
        && (engagementDomain !== 'ground' || enemy.groundStrafeCooldown <= 0 || enemy.burstShots > 0)
        && engagementRange > 450
        && engagementRange < (engagementDomain === 'ground'
          ? (battle.difficulty?.fighter?.targeting?.groundStrafe?.range ?? 6500)
          : (battle.difficulty?.fighter?.gun?.maxRange ?? 2200))
        && enemyNose.dot(targetLead) > (engagementDomain === 'ground' ? .84 : (battle.difficulty?.fighter?.gun?.boresight ?? .88));

      if (enemy.burstShots > 0) {
        enemy.burstClock -= dt;
        if (enemy.burstClock <= 0) {
          if (gunSolution) {
            battle.weaponAI.fireEnemy(battle, enemy, engagementTarget, engagementDomain);
            enemy.burstShots--;
            enemy.burstClock = battle.difficulty?.fighter?.gun?.burstInterval ?? .095;
            if (enemy.burstShots <= 0) enemy.burstTarget = null;
          } else {
            enemy.burstShots = 0;
          }
        }
      } else if (gunSolution && enemy.gunCooldown <= 0) {
        const burstMin = engagementDomain === 'ground' ? 3 : (battle.difficulty?.fighter?.gun?.burstMin ?? 6);
        const burstMax = engagementDomain === 'ground' ? 6 : (battle.difficulty?.fighter?.gun?.burstMax ?? 8);
        enemy.burstShots = burstMin + Math.floor(this.random() * (burstMax - burstMin + 1));
        enemy.burstClock = 0;
        enemy.burstTarget = engagementTarget;
        enemy.burstTargetDomain = engagementDomain;
        if (engagementDomain === 'ground') {
          enemy.groundStrafeCooldown = (battle.difficulty?.fighter?.targeting?.groundStrafe?.cooldown ?? 14)
            + this.random() * ((battle.difficulty?.fighter?.targeting?.groundStrafe?.cooldown ?? 14) * .35);
        }
        enemy.gunCooldown = (engagementDomain === 'ground'
          ? (battle.difficulty?.fighter?.targeting?.groundStrafe?.cooldown ?? 14)
          : (battle.difficulty?.fighter?.gun?.cooldown ?? 1.65))
          + this.random() * (battle.difficulty?.fighter?.gun?.cooldownJitter ?? 1.2);
      }

      const missileCapacity = battle.difficulty?.fighter?.missile?.capacity ?? 2;
      const missileMinRange = battle.difficulty?.fighter?.missile?.minRange ?? 3000;
      const missileBoresight = battle.difficulty?.fighter?.missile?.boresight ?? .93;
      const missileSpeed = battle.difficulty?.fighter?.missile?.projectile?.speed ?? MISSILE_PROFILES.hostile.speed;
      const wingmanMissileTarget = enemy.targetPreference === 'wingmen'
        && battle.allies?.includes(engagementTarget)
        && !engagementTarget.dead
        ? engagementTarget
        : null;
      const missileTarget = wingmanMissileTarget ?? battle.player;
      const missileTargetPosition = missileTarget === battle.player
        ? playerPosition
        : missileTarget.mesh.position;
      const missileTargetVelocity = missileTarget === battle.player
        ? battle.playerVelocity
        : missileTarget.velocity;
      const missileRange = enemy.mesh.position.distanceTo(missileTargetPosition);
      const hasAssignedMissileTarget = enemy.missionRole !== 'strike'
        && (enemy.targetPreference === 'wingmen'
          ? Boolean(wingmanMissileTarget)
          : battle.difficulty?.id !== 'hard' || enemy.engagementTarget === battle.player);
      const toMissileTarget = leadPoint(
        enemy.mesh.position,
        missileTargetPosition,
        missileTargetVelocity,
        missileSpeed,
        battle.difficulty?.fighter?.missile?.leadTime ?? 12,
        enemy.lead,
        enemy.leadOffset,
      )
        .sub(enemy.mesh.position).normalize();
      const hasMissileLaunchSolution = Boolean(
        hasAssignedMissileTarget && enemy.missileClock <= 0 && enemy.missilesFired < missileCapacity && enemy.phase !== 'staging' &&
        missileRange > missileMinRange && missileRange < missileMaxRange && enemyNose.dot(toMissileTarget) > missileBoresight &&
        battle.canStartHostileMissileAttack?.(enemy, missileTarget) !== false &&
        (enemy.missileLockRemaining == null || enemy.missileLockTarget === missileTarget)
      );
      if (!hasMissileLaunchSolution) {
        if (enemy.missileLockTarget && enemy.missileLockTarget !== battle.player) {
          battle.clearWingmanMissileLock?.(enemy, enemy.missileLockTarget);
        }
        enemy.missileLockRemaining = null;
        enemy.missileLockSeeker = null;
        enemy.missileLockTarget = null;
      } else {
        if (enemy.missileLockSeeker == null) {
          enemy.missileLockSeeker = battle.weaponAI.chooseHostileMissileSeeker();
        }
        if (!this.canLaunchMissile(enemy, enemy.missileLockSeeker)) {
          if (enemy.missileLockTarget && enemy.missileLockTarget !== battle.player) {
            battle.clearWingmanMissileLock?.(enemy, enemy.missileLockTarget);
          }
          enemy.missileLockRemaining = null;
          enemy.missileLockTarget = null;
        } else if (enemy.missileLockRemaining == null) {
          enemy.missileLockRemaining = MISSILE_LOCK_WARNING_SECONDS;
          enemy.missileLockTarget = missileTarget;
          if (missileTarget !== battle.player) {
            battle.reportWingmanMissileLock?.(enemy, missileTarget, enemy.missileLockSeeker);
          }
        } else {
          enemy.missileLockRemaining = Math.max(0, enemy.missileLockRemaining - dt);
          if (enemy.missileLockRemaining <= 0) {
            battle.weaponAI.launchEnemyMissile(battle, enemy, enemy.missileLockSeeker, missileTarget);
            enemy.missileClock = (battle.difficulty?.fighter?.missile?.cooldown ?? 14)
              + this.random() * (battle.difficulty?.fighter?.missile?.cooldownJitter ?? 5);
            enemy.missilesFired++;
            enemy.missileLockRemaining = null;
            enemy.missileLockSeeker = null;
            enemy.missileLockTarget = null;
          }
        }
      }
    }
  }

  beginEvasiveManeuver(battle, enemy, threatPosition, duration, threatVelocity = null) {
    const offset = enemy.separation.subVectors(enemy.mesh.position, threatPosition);
    const right = rightOfHeading(enemy.heading, this._evasionRight);
    let side = offset.dot(right);
    if (threatVelocity && enemy.velocity) {
      const relativeVelocity = this._missileRelativeVelocity.subVectors(threatVelocity, enemy.velocity);
      const relativePosition = this._missileRelativePosition.subVectors(threatPosition, enemy.mesh.position);
      const relativeSpeedSquared = relativeVelocity.lengthSq();
      const closing = relativePosition.dot(relativeVelocity) < 0;
      if (relativeSpeedSquared > 1 && closing) {
        const timeToClosestPass = THREE.MathUtils.clamp(
          -relativePosition.dot(relativeVelocity) / relativeSpeedSquared,
          0,
          3.5,
        );
        relativePosition.addScaledVector(relativeVelocity, timeToClosestPass);
        const predictedPassSide = relativePosition.dot(right);
        const missileCrossingRate = relativeVelocity.dot(right);
        if (Math.abs(predictedPassSide) > 40) side = -predictedPassSide;
        else if (Math.abs(missileCrossingRate) > 25) side = -missileCrossingRate;
      }
    }
    enemy.evasiveDirection = Math.abs(side) > 40 ? Math.sign(side) : (this.random() < .5 ? -1 : 1);
    enemy.evasiveTimer = Math.max(enemy.evasiveTimer, duration);
    enemy.evasiveDuration = Math.max(enemy.evasiveDuration ?? 0, duration);
    const climbMin = battle.difficulty?.fighter?.evasion?.evasiveClimb?.min ?? 350;
    const climbMax = battle.difficulty?.fighter?.evasion?.evasiveClimb?.max ?? 800;
    enemy.evasiveClimb = climbMin + this.random() * (climbMax - climbMin);
  }

  selectEnemyEngagementTarget(battle, enemy, playerRange, result) {
    const selection = result ?? {};
    if (enemy.targetPreference === 'wingmen') {
      let nearestWingman = null;
      let nearestRange = Infinity;
      for (const ally of battle.allies) {
        if (ally.dead) continue;
        const range = enemy.mesh.position.distanceTo(ally.mesh.position);
        if (range < nearestRange) {
          nearestRange = range;
          nearestWingman = ally;
        }
      }
      if (nearestWingman) {
        selection.target = nearestWingman;
        selection.domain = 'air';
        return selection;
      }
    }
    if (enemy.missionRole === 'strike') {
      let nearestTarget = null;
      let nearestRange = Infinity;
      for (const unit of battle.friendlyGroundUnits ?? EMPTY_MISSILES) {
        if (unit.dead || unit.armed === false || !unit.mesh?.position) continue;
        const range = enemy.mesh.position.distanceTo(unit.mesh.position);
        if (range < nearestRange) {
          nearestRange = range;
          nearestTarget = unit;
        }
      }
      selection.target = nearestTarget;
      selection.domain = 'ground';
      return selection;
    }
    const targeting = battle.difficulty?.fighter?.targeting;
    const priorityRange = targeting?.airPriorityRange ?? 13000;
    const playerTrackAvailable = playerRange <= priorityRange
      && (enemy.radarTrackDisruptionRemaining ?? 0) <= 0;
    if (playerTrackAvailable) {
      const focusLimit = targeting?.focusFireLimit;
      if (!focusLimit) {
        selection.target = battle.player;
        selection.domain = 'air';
        return selection;
      }

      let otherPlayerAttackers = 0;
      for (const other of battle.enemies ?? EMPTY_MISSILES) {
        if (other === enemy || other.dead || other.kind === 'attack-helicopter') continue;
        if (other.engagementTarget === battle.player) otherPlayerAttackers++;
      }
      const playerSpeed = battle.playerVelocity?.length?.() ?? Infinity;
      const lowEnergy = playerSpeed <= (targeting.lowEnergySpeed ?? 0)
        && battle.player.position.y <= enemy.mesh.position.y + (targeting.lowEnergyAltitudeMargin ?? 0);
      const activeFocusLimit = lowEnergy
        ? (targeting.lowEnergyFocusFireLimit ?? focusLimit)
        : focusLimit;
      if (otherPlayerAttackers < activeFocusLimit) {
        selection.target = battle.player;
        selection.domain = 'air';
        return selection;
      }
    }

    let nearestAlly = null;
    let nearestAllyRange = priorityRange;
    let fewestAllyAttackers = Infinity;
    const coordinateAirTargets = battle.difficulty?.id === 'hard' && targeting?.focusFireLimit > 0;
    for (const ally of battle.allies) {
      if (ally.dead) continue;
      const range = enemy.mesh.position.distanceTo(ally.mesh.position);
      if (range >= priorityRange) continue;
      if (!coordinateAirTargets) {
        if (range < nearestAllyRange) {
          nearestAllyRange = range;
          nearestAlly = ally;
        }
        continue;
      }
      let allyAttackers = 0;
      for (const other of battle.enemies ?? EMPTY_MISSILES) {
        if (other !== enemy && !other.dead && other.engagementTarget === ally) allyAttackers++;
      }
      if (allyAttackers < fewestAllyAttackers
        || (allyAttackers === fewestAllyAttackers && range < nearestAllyRange)) {
        fewestAllyAttackers = allyAttackers;
        nearestAllyRange = range;
        nearestAlly = ally;
      }
    }
    if (nearestAlly) {
      selection.target = nearestAlly;
      selection.domain = 'air';
      return selection;
    }

    // Ground strafing is opportunistic: aircraft contacts always take priority.
    if (enemy.groundStrafeCooldown <= 0
      && this.random() < (targeting?.groundStrafe?.chance ?? .12)) {
      let target = null;
      let nearest = targeting?.groundStrafe?.range ?? 6500;
      for (const unit of battle.friendlyGroundUnits) {
        if (unit.dead || unit.armed === false) continue;
        const range = enemy.mesh.position.distanceTo(unit.mesh.position);
        if (range < nearest) {
          nearest = range;
          target = unit;
        }
      }
      if (target) {
        selection.target = target;
        selection.domain = 'ground';
        return selection;
      }
    }
    if (playerTrackAvailable) {
      selection.target = battle.player;
      selection.domain = 'air';
      return selection;
    }
    if (!result) return null;
    selection.target = null;
    selection.domain = 'air';
    return selection;
  }

  canLaunchMissile(enemy, seeker) {
    return (enemy.radarTrackDisruptionRemaining ?? 0) <= 0 || seeker === 'ir';
  }

  update(battle, dt, playerForward, playerRight, playerThreat) {
    this.updateJets(battle, dt, playerForward, playerRight, playerThreat);
  }
}
