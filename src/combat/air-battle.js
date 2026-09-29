import * as THREE from 'three';
import { createFighter } from '../plane.js';
import { createMissile, MISSILE_PROFILES } from './projectiles.js';

const allyShotGeo = new THREE.SphereGeometry(.12, 5, 4);
const hostileShotGeo = new THREE.SphereGeometry(.3, 7, 5);
const allyShotMaterial = new THREE.MeshBasicMaterial({ color: '#75dff0' });
const hostileShotMaterial = new THREE.MeshBasicMaterial({ color: '#ff694d' });
const forward = new THREE.Vector3(0, 0, 1);

const wrapAngle = angle => THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;

function flightDirection(heading, pitch, target = new THREE.Vector3()) {
  const horizontal = Math.cos(pitch);
  return target.set(Math.sin(heading) * horizontal, Math.sin(pitch), Math.cos(heading) * horizontal);
}

function leadPoint(origin, target, targetVelocity, projectileSpeed, maxTime = 4) {
  const offset = target.clone().sub(origin);
  const velocity = targetVelocity ?? new THREE.Vector3();
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

  return target.clone().addScaledVector(velocity, THREE.MathUtils.clamp(time, 0, maxTime));
}

function steerAircraft(unit, target, dt, { turnRate, pitchRate, acceleration, speed, maxSpeed }) {
  const offset = target.clone().sub(unit.mesh.position);
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

  const direction = flightDirection(unit.heading, unit.pitch);
  unit.velocity.copy(direction).multiplyScalar(unit.speed);
  unit.mesh.position.addScaledVector(unit.velocity, dt);
  unit.mesh.rotation.order = 'YXZ';
  unit.mesh.rotation.y = unit.heading;
  unit.mesh.rotation.x = -unit.pitch;
  unit.mesh.rotation.z = THREE.MathUtils.clamp(-(yawStep / Math.max(dt, 1e-4)) * 1.55, -.7, .7);
  return direction;
}

function rightOfHeading(heading) {
  return new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
}

function forwardOfHeading(heading) {
  return new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
}

/** Handles intercept passes, wingman support, and air-to-air weapons. */
export class AirBattle {
  constructor({ scene, player, aircraftAsset, mission, terrain, audio, fx, playerVelocity, getPlayerHeading, deployHostileCountermeasures, addHostileProjectile, addPlayerProjectile }) {
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
    this.enemies = [];
    this.allies = [];
    this.spawn();
  }

