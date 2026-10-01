import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CollisionSystem } from '../../src/combat/collision-system.js';
import { createCoverageField, isInCoverage } from '../../src/environment/terrain/coverage.js';

function makeCollisionSystem({
  position = new THREE.Vector3(0, 100, 0),
  previousPosition = position.clone(),
  worldSize = 2000,
  terrainHeight = -1000,
  operationBounds,
  isPlayableArea,
  coverageCellMeters,
  colliders = [],
  enemies = [],
  allies = [],
  redUnits = [],
} = {}) {
  const player = { position };
  const onPlayerDestroyed = vi.fn();
  const onPlayerBoundaryAbort = vi.fn();
  const system = new CollisionSystem({
    player,
    terrain: { worldSize, operationBounds, isPlayableArea, coverageCellMeters, sampleHeight: () => terrainHeight },
    colliders,
    enemies,
    allies,
    redUnits,
    lastCollisionPosition: previousPosition.clone(),
    onPlayerDestroyed,
    onPlayerBoundaryAbort,
  });
  return { system, player, onPlayerDestroyed, onPlayerBoundaryAbort };
}

describe('CollisionSystem', () => {
  it('detects terrain contact across a swept player movement segment', () => {
    const { system, onPlayerDestroyed } = makeCollisionSystem({
      position: new THREE.Vector3(0, 1, 0),
      terrainHeight: 0,
    });

    expect(system.checkPlayerCollision(.1)).toBe(true);
    expect(onPlayerDestroyed).toHaveBeenCalledWith('combat.collisionTerrain');
  });

  it('detects aircraft collisions between sampled frame positions', () => {
    const enemy = { mesh: new THREE.Object3D(), velocity: new THREE.Vector3(), dead: false };
    enemy.mesh.position.set(0, 100, 0);
    const { system, onPlayerDestroyed } = makeCollisionSystem({
      position: new THREE.Vector3(30, 100, 0),
      previousPosition: new THREE.Vector3(-30, 100, 0),
      enemies: [enemy],
    });

    expect(system.checkPlayerCollision(1)).toBe(true);
    expect(onPlayerDestroyed).toHaveBeenCalledWith('combat.collisionHostile');
  });

  it('aborts at the theater edge and clamps the aircraft inside', () => {
    const { system, player, onPlayerDestroyed, onPlayerBoundaryAbort } = makeCollisionSystem({
      position: new THREE.Vector3(1001, 100, 0),
      worldSize: 2000,
    });

    expect(system.checkPlayerCollision(.1)).toBe(true);
    expect(onPlayerBoundaryAbort).toHaveBeenCalledWith('combat.collisionBoundary');
    expect(onPlayerDestroyed).not.toHaveBeenCalled();
    expect(player.position.x).toBe(998);
  });

  it('aborts at the mapped imagery edge instead of allowing flight into fallback terrain', () => {
    const { system, player, onPlayerBoundaryAbort } = makeCollisionSystem({
      position: new THREE.Vector3(6001, 100, 0),
      worldSize: 20_000,
      operationBounds: { minX: -6000, maxX: 6000, minZ: -6000, maxZ: 6000 },
    });

    expect(system.checkPlayerCollision(.1)).toBe(true);
    expect(onPlayerBoundaryAbort).toHaveBeenCalledWith('combat.collisionBoundary');
    expect(player.position.x).toBe(5998);
  });

  it('aborts when crossing the exterior image edge inside the orthophoto square', () => {
    const { system, player, onPlayerBoundaryAbort, onPlayerDestroyed } = makeCollisionSystem({
      position: new THREE.Vector3(100, 100, 0),
      previousPosition: new THREE.Vector3(0, 100, 0),
      worldSize: 20_000,
      operationBounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
      coverageCellMeters: 16,
      isPlayableArea: x => x < 52,
    });

    expect(system.checkPlayerCollision(.04)).toBe(true);
    expect(player.position.x).toBeLessThan(52);
    expect(player.position.x).toBeGreaterThan(40);
    expect(onPlayerBoundaryAbort).toHaveBeenCalledWith('combat.collisionBoundary');
    expect(onPlayerDestroyed).not.toHaveBeenCalled();
  });

  it('does not abort for an enclosed NoData gap in the orthophoto', () => {
    const width = 7;
    const mask = new Uint8Array(width * width).fill(1);
    for (let row = 3; row < 5; row++) {
      for (let col = 3; col < 5; col++) mask[row * width + col] = 0;
    }
    const coverage = createCoverageField(mask, width, width, 70);
    const { system, onPlayerBoundaryAbort } = makeCollisionSystem({
      position: new THREE.Vector3(20, 100, 0),
      previousPosition: new THREE.Vector3(-20, 100, 0),
      worldSize: 70,
      operationBounds: { minX: -35, maxX: 35, minZ: -35, maxZ: 35 },
      coverageCellMeters: coverage.cellMeters,
      isPlayableArea: (x, z) => isInCoverage(coverage, x, z),
    });

    expect(system.checkPlayerCollision(.04)).toBe(false);
    expect(onPlayerBoundaryAbort).not.toHaveBeenCalled();
  });

  it('returns the earliest aircraft or vehicle impact on a projectile sweep', () => {
    const aircraftMesh = new THREE.Object3D();
    aircraftMesh.position.x = 2;
    aircraftMesh.userData.hitZones = [{ x: 0, y: 0, z: 0, rx: .5, ry: .5, rz: .5, damage: 1 }];
    const aircraft = { mesh: aircraftMesh, velocity: new THREE.Vector3(), dead: false };
    const vehicleMesh = new THREE.Object3D();
    vehicleMesh.position.x = -2;
    vehicleMesh.userData.hitBounds = { min: [-.5, -.5, -.5], max: [.5, .5, .5] };
    const vehicle = { mesh: vehicleMesh, velocity: new THREE.Vector3(), dead: false };
    const { system } = makeCollisionSystem({ enemies: [aircraft], redUnits: [vehicle] });

    const hit = system.findProjectileImpact(new THREE.Vector3(-5, 0, 0), new THREE.Vector3(5, 0, 0), 1);
    const vehicleOnlyHit = system.findProjectileImpact(
      new THREE.Vector3(-5, 0, 0), new THREE.Vector3(5, 0, 0), 1, { ally: true },
    );

    expect(hit?.target).toBe(vehicle);
    expect(vehicleOnlyHit?.target).toBe(aircraft);
    expect(system.sweptDistanceSquared(
      new THREE.Vector3(-5, 0, 0), new THREE.Vector3(5, 0, 0),
      new THREE.Vector3(0, 0, -5), new THREE.Vector3(0, 0, 5),
    )).toBe(0);
  });

  it('allows a locked missile proximity fuze to resolve a near pass', () => {
    const aircraftMesh = new THREE.Object3D();
    aircraftMesh.position.set(50, 10, 0);
    aircraftMesh.userData.hitZones = [{ x: 0, y: 0, z: 0, rx: .5, ry: .5, rz: .5, damage: 1 }];
    const aircraft = { mesh: aircraftMesh, velocity: new THREE.Vector3(), dead: false };
    const { system } = makeCollisionSystem({ enemies: [aircraft] });

    const nearPass = system.findMissileProximityImpact(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(100, 0, 0),
      .1,
      aircraft,
      12,
      .8,
    );
    const outsideFuse = system.findMissileProximityImpact(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(100, 0, 0),
      .1,
      aircraft,
      8,
      .8,
    );

    expect(nearPass?.target).toBe(aircraft);
    expect(nearPass?.hitInfo).toMatchObject({ damage: .8, proximity: true });
    expect(outsideFuse).toBeNull();
  });
});
