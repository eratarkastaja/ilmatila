import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ProjectileSystem } from './projectile-system.js';

function makeSystem(overrides = {}) {
  const scene = new THREE.Scene();
  const player = { position: new THREE.Vector3() };
  const playerShots = [];
  const hostiles = [];
  const hooks = {
    onPlayerDestroyed: vi.fn(),
    onJetDestroyed: vi.fn(),
    onUnitDestroyed: vi.fn(),
    addSpark: vi.fn(),
    addExplosion: vi.fn(),
  };
  const audio = {
    stopMissileFlight: vi.fn(),
    updateMissileFlight: vi.fn(),
    playIncomingMissile: vi.fn(),
  };
  const system = new ProjectileSystem({
    scene,
    player,
    terrain: { sampleHeight: () => -1000 },
    playerShots,
    hostiles,
    enemies: [],
    redUnits: [],
    decoys: [],
    audio,
    lastCollisionPosition: player.position.clone(),
    ...hooks,
    ...overrides,
  });
  return { system, scene, player, playerShots, hostiles, hooks, audio };
}

describe('ProjectileSystem', () => {
  it('moves player projectiles, resolves aircraft hits and removes spent rounds', () => {
    const { system, scene, playerShots, hooks } = makeSystem();
    const aircraftMesh = new THREE.Object3D();
    aircraftMesh.userData.hitZones = [{ x: 0, y: 0, z: 0, rx: 1, ry: 1, rz: 1, damage: 1 }];
    scene.add(aircraftMesh);
    const enemy = { mesh: aircraftMesh, velocity: new THREE.Vector3(), dead: false, hp: 1 };
    system.enemies.push(enemy);
    const round = {
      mesh: new THREE.Object3D(),
      velocity: new THREE.Vector3(10, 0, 0),
      life: 2,
      damage: 2,
    };
    round.mesh.position.set(-5, 0, 0);
    scene.add(round.mesh);
    system.addPlayerProjectile(round);

    system.update(1);

    expect(hooks.onJetDestroyed).toHaveBeenCalledWith(enemy, true);
    expect(playerShots).toHaveLength(0);
    expect(scene.children).not.toContain(round.mesh);
  });

  it('expires hostile projectiles and removes their scene objects', () => {
    const { system, scene, hostiles } = makeSystem();
    const projectile = {
      projectile: true,
      mesh: new THREE.Object3D(),
      velocity: new THREE.Vector3(2, 0, 0),
      life: .01,
    };
    scene.add(projectile.mesh);
    system.addHostileProjectile(projectile);

    system.update(.02);

    expect(hostiles).toHaveLength(0);
    expect(scene.children).not.toContain(projectile.mesh);
  });

  it('marks an approaching hostile missile as a threat and reports swept player impact', () => {
    const { system, player, scene, hostiles, hooks } = makeSystem();
    const missile = {
      projectile: true,
      missile: true,
      guidanceActive: false,
      motorBurning: false,
      coastDrag: 0,
      mesh: new THREE.Object3D(),
      velocity: new THREE.Vector3(10, 0, 0),
      life: 2,
      warningClock: 1,
    };
    missile.mesh.position.set(-5, 0, 0);
    scene.add(missile.mesh);
    system.addHostileProjectile(missile);

    system.update(1);

    expect(system.incomingMissile).toBe(true);
    expect(hooks.onPlayerDestroyed).toHaveBeenCalledWith('combat.hostileMissile');
    expect(hooks.addExplosion).toHaveBeenCalledOnce();
    expect(hostiles).toHaveLength(0);
    expect(player.position).toEqual(new THREE.Vector3());
  });
});
