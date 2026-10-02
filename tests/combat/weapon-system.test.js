import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MISSILE_PROFILES } from '../../src/combat/projectiles.js';
import { createSeededRandom } from '../../src/combat/random.js';
import { WeaponSystem } from '../../src/combat/weapon-system.js';

function makeSystem(overrides = {}) {
  const target = { dead: false, mesh: new THREE.Object3D() };
  const radar = {
    mode: 'air',
    target: null,
    targetDomain: 'air',
    targetInSensorRange: false,
    inLockEnvelope: false,
    lockCueConfirmed: false,
  };
  const shots = [];
  const audio = {
    playWeaponNoLock: vi.fn(),
    playMissileLaunch: vi.fn(),
    startMissileFlight: vi.fn(),
    setGunFiring: vi.fn(),
  };
  const scene = new THREE.Scene();
  const player = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  const system = new WeaponSystem({
    player,
    scene,
    fx: null,
    audio,
    radar,
    playerVelocity: new THREE.Vector3(),
    addProjectile: shot => shots.push(shot),
    ...overrides,
  });
  return { system, radar, shots, audio, scene, target };
}

describe('WeaponSystem', () => {
  it('refuses a missile launch without a manually selected confirmed lock', () => {
    const { system, shots, audio } = makeSystem();

    expect(system.requestMissile()).toBe(false);

    expect(system.missiles.air).toBe(MISSILE_PROFILES.playerAir.count);
    expect(shots).toHaveLength(0);
    expect(system.missileFeedbackKey).toBe('combat.aimAtHostile');
    expect(audio.playWeaponNoLock).toHaveBeenCalledOnce();
  });

  it('fires a locked air missile and spends only air ammunition', () => {
    const { system, radar, shots, audio, scene, target } = makeSystem();
    radar.target = target;
    radar.targetDomain = 'air';
    radar.targetInSensorRange = true;
    radar.inLockEnvelope = true;
    radar.lockCueConfirmed = true;

    expect(system.requestMissile()).toBe(true);

    expect(system.missiles.air).toBe(MISSILE_PROFILES.playerAir.count - 1);
    expect(system.missiles.ground).toBe(MISSILE_PROFILES.playerGround.count);
    expect(system.cooldown).toBe(2.8);
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ homing: true, target, targetDomain: 'air', seeker: 'radar' });
    expect(scene.children).toContain(shots[0].mesh);
    expect(audio.playMissileLaunch).toHaveBeenCalledOnce();
  });

  it('does not fire during cooldown or without the selected weapon type ammunition', () => {
    const { system, radar, shots, audio } = makeSystem();
    radar.target = { dead: false };
    radar.inLockEnvelope = true;
    radar.lockCueConfirmed = true;
    system.cooldown = .5;

    expect(system.requestMissile()).toBe(false);
    system.cooldown = 0;
    system.missiles.air = 0;
    expect(system.requestMissile()).toBe(false);

    expect(shots).toHaveLength(0);
    expect(audio.playWeaponNoLock).toHaveBeenCalledTimes(2);
  });

  it('rejects a stale lock after the target leaves sensor range', () => {
    const { system, radar, shots } = makeSystem();
    radar.target = { dead: false };
    radar.targetInSensorRange = false;
    radar.inLockEnvelope = true;
    radar.lockCueConfirmed = true;

    expect(system.requestMissile()).toBe(false);
    expect(system.missileFeedbackKey).toBe('combat.sensorReacquire');
    expect(shots).toHaveLength(0);
  });

  it('fires gun rounds on trigger cadence and resets cadence when released', () => {
    const { system, shots, audio } = makeSystem();

    system.update(.02, { gunFiring: true });
    expect(shots).toHaveLength(2);
    expect(shots.every(shot => shot.ballistic)).toBe(true);
    expect(audio.setGunFiring).toHaveBeenLastCalledWith(true);

    system.update(.02, { gunFiring: false });
    expect(system.gunClock).toBe(0);
    expect(audio.setGunFiring).toHaveBeenLastCalledWith(false);
  });

  it('stops at the finite cannon ammunition limit and keeps the gun silent when empty', () => {
    const { system, shots, audio } = makeSystem({
      loadout: { airMissiles: 6, groundMissiles: 6, gunRounds: 1 },
    });

    system.update(.02, { gunFiring: true });
    expect(shots).toHaveLength(1);
    expect(system.gunAmmoRemaining).toBe(0);
    expect(system.gunRoundCount).toBe(1);

    system.update(.1, { gunFiring: true });
    expect(shots).toHaveLength(1);
    expect(audio.setGunFiring).toHaveBeenLastCalledWith(false);
    expect(system.fireGun()).toBe(false);
  });

  it('uses the configured player missile stores', () => {
    const { system } = makeSystem({
      loadout: { airMissiles: 6, groundMissiles: 6, gunRounds: 1200 },
    });

    expect(system.missiles).toEqual({ air: 6, ground: 6 });
    expect(system.gunAmmoCapacity).toBe(1200);
    expect(system.gunAmmoRemaining).toBe(1200);
  });

  it('uses the sortie seed for repeatable gun dispersion', () => {
    const fireWithSeed = seed => {
      const { system, shots } = makeSystem({ random: createSeededRandom(seed) });
      system.fireGun();
      return shots[0].velocity.toArray();
    };

    expect(fireWithSeed(1234)).toEqual(fireWithSeed(1234));
    expect(fireWithSeed(1234)).not.toEqual(fireWithSeed(5678));
  });
});
