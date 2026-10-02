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
});
