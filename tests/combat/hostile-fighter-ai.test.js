import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AirWeaponAI } from '../../src/combat/air-weapon-ai.js';
import { DIFFICULTY_PRESETS } from '../../src/combat/difficulty.js';
import { HostileFighterAI } from '../../src/combat/hostile-fighter-ai.js';

function makeHostile(position, phase = 'inbound') {
  const mesh = new THREE.Object3D();
  mesh.position.copy(position);
  return {
    mesh,
    phase,
    phaseClock: 0,
    altitudeOffset: 0,
    heading: 0,
    pitch: 0,
    speed: phase === 'extend' ? 335 : 295,
    velocity: new THREE.Vector3(0, 0, phase === 'extend' ? 335 : 295),
    direction: new THREE.Vector3(),
    steeringOffset: new THREE.Vector3(),
    away: new THREE.Vector3(),
    waypoint: new THREE.Vector3(),
    separation: new THREE.Vector3(),
    nose: new THREE.Vector3(),
    lead: new THREE.Vector3(),
    leadOffset: new THREE.Vector3(),
    attackForward: new THREE.Vector3(0, 0, 1),
    attackRight: new THREE.Vector3(1, 0, 0),
    lane: 0,
    attackPattern: 0,
    stagingLane: 0,
    stagingLateral: 0,
    detectedPlayerTimer: 0,
    gunCooldown: 0,
    missileClock: 100,
    missileLockRemaining: null,
    missileLockSeeker: null,
    missilesFired: DIFFICULTY_PRESETS.standard.fighter.missile.capacity,
    effectClock: 0,
    countermeasureCooldown: 0,
    radarTrackDisruptionRemaining: 0,
    chaffTrackReevaluationRemaining: 0,
    evasiveTimer: 0,
    evasiveDuration: 0,
    evasiveDirection: 1,
    evasiveClimb: 300,
    tacticalManeuverCooldown: 100,
    groundStrafeCooldown: 100,
    targetRefreshTimer: 0,
    engagementTarget: null,
    engagementTargetDomain: 'air',
    burstTarget: null,
    burstTargetDomain: 'air',
    burstShots: 0,
    burstClock: 0,
    lockResponseLost: 0,
    lockResponseTimer: null,
    lockResponseDone: false,
    lockResponseFollowupTimer: 0,
    lastDefendedMissile: null,
  };
}

function makeBattle(enemy, fireEnemy) {
  return {
    player: { position: new THREE.Vector3(0, 300, 0) },
    playerVelocity: new THREE.Vector3(),
    allies: [],
    enemies: [enemy],
    friendlyGroundUnits: [],
    difficulty: DIFFICULTY_PRESETS.standard,
    mission: {},
    weaponAI: { fireEnemy },
  };
}

