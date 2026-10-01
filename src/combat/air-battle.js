import * as THREE from 'three';
import { createFighter, disposeAircraftVisual } from '../aircraft/plane.js';
import { createMi24AttackHelicopter } from '../aircraft/rotorcraft.js';
import { createMissile, MISSILE_PROFILES } from './projectiles.js';
import { applyAirframeCondition } from './airframe-condition.js';

const allyShotGeo = new THREE.SphereGeometry(.12, 5, 4);
const hostileShotGeo = new THREE.CylinderGeometry(.055, .045, .92, 6, 1);
const allyShotMaterial = new THREE.MeshBasicMaterial({ color: '#75dff0' });
const hostileShotMaterial = new THREE.MeshBasicMaterial({ color: '#ffc477', toneMapped: false });
const helicopterRocketGeo = new THREE.CylinderGeometry(0.09, 0.12, 1.25, 6, 1);
const helicopterRocketMaterial = new THREE.MeshBasicMaterial({ color: '#d3d3bd', toneMapped: false });
const forward = new THREE.Vector3(0, 0, 1);
const projectileAxis = new THREE.Vector3(0, 1, 0);
const zeroVelocity=new THREE.Vector3();
const eventLeadPoint=new THREE.Vector3();
const eventLeadOffset=new THREE.Vector3();
const contactOffset=new THREE.Vector3();
const ENEMY_ATTACK_RUNS = [
  { trail: -850, lateral: 260, altitude: 0, passRange: 1450 },
  { trail: -1350, lateral: 540, altitude: 320, passRange: 1650 },
  { trail: -1750, lateral: 430, altitude: -100, passRange: 1850 },
];

const wrapAngle = angle => THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;

function flightDirection(heading, pitch, target = new THREE.Vector3()) {
  const horizontal = Math.cos(pitch);
  return target.set(Math.sin(heading) * horizontal, Math.sin(pitch), Math.cos(heading) * horizontal);
}

function leadPoint(origin, target, targetVelocity, projectileSpeed, maxTime, result=eventLeadPoint, offset=eventLeadOffset) {
  offset.subVectors(target,origin);
  const velocity = targetVelocity ?? zeroVelocity;
  const a = velocity.lengthSq() - projectileSpeed * projectileSpeed;
  const b = 2 * offset.dot(velocity);
  const c = offset.lengthSq();
  const discriminant = b * b - 4 * a * c;
  let time = offset.length() / projectileSpeed;

  if (Math.abs(a) > 1e-6 && discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    const first = (-b - root) / (2 * a);
    const second = (-b + root) / (2 * a);
    const intercept = first > 0 ? first : second > 0 ? second : time;
    if (intercept > 0) time = intercept;
  }

  return result.copy(target).addScaledVector(velocity, THREE.MathUtils.clamp(time, 0, maxTime));
}

function steerAircraft(unit, target, dt, turnRate, pitchRate, acceleration, speed, maxSpeed) {
  const offset = unit.steeringOffset.subVectors(target,unit.mesh.position);
  const horizontalDistance = Math.max(1, Math.hypot(offset.x, offset.z));
  const desiredHeading = Math.atan2(offset.x, offset.z);
  const yawStep = THREE.MathUtils.clamp(wrapAngle(desiredHeading - unit.heading), -turnRate * dt, turnRate * dt);
  unit.heading = wrapAngle(unit.heading + yawStep);

  const desiredPitch = THREE.MathUtils.clamp(Math.atan2(offset.y, horizontalDistance), -.2, .2);
  unit.pitch += THREE.MathUtils.clamp(desiredPitch - unit.pitch, -pitchRate * dt, pitchRate * dt);
  unit.speed = THREE.MathUtils.clamp(
    unit.speed + THREE.MathUtils.clamp(speed - unit.speed, -acceleration * dt, acceleration * dt),
    0,
    maxSpeed,
  );

  const direction = flightDirection(unit.heading, unit.pitch,unit.direction);
  unit.velocity.copy(direction).multiplyScalar(unit.speed);
  unit.mesh.position.addScaledVector(unit.velocity, dt);
  unit.mesh.rotation.order = 'YXZ';
  unit.mesh.rotation.y = unit.heading;
  unit.mesh.rotation.x = -unit.pitch;
  unit.mesh.rotation.z = THREE.MathUtils.clamp(-(yawStep / Math.max(dt, 1e-4)) * 1.55, -.7, .7);
  return direction;
}

function rightOfHeading(heading,target=new THREE.Vector3()) {
  return target.set(Math.cos(heading), 0, -Math.sin(heading));
}

function forwardOfHeading(heading,target=new THREE.Vector3()) {
  return target.set(Math.sin(heading), 0, Math.cos(heading));
}

/** Handles intercept passes, wingman support, and air-to-air weapons. */
export class AirBattle {
  constructor({ scene, player, aircraftAsset, mission, terrain, audio, fx, playerVelocity, getPlayerHeading, deployHostileCountermeasures, addHostileProjectile, addPlayerProjectile, onMissileLaunch, onWingmanRadio, difficulty = {} }) {
    this.scene = scene;
    this.player = player;
    this.aircraftAssets = aircraftAsset;
    this.mission = mission;
    this.terrain = terrain ?? null;
    this.audio = audio;
    this.fx = fx;
    this.playerVelocity = playerVelocity;
    this.currentPlayerHeading = getPlayerHeading;
    this.deployHostileCountermeasures = deployHostileCountermeasures;
    this.addHostileProjectile = addHostileProjectile;
    this.addPlayerProjectile = addPlayerProjectile;
    this.onMissileLaunch = onMissileLaunch;
    this.onWingmanRadio = onWingmanRadio;
    this.difficulty = difficulty;
    this._playerForward=new THREE.Vector3();
    this._playerRight=new THREE.Vector3();
    this._aft=new THREE.Vector3();
    this._gunMuzzle=new THREE.Vector3();
    this.enemies = [];
    this.allies = [];
    this.groundUnits = [];
    this.friendlyGroundUnits = [];
    this.wingmanOrder = 'attack';
    this.hostilesSpawned = false;
    this.spawn();
  }

