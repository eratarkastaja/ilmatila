import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AirBattle } from '../../src/combat/air-battle.js';
import { CollisionSystem } from '../../src/combat/collision-system.js';
import { DestructionSystem } from '../../src/combat/destruction-system.js';
import { DIFFICULTY_PRESETS } from '../../src/combat/difficulty.js';
import { GroundBattle } from '../../src/combat/ground-battle.js';
import { MissionSystem } from '../../src/combat/mission-system.js';
import { createSeededRandom } from '../../src/combat/random.js';
import { ProjectileSystem } from '../../src/combat/projectile-system.js';
import { createMissile, disposeMissilePool, releaseMissile } from '../../src/combat/projectiles.js';
import { ScoreSystem } from '../../src/combat/score-system.js';
import { WeaponSystem } from '../../src/combat/weapon-system.js';

const dt = 1 / 60;
const forward = new THREE.Vector3(0, 0, 1);
const right = new THREE.Vector3(1, 0, 0);

function createTerrain() {
  return {
    worldSize: 32000,
    operationBounds: { minX: -16000, maxX: 16000, minZ: -16000, maxZ: 16000 },
    sampleHeight: () => 0,
    isPlayableArea: () => true,
    isWater: () => false,
  };
}

function createAircraftAsset() {
  const model = () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(6, 2, 12), new THREE.MeshBasicMaterial()));
    return root;
  };
  return { player: model(), hostiles: { su27: model(), mig29: model() } };
}

function createDestruction(scene, score) {
  const effects = { addExplosion: vi.fn() };
  const feedback = { notify: vi.fn() };
  const reportWingmanRadio = vi.fn();
  const destruction = new DestructionSystem({
    scene, fx: null, score, effects, feedback, reportWingmanRadio,
  });
  return { destruction, effects, feedback, reportWingmanRadio };
}

afterEach(() => disposeMissilePool());

