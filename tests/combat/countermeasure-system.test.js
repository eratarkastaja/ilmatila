import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CountermeasureSystem } from '../../src/combat/countermeasure-system.js';

function makeCountermeasures({ hostileAircraft = [], hostileShots: initialHostileShots = [], random, chaffConfig } = {}) {
  const scene = new THREE.Scene();
  const player = { position: new THREE.Vector3(0, 100, 0), quaternion: new THREE.Quaternion() };
  const decoys = [];
  const playerShots = [];
  const hostileShots = initialHostileShots;
  const fx = { emitParticle: vi.fn() };
  const audio = {
    playWeaponNoLock: vi.fn(),
    playCountermeasure: vi.fn(),
    playChaffCountermeasure: vi.fn(),
    playCountermeasureUnavailable: vi.fn(),
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
    hostileAircraft,
    addTransientGlow,
    onInventoryChange,
    random,
    chaffConfig,
  });
  return { system, scene, player, decoys, playerShots, hostileShots, hostileAircraft, fx, audio, onInventoryChange };
}

describe('CountermeasureSystem', () => {
  it('deploys one flare, spends one charge and applies cooldown', () => {
    const { system, scene, decoys, audio, onInventoryChange } = makeCountermeasures();

    expect(system.deployPlayer()).toBe(true);

    expect(system.countermeasures).toBe(11);
    expect(system.cooldown).toBe(.85);
    expect(decoys.map(decoy => [decoy.team, decoy.type])).toEqual([['player', 'ir']]);
    expect(decoys[0].source).toBe(system.player);
    expect(scene.children).toHaveLength(1);
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

    expect(decoys).toHaveLength(2);
    expect(audio.playCountermeasureUnavailable).toHaveBeenCalledTimes(2);
  });

  it('deploys a flare and starts evasive action for a hostile aircraft', () => {
    const { system, decoys, scene } = makeCountermeasures();
    const enemy = {
      mesh: new THREE.Object3D(),
      velocity: new THREE.Vector3(0, 0, 40),
      dead: false,
      countermeasures: 2,
      countermeasureCooldown: 0,
    };
    enemy.mesh.position.set(100, 100, 100);

    expect(system.deployHostile(enemy)).toBe(true);

    expect(enemy.countermeasures).toBe(1);
    expect(enemy.countermeasureCooldown).toBeGreaterThanOrEqual(4.5);
    expect(enemy.evasiveTimer).toBe(2.4);
    expect(decoys.map(decoy => decoy.type)).toEqual(['ir']);
    expect(decoys[0].spoofChance).toBe(.62);
    expect(scene.children).toHaveLength(1);
  });

  it('deploys chaff from a separate finite inventory and respects its cooldown', () => {
    const { system, fx, audio } = makeCountermeasures({ random: () => 0 });

    expect(system.deployChaff()).toBe(true);
    expect(system.chaff).toBe(11);
    expect(system.flares).toBe(12);
    expect(system.chaffCooldown).toBe(1.7);
    expect(system.cooldown).toBe(.85);
    expect(fx.emitParticle).toHaveBeenCalledTimes(14);
    expect(audio.playChaffCountermeasure).toHaveBeenCalledOnce();

    expect(system.deployChaff()).toBe(false);
    expect(system.chaff).toBe(11);
    system.tick(1.7);
    expect(system.deployChaff()).toBe(true);
    expect(system.chaff).toBe(10);
  });

  it('cannot deploy chaff when its inventory is empty', () => {
    const { system, fx, audio } = makeCountermeasures({ random: () => 0 });
    system.chaff = 0;

    expect(system.deployChaff()).toBe(false);
    expect(system.lastChaffDeployment).toBe('empty');
    expect(fx.emitParticle).not.toHaveBeenCalled();
    expect(audio.playCountermeasureUnavailable).toHaveBeenCalledOnce();
  });

  it('probabilistically disrupts an existing hostile radar track, not a searching fighter', () => {
    const player = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    const trackingEnemy = { phase: 'inbound', engagementTarget: player, burstTarget: player, dead: false };
    const searchingEnemy = { phase: 'staging', detectedPlayerTimer: 1, engagementTarget: player, dead: false };
    const { system } = makeCountermeasures({
      hostileAircraft: [trackingEnemy, searchingEnemy],
      random: () => 0,
    });
    system.player = player;

    expect(system.deployChaff()).toBe(true);

    expect(trackingEnemy.radarTrackDisruptionRemaining).toBe(2.8);
    expect(trackingEnemy.chaffTrackReevaluationRemaining).toBe(5);
    expect(searchingEnemy.radarTrackDisruptionRemaining).toBeUndefined();
  });

  it('keeps a failed track-break roll from being rerolled by another chaff deployment', () => {
    const player = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    const enemy = { phase: 'inbound', engagementTarget: player, dead: false };
    const { system } = makeCountermeasures({ hostileAircraft: [enemy], random: () => .99 });
    system.player = player;

    expect(system.deployChaff()).toBe(true);
    expect(enemy.radarTrackDisruptionRemaining).toBeUndefined();
    expect(enemy.chaffTrackReevaluationRemaining).toBe(5);

    system.tick(2);
    expect(system.deployChaff()).toBe(true);
    expect(enemy.radarTrackDisruptionRemaining).toBeUndefined();
  });

  it('disrupts radar missile guidance without affecting an infrared missile', () => {
    const player = { position: new THREE.Vector3(0, 100, 0), quaternion: new THREE.Quaternion() };
    const makeMissile = seeker => {
      const mesh = new THREE.Object3D();
      mesh.position.set(0, 100, 500);
      return { missile: true, seeker, mesh, target: player, guidanceActive: true, life: 5 };
    };
    const radarMissile = makeMissile('radar');
    const infraredMissile = makeMissile('ir');
    const { system } = makeCountermeasures({ hostileShots: [radarMissile, infraredMissile], random: () => 0 });
    system.player = player;

    expect(system.deployChaff()).toBe(true);

    expect(radarMissile.chaffAttempted).toBe(true);
    expect(radarMissile.chaffDisruptedRemaining).toBe(3.3);
    expect(infraredMissile.chaffAttempted).toBeUndefined();
    expect(infraredMissile.chaffDisruptedRemaining).toBeUndefined();
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