  spawn() {
    const heading = this.currentPlayerHeading();
    const playerForward = forwardOfHeading(heading);
    const playerRight = rightOfHeading(heading);
    if (!this.mission.deferredHostiles) this.spawnHostiles(heading, playerForward, playerRight);

    for (let i = 0; i < this.mission.wingmen; i++) {
      const wing = i === 0 ? -1 : 1;
      const jet = createFighter({ friendly: true, aircraftAsset: this.aircraftAssets?.player });
      jet.position.copy(this.player.position)
        .addScaledVector(playerRight, wing * 230)
        .addScaledVector(playerForward, -300);
      jet.position.y += wing * 28 + 24;
      jet.rotation.order = 'YXZ';
      jet.rotation.y = heading;
      jet.scale.setScalar(1);
      this.scene.add(jet);
      this.allies.push({
        mesh: jet,
        radioId: `wingman${i + 1}`,
        wing,
        fireCooldown: 1.2 + i * .6,
        burstClock: 0,
        burstShots: 0,
        target: null,
        groundTarget: null,
        targetRefresh: 0,
        groundMissiles: 2,
        groundMissileCooldown: 2 + i * 1.2,
        threatTarget: null,
        threatTimer: 0,
        groundRoundCount: 0,
        phase: 'formation',
        velocity: flightDirection(heading, 0).multiplyScalar(235),
        heading,
        pitch: 0,
        speed: 235,
        hp: 3.6,
        maxHp: 3.6,
        disengageTimer: 0,
        defensiveTimer: 0,
        evasiveDirection: wing,
        evasiveTimer: 0,
        dead: false,
        waypoint:new THREE.Vector3(),steeringOffset:new THREE.Vector3(),direction:new THREE.Vector3(),
        away:new THREE.Vector3(),separation:new THREE.Vector3(),lead:new THREE.Vector3(),leadOffset:new THREE.Vector3(),
      });
      this.onWingmanRadio?.('formation', this.allies[this.allies.length - 1]);
    }
  }

  spawnHostiles(heading = this.currentPlayerHeading(), playerForward = forwardOfHeading(heading), playerRight = rightOfHeading(heading)) {
    if (this.enemies.length || this.mission.hostiles <= 0) return false;
    this.hostilesSpawned = true;
    const hostileCount = this.mission.hostiles;
    const altitudeOffsets = [-110, 95, -45, 145, -160, 65];
    const edgeMargin = this.getAircraftEdgeMargin();
    const theaterLimit = this.getTheaterLimit(edgeMargin);
    const requestedDistance = this.mission.hostileSpawnDistance ?? 7200;
    const distance = Math.min(requestedDistance, theaterLimit);
    const lateralSpacing = this.mission.hostileLateralSpacing ?? 560;

    for (let i = 0; i < hostileCount; i++) {
      const aircraftVariant = i % 2 === 0 ? 'su27' : 'mig29';
      const jet = createFighter({
        enemy: true,
        aircraftAsset: this.aircraftAssets?.hostiles,
        aircraftVariant,
      });
      const lane = i - (hostileCount - 1) * .5;
      const laneCoordinate = lane / Math.max(.5, (hostileCount - 1) * .5);
      const lateral = lane * lateralSpacing;
      jet.position.copy(this.player.position)
        .addScaledVector(playerForward, distance + Math.abs(lane) * 90)
        .addScaledVector(playerRight, lateral);
      this.clampToTheater(jet.position, edgeMargin);

      const ground = this.terrain?.sampleHeight(jet.position.x, jet.position.z) ?? -Infinity;
      jet.position.y = Math.max(this.player.position.y + altitudeOffsets[i % altitudeOffsets.length], ground + 360);
      const stagingOffset = jet.position.clone().sub(this.player.position);
      // Hold a loose inbound formation through the setup window while closing
      // on the player; the selected difficulty controls when they open fire.
      // Contact aircraft should arrive nose-on instead of coasting away in the
      // player's direction before turning back for their first pass.
      const initialHeading = wrapAngle(heading + Math.PI);
      const initialPitch = 0;
      jet.rotation.order = 'YXZ';
      jet.rotation.y = initialHeading;
      jet.rotation.x = -initialPitch;
      jet.scale.setScalar(.82);
      this.scene.add(jet);
      const maxHp = 4 * (this.difficulty.enemyHealth ?? 1);

      this.enemies.push({
        mesh: jet,
        label: jet.userData.platformName,
        hp: maxHp,
        maxHp,
        heading: initialHeading,
        pitch: initialPitch,
        speed: 285,
        velocity: flightDirection(initialHeading, initialPitch).multiplyScalar(285),
        // Keep each formation lane distinct while bounding the orbit spread,
        // including larger test formations.
        lane: laneCoordinate || (i % 2 ? 1 : -1),
        altitudeOffset: altitudeOffsets[i % altitudeOffsets.length],
        phase: 'staging',
        phaseClock: 0,
        stagingLane: lane,
        stagingLateral: stagingOffset.dot(playerRight),
        attackPattern: Math.floor(Math.random() * ENEMY_ATTACK_RUNS.length),
        gunCooldown: (this.difficulty.enemyGunCooldown ?? 2.2) + i * .45,
        burstClock: 0,
        burstShots: 0,
        missileClock: (this.difficulty.enemyMissileInitialDelay ?? 7) + i * 1.1,
        missilesFired: 0,
        effectClock: 0,
        countermeasures: this.difficulty.enemyCountermeasureCapacity ?? 2,
        countermeasureCooldownBase: this.difficulty.enemyCountermeasureCooldown ?? 4.5,
        countermeasureCooldownJitter: Math.min(1.2, (this.difficulty.enemyCountermeasureCooldown ?? 4.5) * .2),
        countermeasureCooldown: 0,
        lockResponseTimer: null,
        lockResponseLost: 0,
        lockResponseFollowupTimer: 0,
        lockResponseDone: false,
        lockResponseWillDeploy: false,
        lockResponseWillEvade: false,
        lastDefendedMissile: null,
        evasiveTimer: 0,
        evasiveDuration: 0,
        evasiveDirection: Math.random() < 0.5 ? -1 : 1,
        evasiveClimb: 0,
        tacticalManeuverCooldown: 3 + Math.random() * 5,
        groundStrafeCooldown: 8 + Math.random() * 8,
        targetRefreshTimer: 0,
        engagementTarget: null,
        engagementTargetDomain: 'air',
        burstTarget: null,
        burstTargetDomain: 'air',
        boosting: false,
        dead: false,
        attackForward: playerForward.clone(),
        attackRight: playerRight.clone(),
        waypoint:new THREE.Vector3(),steeringOffset:new THREE.Vector3(),direction:new THREE.Vector3(),
        away:new THREE.Vector3(),separation:new THREE.Vector3(),lead:new THREE.Vector3(),leadOffset:new THREE.Vector3(),nose:new THREE.Vector3(),
      });
    }
    this.spawnAttackHelicopters(heading, playerForward, playerRight, edgeMargin, theaterLimit);
    this.mission.deferredHostiles = false;
    return this.enemies.length > 0;
  }