describe('seeded combat scenarios', () => {
  it('runs air combat for 45 seconds and keeps wingman shots and destruction owned once', () => {
    const scene = new THREE.Scene();
    const player = new THREE.Group();
    player.position.set(0, 300, -1000);
    const random = createSeededRandom(0x51a7e);
    const playerShots = [];
    const hostileShots = [];
    let projectileSystem;
    const launchedShots = [];
    const airBattle = new AirBattle({
      scene,
      player,
      aircraftAsset: createAircraftAsset(),
      mission: {
        hostiles: 2,
        hostileSpawnDistance: 6000,
        hostileMinimumSpawnDistance: 5000,
        wingmen: 1,
        deferredHostiles: false,
      },
      terrain: createTerrain(),
      audio: null,
      fx: null,
      playerVelocity: new THREE.Vector3(),
      getPlayerHeading: () => 0,
      deployHostileCountermeasures: vi.fn(),
      addHostileProjectile: shot => projectileSystem.addHostileProjectile(shot),
      addPlayerProjectile: shot => {
        launchedShots.push(shot);
        projectileSystem.addPlayerProjectile(shot);
      },
      onMissileLaunch: vi.fn(),
      onWingmanRadio: vi.fn(),
      difficulty: DIFFICULTY_PRESETS.standard,
      random,
    });

    const [deadEnemy, enemy] = airBattle.enemies;
    deadEnemy.dead = true;
    deadEnemy.mesh.removeFromParent();
    // Hold the hostile pose fixed so this scenario isolates wingman target
    // selection, launch, projectile flight, and destruction for fixed inputs.
    enemy.phase = 'inbound';
    enemy.mesh.position.set(160, 300, 3200);
    enemy.mesh.rotation.set(0, 0, 0);
    enemy.mesh.userData.hitZones = [{ x: 0, y: 0, z: 0, rx: 90, ry: 90, rz: 90, damage: 1 }];
    enemy.hp = .1;
    enemy.maxHp = .1;
    enemy.velocity.set(0, 0, 0);

    const ally = airBattle.allies[0];
    ally.mesh.position.set(0, 300, 0);
    ally.mesh.rotation.set(0, 0, 0);
    ally.heading = 0;
    ally.pitch = 0;
    ally.velocity.set(0, 0, 235);
    ally.airMissiles = 1;
    ally.airMissileCooldown = 0;
    ally.fireCooldown = 100;
    ally.targetRefresh = 0;

    const collision = new CollisionSystem({
      player,
      terrain: createTerrain(),
      colliders: [],
      enemies: airBattle.enemies,
      allies: airBattle.allies,
      redUnits: [],
      lastCollisionPosition: player.position.clone(),
      onPlayerDestroyed: vi.fn(),
    });
    const score = new ScoreSystem();
    const { destruction, effects } = createDestruction(scene, score);
    projectileSystem = new ProjectileSystem({
      scene, player, playerShots, hostiles: hostileShots, collision, random,
      onJetDestroyed: (target, credited, details) => destruction.destroyAircraft(target, credited, details),
      onUnitDestroyed: vi.fn(),
      onFriendlyAircraftHit: vi.fn(),
      addSpark: vi.fn(),
    });
    const launchStates = [];
    const fireMissile = airBattle.weaponAI.fireAllyAirMissile.bind(airBattle.weaponAI);
    vi.spyOn(airBattle.weaponAI, 'fireAllyAirMissile').mockImplementation((battle, source, target) => {
      launchStates.push({ source, target, targetWasDead: target.dead });
      return fireMissile(battle, source, target);
    });

    for (let frame = 0; frame < 45 * 60; frame++) {
      airBattle.wingmanController.update(airBattle, dt, forward, right);
      projectileSystem.update(dt);
    }

    expect(launchStates).toEqual([{ source: ally, target: enemy, targetWasDead: false }]);
    expect(ally.airMissiles).toBe(0);
    expect(enemy.dead).toBe(true);
    expect(ally.target).toBeNull();
    expect(launchedShots).toHaveLength(1);
    expect(launchedShots[0]).toMatchObject({ ally: true, sourceUnit: ally, target: enemy, targetDomain: 'air' });
    expect(playerShots).toHaveLength(0);
    expect(score.airKills).toBe(1);
    expect(effects.addExplosion).toHaveBeenCalledOnce();

    projectileSystem.dispose();
    airBattle.dispose();
  });

  it('runs ground units and air defense for 45 seconds without advancing destroyed units', () => {
    const scene = new THREE.Scene();
    const player = new THREE.Group();
    player.position.set(0, 300, 0);
    const enemyMesh = new THREE.Group();
    scene.add(enemyMesh);
    const enemy = { mesh: enemyMesh, velocity: new THREE.Vector3(), hp: 10, maxHp: 10, dead: false };
    const enemies = [enemy];
    const hostileShots = [];
    const friendlyShots = [];
    const mission = {
      id: 'support',
      groundBattle: true,
      groundPairs: 1,
      groundTrucks: 0,
      groundFriendlyTrucks: 0,
      groundIto90Count: 1,
      groundShilkaCount: 0,
      groundFrontSpan: 1000,
      navigationDistance: 900,
      objective: { type: 'support' },
    };
    const groundBattle = new GroundBattle({
      scene,
      player,
      playerVelocity: new THREE.Vector3(),
      terrain: createTerrain(),
      mission,
      audio: null,
      fx: null,
      difficulty: DIFFICULTY_PRESETS.standard,
      enemies,
      addProjectile: shot => hostileShots.push(shot),
      addFriendlyProjectile: shot => friendlyShots.push(shot),
      random: createSeededRandom(0x6a0a7d),
    });
    groundBattle.setAirDefenseActive(true);
    const blueTank = groundBattle.friends.find(unit => unit.role === 'defender');
    const redTank = groundBattle.redUnits.find(unit => unit.armed !== false);
    const crotale = groundBattle.friends.find(unit => unit.mesh.userData.platform === 'ito90');
    redTank.mesh.position.copy(blueTank.mesh.position).add(new THREE.Vector3(0, 0, 1000));
    redTank.assaultTarget = blueTank.mesh.position;
    redTank.cool = 0;
    blueTank.cool = 0;
    crotale.samAmmo = 1;
    crotale.airAaCooldown = 0;
    enemy.mesh.position.copy(crotale.mesh.position).add(new THREE.Vector3(0, 500, 1600));

    const score = new ScoreSystem();
    const { destruction } = createDestruction(scene, score);
    const remaining = state => {
      state.airRemaining = enemies.filter(unit => !unit.dead).length;
      state.groundRemaining = groundBattle.redUnits.filter(unit => !unit.dead && unit.armed !== false).length;
      return state;
    };
    const missionSystem = new MissionSystem({
      mission,
      objective: mission.objective,
      totals: { air: 1, ground: 1 },
      getRemaining: remaining,
    });
    const fireGround = vi.spyOn(groundBattle.weaponAI, 'fireGround');
    let destroyedState;

    for (let frame = 0; frame < 45 * 60; frame++) {
      groundBattle.update(dt);
      missionSystem.update(dt);
      if (frame === 5 * 60) {
        expect(fireGround.mock.calls.some(([, unit]) => unit === redTank)).toBe(true);
        destruction.destroyGroundUnit(redTank, true);
        destroyedState = {
          position: redTank.mesh.position.clone(),
          phase: redTank.phase,
          cool: redTank.cool,
        };
        fireGround.mockClear();
      }
    }

    expect(crotale.samAmmo).toBe(0);
    expect(friendlyShots).toHaveLength(1);
    expect(friendlyShots[0]).toMatchObject({ missile: true, ally: true, sourceUnit: crotale, target: enemy });
    expect(hostileShots.length).toBeGreaterThan(0);
    expect(redTank.dead).toBe(true);
    expect(redTank.mesh.parent).toBeNull();
    expect(redTank.mesh.position.toArray()).toEqual(destroyedState.position.toArray());
    expect(redTank.phase).toBe(destroyedState.phase);
    expect(redTank.cool).toBe(destroyedState.cool);
    expect(fireGround.mock.calls.some(([, unit]) => unit === redTank)).toBe(false);
    expect(missionSystem.outcome).toBe('active');
    expect(missionSystem.remaining).toMatchObject({ airRemaining: 1, groundRemaining: 0 });

    destruction.destroyAircraft(enemy, true);
    missionSystem.update(dt);
    expect(missionSystem.outcome).toBe('complete');
    expect(score.groundKills).toBe(1);
    expect(score.airKills).toBe(1);

    for (const shot of friendlyShots) {
      if (shot.missile) releaseMissile(shot.mesh);
      else shot.mesh.removeFromParent();
    }
    for (const shot of hostileShots) shot.mesh.removeFromParent();
    missionSystem.dispose();
    groundBattle.dispose();
  });

  it('launches a player missile, guides it to impact, then returns its mesh to the pool', () => {
    const scene = new THREE.Scene();
    const player = new THREE.Group();
    player.position.set(0, 300, 0);
    const targetMesh = new THREE.Group();
    targetMesh.position.set(12, 300, 2200);
    targetMesh.userData.faction = 'enemy';
    targetMesh.userData.hitZones = [{ x: 0, y: 0, z: 0, rx: 120, ry: 120, rz: 120, damage: 1 }];
    scene.add(targetMesh);
    const target = { mesh: targetMesh, velocity: new THREE.Vector3(), hp: 4, maxHp: 4, dead: false };
    const radar = {
      mode: 'air', target, targetDomain: 'air', targetInSensorRange: true,
      inLockEnvelope: true, lockCueConfirmed: true,
    };
    const enemies = [target];
    const collision = new CollisionSystem({
      player,
      terrain: createTerrain(),
      colliders: [], enemies, allies: [], redUnits: [],
      lastCollisionPosition: player.position.clone(),
      onPlayerDestroyed: vi.fn(),
    });
    const score = new ScoreSystem();
    const { destruction, effects } = createDestruction(scene, score);
    const audio = {
      playMissileLaunch: vi.fn(), startMissileFlight: vi.fn(), updateMissileFlight: vi.fn(),
      stopMissileFlight: vi.fn(), setGunFiring: vi.fn(), playWeaponNoLock: vi.fn(),
    };
    const random = createSeededRandom(0xaff1ce);
    const projectileSystem = new ProjectileSystem({
      scene, player, collision, audio, random,
      onJetDestroyed: (unit, credited, details) => destruction.destroyAircraft(unit, credited, details),
      onUnitDestroyed: vi.fn(),
      addSpark: vi.fn(),
    });
    const weaponSystem = new WeaponSystem({
      player, scene, audio, radar, playerVelocity: new THREE.Vector3(), random,
      addProjectile: shot => projectileSystem.addPlayerProjectile(shot),
    });

    expect(weaponSystem.requestMissile()).toBe(true);
    expect(weaponSystem.missiles.air).toBe(9);
    expect(projectileSystem.playerShots).toHaveLength(1);
    const launched = projectileSystem.playerShots[0];
    const missileMesh = launched.mesh;
    expect(launched).toMatchObject({ homing: true, target, targetDomain: 'air', seeker: 'radar' });
    expect(missileMesh.parent).toBe(scene);

    projectileSystem.update(dt);
    expect(launched.velocity.x).toBeGreaterThan(0);
    for (let frame = 1; frame < 1200 && !target.dead; frame++) projectileSystem.update(dt);

    expect(target.dead).toBe(true);
    expect(projectileSystem.playerShots).toHaveLength(0);
    expect(missileMesh.parent).toBeNull();
    expect(missileMesh.visible).toBe(false);
    expect(audio.stopMissileFlight).toHaveBeenCalledOnce();
    expect(score.airKills).toBe(1);
    expect(effects.addExplosion).toHaveBeenCalledOnce();

    const reused = createMissile('#c5c8bb');
    expect(reused).toBe(missileMesh);
    releaseMissile(reused);
    projectileSystem.dispose();
  });
});
