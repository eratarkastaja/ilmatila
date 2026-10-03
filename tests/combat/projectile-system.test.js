import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CollisionSystem } from '../../src/combat/collision-system.js';
import { ProjectileSystem } from '../../src/combat/projectile-system.js';
import { CombatTelemetry } from '../../src/performance/combat-telemetry.js';

function makeSystem(overrides = {}) {
  const scene = new THREE.Scene();
  const player = { position: new THREE.Vector3() };
  const playerShots = [];
  const hostiles = [];
  const decoys = [];
  const hooks = {
    onPlayerDestroyed: vi.fn(),
    onJetDestroyed: vi.fn(),
    onUnitDestroyed: vi.fn(),
    addSpark: vi.fn(),
    addExplosion: vi.fn(),
  };
  const enemies = [];
  const redUnits = [];
  const audio = {
    stopMissileFlight: vi.fn(),
    updateMissileFlight: vi.fn(),
    playIncomingMissile: vi.fn(),
  };
  const collision = new CollisionSystem({
    player,
    terrain: { sampleHeight: () => -1000 },
    colliders: [],
    enemies,
    allies: [],
    redUnits,
    lastCollisionPosition: player.position.clone(),
    onPlayerDestroyed: hooks.onPlayerDestroyed,
  });
  const system = new ProjectileSystem({
    scene,
    player,
    playerShots,
    hostiles,
    decoys,
    collision,
    audio,
    ...hooks,
    ...overrides,
  });
  return { system, scene, player, playerShots, hostiles, decoys, enemies, hooks, audio };
}