  spawnAttackHelicopters(heading, playerForward, playerRight, edgeMargin, theaterLimit) {
    const count = this.mission.hostileHelicopters ?? 0;
    for (let i = 0; i < count; i++) {
      const mesh = createMi24AttackHelicopter();
      const distance = Math.min(this.mission.hostileHelicopterSpawnDistance ?? 3600, theaterLimit);
      mesh.position.copy(this.player.position)
        .addScaledVector(playerForward, distance)
        .addScaledVector(playerRight, (i - (count - 1) * 0.5) * 850);
      this.clampToTheater(mesh.position, edgeMargin);
      const ground = this.terrain?.sampleHeight(mesh.position.x, mesh.position.z) ?? 0;
      mesh.position.y = ground + 300 + i * 45;
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = wrapAngle(heading + Math.PI);
      mesh.scale.setScalar(0.88);
      this.scene.add(mesh);
      const health = 3.7 * (this.difficulty.enemyHealth ?? 1);
      this.enemies.push({
        kind: 'attack-helicopter',
        mesh,
        label: 'Mi-24V',
        hp: health,
        maxHp: health,
        heading: mesh.rotation.y,
        pitch: 0,
        speed: 62,
        velocity: new THREE.Vector3(),
        dead: false,
        phaseClock: 0,
        orbitPhase: i * Math.PI,
        targetRefreshTimer: 0,
        groundTarget: null,
        rocketCooldown: 8 + i * 6,
        waypoint: new THREE.Vector3(),
        steeringOffset: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        lead: new THREE.Vector3(),
        leadOffset: new THREE.Vector3(),
      });
    }
  }

  update(dt, playerThreat = {}) {
    const heading = this.currentPlayerHeading();
    const playerForward = forwardOfHeading(heading,this._playerForward);
    const playerRight = rightOfHeading(heading,this._playerRight);
    this.updateJets(dt, playerForward, playerRight, playerThreat);
    this.updateAllies(dt, playerForward, playerRight);
  }

  setFriendlyGroundUnits(units) {
    this.friendlyGroundUnits = units ?? [];
  }

