import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CollisionSystem } from './collision-system.js';

function makeCollisionSystem({
  position = new THREE.Vector3(0, 100, 0),
  previousPosition = position.clone(),
  worldSize = 2000,
  terrainHeight = -1000,
  colliders = [],
  enemies = [],
  allies = [],
  redUnits = [],
} = {}) {
  const player = { position };
  const onPlayerDestroyed = vi.fn();
  const system = new CollisionSystem({
    player,
    terrain: { worldSize, sampleHeight: () => terrainHeight },
    colliders,
    enemies,
    allies,
    redUnits,
    lastCollisionPosition: previousPosition.clone(),
    onPlayerDestroyed,
  });
  return { system, player, onPlayerDestroyed };
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

  it('detects theater-edge contact and reports the boundary failure', () => {
    const { system, onPlayerDestroyed } = makeCollisionSystem({
      position: new THREE.Vector3(991, 100, 0),
      worldSize: 2000,
    });

    expect(system.checkPlayerCollision(.1)).toBe(true);
    expect(onPlayerDestroyed).toHaveBeenCalledWith('combat.collisionBoundary');
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
