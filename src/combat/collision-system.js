import * as THREE from 'three';
import { pointSegmentDistanceSquared, traceFighterHit, traceVehicleHit } from './hit-testing.js';

const origin = new THREE.Vector3();
const stationaryVelocity = new THREE.Vector3();

function closestSegmentFractionXZ(start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-9) return 0;
  return THREE.MathUtils.clamp(-(start.x * dx + start.z * dz) / lengthSquared, 0, 1);
}

/** Centralizes swept collision queries for aircraft and all projectile types. */
export class CollisionSystem {
  constructor({ player, terrain, colliders, enemies, allies, redUnits, lastCollisionPosition, onPlayerDestroyed, onPlayerBoundaryAbort = onPlayerDestroyed }) {
    this.player = player;
    this.terrain = terrain;
    this.colliders = colliders;
    this.enemies = enemies;
    this.allies = allies;
    this.redUnits = redUnits;
    this.lastCollisionPosition = lastCollisionPosition;
    this.onPlayerDestroyed = onPlayerDestroyed;
    this.onPlayerBoundaryAbort = onPlayerBoundaryAbort;
    this.projectileTargetMatricesPrepared=false;
    this._start = new THREE.Vector3();
    this._travel = new THREE.Vector3();
    this._relativeStart = new THREE.Vector3();
    this._relativeEnd = new THREE.Vector3();
    this._center = new THREE.Vector3();
  }

  checkPlayerCollision(dt = 0) {
    const position = this.player.position;
    const start = this._start.copy(this.lastCollisionPosition);
    const travel = this._travel.subVectors(position,start);
    const halfSize = this.terrain.worldSize / 2;
    const bounds = this.terrain.operationBounds;
    const minX = bounds?.minX ?? -halfSize;
    const maxX = bounds?.maxX ?? halfSize;
    const minZ = bounds?.minZ ?? -halfSize;
    const maxZ = bounds?.maxZ ?? halfSize;
    if (position.x <= minX || position.x >= maxX
      || position.z <= minZ || position.z >= maxZ) {
      // End this sortie at the marked edge and keep the rendered aircraft on
      // the playable side, even when a fast frame crosses the boundary.
      position.x = THREE.MathUtils.clamp(position.x, minX + 2, maxX - 2);
      position.z = THREE.MathUtils.clamp(position.z, minZ + 2, maxZ - 2);
      this.lastCollisionPosition.copy(position);
      this.onPlayerBoundaryAbort('combat.collisionBoundary');
      return true;
    }
    if (this.terrain.isPlayableArea) {
      const cellMeters = this.terrain.coverageCellMeters ?? 16;
      const sampleStep = Math.min(8, cellMeters * 0.45);
      const samples = Math.max(1, Math.ceil(travel.length() / sampleStep));
      let lastPlayableFraction = 0;
      for (let step = 1; step <= samples; step++) {
        const fraction = step / samples;
        const x = THREE.MathUtils.lerp(start.x, position.x, fraction);
        const z = THREE.MathUtils.lerp(start.z, position.z, fraction);
        if (this.terrain.isPlayableArea(x, z)) {
          lastPlayableFraction = fraction;
          continue;
        }
        position.x = THREE.MathUtils.lerp(start.x, position.x, lastPlayableFraction);
        position.z = THREE.MathUtils.lerp(start.z, position.z, lastPlayableFraction);
        this.lastCollisionPosition.copy(position);
        this.onPlayerBoundaryAbort('combat.collisionBoundary');
        return true;
      }
    }
    const samples = Math.max(1, Math.ceil(travel.length() / 8));
    this.lastCollisionPosition.copy(position);
    for (let step = 0; step <= samples; step++) {
      const fraction = step / samples;
      const x = THREE.MathUtils.lerp(start.x, position.x, fraction);
      const y = THREE.MathUtils.lerp(start.y, position.y, fraction);
      const z = THREE.MathUtils.lerp(start.z, position.z, fraction);
      if (y - 3.5 <= this.terrain.sampleHeight(x, z)) {
        this.onPlayerDestroyed('combat.collisionTerrain');
        return true;
      }
    }

    for (const collider of this.colliders) {
      if (collider.mesh && !collider.mesh.parent) continue;
      const centerY = collider.y + collider.height * .5;
      const displacement = collider.velocity ?? stationaryVelocity;
      const center=this._center.set(collider.x,centerY,collider.z);
      const relativeStart = this._relativeStart.copy(start).addScaledVector(displacement, -dt).sub(center);
      const relativeEnd = this._relativeEnd.copy(position).sub(center);
      const fraction = closestSegmentFractionXZ(relativeStart, relativeEnd);
      const closestY = THREE.MathUtils.lerp(relativeStart.y, relativeEnd.y, fraction);
      const closestX = THREE.MathUtils.lerp(relativeStart.x, relativeEnd.x, fraction);
      const closestZ = THREE.MathUtils.lerp(relativeStart.z, relativeEnd.z, fraction);
      if (closestX * closestX + closestZ * closestZ <= (collider.radius + 7.5) ** 2
        && Math.abs(closestY) <= collider.height * .5 + 3.5) {
        this.onPlayerDestroyed(collider.collisionKey, { vehicle: collider.vehicle });
        return true;
      }
    }

    for (const aircraft of this.enemies) {
      if (this.sweptAircraftCollision(start, position, aircraft, dt)) {
        this.onPlayerDestroyed('combat.collisionHostile');
        return true;
      }
    }
    for (const aircraft of this.allies) {
      if (this.sweptAircraftCollision(start, position, aircraft, dt)) {
        this.onPlayerDestroyed('combat.collisionFriendly');
        return true;
      }
    }
    return false;
  }