describe('HostileFighterAI radar tracking', () => {
  it('uses an injected random source for evasive direction and climb choice', () => {
    const rolls = [0.2, 0.5];
    const ai = new HostileFighterAI(() => rolls.shift());
    const enemy = {
      separation: new THREE.Vector3(),
      mesh: { position: new THREE.Vector3() },
      heading: 0,
    };
    const battle = { difficulty: { fighter: { evasion: { evasiveClimb: { min: 100, max: 300 } } } } };

    ai.beginEvasiveManeuver(battle, enemy, new THREE.Vector3(), 2);

    expect(enemy.evasiveDirection).toBe(-1);
    expect(enemy.evasiveClimb).toBe(200);
  });

  it('uses an injected random source to choose a hostile missile seeker', () => {
    expect(new AirWeaponAI(() => 0.75).chooseHostileMissileSeeker()).toBe('radar');
    expect(new AirWeaponAI(() => 0.25).chooseHostileMissileSeeker()).toBe('ir');
  });

  it('holds a broken player track during chaff disruption and reacquires afterward', () => {
    const ai = new HostileFighterAI();
    const player = { position: new THREE.Vector3() };
    const ally = { mesh: { position: new THREE.Vector3(100, 0, 0) }, dead: false };
    const enemy = {
      mesh: { position: new THREE.Vector3(0, 0, 500) },
      radarTrackDisruptionRemaining: 2.8,
      groundStrafeCooldown: 10,
    };
    const battle = {
      player,
      allies: [ally],
      friendlyGroundUnits: [],
      difficulty: { fighter: { targeting: { airPriorityRange: 1000 } } },
    };

    expect(ai.selectEnemyEngagementTarget(battle, enemy, 500)).toEqual({ target: ally, domain: 'air' });

    enemy.radarTrackDisruptionRemaining = 0;
    expect(ai.selectEnemyEngagementTarget(battle, enemy, 500)).toEqual({ target: player, domain: 'air' });
  });

  it('blocks radar missile launches during a broken radar track but leaves IR launches alone', () => {
    const ai = new HostileFighterAI();
    const enemy = { radarTrackDisruptionRemaining: 2 };

    expect(ai.canLaunchMissile(enemy, 'radar')).toBe(false);
    expect(ai.canLaunchMissile(enemy, 'ir')).toBe(true);

    enemy.radarTrackDisruptionRemaining = 0;
    expect(ai.canLaunchMissile(enemy, 'radar')).toBe(true);
  });

  it('honors a wingman-pressure encounter even when the player is within normal priority range', () => {
    const ai = new HostileFighterAI();
    const player = { position: new THREE.Vector3(0, 300, 0) };
    const wingman = { dead: false, mesh: { position: new THREE.Vector3(0, 300, 900) } };
    const enemy = makeHostile(new THREE.Vector3(0, 300, 1200));
    enemy.targetPreference = 'wingmen';
    const battle = {
      player,
      allies: [wingman],
      enemies: [enemy],
      friendlyGroundUnits: [],
      difficulty: DIFFICULTY_PRESETS.standard,
    };

    expect(ai.selectEnemyEngagementTarget(battle, enemy, 1200)).toEqual({
      target: wingman,
      domain: 'air',
    });
  });

  it('coordinates Hard target assignments and tightens focus when the player has low energy', () => {
    const ai = new HostileFighterAI(() => .5);
    const player = { position: new THREE.Vector3(0, 300, 0) };
    const closerWingman = { dead: false, mesh: { position: new THREE.Vector3(300, 300, 1000) } };
    const lessThreatenedWingman = { dead: false, mesh: { position: new THREE.Vector3(-1200, 300, 900) } };
    const enemy = makeHostile(new THREE.Vector3(0, 300, -5000));
    const firstAttacker = { dead: false, engagementTarget: player };
    const secondAttacker = { dead: false, engagementTarget: player };
    const wingmanAttacker = { dead: false, engagementTarget: closerWingman };
    const battle = {
      player,
      playerVelocity: new THREE.Vector3(0, 0, 235),
      allies: [closerWingman, lessThreatenedWingman],
      enemies: [enemy, firstAttacker, secondAttacker, wingmanAttacker],
      friendlyGroundUnits: [],
      difficulty: DIFFICULTY_PRESETS.hard,
    };

    expect(ai.selectEnemyEngagementTarget(battle, enemy, 5000).target).toBe(player);

    battle.playerVelocity.set(0, 0, 410);
    expect(ai.selectEnemyEngagementTarget(battle, enemy, 5000).target).toBe(lessThreatenedWingman);
  });

  it('does not use player energy after the player track is disrupted', () => {
    const ai = new HostileFighterAI(() => .5);
    const player = { position: new THREE.Vector3(0, 300, 0) };
    const ally = { dead: false, mesh: { position: new THREE.Vector3(100, 300, 700) } };
    const enemy = makeHostile(new THREE.Vector3(0, 300, -4000));
    enemy.radarTrackDisruptionRemaining = 1;
    const battle = {
      player,
      playerVelocity: new THREE.Vector3(0, 0, 100),
      allies: [ally],
      enemies: [enemy],
      friendlyGroundUnits: [],
      difficulty: DIFFICULTY_PRESETS.hard,
    };

    expect(ai.selectEnemyEngagementTarget(battle, enemy, 4000).target).toBe(ally);
  });

  it('breaks across a Hard missile crossing using its observed velocity', () => {
    const ai = new HostileFighterAI(() => .5);
    const enemy = makeHostile(new THREE.Vector3(0, 300, 0));
    enemy.velocity.set(0, 0, 0);
    const battle = { difficulty: DIFFICULTY_PRESETS.hard };

    ai.beginEvasiveManeuver(
      battle,
      enemy,
      new THREE.Vector3(100, 300, -200),
      2,
      new THREE.Vector3(-100, 0, 0),
    );

    expect(enemy.evasiveDirection).toBe(1);
    expect(enemy.evasiveTimer).toBe(2);
  });

  it('holds player-targeted missiles while a Hard fighter is assigned to a wingman', () => {
    const enemy = makeHostile(new THREE.Vector3(0, 300, -3000));
    const wingman = { dead: false, mesh: { position: new THREE.Vector3(100, 300, 0) } };
    const launchEnemyMissile = vi.fn();
    enemy.engagementTarget = wingman;
    enemy.targetRefreshTimer = 100;
    enemy.missileClock = 0;
    enemy.missilesFired = 0;
    enemy.gunCooldown = 100;
    enemy.tacticalManeuverCooldown = 100;
    enemy.groundStrafeCooldown = 100;
    const battle = makeBattle(enemy, vi.fn());
    battle.difficulty = DIFFICULTY_PRESETS.hard;
    battle.mission = {};
    battle.friendlyGroundUnits = [];
    battle.weaponAI.chooseHostileMissileSeeker = () => 'ir';
    battle.weaponAI.launchEnemyMissile = launchEnemyMissile;

    new HostileFighterAI(() => .5).updateJets(
      battle,
      1 / 60,
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
      { lockedTarget: null, incomingMissiles: [] },
    );

    expect(launchEnemyMissile).not.toHaveBeenCalled();
  });

  it('shows a fire-control lock window before a fighter can launch its missile', () => {
    const enemy = makeHostile(new THREE.Vector3(0, 300, -3000));
    enemy.engagementTarget = null;
    enemy.targetRefreshTimer = 0;
    enemy.missileClock = 0;
    enemy.missilesFired = 0;
    enemy.gunCooldown = 100;
    enemy.tacticalManeuverCooldown = 100;
    enemy.groundStrafeCooldown = 100;
    const launchEnemyMissile = vi.fn();
    const battle = makeBattle(enemy, vi.fn());
    battle.weaponAI.chooseHostileMissileSeeker = () => 'radar';
    battle.weaponAI.launchEnemyMissile = launchEnemyMissile;
    const ai = new HostileFighterAI(() => .5);
    const playerThreat = { lockedTarget: null, incomingMissiles: [] };
    const forward = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3(1, 0, 0);
    const restoreLaunchGeometry = () => {
      enemy.mesh.position.set(0, 300, -3000);
      enemy.mesh.rotation.set(0, 0, 0);
      enemy.heading = 0;
      enemy.pitch = 0;
      enemy.phase = 'inbound';
      enemy.engagementTarget = battle.player;
      enemy.targetRefreshTimer = 100;
    };

    restoreLaunchGeometry();
    ai.updateJets(battle, 0, forward, right, playerThreat);
    expect(enemy.missileLockRemaining).toBe(2.5);
    expect(launchEnemyMissile).not.toHaveBeenCalled();

    for (let index = 0; index < 4; index++) {
      restoreLaunchGeometry();
      ai.updateJets(battle, .5, forward, right, playerThreat);
      expect(enemy.missileLockRemaining).toBeGreaterThan(0);
      expect(launchEnemyMissile).not.toHaveBeenCalled();
    }

    restoreLaunchGeometry();
    ai.updateJets(battle, .5, forward, right, playerThreat);
    expect(launchEnemyMissile).toHaveBeenCalledOnce();
    expect(enemy.missileLockRemaining).toBeNull();
  });

  it('gives a wingman-pressure fighter a warned missile solution on its assigned wingman', () => {
    const enemy = makeHostile(new THREE.Vector3(0, 300, -3000));
    const wingman = { dead: false, mesh: { position: new THREE.Vector3(0, 300, 0) }, velocity: new THREE.Vector3() };
    enemy.targetPreference = 'wingmen';
    enemy.engagementTarget = wingman;
    enemy.targetRefreshTimer = 100;
    enemy.missileClock = 0;
    enemy.missilesFired = 0;
    enemy.gunCooldown = 100;
    enemy.tacticalManeuverCooldown = 100;
    enemy.groundStrafeCooldown = 100;
    const launchEnemyMissile = vi.fn();
    const reportWingmanMissileLock = vi.fn();
    const battle = makeBattle(enemy, vi.fn());
    battle.allies = [wingman];
    battle.weaponAI.chooseHostileMissileSeeker = () => 'radar';
    battle.weaponAI.launchEnemyMissile = launchEnemyMissile;
    battle.reportWingmanMissileLock = reportWingmanMissileLock;
    const ai = new HostileFighterAI(() => .5);
    const playerThreat = { lockedTarget: null, incomingMissiles: [] };
    const forward = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3(1, 0, 0);
    const restoreLaunchGeometry = () => {
      enemy.mesh.position.set(0, 300, -3000);
      enemy.mesh.rotation.set(0, 0, 0);
      enemy.heading = 0;
      enemy.pitch = 0;
      enemy.phase = 'inbound';
      enemy.engagementTarget = wingman;
      enemy.targetRefreshTimer = 100;
    };

    restoreLaunchGeometry();
    ai.updateJets(battle, 0, forward, right, playerThreat);
    expect(enemy.missileLockTarget).toBe(wingman);
    expect(reportWingmanMissileLock).toHaveBeenCalledWith(enemy, wingman, 'radar');
    expect(launchEnemyMissile).not.toHaveBeenCalled();

    for (let index = 0; index < 5; index++) {
      restoreLaunchGeometry();
      ai.updateJets(battle, .5, forward, right, playerThreat);
    }

    expect(launchEnemyMissile).toHaveBeenCalledWith(battle, enemy, 'radar', wingman);
  });

  it('sends a Strike fighter toward friendly ground units instead of selecting air targets', () => {
    const ai = new HostileFighterAI(() => .99);
    const enemy = makeHostile(new THREE.Vector3(0, 300, -5000));
    enemy.missionRole = 'strike';
    const fartherUnit = {
      dead: false,
      armed: true,
      mesh: { position: new THREE.Vector3(500, 0, 0) },
    };
    const otherUnit = {
      dead: false,
      armed: true,
      mesh: { position: new THREE.Vector3(100, 0, 200) },
    };
    const battle = {
      player: { position: new THREE.Vector3(0, 300, 0) },
      playerVelocity: new THREE.Vector3(),
      allies: [{ dead: false, mesh: { position: new THREE.Vector3(0, 300, -4900) } }],
      enemies: [enemy],
      friendlyGroundUnits: [otherUnit, fartherUnit],
      difficulty: DIFFICULTY_PRESETS.standard,
    };

    expect(ai.selectEnemyEngagementTarget(battle, enemy, 5000)).toEqual({
      target: fartherUnit,
      domain: 'ground',
    });
  });

  it('keeps a Strike fighter on its target area and prevents player missile launches', () => {
    const enemy = makeHostile(new THREE.Vector3(0, 300, -5000));
    enemy.missionRole = 'strike';
    enemy.missileClock = 0;
    enemy.missilesFired = 0;
    enemy.gunCooldown = 100;
    const launchEnemyMissile = vi.fn();
    const fireEnemy = vi.fn();
    const battle = makeBattle(enemy, fireEnemy);
    battle.strikeTarget = new THREE.Vector3(4200, 300, 6100);
    battle.weaponAI.chooseHostileMissileSeeker = () => 'ir';
    battle.weaponAI.launchEnemyMissile = launchEnemyMissile;

    new HostileFighterAI(() => .99).updateJets(
      battle,
      1 / 60,
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
      { lockedTarget: null, incomingMissiles: [] },
    );

    expect(enemy.engagementTarget).toBeNull();
    expect(enemy.engagementTargetDomain).toBe('ground');
    expect(enemy.waypoint.x).toBeCloseTo(4200);
    expect(enemy.waypoint.z).toBeCloseTo(6100);
    expect(launchEnemyMissile).not.toHaveBeenCalled();
    expect(fireEnemy).not.toHaveBeenCalled();
  });

  it('turns an extending fighter back toward its selected air target', () => {
    const enemy = makeHostile(new THREE.Vector3(0, 300, 1000), 'extend');
    const ai = new HostileFighterAI(() => .99);
    const battle = makeBattle(enemy, vi.fn());

    ai.updateJets(battle, .25, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), {
      lockedTarget: null,
      incomingMissiles: [],
    });

    expect(enemy.heading).toBeLessThan(0);
  });

  it('fires cannon bursts at air targets after hostile missile stores are empty', () => {
    const enemy = makeHostile(new THREE.Vector3(0, 300, -2000));
    const fireEnemy = vi.fn();
    const ai = new HostileFighterAI(() => .99);
    const battle = makeBattle(enemy, fireEnemy);
    const forward = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3(1, 0, 0);
    const playerThreat = { lockedTarget: null, incomingMissiles: [] };

    ai.updateJets(battle, 1 / 60, forward, right, playerThreat);
    expect(enemy.missilesFired).toBe(DIFFICULTY_PRESETS.standard.fighter.missile.capacity);
    expect(enemy.burstShots).toBeGreaterThan(0);
    ai.updateJets(battle, .1, forward, right, playerThreat);

    expect(fireEnemy).toHaveBeenCalledWith(battle, enemy, battle.player, 'air');
  });

  it('holds a new hostile missile lock while the complication slot is occupied', () => {
    const enemy = makeHostile(new THREE.Vector3(0, 300, -4000));
    const fireEnemy = vi.fn();
    enemy.missileClock = 0;
    enemy.missilesFired = 0;
    enemy.gunCooldown = 100;
    const battle = makeBattle(enemy, fireEnemy);
    battle.canStartHostileMissileAttack = () => false;

    new HostileFighterAI(() => .5).updateJets(
      battle,
      1 / 60,
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
      { lockedTarget: null, incomingMissiles: [] },
    );

    expect(enemy.missileLockRemaining).toBeNull();
    expect(fireEnemy).not.toHaveBeenCalled();
  });
});
