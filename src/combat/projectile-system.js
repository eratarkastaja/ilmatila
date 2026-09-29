import * as THREE from 'three';
import { estimateInterceptTime } from './ballistics.js';
import { pointSegmentDistanceSquared, traceFighterHit, traceVehicleHit } from './hit-testing.js';
import { updateMissileMotor } from './projectiles.js';

const forward = new THREE.Vector3(0, 0, 1);
const stationaryVelocity = new THREE.Vector3();
const localBulletAxis = new THREE.Vector3(0, 1, 0);
const origin = new THREE.Vector3();
const MISSILE_TURN_RATE = 2.45;

function turnDirection(current, desired, maxAngle) {
  if (desired.lengthSq() < 1e-9) {
    return current.lengthSq() > 1e-9 ? current.clone().normalize() : forward.clone();
  }
  const direction = current.lengthSq() > 1e-9 ? current.clone().normalize() : desired.clone().normalize();
  const angle = direction.angleTo(desired);
  if (angle <= maxAngle) return direction.copy(desired);

  const axis = new THREE.Vector3().crossVectors(direction, desired);
  if (axis.lengthSq() < 1e-8) {
    axis.crossVectors(direction, new THREE.Vector3(0, 1, 0));
    if (axis.lengthSq() < 1e-8) axis.crossVectors(direction, new THREE.Vector3(1, 0, 0));
  }
  return direction.applyAxisAngle(axis.normalize(), maxAngle).normalize();
}

function sweptRelativeDistanceSquared(movingStart, movingEnd, targetStart, targetEnd) {
  return pointSegmentDistanceSquared(
    origin,
    movingStart.clone().sub(targetStart),
    movingEnd.clone().sub(targetEnd),
  );
}

/** Owns projectile collections and per-frame movement, guidance and expiry. */
export class ProjectileSystem {
  constructor({
    scene, player, terrain, playerShots = [], hostiles = [], enemies = [], redUnits = [],
    decoys = [], fx, audio, lastCollisionPosition, onPlayerDestroyed, onJetDestroyed,
    onUnitDestroyed, addSpark, addExplosion,
  }) {
    this.scene = scene;
    this.player = player;
    this.terrain = terrain;
    this.playerShots = playerShots;
    this.hostiles = hostiles;
    this.enemies = enemies;
    this.redUnits = redUnits;
    this.decoys = decoys;
    this.fx = fx;
    this.audio = audio;
    this.lastCollisionPosition = lastCollisionPosition;
    this.onPlayerDestroyed = onPlayerDestroyed;
    this.onJetDestroyed = onJetDestroyed;
    this.onUnitDestroyed = onUnitDestroyed;
    this.addSpark = addSpark;
    this.addExplosion = addExplosion;
    this.incomingMissile = false;
  }

  addPlayerProjectile(projectile) {
    this.playerShots.push(projectile);
  }

  addHostileProjectile(projectile) {
    this.hostiles.push(projectile);
  }