  sweptAircraftCollision(start, end, aircraft, dt) {
    if (aircraft.dead) return false;
    const displacement = aircraft.velocity ?? stationaryVelocity;
    const relativeStart = this._relativeStart.copy(start).addScaledVector(displacement, -dt).sub(aircraft.mesh.position);
    const relativeEnd = this._relativeEnd.copy(end).sub(aircraft.mesh.position);
    return pointSegmentDistanceSquared(origin, relativeStart, relativeEnd) < 14 ** 2;
  }

  sweptDistanceSquared(movingStart, movingEnd, targetStart, targetEnd) {
    return pointSegmentDistanceSquared(
      origin,
      this._relativeStart.subVectors(movingStart,targetStart),
      this._relativeEnd.subVectors(movingEnd,targetEnd),
    );
  }

  prepareProjectileTargetMatrices(){
    for(const enemy of this.enemies)if(!enemy.dead)enemy.mesh.updateWorldMatrix(true,false);
    for(const ally of this.allies)if(!ally.dead)ally.mesh.updateWorldMatrix(true,false);
    for(const unit of this.redUnits)if(!unit.dead)unit.mesh.updateWorldMatrix(true,false);
    this.projectileTargetMatricesPrepared=true;
  }

  findFriendlyAircraftImpact(start, end, dt) {
    let target = null;
    let hitInfo = null;
    const matricesPrepared = this.projectileTargetMatricesPrepared;
    for (const ally of this.allies) {
      if (ally.dead) continue;
      const relativeStart = this._relativeStart.copy(start).addScaledVector(ally.velocity ?? stationaryVelocity, dt);
      if (pointSegmentDistanceSquared(ally.mesh.position, relativeStart, end) > 20 ** 2) continue;
      const impact = traceFighterHit(relativeStart, end, ally.mesh, matricesPrepared);
      if (impact && (!hitInfo || impact.t < hitInfo.t)) {
        target = ally;
        hitInfo = impact;
      }
    }
    return target ? { target, hitInfo } : null;
  }

  findProjectileImpact(start, end, dt, { ally = false, ballistic = false, canHitGround = false } = {}) {
    let target = null;
    let hitInfo = null;
    const matricesPrepared=this.projectileTargetMatricesPrepared;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      // Trace against the target's current pose, compensating for its motion during this step.
      const relativeStart = this._relativeStart.copy(start).addScaledVector(enemy.velocity ?? stationaryVelocity, dt);
      if(pointSegmentDistanceSquared(enemy.mesh.position,relativeStart,end)>20**2)continue;
      const impact = traceFighterHit(relativeStart, end, enemy.mesh,matricesPrepared);
      if (impact && (!hitInfo || impact.t < hitInfo.t)) {
        target = enemy;
        hitInfo = impact;
      }
    }
    if (!ally || canHitGround) for (const unit of this.redUnits) {
      if (unit.dead) continue;
      const relativeStart = this._relativeStart.copy(start).addScaledVector(unit.velocity ?? stationaryVelocity, dt);
      if(pointSegmentDistanceSquared(unit.mesh.position,relativeStart,end)>26**2)continue;
      const impact = traceVehicleHit(relativeStart, end, unit.mesh, ballistic ? 1.5 : undefined,matricesPrepared);
      if (impact && (!hitInfo || impact.t < hitInfo.t)) {
        target = unit;
        hitInfo = impact;
      }
    }
    return target ? { target, hitInfo } : null;
  }

  findMissileProximityImpact(start, end, dt, target, radius, damage = .8) {
    if (!target || target.dead || !target.mesh) return null;
    const targetVelocity = target.velocity ?? stationaryVelocity;
    const relativeStart = this._relativeStart.copy(start).addScaledVector(targetVelocity, dt).sub(target.mesh.position);
    const relativeEnd = this._relativeEnd.copy(end).sub(target.mesh.position);
    const travel = this._travel.subVectors(relativeEnd, relativeStart);
    const fraction = travel.lengthSq() > 1e-9
      ? THREE.MathUtils.clamp(-relativeStart.dot(travel) / travel.lengthSq(), 0, 1)
      : 0;
    const miss = this._center.copy(relativeStart).addScaledVector(travel, fraction);
    if (miss.lengthSq() > radius * radius) return null;
    return { target, hitInfo: { t: fraction, damage, proximity: true } };
  }

  groundHeight(x, z) {
    return this.terrain.sampleHeight(x, z);
  }

  isWater(x, z) {
    return this.terrain.isWater?.(x, z) ?? false;
  }
}
