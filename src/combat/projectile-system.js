import * as THREE from 'three';
import { applyAirframeCondition } from './airframe-condition.js';
import { estimateInterceptTime } from './ballistics.js';
import { releaseMissile, updateMissileMotor } from './projectiles.js';

const forward = new THREE.Vector3(0, 0, 1);
const stationaryVelocity = new THREE.Vector3();
const localBulletAxis = new THREE.Vector3(0, 1, 0);
const MISSILE_TURN_RATE = 1.9;
const HOSTILE_MISSILE_TURN_RATE = 1.18;
const _up=new THREE.Vector3(0,1,0);
const _right=new THREE.Vector3(1,0,0);

function turnDirection(current, desired, maxAngle, direction, axis) {
  if (desired.lengthSq() < 1e-9) {
    return current.lengthSq() > 1e-9 ? direction.copy(current).normalize() : direction.copy(forward);
  }
  if(current.lengthSq()>1e-9)direction.copy(current).normalize();
  else direction.copy(desired).normalize();
  const angle = direction.angleTo(desired);
  if (angle <= maxAngle) return direction.copy(desired);

  axis.crossVectors(direction, desired);
  if (axis.lengthSq() < 1e-8) {
    axis.crossVectors(direction, _up);
    if (axis.lengthSq() < 1e-8) axis.crossVectors(direction, _right);
  }
  return direction.applyAxisAngle(axis.normalize(), maxAngle).normalize();
}

/** Owns projectile collections and per-frame movement, guidance and expiry. */
export class ProjectileSystem {
  constructor({
    scene, player, playerShots = [], hostiles = [], decoys = [], collision, audio,
    playerVelocity = stationaryVelocity, onPlayerDestroyed, onPlayerDamaged, onPlayerHit, onJetDestroyed,
    onUnitDestroyed, onFriendlyAircraftHit, addSpark, addWaterImpact, addExplosion, incomingDamageMultiplier = 1,
    hostileMissileTurnRate = HOSTILE_MISSILE_TURN_RATE, hostileMissileDamage = 62,
    hostileMissileProximityRadius = 20,
  }) {
    this.scene = scene;
    this.player = player;
    this.playerVelocity = playerVelocity;
    this.playerShots = playerShots;
    this.hostiles = hostiles;
    this.decoys = decoys;
    this.collision = collision;
    this.audio = audio;
    this.onPlayerDestroyed = onPlayerDestroyed;
    this.onPlayerDamaged = onPlayerDamaged;
    this.onPlayerHit = onPlayerHit;
    this.onJetDestroyed = onJetDestroyed;
    this.onFriendlyAircraftHit = onFriendlyAircraftHit;
    this.onUnitDestroyed = onUnitDestroyed;
    this.incomingDamageMultiplier = incomingDamageMultiplier;
    this.hostileMissileTurnRate = hostileMissileTurnRate;
    this.hostileMissileDamage = hostileMissileDamage;
    this.hostileMissileProximityRadius = hostileMissileProximityRadius;
    this.addSpark = addSpark;
    this.addWaterImpact = addWaterImpact;
    this.addExplosion = addExplosion;
    this.incomingMissile = false;
    this.missileThreat = null;
    this.missileThreatDistance = Infinity;
    this.missileThreatEta = Infinity;
    this.missileThreatGrace = 0;
    this._previousPosition=new THREE.Vector3();
    this._aimPoint=new THREE.Vector3();
    this._targetOffset=new THREE.Vector3();
    this._targetStart=new THREE.Vector3();
    this._steeringDirection=new THREE.Vector3();
    this._steeringAxis=new THREE.Vector3();
    this._tracerDirection=new THREE.Vector3();
    this._impactPosition=new THREE.Vector3();
  }

  addPlayerProjectile(projectile) {
    this.playerShots.push(projectile);
  }

  addHostileProjectile(projectile) {
    this.hostiles.push(projectile);
  }

  setDecoys(decoys) {
    this.decoys = decoys;
  }