describe('ProjectileSystem', () => {
  it('uses the injected random source for flare acquisition and reports the successful decoy', () => {
    const random = vi.fn(() => 0);
    const telemetry = new CombatTelemetry();
    const { system, player, decoys } = makeSystem({ random });
    system.setTelemetry(telemetry);
    const flarePosition = new THREE.Vector3(0, 0, -50);
    const flare = {
      active: true,
      team: 'player',
      source: player,
      type: 'ir',
      position: flarePosition,
      age: 0,
      maxLife: 2.7,
      spoofChance: 1,
    };
    decoys.push(flare);
    const missile = {
      seeker: 'ir',
      velocity: new THREE.Vector3(0, 0, 1),
      mesh: { position: new THREE.Vector3(0, 0, -100) },
    };

    expect(system.tryAcquireFlare(missile, player.position, decoys, 'player', player)).toBe(flare);
    expect(random).toHaveBeenCalledOnce();
    expect(telemetry.snapshot().countermeasures).toMatchObject({
      attempts: { flare: { player: { missile: 1 } } },
      successes: { flare: { player: { missile: 1 } } },
    });
  });

  it('records player, wingman and hostile missile launches by seeker type', () => {
    const telemetry = new CombatTelemetry();
    const { system } = makeSystem();
    system.setTelemetry(telemetry);

    system.addPlayerProjectile({ missile: true, seeker: 'radar' });
    system.addPlayerProjectile({ missile: true, seeker: 'ir', ally: true });
    system.addHostileProjectile({ missile: true, seeker: 'ir' });

    expect(telemetry.snapshot().missileLaunches).toEqual({
      total: 3,
      byTeam: { player: { radar: 1 }, wingman: { ir: 1 }, hostile: { ir: 1 } },
      bySeeker: { radar: 1, ir: 2 },
    });
  });

  it('moves player projectiles, resolves aircraft hits and removes spent rounds', () => {
    const { system, scene, playerShots, enemies, hooks } = makeSystem();
    const aircraftMesh = new THREE.Object3D();
    aircraftMesh.userData.hitZones = [{ x: 0, y: 0, z: 0, rx: 1, ry: 1, rz: 1, damage: 1 }];
    scene.add(aircraftMesh);
    const enemy = { mesh: aircraftMesh, velocity: new THREE.Vector3(), dead: false, hp: 1 };
    enemies.push(enemy);
    const round = {
      mesh: new THREE.Object3D(),
      velocity: new THREE.Vector3(10, 0, 0),
      life: 2,
      damage: 2,
      sourceUnit: { radioId: 'wingman1' },
    };
    round.mesh.position.set(-5, 0, 0);
    scene.add(round.mesh);
    system.addPlayerProjectile(round);

    system.update(1);

    expect(hooks.onJetDestroyed).toHaveBeenCalledWith(enemy, true, { sourceUnit: round.sourceUnit, shot: round });
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

  it('disposes both projectile queues and stops their missile audio loops', () => {
    const { system, scene, playerShots, hostiles, audio } = makeSystem();
    const playerMissile = { homing: true, mesh: new THREE.Object3D() };
    const hostileMissile = { missile: true, mesh: new THREE.Object3D() };
    scene.add(playerMissile.mesh, hostileMissile.mesh);
    playerShots.push(playerMissile);
    hostiles.push(hostileMissile);

    system.dispose();

    expect(playerShots).toHaveLength(0);
    expect(hostiles).toHaveLength(0);
    expect(scene.children).toHaveLength(0);
    expect(audio.stopMissileFlight).toHaveBeenCalledTimes(2);
  });

  it('clears a missile threat after swept impact resolves', () => {
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

    expect(system.incomingMissile).toBe(false);
    expect(hooks.onPlayerDestroyed).toHaveBeenCalledWith('combat.hostileMissile');
    expect(hooks.addExplosion).toHaveBeenCalledOnce();
    expect(hostiles).toHaveLength(0);
    expect(player.position).toEqual(new THREE.Vector3());
  });

  it('keeps radar guided air-to-air missiles on their target when only a flare is released', () => {
    const { system, scene, playerShots, decoys, enemies } = makeSystem();
    const targetMesh = new THREE.Object3D();
    targetMesh.position.set(0, 0, 1000);
    scene.add(targetMesh);
    const target = { mesh: targetMesh, velocity: new THREE.Vector3(), dead: false, hp: 10 };
    enemies.push(target);
    const flareMesh = new THREE.Group();
    flareMesh.position.set(0, 0, 800);
    scene.add(flareMesh);
    const flare = {
      team: 'enemy', source: target, type: 'ir', mesh: flareMesh, position: flareMesh.position,
      previousPosition: flareMesh.position.clone(), velocity: new THREE.Vector3(),
      life: 2.7, maxLife: 2.7, active: true, age: 0, spoofChance: 1,
    };
    decoys.push(flare);
    const missileMesh = new THREE.Object3D();
    scene.add(missileMesh);
    const missile = {
      homing: true, seeker: 'radar', target, targetDomain: 'air',
      mesh: missileMesh, velocity: new THREE.Vector3(0, 0, 650), speed: 650,
      life: 5, burnRemaining: 2, coastDrag: .07, motorBurning: true, guidanceActive: true,
      decoyTarget: null, decoyAttempts: new Set(), damage: 1,
    };
    playerShots.push(missile);

    system.update(.02);

    expect(missile.decoyTarget).toBeNull();
    expect(missile.velocity.length()).toBeGreaterThan(600);
  });

  it('lets a radar missile fly unguided through chaff disruption, then reacquire', () => {
    const { system, scene, player, hostiles } = makeSystem();
    player.position.set(1000, 0, 0);
    system.collision.lastCollisionPosition.copy(player.position);
    const mesh = new THREE.Object3D();
    scene.add(mesh);
    const missile = {
      projectile: true, missile: true, seeker: 'radar', target: player,
      mesh, velocity: new THREE.Vector3(0, 0, 650), speed: 650, turnRate: .78,
      life: 8, burnRemaining: 5, coastDrag: .07, motorBurning: true, guidanceActive: true,
      guidanceAfterBurnout: true, chaffDisruptedRemaining: 1, warningClock: 2,
      proximityRadius: 20, damage: 1,
    };
    hostiles.push(missile);

    system.update(.1);

    expect(hostiles).toContain(missile);
    expect(missile.mesh.position.z).toBeCloseTo(65);
    expect(missile.velocity.x).toBe(0);
    expect(missile.guidanceActive).toBe(true);

    missile.chaffDisruptedRemaining = .01;
    system.update(.1);
    expect(missile.chaffDisruptedRemaining).toBe(0);
    expect(missile.velocity.x).toBeGreaterThan(0);
  });

  it('continues normal guidance on radar missiles that have not been disrupted by chaff', () => {
    const { system, scene, player, hostiles } = makeSystem();
    player.position.set(1000, 0, 0);
    system.collision.lastCollisionPosition.copy(player.position);
    const mesh = new THREE.Object3D();
    scene.add(mesh);
    const missile = {
      projectile: true, missile: true, seeker: 'radar', target: player,
      mesh, velocity: new THREE.Vector3(0, 0, 650), speed: 650, turnRate: .78,
      life: 8, burnRemaining: 5, coastDrag: .07, motorBurning: true, guidanceActive: true,
      guidanceAfterBurnout: true, warningClock: 2, proximityRadius: 20, damage: 1,
    };
    hostiles.push(missile);

    system.update(.1);

    expect(missile.chaffDisruptedRemaining).toBe(0);
    expect(missile.velocity.x).toBeGreaterThan(0);
    expect(hostiles).toContain(missile);
  });

  it('limits air-to-air missile turns smoothly while preserving flight speed', () => {
    const { system, scene, playerShots, enemies } = makeSystem();
    const targetMesh = new THREE.Object3D();
    targetMesh.position.set(1000, 0, 0);
    scene.add(targetMesh);
    const target = { mesh: targetMesh, velocity: new THREE.Vector3(), dead: false, hp: 10 };
    enemies.push(target);
    const mesh = new THREE.Object3D();
    scene.add(mesh);
    const missile = {
      homing: true, seeker: 'radar', target, targetDomain: 'air',
      mesh, velocity: new THREE.Vector3(0, 0, 650), speed: 650, turnRate: .78,
      life: 5, burnRemaining: 2, coastDrag: .07, motorBurning: true, guidanceActive: true,
      decoyTarget: null, decoyAttempts: new Set(), damage: 1,
    };
    const initialDirection = missile.velocity.clone().normalize();
    playerShots.push(missile);

    system.update(.1);

    expect(initialDirection.angleTo(missile.velocity)).toBeLessThanOrEqual(.78 * .1 + 1e-8);
    expect(missile.velocity.length()).toBeCloseTo(650, 6);
    expect(mesh.position.length()).toBeGreaterThan(64);
  });

  it('continues missile coasting after motor burnout instead of freezing in place', () => {
    const { system, scene, playerShots, enemies } = makeSystem();
    const targetMesh = new THREE.Object3D();
    targetMesh.position.set(0, 0, 1000);
    scene.add(targetMesh);
    const target = { mesh: targetMesh, velocity: new THREE.Vector3(), dead: false, hp: 10 };
    enemies.push(target);
    const mesh = new THREE.Object3D();
    scene.add(mesh);
    const missile = {
      homing: true, seeker: 'radar', target, targetDomain: 'air',
      mesh, velocity: new THREE.Vector3(0, 0, 650), speed: 650, turnRate: .78,
      life: 5, burnRemaining: .01, coastDrag: .07, motorBurning: true, guidanceActive: true,
      decoyTarget: null, decoyAttempts: new Set(), damage: 1,
    };
    playerShots.push(missile);

    system.update(.02);

    expect(missile.motorBurning).toBe(false);
    expect(missile.guidanceActive).toBe(false);
    expect(mesh.position.length()).toBeGreaterThan(12);
    expect(missile.velocity.length()).toBeGreaterThan(640);
  });

  it('resolves a hostile missile against its assigned wingman target', () => {
    const onFriendlyAircraftHit = vi.fn();
    const { system, scene, hostiles } = makeSystem({ onFriendlyAircraftHit });
    const allyMesh = new THREE.Object3D();
    allyMesh.position.set(0, 0, 25);
    scene.add(allyMesh);
    const ally = { mesh: allyMesh, velocity: new THREE.Vector3(), dead: false, hp: 3.6 };
    const attacker = { mesh: new THREE.Object3D(), dead: false };
    const missileMesh = new THREE.Object3D();
    scene.add(missileMesh);
    hostiles.push({
      projectile: true,
      missile: true,
      homing: true,
      seeker: 'ir',
      mesh: missileMesh,
      velocity: new THREE.Vector3(0, 0, 180),
      speed: 180,
      burnRemaining: 0,
      coastDrag: 0,
      motorBurning: false,
      guidanceActive: false,
      life: 2,
      damage: 58,
      proximityRadius: 20,
      target: ally,
      sourceUnit: attacker,
      warningClock: 0,
    });

    system.update(.2);

    expect(onFriendlyAircraftHit).toHaveBeenCalledWith(ally, 58, attacker);
    expect(hostiles).toHaveLength(0);
  });

  it('lets an infrared missile take a fresh flare only when it is ahead of and separated from its target', () => {
    const { system, player, scene, hostiles, decoys } = makeSystem({ random: () => 0 });
    player.position.set(0, 0, 1000);
    const flareMesh = new THREE.Group();
    flareMesh.position.set(0, 0, 800);
    scene.add(flareMesh);
    decoys.push({
      team: 'player', source: player, type: 'ir', mesh: flareMesh, position: flareMesh.position,
      previousPosition: flareMesh.position.clone(), velocity: new THREE.Vector3(),
      life: 2.7, maxLife: 2.7, active: true, age: 0, spoofChance: 1,
    });
    const missileMesh = new THREE.Object3D();
    scene.add(missileMesh);
    const missile = {
      projectile: true, missile: true, seeker: 'ir', mesh: missileMesh,
      velocity: new THREE.Vector3(0, 0, 305), speed: 305,
      life: 8, burnRemaining: 4, coastDrag: .12, motorBurning: true, guidanceActive: true,
      guidanceAfterBurnout: true, turnRate: .8, targetDomain: 'air', decoyTarget: null,
      damage: 1, warningClock: 2,
    };
    hostiles.push(missile);
    system.update(.02);

    expect(missile.decoyTarget).toBe(decoys[0]);
    expect(missile.velocity.length()).toBeGreaterThan(300);
  });

  it('does not let a flare pull an infrared missile from behind its seeker direction', () => {
    const { system, player, scene, hostiles, decoys } = makeSystem({ random: () => 0 });
    player.position.set(0, 0, 0);
    const flareMesh = new THREE.Group();
    flareMesh.position.set(0, 0, 300);
    scene.add(flareMesh);
    decoys.push({
      team: 'player', source: player, type: 'ir', mesh: flareMesh, position: flareMesh.position,
      previousPosition: flareMesh.position.clone(), velocity: new THREE.Vector3(),
      life: 2.7, maxLife: 2.7, active: true, age: 0, spoofChance: 1,
    });
    const missileMesh = new THREE.Object3D();
    missileMesh.position.set(0, 0, 1200);
    scene.add(missileMesh);
    const missile = {
      projectile: true, missile: true, seeker: 'ir', mesh: missileMesh,
      velocity: new THREE.Vector3(0, 0, 305), speed: 305,
      life: 8, burnRemaining: 4, coastDrag: .12, motorBurning: true, guidanceActive: true,
      guidanceAfterBurnout: true, turnRate: .8, targetDomain: 'air', decoyTarget: null,
      damage: 1, warningClock: 2,
    };
    hostiles.push(missile);
    system.update(.02);

    expect(missile.decoyTarget).toBeNull();
    expect(missile.velocity.length()).toBeGreaterThan(300);
  });
});