  update(dt) {
    const { player, scene, terrain, audio, playerShots, hostiles, enemies, redUnits, decoys } = this;
    for (let i = playerShots.length - 1; i >= 0; i--) {
      const shot = playerShots[i];
      shot.life -= dt;
      if (shot.homing) updateMissileMotor(shot, dt);
      if (shot.homing && (!shot.target || shot.target.dead)) shot.life = 0;
      if (shot.homing && shot.guidanceActive && shot.target && !shot.target.dead) {
        if (shot.decoyTarget && !shot.decoyTarget.active) shot.decoyTarget = null;
        if (!shot.decoyTarget && shot.seeker) {
          let nearest = 1250;
          let candidate = null;
          for (const decoy of decoys) {
            if (!decoy.active || decoy.team !== 'enemy' || decoy.source !== shot.target || decoy.type !== shot.seeker || shot.decoyAttempts.has(decoy)) continue;
            const distance = shot.mesh.position.distanceTo(decoy.position);
            if (distance < nearest) {
              nearest = distance;
              candidate = decoy;
            }
          }
          if (candidate) {
            shot.decoyAttempts.add(candidate);
            if (Math.random() < candidate.spoofChance) shot.decoyTarget = candidate;
          }
        }
        const missileSpeed = shot.speed ?? (shot.targetDomain === 'ground' ? 270 : 350);
        let aimPoint;
        if (shot.decoyTarget) {
          aimPoint = shot.decoyTarget.position.clone().addScaledVector(shot.decoyTarget.velocity, .15);
        } else {
          const targetVelocity = shot.target.velocity ?? stationaryVelocity;
          const targetOffset = shot.target.mesh.position.clone().sub(shot.mesh.position);
          const leadTime = estimateInterceptTime(targetOffset, targetVelocity, missileSpeed);
          aimPoint = shot.target.mesh.position.clone().addScaledVector(targetVelocity, leadTime);
        }
        const desiredDirection = aimPoint.sub(shot.mesh.position).normalize();
        const direction = turnDirection(shot.velocity, desiredDirection, MISSILE_TURN_RATE * dt);
        shot.velocity.copy(direction).multiplyScalar(missileSpeed);
        shot.mesh.quaternion.setFromUnitVectors(forward, direction);
        if (Math.random() < .04) this.addSpark(shot.mesh.position);
      }
      if (shot.homing) audio?.updateMissileFlight(shot.mesh.id, shot.mesh.position.distanceTo(player.position), dt);
      const previous = shot.mesh.position.clone();
      if (shot.ballistic) shot.velocity.y -= shot.gravity * dt;
      shot.mesh.position.addScaledVector(shot.velocity, dt);
      if (shot.tracer) shot.mesh.quaternion.setFromUnitVectors(localBulletAxis, shot.velocity.clone().normalize());
      if (shot.decoyTarget && sweptRelativeDistanceSquared(previous, shot.mesh.position, shot.decoyTarget.previousPosition, shot.decoyTarget.position) < 12 ** 2) {
        this.addSpark(shot.mesh.position);
        shot.life = 0;
      }
      let hit = null;
      let hitInfo = null;
      if (shot.life > 0) for (const enemy of enemies) {
        if (enemy.dead) continue;
        // Hit tracing uses the target's current pose, so compensate for its movement over this frame.
        const relativeStart = previous.clone().addScaledVector(enemy.velocity ?? stationaryVelocity, dt);
        const impact = traceFighterHit(relativeStart, shot.mesh.position, enemy.mesh);
        if (impact && (!hitInfo || impact.t < hitInfo.t)) {
          hit = enemy;
          hitInfo = impact;
        }
      }
      if (shot.life > 0 && !shot.ally) for (const unit of redUnits) {
        if (unit.dead) continue;
        const relativeStart = previous.clone().addScaledVector(unit.velocity ?? stationaryVelocity, dt);
        const impact = traceVehicleHit(relativeStart, shot.mesh.position, unit.mesh, shot.ballistic ? 1.5 : undefined);
        if (impact && (!hitInfo || impact.t < hitInfo.t)) {
          hit = unit;
          hitInfo = impact;
        }
      }
      if (hit) {
        hit.hp -= shot.damage * (hitInfo.damage ?? 1);
        if (hit.hp <= 0) {
          if (hit.mesh.userData.faction === 'red') this.onUnitDestroyed(hit);
          else this.onJetDestroyed(hit, !shot.ally);
        } else {
          this.addSpark(previous.clone().lerp(shot.mesh.position, hitInfo.t));
        }
        shot.life = 0;
      }
      if (shot.life > 0 && shot.ballistic) {
        const groundHeight = terrain.sampleHeight(shot.mesh.position.x, shot.mesh.position.z);
        if (shot.mesh.position.y <= groundHeight) {
          shot.mesh.position.y = groundHeight;
          if (shot.tracer) this.addSpark(shot.mesh.position);
          shot.life = 0;
        }
      }
      if (shot.life <= 0) {
        if (shot.homing) audio?.stopMissileFlight(shot.mesh.id);
        scene.remove(shot.mesh);
        playerShots.splice(i, 1);
      }
    }

    this.incomingMissile = false;
    for (let i = hostiles.length - 1; i >= 0; i--) {
      const shot = hostiles[i];
      if (!shot.projectile) continue;
      shot.life -= dt;
      const previous = shot.mesh.position.clone();
      if (shot.missile) {
        updateMissileMotor(shot, dt);
        const distanceToPlayer = shot.mesh.position.distanceTo(player.position);
        if (distanceToPlayer < 1900) {
          this.incomingMissile = true;
          shot.warningClock -= dt;
          if (shot.warningClock <= 0) {
            audio?.playIncomingMissile();
            shot.warningClock = 1.25;
          }
        }
        if (shot.guidanceActive) {
          if (shot.decoyTarget && !shot.decoyTarget.active) shot.decoyTarget = null;
          if (!shot.decoyTarget) {
            let nearest = 1250;
            for (const decoy of decoys) {
              if (!decoy.active || decoy.team !== 'player' || decoy.type !== shot.seeker) continue;
              const distance = shot.mesh.position.distanceTo(decoy.position);
              if (distance < nearest) {
                nearest = distance;
                shot.decoyTarget = decoy;
              }
            }
          }
          const aimTarget = shot.decoyTarget ? shot.decoyTarget.position : player.position;
          const missileSpeed = shot.velocity.length();
          const wanted = aimTarget.clone().sub(shot.mesh.position).normalize().multiplyScalar(missileSpeed);
          shot.velocity.lerp(wanted, 1 - Math.exp(3.1 * dt));
          if (shot.velocity.lengthSq() > 1) shot.mesh.quaternion.setFromUnitVectors(forward, shot.velocity.clone().normalize());
        }
        audio?.updateMissileFlight(shot.mesh.id, distanceToPlayer, dt);
        shot.mesh.position.addScaledVector(shot.velocity, dt);
        if (shot.decoyTarget && sweptRelativeDistanceSquared(previous, shot.mesh.position, shot.decoyTarget.previousPosition, shot.decoyTarget.position) < 12 ** 2) {
          this.addSpark(shot.mesh.position);
          shot.life = 0;
        } else if (!shot.decoyTarget && sweptRelativeDistanceSquared(previous, shot.mesh.position, this.lastCollisionPosition, player.position) < 13 ** 2) {
          this.onPlayerDestroyed('combat.hostileMissile');
          this.addExplosion(shot.mesh.position, .48);
          shot.life = 0;
        }
      } else if (shot.flak) {
        shot.mesh.position.addScaledVector(shot.velocity, dt);
        const distanceSquared = sweptRelativeDistanceSquared(previous, shot.mesh.position, this.lastCollisionPosition, player.position);
        if (distanceSquared < 9 ** 2) {
          this.onPlayerDestroyed('combat.hostileFire');
          this.addExplosion(shot.mesh.position, .34);
          shot.life = 0;
        } else if (!shot.burst && distanceSquared < 42 ** 2) {
          this.addExplosion(shot.mesh.position, .24);
          shot.burst = true;
          shot.life = 0;
        }
      } else {
        shot.mesh.position.addScaledVector(shot.velocity, dt);
        if (shot.ground && shot.target && !shot.target.dead && sweptRelativeDistanceSquared(
          previous,
          shot.mesh.position,
          shot.target.mesh.position.clone().addScaledVector(shot.target.velocity ?? stationaryVelocity, -dt),
          shot.target.mesh.position,
        ) < 12 ** 2) {
          shot.target.hp--;
          if (shot.target.hp <= 0) this.onUnitDestroyed(shot.target);
          this.addExplosion(shot.mesh.position, .72);
          shot.life = 0;
        }
        if (!shot.ground && sweptRelativeDistanceSquared(previous, shot.mesh.position, this.lastCollisionPosition, player.position) < 9 ** 2) {
          this.onPlayerDestroyed('combat.hostileFire');
          shot.life = 0;
        }
      }
      if (shot.life <= 0) {
        if (shot.missile) audio?.stopMissileFlight(shot.mesh.id);
        scene.remove(shot.mesh);
        hostiles.splice(i, 1);
      }
    }
  }
}