  spawn() {
    const heading = this.currentPlayerHeading();
    const playerForward = forwardOfHeading(heading);
    const playerRight = rightOfHeading(heading);
    const hostileCount = this.mission.hostiles;
    const altitudeOffsets = [-110, 95, -45, 145, -160, 65];
    const theaterLimit = this.getTheaterLimit(450);
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
      const lateral = lane * lateralSpacing;
      jet.position.copy(this.player.position)
        .addScaledVector(playerForward, distance + Math.abs(lane) * 90)
        .addScaledVector(playerRight, lateral);
      this.clampToTheater(jet.position, 300);

      const ground = this.terrain?.sampleHeight(jet.position.x, jet.position.z) ?? -Infinity;
      jet.position.y = Math.max(this.player.position.y + altitudeOffsets[i % altitudeOffsets.length], ground + 360);
      const stagingOffset = jet.position.clone().sub(this.player.position);
      // Keep the first contact in a loose, non-threatening transit formation.
      // The intercept pass begins after the mission-specific setup interval.
      const initialHeading = heading;
      const initialPitch = 0;
      jet.rotation.order = 'YXZ';
      jet.rotation.y = initialHeading;
      jet.rotation.x = -initialPitch;
      jet.scale.setScalar(.82);
      this.scene.add(jet);

      this.enemies.push({
        mesh: jet,
        label: jet.userData.platformName,
        hp: 4,
        heading: initialHeading,
        pitch: initialPitch,
        speed: 285,
        velocity: flightDirection(initialHeading, initialPitch).multiplyScalar(285),
        lane: Math.sign(lateral || (i % 2 ? 1 : -1)),
        altitudeOffset: altitudeOffsets[i % altitudeOffsets.length],
        phase: 'staging',
        phaseClock: 0,
        stagingLane: lane,
        stagingForward: stagingOffset.dot(playerForward),
        stagingLateral: stagingOffset.dot(playerRight),
        gunCooldown: 2.4 + i * .55,
        burstClock: 0,
        burstShots: 0,
        missileClock: 7 + i * 1.1,
        missilesFired: 0,
        effectClock: 0,
        countermeasures: 2,
        countermeasureCooldown: 0,
        lockResponseTimer: null,
        lockResponseLost: 0,
        lockResponseDone: false,
        lockResponseWillDeploy: false,
        lastDefendedMissile: null,
        evasiveTimer: 0,
        evasiveDirection: Math.random() < 0.5 ? -1 : 1,
        boosting: false,
        dead: false,
      });
    }

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
        wing,
        fireCooldown: 1.2 + i * .6,
        burstClock: 0,
        burstShots: 0,
        target: null,
        targetRefresh: 0,
        phase: 'formation',
        velocity: flightDirection(heading, 0).multiplyScalar(235),
        heading,
        pitch: 0,
        speed: 235,
        dead: false,
      });
    }
  }

  update(dt, playerThreat = {}) {
    const heading = this.currentPlayerHeading();
    const playerForward = forwardOfHeading(heading);
    const playerRight = rightOfHeading(heading);
    this.updateJets(dt, playerForward, playerRight, playerThreat);
    this.updateAllies(dt, playerForward, playerRight);
  }

  updateJets(dt, playerForward, playerRight, playerThreat) {
    const playerPosition = this.player.position;

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.phaseClock += dt;
      enemy.gunCooldown -= dt;
      enemy.missileClock -= dt;
      enemy.effectClock += dt;
      enemy.countermeasureCooldown = Math.max(0, enemy.countermeasureCooldown - dt);
      enemy.evasiveTimer = Math.max(0, enemy.evasiveTimer - dt);

      const range = enemy.mesh.position.distanceTo(playerPosition);
      const playerHasLock = playerThreat.lockedTarget === enemy;
      if (playerHasLock) {
        enemy.lockResponseLost = 0;
        if (enemy.lockResponseTimer === null) {
          enemy.lockResponseTimer = 0.8 + Math.random() * 0.65;
          enemy.lockResponseDone = false;
          enemy.lockResponseWillDeploy = Math.random() < 0.68;
        }
        if (!enemy.lockResponseDone) {
          enemy.lockResponseTimer -= dt;
          if (enemy.lockResponseTimer <= 0) {
            enemy.lockResponseDone = true;
            if (enemy.lockResponseWillDeploy && range > 1300 && range < 6200) {
              this.deployHostileCountermeasures?.(enemy);
            }
          }
        }
      } else {
        enemy.lockResponseLost += dt;
        if (enemy.lockResponseLost > 1.4) {
          enemy.lockResponseTimer = null;
          enemy.lockResponseDone = false;
          enemy.lockResponseWillDeploy = false;
        }
      }

      const incomingMissile = playerThreat.incomingMissiles
        ?.filter(missile => missile.target === enemy && missile.life > 0)
        .sort((a, b) => a.mesh.position.distanceToSquared(enemy.mesh.position) - b.mesh.position.distanceToSquared(enemy.mesh.position))[0];
      if (
        incomingMissile && incomingMissile.mesh.position.distanceTo(enemy.mesh.position) < 3000 &&
        enemy.lastDefendedMissile !== incomingMissile.mesh.id
      ) {
        if (this.deployHostileCountermeasures?.(enemy, incomingMissile.seeker ?? 'ir')) {
          enemy.lastDefendedMissile = incomingMissile.mesh.id;
        }
      }

      let waypoint;

      if (enemy.phase === 'staging' && enemy.phaseClock >= (this.mission.openingDelay ?? 14)) {
        enemy.phase = 'inbound';
        enemy.phaseClock = 0;
      }

      if (enemy.phase === 'staging') {
        const laneDrift = Math.sin(enemy.phaseClock * .22 + enemy.stagingLane) * 70;
        waypoint = playerPosition.clone()
          .addScaledVector(this.playerVelocity, .7)
          .addScaledVector(playerForward, enemy.stagingForward)
          .addScaledVector(playerRight, enemy.stagingLateral + laneDrift);
      } else if (enemy.phase === 'inbound') {
        waypoint = playerPosition.clone()
          .addScaledVector(this.playerVelocity, .6)
          .addScaledVector(playerForward, -1000)
          .addScaledVector(playerRight, enemy.lane * 240);
        // Hold the attack line through cannon range, then extend after the pass.
        if (range < 720) {
          enemy.phase = 'extend';
          enemy.phaseClock = 0;
        }
      } else if (enemy.phase === 'extend') {
        waypoint = playerPosition.clone()
          .addScaledVector(this.playerVelocity, .65)
          .addScaledVector(playerForward, 4300)
          .addScaledVector(playerRight, enemy.lane * 1750);
        if (waypoint.distanceTo(enemy.mesh.position) < 850 || range > 6200) {
          enemy.phase = 'rejoin';
          enemy.phaseClock = 0;
        }
      }

      if (enemy.phase === 'rejoin') {
        waypoint = playerPosition.clone()
          .addScaledVector(this.playerVelocity, .8)
          .addScaledVector(playerForward, 7350)
          .addScaledVector(playerRight, enemy.lane * 1650);
        if (waypoint.distanceTo(enemy.mesh.position) < 1000) {
          enemy.phase = 'inbound';
          enemy.phaseClock = 0;
        }
      }

      // Give each hostile a slightly different run line while keeping the pass legible.
      const runOffset = Math.sin(enemy.phaseClock * .24 + enemy.lane * 1.8) * 130;
      waypoint.addScaledVector(playerRight, runOffset);
      if (enemy.evasiveTimer > 0) {
        const urgency = enemy.evasiveTimer / 2.4;
        waypoint.addScaledVector(playerRight, enemy.evasiveDirection * (520 + urgency * 260));
        waypoint.y += 120 + urgency * 120;
      }
      this.keepAircraftClear(enemy, waypoint, playerRight, false);
      this.constrainWaypoint(waypoint, playerPosition.y + enemy.altitudeOffset);

      enemy.boosting = (enemy.phase === 'extend' && range > 2300) || enemy.evasiveTimer > 0;
      enemy.mesh.userData.boosting = enemy.boosting;
      if (enemy.mesh.userData.afterburner) {
        enemy.mesh.userData.afterburner.visible = enemy.boosting;
        const pulse = 1 + Math.sin(enemy.effectClock * 18 + enemy.mesh.position.z * .015) * .045;
        enemy.mesh.userData.afterburner.scale.setScalar(enemy.boosting ? pulse : 1);
      }

      const desiredSpeed = enemy.phase === 'staging'
        ? THREE.MathUtils.clamp(this.playerVelocity.length(), 220, 300)
        : enemy.phase === 'extend' ? 315 : enemy.phase === 'rejoin' ? 300 : 280;
      steerAircraft(enemy, waypoint, dt, {
        turnRate: enemy.boosting ? .4 : .34,
        pitchRate: .2,
        acceleration: 23,
        speed: desiredSpeed,
        maxSpeed: 345,
      });

      const toPlayer = leadPoint(enemy.mesh.position, playerPosition, this.playerVelocity, 720, 3)
        .sub(enemy.mesh.position)
        .normalize();
      const enemyNose = forward.clone().applyQuaternion(enemy.mesh.quaternion).normalize();
      const canEngage = enemy.phase === 'inbound' || enemy.phase === 'extend';
      const gunSolution = canEngage && range > 650 && range < 1900 && enemyNose.dot(toPlayer) > .91;

      if (enemy.burstShots > 0) {
        enemy.burstClock -= dt;
        if (enemy.burstClock <= 0) {
          if (gunSolution) {
            this.fireEnemy(enemy);
            enemy.burstShots--;
            enemy.burstClock = .105;
          } else {
            enemy.burstShots = 0;
          }
        }
      } else if (gunSolution && enemy.gunCooldown <= 0) {
        enemy.burstShots = 5 + Math.floor(Math.random() * 3);
        enemy.burstClock = 0;
        enemy.gunCooldown = 2 + Math.random() * 1.35;
      }

      if (
        enemy.missileClock <= 0 && enemy.missilesFired < 2 && enemy.phase === 'inbound' &&
        range > 3000 && range < 6400 && enemyNose.dot(toPlayer) > .93
      ) {
        this.launchEnemyMissile(enemy);
        enemy.missileClock = 14 + Math.random() * 5;
        enemy.missilesFired++;
      }
    }
  }

  updateAllies(dt, playerForward, playerRight) {
    for (const ally of this.allies) {
      if (ally.dead) continue;
      ally.targetRefresh -= dt;
      ally.fireCooldown -= dt;

      if (!ally.target || ally.target.dead || ally.targetRefresh <= 0) {
        ally.target = this.selectAllyTarget(ally);
        ally.targetRefresh = 2.5 + Math.random() * 1.4;
      }

      const target = ally.target;
      const targetRange = target ? target.mesh.position.distanceTo(ally.mesh.position) : Infinity;
      let waypoint;

      if (target && targetRange < 1100) ally.phase = 'extend';
      else if (!target || (ally.phase === 'extend' && targetRange > 2050)) ally.phase = target ? 'attack' : 'formation';

      if (target && targetRange < 10500) {
        if (ally.phase === 'extend') {
          const radial = ally.mesh.position.clone().sub(target.mesh.position);
          radial.y = 0;
          if (radial.lengthSq() < 1) radial.copy(playerRight).multiplyScalar(ally.wing);
          radial.normalize();
          waypoint = target.mesh.position.clone()
            .addScaledVector(target.velocity, .8)
            .addScaledVector(radial, 1600)
            .add(new THREE.Vector3(0, 70 + ally.wing * 30, 0));
        } else {
          waypoint = leadPoint(ally.mesh.position, target.mesh.position, target.velocity, ally.speed, 4)
            .add(new THREE.Vector3(0, 45 + ally.wing * 28, 0));
        }
      } else {
        ally.target = null;
        ally.phase = 'formation';
        const aft = playerForward.clone().negate();
        waypoint = this.player.position.clone()
          .addScaledVector(playerRight, ally.wing * 230)
          .addScaledVector(aft, 300)
          .add(new THREE.Vector3(0, 24 + ally.wing * 28, 0));
      }

      this.keepAircraftClear(ally, waypoint, playerRight, true, target);
      this.constrainWaypoint(waypoint, this.player.position.y + 35 + ally.wing * 25);
      const followSpeed = THREE.MathUtils.clamp(this.playerVelocity.length() + 24, 245, 425);
      const nose = steerAircraft(ally, waypoint, dt, {
        turnRate: target ? .39 : .43,
        pitchRate: .23,
        acceleration: 28,
        speed: followSpeed,
        maxSpeed: 445,
      });

      ally.mesh.userData.boosting = Boolean(this.player.userData.boosting) || (target && targetRange > 3600);
      if (ally.mesh.userData.afterburner) ally.mesh.userData.afterburner.visible = ally.mesh.userData.boosting;

      if (!target || ally.phase === 'extend') {
        if (ally.burstShots > 0) ally.burstShots = 0;
        continue;
      }

      const aim = leadPoint(ally.mesh.position, target.mesh.position, target.velocity, 680, 3)
        .sub(ally.mesh.position)
        .normalize();
      const aligned = nose.dot(aim) > .91;
      const gunSolution = targetRange > 650 && targetRange < 1950 && aligned;

      if (ally.burstShots > 0) {
        ally.burstClock -= dt;
        if (ally.burstClock <= 0) {
          if (gunSolution) {
            this.fireAlly(ally, target);
            ally.burstShots--;
            ally.burstClock = .09;
          } else {
            ally.burstShots = 0;
          }
        }
      } else if (gunSolution && ally.fireCooldown <= 0) {
        ally.burstShots = 5 + Math.floor(Math.random() * 3);
        ally.burstClock = 0;
        ally.fireCooldown = 1.45 + Math.random() * 1.25;
      }
    }
  }

  selectAllyTarget(ally) {
    let selected = null;
    let bestScore = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.phase === 'staging' || enemy.mesh.position.distanceTo(this.player.position) > 9400) continue;
      const range = enemy.mesh.position.distanceTo(ally.mesh.position);
      if (range > 10200) continue;
      const otherAttackers = this.allies.filter(other => other !== ally && other.target === enemy).length;
      const score = range + otherAttackers * 2300;
      if (score < bestScore) {
        bestScore = score;
        selected = enemy;
      }
    }
    return selected;
  }

  keepAircraftClear(unit, waypoint, playerRight, friendly, target = null) {
    const awayFromPlayer = unit.mesh.position.clone().sub(this.player.position);
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
        const separation = unit.mesh.position.clone().sub(other.mesh.position);
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
        const separation = unit.mesh.position.clone().sub(enemy.mesh.position);
        const distance = separation.length();
        if (distance < 430) waypoint.addScaledVector(separation.normalize(), (430 - distance) * 1.5);
      }
    }
  }

  getTheaterLimit(margin = 500) {
    if (!this.terrain?.worldSize) return Infinity;
    return Math.max(1200, this.terrain.worldSize * .5 - margin);
  }

  clampToTheater(position, margin = 500) {
    const limit = this.getTheaterLimit(margin);
    position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
    position.z = THREE.MathUtils.clamp(position.z, -limit, limit);
  }

  constrainWaypoint(waypoint, preferredAltitude) {
    const ground = this.terrain?.sampleHeight(waypoint.x, waypoint.z) ?? -Infinity;
    waypoint.y = Math.max(preferredAltitude, ground + 360);
    this.clampToTheater(waypoint, 500);
  }

  fireAlly(ally, target) {
    this.audio?.playDistantGun(ally.mesh.position.distanceTo(this.player.position), 'air');
    const start = ally.mesh.position.clone();
    const predicted = leadPoint(start, target.mesh.position, target.velocity, 680, 3);
    const aim = predicted.sub(start).normalize();
    aim.add(new THREE.Vector3((Math.random() - .5) * .012, (Math.random() - .5) * .009, (Math.random() - .5) * .012)).normalize();
    this.fx?.addTracer(start, start.clone().addScaledVector(aim, 30), '#82e7ff');
    const shot = new THREE.Mesh(allyShotGeo, allyShotMaterial);
    shot.position.copy(start);
    this.scene.add(shot);
    this.addPlayerProjectile({ mesh: shot, velocity: aim.multiplyScalar(680), life: 4, damage: .42, ally: true });
  }

  fireEnemy(enemy) {
    this.audio?.playDistantGun(enemy.mesh.position.distanceTo(this.player.position), 'air');
    const start = enemy.mesh.position.clone();
    const predicted = leadPoint(start, this.player.position, this.playerVelocity, 720, 3);
    const aim = predicted.sub(start).normalize();
    aim.add(new THREE.Vector3((Math.random() - .5) * .018, (Math.random() - .5) * .012, (Math.random() - .5) * .018)).normalize();
    this.fx?.addTracer(start, start.clone().addScaledVector(aim, 32), '#ff735a');
    const shot = new THREE.Mesh(hostileShotGeo, hostileShotMaterial);
    shot.position.copy(start);
    this.scene.add(shot);
    this.addHostileProjectile({ projectile: true, mesh: shot, velocity: aim.multiplyScalar(720), life: 4 });
  }

  launchEnemyMissile(enemy) {
    const direction = forward.clone().applyQuaternion(enemy.mesh.quaternion).normalize();
    const start = enemy.mesh.position.clone().addScaledVector(direction, 5);
    const missileProfile = MISSILE_PROFILES.hostile;
    const predicted = leadPoint(start, this.player.position, this.playerVelocity, missileProfile.speed, 2.5);
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
      velocity: aim.multiplyScalar(missileProfile.speed),
      burnRemaining: missileProfile.burnTime,
      coastDrag: missileProfile.coastDrag,
      motorBurning: true,
      guidanceActive: true,
      life: missileProfile.life,
      warningClock: 0,
      decoyTarget: null,
    });
    this.audio?.playMissileLaunch();
    this.audio?.startMissileFlight(mesh.id);
  }

  dispose() {
    for (const unit of [...this.enemies, ...this.allies]) this.scene.remove(unit.mesh);
    this.enemies.length = 0;
    this.allies.length = 0;
  }
}