  issueWingmanOrder(order) {
    if (!['attack', 'defend', 'regroup', 'disengage', 'rtb'].includes(order)) return false;
    if (!this.allies.some(ally => !ally.dead)) return false;
    if (this.wingmanOrder === order) return true;
    this.wingmanOrder = order;
    for (const ally of this.allies) {
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

  updateJets(dt, playerForward, playerRight, playerThreat) {
    const playerPosition = this.player.position;

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (enemy.kind === 'attack-helicopter') {
        this.updateAttackHelicopter(enemy, dt, playerForward, playerRight);
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
          const reactionScale = this.difficulty.id === 'hard' ? .58 : this.difficulty.id === 'easy' ? 1.25 : 1;
          enemy.lockResponseTimer = (0.8 + Math.random() * 0.65) * reactionScale;
          enemy.lockResponseDone = false;
          enemy.lockResponseWillDeploy = Math.random() < (this.difficulty.enemyLockCountermeasureChance ?? .68);
          enemy.lockResponseWillEvade = Math.random() < (this.difficulty.enemyLockEvasionChance ?? .38);
        }
        if (!enemy.lockResponseDone) {
          enemy.lockResponseTimer -= dt;
          if (enemy.lockResponseTimer <= 0) {
            enemy.lockResponseDone = true;
            enemy.lockResponseFollowupTimer = 1.5 + Math.random();
            if (enemy.lockResponseWillDeploy && range > 1300 && range < 6200) {
              this.deployHostileCountermeasures?.(enemy);
            }
            if (enemy.lockResponseWillEvade) {
              this.beginEvasiveManeuver(
                enemy,
                playerPosition,
                this.difficulty.enemyLockEvasionDuration ?? 3,
              );
            }
          }
        }
        if (enemy.lockResponseDone && enemy.lockResponseFollowupTimer <= 0) {
          if (range > 1300 && range < 6200 && enemy.countermeasures > 0
            && Math.random() < (this.difficulty.enemyLockCountermeasureFollowupChance ?? 0)) {
            this.deployHostileCountermeasures?.(enemy);
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
        this.deployHostileCountermeasures?.(enemy, incomingMissile.seeker ?? 'ir');
        enemy.lastDefendedMissile = incomingMissile.mesh.id;
        this.beginEvasiveManeuver(
          enemy,
          incomingMissile.mesh.position,
          this.difficulty.enemyMissileEvasionDuration ?? 3.6,
        );
      }

      // Break the player's gunsight proactively when a fighter is being
      // pursued. Hard opponents do this often and pull up aggressively.
      const playerToEnemy = enemy.separation.subVectors(enemy.mesh.position, playerPosition);
      const playerAspect = playerForward.dot(playerToEnemy.normalize());
      const tacticalRange = this.difficulty.enemyTacticalManeuverRange ?? 7000;
      if (enemy.phase !== 'staging' && enemy.tacticalManeuverCooldown <= 0
        && range < tacticalRange && playerAspect > .24
        && Math.random() < (this.difficulty.enemyTacticalManeuverChance ?? .5)) {
        this.beginEvasiveManeuver(enemy, playerPosition, this.difficulty.enemyLockEvasionDuration ?? 3);
        enemy.tacticalManeuverCooldown = (this.difficulty.enemyTacticalManeuverCooldown ?? 10)
          + Math.random() * (this.difficulty.enemyTacticalManeuverJitter ?? 5);
      }

      const waypoint=enemy.waypoint;

      const openingDelay = (this.mission.openingDelay ?? 14) * (this.difficulty.enemyOpeningDelayScale ?? 1);
      if (enemy.phase === 'staging' && enemy.phaseClock >= openingDelay) {
        enemy.phase = 'inbound';
        enemy.phaseClock = 0;
        enemy.attackForward.copy(playerForward);
        enemy.attackRight.copy(playerRight);
      }

      if (enemy.phase === 'staging') {
        const laneDrift = Math.sin(enemy.phaseClock * .22 + enemy.stagingLane) * 70;
        waypoint.copy(playerPosition)
          .addScaledVector(this.playerVelocity, .7)
          .addScaledVector(enemy.attackForward, 1650)
          .addScaledVector(enemy.attackRight, enemy.stagingLateral * .32 + laneDrift);
      } else if (enemy.phase === 'inbound') {
        const attackRun = ENEMY_ATTACK_RUNS[enemy.attackPattern];
        waypoint.copy(playerPosition)
          .addScaledVector(this.playerVelocity, .6)
          .addScaledVector(enemy.attackForward, attackRun.trail)
          .addScaledVector(enemy.attackRight, enemy.lane * attackRun.lateral);
        // Hold the attack line through cannon range, then extend after the pass.
        if (range < attackRun.passRange * (this.difficulty.enemyPassRangeScale ?? 1)) {
          enemy.phase = 'extend';
          enemy.phaseClock = 0;
        }
      } else if (enemy.phase === 'extend') {
        waypoint.copy(playerPosition)
          .addScaledVector(this.playerVelocity, .65)
          .addScaledVector(enemy.attackForward, 5000)
          .addScaledVector(enemy.attackRight, enemy.lane * 2200);
        if (waypoint.distanceTo(enemy.mesh.position) < 850 || range > 6200) {
          enemy.phase = 'rejoin';
          enemy.phaseClock = 0;
        }
      }

      if (enemy.phase === 'rejoin') {
        waypoint.copy(playerPosition)
          .addScaledVector(this.playerVelocity, .8)
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
      this.keepAircraftClear(enemy, waypoint, playerRight, false);
      const attackAltitude = enemy.phase === 'inbound' ? ENEMY_ATTACK_RUNS[enemy.attackPattern].altitude : 0;
      this.constrainWaypoint(waypoint, playerPosition.y + enemy.altitudeOffset + attackAltitude, this.getAircraftEdgeMargin());

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
        ? THREE.MathUtils.clamp(Math.max(this.playerVelocity.length(), 285), 220, 320)
        : enemy.phase === 'extend' ? 335 : enemy.phase === 'rejoin' ? 305 : 295;
      const defensiveBreak=enemy.evasiveTimer>0;
      const handlingFactor = enemy.mesh.userData.handlingFactor ?? 1;
      const turnRate = defensiveBreak
        ? (this.difficulty.enemyDefensiveTurnRate ?? .61)
        : enemy.boosting
          ? Math.max(this.difficulty.enemyAttackTurnRate ?? .36, .4)
          : (this.difficulty.enemyAttackTurnRate ?? .36);
      steerAircraft(
        enemy,
        waypoint,
        dt,
        turnRate * handlingFactor,
        (defensiveBreak ? (this.difficulty.enemyDefensivePitchRate ?? .29) : .2) * handlingFactor,
        23 * handlingFactor,
        desiredSpeed,
        365,
      );

      const enemyNose = enemy.nose.copy(forward).applyQuaternion(enemy.mesh.quaternion).normalize();
      const canEngage = enemy.phase !== 'staging';
      if (enemy.targetRefreshTimer <= 0 || !enemy.engagementTarget || enemy.engagementTarget.dead) {
        const selected = this.selectEnemyEngagementTarget(enemy, range);
        enemy.engagementTarget = selected?.target ?? null;
        enemy.engagementTargetDomain = selected?.domain ?? 'air';
        enemy.targetRefreshTimer = 1.15 + Math.random() * .8;
      }
      const engagement = enemy.burstShots > 0 && enemy.burstTarget && !enemy.burstTarget.dead
        ? { target: enemy.burstTarget, domain: enemy.burstTargetDomain }
        : { target: enemy.engagementTarget, domain: enemy.engagementTargetDomain };
      const targetPosition = engagement.target === this.player
        ? playerPosition
        : engagement.target?.mesh?.position;
      const targetVelocity = engagement.target === this.player
        ? this.playerVelocity
        : engagement.target?.velocity ?? zeroVelocity;
      const engagementRange = targetPosition ? enemy.mesh.position.distanceTo(targetPosition) : Infinity;
      const targetLead = targetPosition
        ? leadPoint(enemy.mesh.position, targetPosition, targetVelocity, 720, 3, enemy.lead, enemy.leadOffset)
          .sub(enemy.mesh.position).normalize()
        : enemy.lead.set(0, 0, 0);
      const gunSolution = canEngage && engagement.target
        && (engagement.domain !== 'ground' || enemy.groundStrafeCooldown <= 0 || enemy.burstShots > 0)
        && engagementRange > 450
        && engagementRange < (engagement.domain === 'ground'
          ? (this.difficulty.enemyGroundStrafeRange ?? 6500)
          : (this.difficulty.enemyGunMaxRange ?? 2200))
        && enemyNose.dot(targetLead) > (engagement.domain === 'ground' ? .84 : (this.difficulty.enemyGunBoresight ?? .88));

      if (enemy.burstShots > 0) {
        enemy.burstClock -= dt;
        if (enemy.burstClock <= 0) {
          if (gunSolution) {
            this.fireEnemy(enemy, engagement.target, engagement.domain);
            enemy.burstShots--;
            enemy.burstClock = this.difficulty.enemyGunBurstInterval ?? .095;
            if (enemy.burstShots <= 0) enemy.burstTarget = null;
          } else {
            enemy.burstShots = 0;
          }
        }
      } else if (gunSolution && enemy.gunCooldown <= 0) {
        const burstMin = engagement.domain === 'ground' ? 3 : (this.difficulty.enemyGunBurstMin ?? 6);
        const burstMax = engagement.domain === 'ground' ? 6 : (this.difficulty.enemyGunBurstMax ?? 8);
        enemy.burstShots = burstMin + Math.floor(Math.random() * (burstMax - burstMin + 1));
        enemy.burstClock = 0;
        enemy.burstTarget = engagement.target;
        enemy.burstTargetDomain = engagement.domain;
        if (engagement.domain === 'ground') {
          enemy.groundStrafeCooldown = (this.difficulty.enemyGroundStrafeCooldown ?? 14)
            + Math.random() * ((this.difficulty.enemyGroundStrafeCooldown ?? 14) * .35);
        }
        enemy.gunCooldown = (engagement.domain === 'ground'
          ? (this.difficulty.enemyGroundStrafeCooldown ?? 14)
          : (this.difficulty.enemyGunCooldown ?? 1.65))
          + Math.random() * (this.difficulty.enemyGunCooldownJitter ?? 1.2);
      }

      const missileCapacity = this.difficulty.enemyMissileCapacity ?? 2;
      const missileMinRange = this.difficulty.enemyMissileMinRange ?? 3000;
      const missileMaxRange = this.difficulty.enemyMissileMaxRange ?? 6400;
      const missileBoresight = this.difficulty.enemyMissileBoresight ?? .93;
      const toPlayer = leadPoint(enemy.mesh.position, playerPosition, this.playerVelocity, 720, 3)
        .sub(enemy.mesh.position).normalize();
      if (
        enemy.missileClock <= 0 && enemy.missilesFired < missileCapacity && enemy.phase !== 'staging' &&
        range > missileMinRange && range < missileMaxRange && enemyNose.dot(toPlayer) > missileBoresight
      ) {
        this.launchEnemyMissile(enemy);
        enemy.missileClock = (this.difficulty.enemyMissileCooldown ?? 14)
          + Math.random() * (this.difficulty.enemyMissileCooldownJitter ?? 5);
        enemy.missilesFired++;
      }
    }
  }

  updateAttackHelicopter(enemy, dt, playerForward, playerRight) {
    enemy.phaseClock += dt;
    enemy.orbitPhase += dt * 0.075;
    enemy.targetRefreshTimer -= dt;
    enemy.rocketCooldown -= dt;
    const playerPosition = this.player.position;
    if (enemy.targetRefreshTimer <= 0 || !enemy.groundTarget || enemy.groundTarget.dead) {
      let nearest = 10500;
      let target = null;
      for (const unit of this.friendlyGroundUnits) {
        if (unit.dead || unit.armed === false || unit.role === 'logistics') continue;
        const distance = enemy.mesh.position.distanceTo(unit.mesh.position);
        if (distance < nearest) {
          nearest = distance;
          target = unit;
        }
      }
      enemy.groundTarget = target;
      enemy.targetRefreshTimer = 3.5 + Math.random() * 2.5;
    }

    const target = enemy.groundTarget;
    const center = target?.mesh.position ?? playerPosition;
    const orbitRadius = target ? 1450 : 3200;
    const waypoint = enemy.waypoint.set(
      center.x + Math.cos(enemy.orbitPhase) * orbitRadius,
      center.y,
      center.z + Math.sin(enemy.orbitPhase) * orbitRadius,
    );
    waypoint.y = (this.terrain?.sampleHeight(waypoint.x, waypoint.z) ?? center.y - 300) + 285;
    this.clampToTheater(waypoint, this.getAircraftEdgeMargin());
    const handlingFactor = enemy.mesh.userData.handlingFactor ?? 1;
    steerAircraft(enemy, waypoint, dt, 0.18 * handlingFactor, 0.075 * handlingFactor, 10 * handlingFactor, 70, 92);
    enemy.mesh.userData.mainRotor.rotation.y += dt * 15.5;
    enemy.mesh.userData.tailRotor.rotation.z += dt * 17;
    enemy.mesh.rotation.z = THREE.MathUtils.clamp(enemy.mesh.rotation.z, -0.4, 0.4);

    if (!target || enemy.rocketCooldown > 0) return;
    const range = enemy.mesh.position.distanceTo(target.mesh.position);
    const toTarget = enemy.lead.subVectors(target.mesh.position, enemy.mesh.position).normalize();
    const nose = enemy.direction.set(0, 0, 1).applyQuaternion(enemy.mesh.quaternion).normalize();
    if (range < 800 || range > 4700 || nose.dot(toTarget) < 0.45) return;
    this.fireHelicopterRocketSalvo(enemy, target, range);
    enemy.rocketCooldown = 19 + Math.random() * 8;
  }

  fireHelicopterRocketSalvo(enemy, target, range) {
    const speed = 260;
    const flightTime = range / speed;
    for (const side of [-1, 1]) {
      const start = enemy.mesh.localToWorld(new THREE.Vector3(side * 2.95, -0.7, -0.1));
      const aim = leadPoint(start, target.mesh.position, target.velocity ?? zeroVelocity, speed, flightTime + 1,
        enemy.lead, enemy.leadOffset);
      const horizontal = Math.hypot(aim.x - start.x, aim.z - start.z);
      const dispersion = Math.min(0.11, 0.035 + range * 0.000012);
      aim.x += (Math.random() - 0.5) * horizontal * dispersion;
      aim.y += (Math.random() - 0.5) * horizontal * dispersion * 0.28;
      aim.z += (Math.random() - 0.5) * horizontal * dispersion;
      const direction = aim.sub(start).normalize();
      const rocket = new THREE.Mesh(helicopterRocketGeo, helicopterRocketMaterial);
      rocket.position.copy(start);
      rocket.quaternion.setFromUnitVectors(projectileAxis, direction);
      this.scene.add(rocket);
      const velocity = direction.multiplyScalar(speed);
      this.fx?.addMovingTracer(start, velocity, '#f0a36b', { life: 0.22, trailTime: 0.1 });
      this.addHostileProjectile({
        projectile: true,
        ground: true,
        aircraftStrafe: true,
        damage: 0.62,
        mesh: rocket,
        velocity,
        life: flightTime + 2.2,
        target,
        sourceUnit: enemy,
      });
    }
    this.audio?.playDistantGun(range, 'air');
  }

  beginEvasiveManeuver(enemy, threatPosition, duration) {
    const offset = enemy.separation.subVectors(enemy.mesh.position, threatPosition);
    const right = rightOfHeading(enemy.heading, enemy.away);
    const side = offset.dot(right);
    enemy.evasiveDirection = Math.abs(side) > 40 ? Math.sign(side) : (Math.random() < .5 ? -1 : 1);
    enemy.evasiveTimer = Math.max(enemy.evasiveTimer, duration);
    enemy.evasiveDuration = Math.max(enemy.evasiveDuration ?? 0, duration);
    const climbMin = this.difficulty.enemyEvasiveClimbMin ?? 350;
    const climbMax = this.difficulty.enemyEvasiveClimbMax ?? 800;
    enemy.evasiveClimb = climbMin + Math.random() * (climbMax - climbMin);
  }

  selectEnemyEngagementTarget(enemy, playerRange) {
    const priorityRange = this.difficulty.enemyAirPriorityRange ?? 13000;
    if (playerRange <= priorityRange) return { target: this.player, domain: 'air' };

    let nearestAlly = null;
    let nearestAllyRange = priorityRange;
    for (const ally of this.allies) {
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
      && Math.random() < (this.difficulty.enemyGroundStrafeChance ?? .12)) {
      let target = null;
      let nearest = this.difficulty.enemyGroundStrafeRange ?? 6500;
      for (const unit of this.friendlyGroundUnits) {
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

  updateAllies(dt, playerForward, playerRight) {
    for (const ally of this.allies) {
      if (ally.dead) continue;
      ally.defensiveTimer = Math.max(0, ally.defensiveTimer - dt);
      ally.groundMissileCooldown = Math.max(0, ally.groundMissileCooldown - dt);
      ally.threatTimer = Math.max(0, ally.threatTimer - dt);
      if (ally.threatTimer <= 0) ally.threatTarget = null;
      if (ally.target?.dead) ally.target = null;
      if (ally.groundTarget?.dead) ally.groundTarget = null;
      if (this.wingmanOrder === 'defend' && ally.target && ally.target.mesh.position.distanceTo(this.player.position) > 5600
        && ally.target.mesh.position.distanceTo(ally.mesh.position) > 2800) {
        ally.target = null;
        ally.targetRefresh = 0;
      }
      ally.targetRefresh -= dt;
      ally.fireCooldown -= dt;

      ally.disengageTimer = Math.max(0, ally.disengageTimer - dt);
      const holdFormation = ['regroup', 'disengage', 'rtb'].includes(this.wingmanOrder);
      if (holdFormation) {
        ally.target = null;
        ally.groundTarget = null;
        ally.targetRefresh = .4;
      } else if ((!ally.target && !ally.groundTarget) || ally.targetRefresh <= 0) {
        if (ally.defensiveTimer <= 0) {
          // Air contacts always take precedence. The ground attack is a CAS
          // fallback once the air picture is clear (or a self-defence task
          // against a ground unit that is firing at the flight).
          ally.target = this.selectAllyTarget(ally);
          ally.groundTarget = ally.target ? null : this.selectAllyGroundTarget(ally);
        }
        ally.targetRefresh = ally.defensiveTimer > 0 ? .4 : 1.1 + Math.random() * .55;
        if (ally.target && ally.target.mesh.position.distanceTo(ally.mesh.position) < 7800) {
          const relative = contactOffset.subVectors(ally.target.mesh.position, this.player.position);
          const ahead = relative.dot(playerForward);
          const side = relative.dot(playerRight);
          const scope = String(ally.target.mesh.id);
          if (ahead < -Math.abs(side) * .35) {
            this.onWingmanRadio?.('six', ally, { scope, target: ally.target });
          } else {
            const direction = Math.abs(side) < Math.abs(ahead) * .35
              ? 'ahead'
              : side > 0 ? 'right' : 'left';
            this.onWingmanRadio?.('contact', ally, {
              scope,
              target: ally.target,
              params: { direction: { key: `radio.direction.${direction}` } },
            });
          }
        }
      }

      const target = ally.target ?? ally.groundTarget;
      const groundTarget = !ally.target && Boolean(ally.groundTarget);
      const targetVelocity = target?.velocity ?? zeroVelocity;
      const targetRange = target ? target.mesh.position.distanceTo(ally.mesh.position) : Infinity;
      const waypoint=ally.waypoint;

      if (target && targetRange < (ally.groundTarget ? 650 : 1100)) ally.phase = 'extend';
      else if (!target || (ally.phase === 'extend' && targetRange > 2050)) ally.phase = target ? 'attack' : 'formation';

      if (ally.defensiveTimer > 0) {
        waypoint.copy(ally.mesh.position).addScaledVector(ally.direction, 1450);
        waypoint.addScaledVector(playerRight, ally.evasiveDirection * 620);
        waypoint.y += 200;
      } else if (this.wingmanOrder === 'disengage' && ally.disengageTimer > 0) {
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
        waypoint.copy(this.player.position)
          .addScaledVector(playerRight, ally.wing * 230)
          .addScaledVector(aft, 300);
        waypoint.y+=24+ally.wing*28;
      }

      this.keepAircraftClear(ally, waypoint, playerRight, true, target);
      let preferredAltitude = this.player.position.y + 35 + ally.wing * 25;
      if (groundTarget) {
        const ground = this.terrain?.sampleHeight(target.mesh.position.x, target.mesh.position.z) ?? 0;
        preferredAltitude = Math.max(ground + 520, Math.min(this.player.position.y - 260, ground + 1150));
      }
      this.constrainWaypoint(waypoint, preferredAltitude, this.getAircraftEdgeMargin());
      const followSpeed = THREE.MathUtils.clamp(this.playerVelocity.length() + 24, 245, 425);
      const nose = steerAircraft(ally, waypoint, dt,target ? .39 : .43,.23,28,followSpeed,445);

      ally.mesh.userData.boosting = Boolean(this.player.userData.boosting) || ally.defensiveTimer > 0 || (target && targetRange > 3600);
      if (ally.mesh.userData.afterburner) ally.mesh.userData.afterburner.visible = ally.mesh.userData.boosting;

      if (ally.defensiveTimer > 0 || !target || ally.phase === 'extend') {
        if (ally.burstShots > 0) ally.burstShots = 0;
        continue;
      }

      const aim = leadPoint(ally.mesh.position, target.mesh.position, targetVelocity, groundTarget ? 880 : 680, 3,ally.lead,ally.leadOffset)
        .sub(ally.mesh.position)
        .normalize();
      const aligned = nose.dot(aim) > (groundTarget ? .94 : .91);
      const gunSolution = targetRange > (groundTarget ? 380 : 650) && targetRange < (groundTarget ? 1800 : 1950) && aligned;

      if (groundTarget && ally.groundMissiles > 0 && ally.groundMissileCooldown <= 0
        && targetRange > 1550 && targetRange < 4400 && nose.dot(aim) > .955) {
        this.fireAllyMaverick(ally, target);
        ally.groundMissiles--;
        ally.groundMissileCooldown = 5.5 + Math.random() * 3.5;
      }

      if (ally.burstShots > 0) {
        ally.burstClock -= dt;
        if (ally.burstClock <= 0) {
          if (gunSolution) {
            if (groundTarget) this.fireAllyGround(ally, target);
            else this.fireAlly(ally, target);
            ally.burstShots--;
            ally.burstClock = .09;
          } else {
            ally.burstShots = 0;
          }
        }
      } else if (gunSolution && ally.fireCooldown <= 0) {
        ally.burstShots = groundTarget ? 7 + Math.floor(Math.random() * 4) : 5 + Math.floor(Math.random() * 3);
        ally.burstClock = 0;
        ally.fireCooldown = groundTarget ? 1.9 + Math.random() * 1.1 : 1.45 + Math.random() * 1.25;
      }
    }
  }

  damageWingman(ally, damage, sourceUnit = null) {
    if (!ally || ally.dead) return;
    ally.hp = Math.max(0, ally.hp - Math.max(0, damage));
    applyAirframeCondition(ally.mesh, ally.hp, ally.maxHp);
    if (ally.hp <= 0) {
      ally.dead = true;
      this.onWingmanRadio?.('lost', ally);
      this.scene.remove(ally.mesh);
      this.fx?.forgetAircraft(ally.mesh);
      disposeAircraftVisual(ally.mesh);
      return;
    }
    if (ally.defensiveTimer <= 0) {
      if (sourceUnit?.mesh) this.beginEvasiveManeuver(ally, sourceUnit.mesh.position, 2.4);
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
    this.onWingmanRadio?.('hit', ally);
  }

  selectAllyTarget(ally) {
    if (['regroup', 'disengage', 'rtb'].includes(this.wingmanOrder)) return null;
    if (ally.threatTimer > 0 && ally.threatTarget && !ally.threatTarget.dead) return ally.threatTarget;
    let selected = null;
    let bestScore = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.phase === 'staging' || enemy.mesh.position.distanceTo(this.player.position) > 9400) continue;
      if (this.wingmanOrder === 'defend' && enemy.mesh.position.distanceTo(this.player.position) > 5200) continue;
      const range = enemy.mesh.position.distanceTo(ally.mesh.position);
      if (range > 10200) continue;
      let otherAttackers=0;
      for(const other of this.allies)if(other!==ally&&other.target===enemy)otherAttackers++;
      const score = range + otherAttackers * 2300;
      if (score < bestScore) {
        bestScore = score;
        selected = enemy;
      }
    }
    return selected;
  }

  setGroundUnits(units) {
    this.groundUnits = units ?? [];
  }

  selectAllyGroundTarget(ally) {
    if (['regroup', 'disengage', 'rtb'].includes(this.wingmanOrder)) return null;
    const liveAirThreats = this.enemies.some(enemy => !enemy.dead);
    let selected = null;
    let bestScore = Infinity;
    for (const unit of this.groundUnits) {
      if (unit.dead || unit.armed === false || unit.team !== 'red' || !unit.mesh?.parent) continue;
      if (this.wingmanOrder === 'defend') {
        const activelyThreatening = unit.aaThreatTimer > 0
          && (unit.aaTarget === this.player || unit.aaTarget === ally.mesh);
        if (!activelyThreatening) continue;
      } else if (liveAirThreats) {
        continue;
      }
      const range = unit.mesh.position.distanceTo(ally.mesh.position);
      if (range > 8200) continue;
      let otherAttackers = 0;
      for (const other of this.allies) if (other !== ally && other.groundTarget === unit) otherAttackers++;
      const score = range + otherAttackers * 1700;
      if (score < bestScore) {
        bestScore = score;
        selected = unit;
      }
    }
    return selected;
  }

  closestWingmanTo(position) {
    let closest = null;
    let closestDistance = Infinity;
    for (const ally of this.allies) {
      if (ally.dead) continue;
      const distance = ally.mesh.position.distanceToSquared(position);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = ally;
      }
    }
    return closest;
  }

  keepAircraftClear(unit, waypoint, playerRight, friendly, target = null) {
    const awayFromPlayer = unit.away.subVectors(unit.mesh.position,this.player.position);
    const playerDistance = awayFromPlayer.length();
    const minimumPlayerDistance = friendly ? 260 : 600;
    if (playerDistance < minimumPlayerDistance) {
      awayFromPlayer.y *= 1.4;
      if (awayFromPlayer.lengthSq() < 1) awayFromPlayer.copy(playerRight).multiplyScalar(unit.wing || 1);
      awayFromPlayer.normalize();
      waypoint.addScaledVector(awayFromPlayer, (minimumPlayerDistance - playerDistance) * 2.4);
    }

    if (friendly) {
      for (const other of this.allies) {
        if (other === unit || other.dead) continue;
        const separation = unit.separation.subVectors(unit.mesh.position,other.mesh.position);
        const distance = separation.length();
        if (distance < 270) {
          separation.y *= 1.5;
          if (separation.lengthSq() < 1) separation.copy(playerRight).multiplyScalar(unit.wing);
          waypoint.addScaledVector(separation.normalize(), (270 - distance) * 1.8);
        }
      }
    }

    // A wingman avoids crossing another hostile, while keeping its selected target in sight.
    if (friendly) {
      for (const enemy of this.enemies) {
        if (enemy === target || enemy.dead) continue;
        const separation = unit.separation.subVectors(unit.mesh.position,enemy.mesh.position);
        const distance = separation.length();
        if (distance < 430) waypoint.addScaledVector(separation.normalize(), (430 - distance) * 1.5);
      }
    }
  }

  getTheaterLimit(margin = 500) {
    if (!this.terrain?.worldSize) return Infinity;
    return Math.max(1200, this.terrain.worldSize * .5 - margin);
  }

  getAircraftEdgeMargin() {
    const bounds = this.terrain?.operationBounds;
    if (!bounds) return Math.min(2400, this.getTheaterLimit(500) * .14);
    const span = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    return Math.min(2400, Math.max(700, span * .075));
  }

  clampToTheater(position, margin = 500) {
    const limit = this.getTheaterLimit(margin);
    const bounds = this.terrain?.operationBounds;
    position.x = THREE.MathUtils.clamp(position.x, bounds ? bounds.minX + margin : -limit, bounds ? bounds.maxX - margin : limit);
    position.z = THREE.MathUtils.clamp(position.z, bounds ? bounds.minZ + margin : -limit, bounds ? bounds.maxZ - margin : limit);
  }

  constrainWaypoint(waypoint, preferredAltitude, margin = 500) {
    this.clampToTheater(waypoint, margin);
    const ground = this.terrain?.sampleHeight(waypoint.x, waypoint.z) ?? -Infinity;
    waypoint.y = Math.max(preferredAltitude, ground + 360);
  }

  fireAlly(ally, target) {
    this.audio?.playDistantGun(ally.mesh.position.distanceTo(this.player.position), 'air');
    // Match the player's M61 gun port in the F-35's local coordinates. The
    // gun round starts at the muzzle; its visible tracer is clipped to the
    // aircraft's forward plane by FlightFX so it cannot draw through the body.
    const start = new THREE.Vector3(-.78, .38, 2.65)
      .applyQuaternion(ally.mesh.quaternion)
      .add(ally.mesh.position);
    const predicted = leadPoint(start, target.mesh.position, target.velocity, 680, 3);
    const aim = predicted.sub(start).normalize();
    const spread=this.difficulty.wingmanAimSpread ?? 1;
    aim.add(new THREE.Vector3((Math.random() - .5) * .012 * spread, (Math.random() - .5) * .009 * spread, (Math.random() - .5) * .012 * spread)).normalize();
    const velocity = aim.multiplyScalar(680);
    this.fx?.addMovingTracer(start, velocity, '#82e7ff', {
      life: .14,
      trailTime: .06,
      ownerAircraft: ally.mesh,
      aircraftForwardClearance: 7.2,
    });
    const shot = new THREE.Mesh(allyShotGeo, allyShotMaterial);
    shot.position.copy(start);
    this.scene.add(shot);
    this.addPlayerProjectile({ mesh: shot, velocity, life: 4, damage: .42 * (this.difficulty.wingmanDamage ?? 1), ally: true, sourceUnit: ally });
  }

  fireAllyGround(ally, target) {
    const start = new THREE.Vector3(-.78, .38, 2.65)
      .applyQuaternion(ally.mesh.quaternion)
      .add(ally.mesh.position);
    const predicted = leadPoint(start, target.mesh.position, target.velocity ?? zeroVelocity, 880, 3);
    const flightTime = Math.min(3, start.distanceTo(predicted) / 880);
    predicted.y += .5 * 9.81 * flightTime * flightTime;
    const aim = predicted.sub(start).normalize();
    aim.add(new THREE.Vector3((Math.random() - .5) * .018, (Math.random() - .5) * .012, (Math.random() - .5) * .018)).normalize();
    const velocity = aim.multiplyScalar(880).add(ally.velocity);
    this.audio?.playDistantGun(ally.mesh.position.distanceTo(this.player.position), 'air');
    ally.groundRoundCount++;
    if (ally.groundRoundCount % 3 === 0) {
      this.fx?.addMovingTracer(start, velocity, '#ffd282', {
        life: .14, trailTime: .06, gravity: 9.81, ownerAircraft: ally.mesh,
        aircraftForwardClearance: 7.2,
      });
    }
    const shot = new THREE.Mesh(allyShotGeo, allyShotMaterial);
    shot.position.copy(start);
    this.scene.add(shot);
    this.addPlayerProjectile({
      mesh: shot, velocity, life: 3.3, damage: .42 * (this.difficulty.wingmanDamage ?? 1),
      gravity: 9.81, ballistic: true, canHitGround: true, ally: true, sourceUnit: ally,
    });
  }

  fireAllyMaverick(ally, target) {
    const profile = MISSILE_PROFILES.playerGround;
    const start = ally.mesh.position.clone().add(
      new THREE.Vector3(0, -.1, 3.2).applyQuaternion(ally.mesh.quaternion),
    );
    const predicted = leadPoint(start, target.mesh.position, target.velocity ?? zeroVelocity, profile.speed, 6);
    const aim = predicted.sub(start).normalize();
    const mesh = createMissile('#c8cbc0');
    mesh.position.copy(start);
    mesh.quaternion.setFromUnitVectors(forward, aim);
    this.scene.add(mesh);
    if (mesh.userData.engineFlame) mesh.userData.engineFlame.visible = true;
    this.audio?.playMissileLaunch();
    this.audio?.startMissileFlight(mesh.id);
    this.addPlayerProjectile({
      projectile: true, missile: true, homing: true, seeker: profile.seeker, mesh,
      velocity: aim.multiplyScalar(profile.speed), speed: profile.speed, life: profile.life,
      burnRemaining: profile.burnTime, coastDrag: profile.coastDrag, motorBurning: true,
      guidanceActive: true, damage: profile.damage, proximityRadius: profile.proximityRadius,
      proximityDamage: profile.proximityDamage, target, targetDomain: 'ground', decoyTarget: null,
      decoyAttempts: new Set(), trail: 0, ally: true, sourceUnit: ally,
    });
    this.onWingmanRadio?.('rifle', ally, { scope: String(target.mesh.id), target });
  }

  fireEnemy(enemy, target = this.player, domain = 'air') {
    const targetMesh = target === this.player ? this.player : target?.mesh;
    if (!targetMesh) return;
    this.audio?.playDistantGun(enemy.mesh.position.distanceTo(targetMesh.position), 'air');
    const clearance = enemy.mesh.userData.aircraftForwardClearance ?? 7.2;
    const start = enemy.mesh.localToWorld(this._gunMuzzle.set(.42, -.16, Math.max(2.8, clearance * .62)));
    const targetPosition = target === this.player ? this.player.position : targetMesh.position;
    const targetVelocity = target === this.player ? this.playerVelocity : target.velocity ?? zeroVelocity;
    const predicted = leadPoint(start, targetPosition, targetVelocity, 720, 3);
    const aim = predicted.sub(start).normalize();
    const spread=this.difficulty.enemyAimSpread ?? 1;
    aim.add(new THREE.Vector3((Math.random() - .5) * .018 * spread, (Math.random() - .5) * .012 * spread, (Math.random() - .5) * .018 * spread)).normalize();
    const shot = new THREE.Mesh(hostileShotGeo, hostileShotMaterial);
    shot.position.copy(start);
    shot.quaternion.setFromUnitVectors(projectileAxis, aim);
    this.scene.add(shot);
    const velocity = aim.multiplyScalar(720);
    this.fx?.addMovingTracer(start, velocity, '#ffc477', {
      life: .14,
      trailTime: .045,
      ownerAircraft: enemy.mesh,
      aircraftForwardClearance: clearance,
    });
    this.addHostileProjectile({
      projectile: true,
      aircraftGun: domain !== 'ground',
      ground: domain === 'ground',
      aircraftStrafe: domain === 'ground',
      damage: domain === 'ground' ? .18 : .85,
      mesh: shot,
      velocity,
      life: 4,
      target: domain === 'ground' ? target : undefined,
      sourceUnit: enemy,
    });
  }

  launchEnemyMissile(enemy) {
    const direction = forward.clone().applyQuaternion(enemy.mesh.quaternion).normalize();
    const start = enemy.mesh.position.clone().addScaledVector(direction, 5);
    const missileProfile = MISSILE_PROFILES.hostile;
    const missileSpeed = this.difficulty.hostileMissileSpeed ?? missileProfile.speed;
    const predicted = leadPoint(start, this.player.position, this.playerVelocity, missileSpeed, 5);
    const aim = predicted.sub(start).normalize();
    const mesh = createMissile('#c5c5bc');
    mesh.position.copy(start);
    mesh.quaternion.setFromUnitVectors(forward, aim);
    this.scene.add(mesh);
    if (mesh.userData.engineFlame) mesh.userData.engineFlame.visible = true;
    const seeker = Math.random() < .5 ? 'ir' : 'radar';
    this.addHostileProjectile({
      projectile: true,
      missile: true,
      homing: true,
      seeker,
      mesh,
      velocity: aim.multiplyScalar(missileSpeed),
      speed: missileSpeed,
      burnRemaining: missileProfile.burnTime,
      coastDrag: missileProfile.coastDrag,
      motorBurning: true,
      guidanceActive: true,
      life: missileProfile.life,
      warningClock: 0,
      decoyTarget: null,
    });
    this.onMissileLaunch?.(enemy, mesh);
    this.audio?.playMissileLaunch();
    this.audio?.startMissileFlight(mesh.id);
  }

  dispose() {
    for (const unit of this.enemies){this.scene.remove(unit.mesh);this.fx?.forgetAircraft(unit.mesh);disposeAircraftVisual(unit.mesh);}
    for (const unit of this.allies){this.scene.remove(unit.mesh);this.fx?.forgetAircraft(unit.mesh);disposeAircraftVisual(unit.mesh);}
    this.enemies.length = 0;
    this.allies.length = 0;
  }
}
