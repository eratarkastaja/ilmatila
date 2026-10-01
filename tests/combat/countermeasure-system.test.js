import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CountermeasureSystem } from '../../src/combat/countermeasure-system.js';

function makeCountermeasures() {
  const scene = new THREE.Scene();
  const player = { position: new THREE.Vector3(0, 100, 0), quaternion: new THREE.Quaternion() };
  const decoys = [];
  const playerShots = [];
  const hostileShots = [];
  const fx = { emitParticle: vi.fn() };
  const audio = {
    playWeaponNoLock: vi.fn(),
    playCountermeasure: vi.fn(),
  };
  const addTransientGlow = (parent, color, size, opacity) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color, opacity, transparent: true }));
    glow.scale.setScalar(size);
    glow.userData.transient = true;
    parent.add(glow);
    return glow;
  };
  const onInventoryChange = vi.fn();
  const system = new CountermeasureSystem({
    scene,
    player,
    playerVelocity: new THREE.Vector3(0, 0, 100),
    fx,
    audio,
    decoys,
    playerShots,
    hostileShots,
    addTransientGlow,
    onInventoryChange,
  });
  return { system, scene, player, decoys, playerShots, hostileShots, fx, audio, onInventoryChange };
}

describe('CountermeasureSystem', () => {
  it('deploys a flare/chaff pair, spends one charge and applies cooldown', () => {
    const { system, scene, decoys, audio, onInventoryChange } = makeCountermeasures();

    expect(system.deployPlayer()).toBe(true);

    expect(system.countermeasures).toBe(11);
    expect(system.cooldown).toBe(.85);
    expect(decoys.map(decoy => [decoy.team, decoy.type])).toEqual([
      ['player', 'ir'], ['player', 'radar'],
    ]);
    expect(scene.children).toHaveLength(2);
    expect(audio.playCountermeasure).toHaveBeenCalledOnce();
    expect(onInventoryChange).toHaveBeenCalledOnce();
  });

  it('blocks deployment while rearming or when inventory is empty', () => {
    const { system, decoys, audio } = makeCountermeasures();
    expect(system.deployPlayer()).toBe(true);
    expect(system.deployPlayer()).toBe(false);

    system.tick(.85);
    expect(system.deployPlayer()).toBe(true);
    expect(system.countermeasures).toBe(10);
    system.countermeasures = 0;
    expect(system.deployPlayer()).toBe(false);

    expect(decoys).toHaveLength(4);
    expect(audio.playWeaponNoLock).toHaveBeenCalledTimes(2);
  });

  it('deploys only the decoy type requested by hostile missile seeker and starts evasive action', () => {
    const { system, decoys, scene } = makeCountermeasures();
    const enemy = {
      mesh: new THREE.Object3D(),
      velocity: new THREE.Vector3(0, 0, 40),
      dead: false,
      countermeasures: 2,
      countermeasureCooldown: 0,
    };
    enemy.mesh.position.set(100, 100, 100);

    expect(system.deployHostile(enemy, 'ir')).toBe(true);

    expect(enemy.countermeasures).toBe(1);
    expect(enemy.countermeasureCooldown).toBeGreaterThanOrEqual(4.5);
    expect(enemy.evasiveTimer).toBe(2.4);
    expect(decoys.map(decoy => decoy.type)).toEqual(['ir']);
    expect(decoys[0].spoofChance).toBe(.62);
    expect(scene.children).toHaveLength(1);
  });

  it('keeps expired decoys while a missile tracks them, then disposes them after release', () => {
    const { system, scene, decoys, playerShots } = makeCountermeasures();
    const mesh = new THREE.Group();
    mesh.position.set(10, 100, 10);
    scene.add(mesh);
    const decoy = {
      team: 'enemy', type: 'ir', mesh, position: mesh.position,
      previousPosition: mesh.position.clone(), velocity: new THREE.Vector3(),
      life: .01, maxLife: 1, active: true, age: 0, trailClock: 1,
    };
    decoys.push(decoy);
    const missile = { homing: true, decoyTarget: decoy };
    playerShots.push(missile);

    system.update(.02);
    expect(decoys).toHaveLength(1);
    expect(scene.children).not.toContain(mesh);

    playerShots.length = 0;
    system.update(.01);
    expect(decoys).toHaveLength(0);
  });
});