  stopMissileAudio() {
    for (const shot of this.playerShots) {
      if (shot.homing) this.audio?.stopMissileFlight(shot.mesh.id);
    }
    for (const shot of this.hostiles) {
      if (shot.missile) this.audio?.stopMissileFlight(shot.mesh.id);
    }
  }

  dispose() {
    this.stopMissileAudio();
    for(const shot of this.playerShots)this.recycleProjectile(shot);
    for(const shot of this.hostiles)this.recycleProjectile(shot);
    this.playerShots.length = 0;
    this.hostiles.length = 0;
  }

  recycleProjectile(shot){
    if(shot.mesh&&!releaseMissile(shot.mesh))this.scene.remove(shot.mesh);
    if(shot.pool){
      shot.mesh?.position.set(0,0,0);
      shot.mesh?.quaternion.identity();
      shot.velocity?.set(0,0,0);
      shot.target=null;
      shot.decoyTarget=null;
      shot.life=0;
      shot.pool.push(shot);
    }
  }

  update(dt) {
    const { player, audio, playerShots, hostiles, decoys } = this;
    this.collision.prepareProjectileTargetMatrices?.();
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
          aimPoint = this._aimPoint.copy(shot.decoyTarget.position).addScaledVector(shot.decoyTarget.velocity, .15);
        } else {
          const targetVelocity = shot.target.velocity ?? stationaryVelocity;
          const targetOffset = this._targetOffset.subVectors(shot.target.mesh.position,shot.mesh.position);
          const leadTime = estimateInterceptTime(targetOffset, targetVelocity, missileSpeed);
          aimPoint = this._aimPoint.copy(shot.target.mesh.position).addScaledVector(targetVelocity, leadTime);
        }
        const desiredDirection = aimPoint.sub(shot.mesh.position).normalize();
        const turnRate = shot.targetDomain === 'ground' ? 1.5 : MISSILE_TURN_RATE;
        const direction = turnDirection(shot.velocity, desiredDirection, turnRate * dt,this._steeringDirection,this._steeringAxis);
        shot.velocity.copy(direction).multiplyScalar(missileSpeed);
        shot.mesh.quaternion.setFromUnitVectors(forward, direction);
        if (Math.random() < .04) this.addSpark(shot.mesh.position);
      }
      if (shot.homing) audio?.updateMissileFlight(shot.mesh.id, shot.mesh.position.distanceTo(player.position), dt);
      const previous = this._previousPosition.copy(shot.mesh.position);
      if (shot.ballistic) shot.velocity.y -= shot.gravity * dt;
      shot.mesh.position.addScaledVector(shot.velocity, dt);
      if (shot.tracer) shot.mesh.quaternion.setFromUnitVectors(localBulletAxis, this._tracerDirection.copy(shot.velocity).normalize());
      if (shot.decoyTarget && this.collision.sweptDistanceSquared(previous, shot.mesh.position, shot.decoyTarget.previousPosition, shot.decoyTarget.position) < 12 ** 2) {
        this.addSpark(shot.mesh.position);
        shot.life = 0;
      }
      let impact = shot.life > 0
        ? this.collision.findProjectileImpact(previous, shot.mesh.position, dt, {
            ally: shot.ally, ballistic: shot.ballistic, canHitGround: shot.canHitGround,
          })
        : null;
      if (!impact && shot.life > 0 && shot.homing && shot.target && !shot.decoyTarget) {
        impact = this.collision.findMissileProximityImpact(
          previous,
          shot.mesh.position,
          dt,
          shot.target,
          shot.proximityRadius ?? (shot.targetDomain === 'ground' ? 17 : 24),
          shot.proximityDamage ?? .8,
        );
      }
      if (impact) {
        const { target, hitInfo } = impact;
        const damage = shot.damage * (hitInfo.damage ?? 1);
        target.hp -= damage;
        if (target.mesh?.userData.airframeHealthRatio !== undefined) {
          applyAirframeCondition(target.mesh, target.hp, target.maxHp);
        }
        const impactPosition = this._impactPosition.copy(previous).lerp(shot.mesh.position, hitInfo.t);
        if (!shot.ally && shot.ballistic) {
          this.onPlayerHit?.(target, {
            damage,
            destroyed: target.hp <= 0,
            domain: target.mesh.userData.faction === 'red' ? 'ground' : 'air',
            position: impactPosition,
          });
        }
        if (target.hp <= 0) {
          if (target.mesh.userData.faction === 'red') this.onUnitDestroyed(target, !shot.ally, { sourceUnit: shot.sourceUnit, shot });
          else this.onJetDestroyed(target, !shot.ally, { sourceUnit: shot.sourceUnit, shot });
        } else {
          this.addSpark(impactPosition);
        }
        shot.life = 0;
      }
      if (shot.life > 0 && shot.ballistic) {
        const groundHeight = this.collision.groundHeight(shot.mesh.position.x, shot.mesh.position.z);
        if (shot.mesh.position.y <= groundHeight) {
          shot.mesh.position.y = groundHeight;
          if (shot.tracer) {
            const waterImpact = this.collision.isWater?.(shot.mesh.position.x, shot.mesh.position.z);
            if (waterImpact) this.addWaterImpact?.(shot.mesh.position);
            else this.addSpark(shot.mesh.position);
          }
          shot.life = 0;
        }
      }
      if (shot.life <= 0) {
        if (shot.homing) audio?.stopMissileFlight(shot.mesh.id);
        this.recycleProjectile(shot);
        playerShots.splice(i, 1);
      }
    }

    this.incomingMissile = false;
    const previousThreat = this.missileThreat;
    let previousThreatEta = this.missileThreatEta;
    let previousThreatDistance = Infinity;
    let previousThreatStillViable = false;
    this.missileThreatGrace = Math.max(0, this.missileThreatGrace - dt);
    this.missileThreat = null;
    this.missileThreatDistance = Infinity;
    this.missileThreatEta = Infinity;
    for (let i = hostiles.length - 1; i >= 0; i--) {
      const shot = hostiles[i];
      if (!shot.projectile) continue;
      shot.life -= dt;
      const previous = this._previousPosition.copy(shot.mesh.position);
      if (shot.missile) {
        updateMissileMotor(shot, dt);
        const distanceToPlayer = shot.mesh.position.distanceTo(player.position);
        const decoyingAway = Boolean(shot.decoyTarget?.active && shot.decoyTarget.position.distanceToSquared(player.position) > distanceToPlayer ** 2);
        if (!decoyingAway && distanceToPlayer < 9000) {
          const separation = this._targetOffset.subVectors(player.position, shot.mesh.position);
          const distance = Math.max(1, separation.length());
          const relativeVelocity = this._steeringDirection.subVectors(this.playerVelocity, shot.velocity);
          const closingSpeed = -separation.dot(relativeVelocity) / distance;
          const relativeSpeedSquared = relativeVelocity.lengthSq();
          const eta = closingSpeed > 1 ? distance / closingSpeed : Infinity;
          const closestApproachTime = relativeSpeedSquared > 1
            ? THREE.MathUtils.clamp(-separation.dot(relativeVelocity) / relativeSpeedSquared, 0, 20)
            : 0;
          const missDistance = separation.addScaledVector(relativeVelocity, closestApproachTime).length();
          if (closingSpeed > 8 && eta < 28 && missDistance < 620 && eta < this.missileThreatEta) {
            this.missileThreat = shot;
            this.missileThreatDistance = distanceToPlayer;
            this.missileThreatEta = eta;
          }
          if (shot === previousThreat && closingSpeed > 8 && eta < 28 && missDistance < 620) {
            previousThreatStillViable = true;
            previousThreatEta = eta;
            previousThreatDistance = distanceToPlayer;
          }
        }
        if (this.missileThreat === shot && this.missileThreatEta < 10 && distanceToPlayer < 4300) {
          shot.warningClock -= dt;
          if (shot.warningClock <= 0) {
            audio?.playIncomingMissile(this.missileThreatEta);
            shot.warningClock = 1.05;
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
          const targetVelocity = shot.decoyTarget?.velocity ?? this.playerVelocity ?? stationaryVelocity;
          const missileSpeed = Math.max(1, shot.velocity.length());
          const targetOffset = this._targetOffset.subVectors(aimTarget, shot.mesh.position);
          const leadTime = estimateInterceptTime(targetOffset, targetVelocity, missileSpeed, shot.interceptLeadTime ?? 14);
          const aimPoint = this._aimPoint.copy(aimTarget).addScaledVector(targetVelocity, leadTime);
          const wanted = this._targetOffset.subVectors(aimPoint, shot.mesh.position).normalize();
          const turnRate = shot.turnRate ?? this.hostileMissileTurnRate;
          const energyFactor = shot.motorBurning ? 1 : (shot.coastTurnScale ?? .72);
          const direction = turnDirection(shot.velocity, wanted, turnRate * energyFactor * dt, this._steeringDirection, this._steeringAxis);
          shot.velocity.copy(direction).multiplyScalar(missileSpeed);
          if (shot.velocity.lengthSq() > 1) shot.mesh.quaternion.setFromUnitVectors(forward,this._tracerDirection.copy(shot.velocity).normalize());
        }
        audio?.updateMissileFlight(shot.mesh.id, distanceToPlayer, dt);
        shot.mesh.position.addScaledVector(shot.velocity, dt);
        if (shot.decoyTarget && this.collision.sweptDistanceSquared(previous, shot.mesh.position, shot.decoyTarget.previousPosition, shot.decoyTarget.position) < 12 ** 2) {
          this.addSpark(shot.mesh.position);
          shot.life = 0;
        } else if (!shot.decoyTarget && this.collision.sweptDistanceSquared(
          previous,
          shot.mesh.position,
          this.collision.lastCollisionPosition,
          player.position,
        ) < (shot.proximityRadius ?? this.hostileMissileProximityRadius) ** 2) {
          this.damagePlayer(shot.damage ?? this.hostileMissileDamage, 'combat.hostileMissile');
          this.addExplosion(shot.mesh.position, .48);
          shot.life = 0;
        }
      } else if (shot.groundAA) {
        shot.mesh.position.addScaledVector(shot.velocity, dt);
        const target = shot.target;
        if (target && !target.dead && this.collision.sweptDistanceSquared(
          previous,
          shot.mesh.position,
          this._targetStart.copy(target.mesh.position).addScaledVector(target.velocity ?? stationaryVelocity, -dt),
          target.mesh.position,
        ) < 24 ** 2) {
          target.hp -= shot.damage ?? .1;
          if (target.mesh?.userData.airframeHealthRatio !== undefined) {
            applyAirframeCondition(target.mesh, target.hp, target.maxHp);
          }
          if (target.hp <= 0) {
            this.onJetDestroyed?.(target, false);
            this.addExplosion(shot.mesh.position, .82);
          } else {
            this.addSpark(shot.mesh.position);
          }
          shot.life = 0;
        }
      } else if (shot.flak) {
        shot.mesh.position.addScaledVector(shot.velocity, dt);
        const distanceSquared = this.collision.sweptDistanceSquared(previous, shot.mesh.position, this.collision.lastCollisionPosition, player.position);
        if (distanceSquared < 9 ** 2) {
          this.damagePlayer(shot.directDamage ?? 22, 'combat.hostileFire');
          this.addExplosion(shot.mesh.position, .38);
          shot.life = 0;
        } else if (!shot.burst && distanceSquared < (shot.nearMissRadius ?? 42) ** 2) {
          const nearMissRadius = shot.nearMissRadius ?? 42;
          const nearMissDamage = Math.max(shot.nearMissDamageMin ?? 2, (shot.nearMissDamage ?? 12) * (1 - Math.sqrt(distanceSquared) / nearMissRadius));
          this.damagePlayer(nearMissDamage, 'combat.hostileFire');
          this.addExplosion(shot.mesh.position, .28);
          shot.burst = true;
          shot.life = 0;
        }
      } else {
        shot.mesh.position.addScaledVector(shot.velocity, dt);
        if (shot.aircraftGun) {
          const impact = this.collision.findFriendlyAircraftImpact?.(previous, shot.mesh.position, dt);
          if (impact) {
            this.onFriendlyAircraftHit?.(impact.target, shot.damage ?? 0.85, shot.sourceUnit);
            this.addSpark(shot.mesh.position);
            shot.life = 0;
          }
        }
        if (shot.ground && shot.target && !shot.target.dead && this.collision.sweptDistanceSquared(
          previous,
          shot.mesh.position,
          this._targetStart.copy(shot.target.mesh.position).addScaledVector(shot.target.velocity ?? stationaryVelocity, -dt),
          shot.target.mesh.position,
        ) < 12 ** 2) {
          if (shot.aircraftStrafe) {
            shot.target.hp -= shot.damage ?? .18;
            if (shot.target.hp <= 0) {
              this.onUnitDestroyed(shot.target, false, { sourceUnit: shot.sourceUnit, shot });
              this.addExplosion(shot.mesh.position, .72);
            } else this.addSpark(shot.mesh.position);
          } else {
            shot.target.hp--;
            if (shot.target.hp <= 0) this.onUnitDestroyed(shot.target, false);
            this.addExplosion(shot.mesh.position, .72);
          }
          shot.life = 0;
        }
        if (shot.life > 0 && !shot.ground && this.collision.sweptDistanceSquared(previous, shot.mesh.position, this.collision.lastCollisionPosition, player.position) < 9 ** 2) {
          this.damagePlayer(8, 'combat.hostileFire');
          shot.life = 0;
        }
      }
      if (shot.life <= 0) {
        if (shot.missile) audio?.stopMissileFlight(shot.mesh.id);
        this.recycleProjectile(shot);
        hostiles.splice(i, 1);
      }
    }
    if (previousThreatStillViable && this.missileThreat && this.missileThreat !== previousThreat
      && this.missileThreatEta > previousThreatEta - 1.4) {
      // Do not make the HUD marker jump between nearly simultaneous missiles.
      this.missileThreat = previousThreat;
      this.missileThreatDistance = previousThreatDistance;
      this.missileThreatEta = previousThreatEta;
    }
    if (this.missileThreat) {
      this.missileThreatGrace = 1.15;
    } else if (
      previousThreat
      && hostiles.includes(previousThreat)
      && previousThreat.life > 0
      && this.missileThreatGrace > 0
      && !(previousThreat.decoyTarget?.active
        && previousThreat.decoyTarget.position.distanceToSquared(player.position)
          > previousThreat.mesh.position.distanceToSquared(player.position))
    ) {
      // Keep the cue steady across brief frame-to-frame changes in the
      // projected intercept. Drop it immediately when a flare pulls the
      // missile safely away or the missile is removed.
      this.missileThreat = previousThreat;
      this.missileThreatDistance = previousThreat.mesh.position.distanceTo(player.position);
      this.missileThreatEta = Math.max(0, previousThreatEta - dt);
    } else {
      this.missileThreatGrace = 0;
    }
    if (this.missileThreat && (!hostiles.includes(this.missileThreat) || this.missileThreat.life <= 0)) {
      this.missileThreat = null;
      this.missileThreatDistance = Infinity;
      this.missileThreatEta = Infinity;
      this.missileThreatGrace = 0;
    }
    this.incomingMissile = Boolean(this.missileThreat && this.missileThreatEta <= 8.5);
  }

  damagePlayer(amount, reason) {
    if (this.onPlayerDamaged) this.onPlayerDamaged(amount * this.incomingDamageMultiplier, reason);
    else this.onPlayerDestroyed?.(reason);
  }
}
