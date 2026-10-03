import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GroundAirDefenseAI } from '../../src/combat/ground-air-defense-ai.js';
import { HelicopterAI } from '../../src/combat/helicopter-ai.js';

describe('hostile threat escalation', () => {
  it('shows ground AA tracking before the first burst', () => {
    const ai = new GroundAirDefenseAI(() => .5);
    const fireAntiAir = vi.spyOn(ai, 'fireAntiAir').mockImplementation(() => {});
    const unit = {
      mesh: new THREE.Group(),
      role: 'airDefense',
      aaCooldown: 1.6,
      aaBurstClock: 0,
      aaBurstRemaining: 0,
      aaTrackTimer: null,
      aaPlayerTracking: false,
    };
    unit.mesh.position.set(0, 0, -1000);
    unit.mesh.userData.platform = 'bmp2';
    const battle = {
      airDefenseActive: true,
      player: { position: new THREE.Vector3(0, 300, 0) },
      terrain: { sampleHeight: () => 0 },
      difficulty: { groundAA: { maxRange: 1850, altitudeScale: 1 } },
    };

    ai.updateAntiAir(battle, unit, .2);
    expect(unit.aaPlayerTracking).toBe(true);
    expect(unit.aaTrackTimer).toBe(1.5);
    expect(fireAntiAir).not.toHaveBeenCalled();

    ai.updateAntiAir(battle, unit, 1.49);
    expect(unit.aaPlayerTracking).toBe(true);
    expect(fireAntiAir).not.toHaveBeenCalled();

    ai.updateAntiAir(battle, unit, .02);
    expect(unit.aaPlayerTracking).toBe(false);
    expect(fireAntiAir).toHaveBeenCalled();
  });

  it('gives an attack helicopter a missile seeker warning before launch', () => {
    const ai = new HelicopterAI(() => .5);
    const enemy = {
      mesh: new THREE.Group(),
      direction: new THREE.Vector3(),
      steeringOffset: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      waypoint: new THREE.Vector3(),
      lead: new THREE.Vector3(),
      leadOffset: new THREE.Vector3(),
      heading: 0,
      pitch: 0,
      speed: 70,
      orbitPhase: 0,
      targetRefreshTimer: 100,
      rocketCooldown: 100,
      airMissileCooldown: 0,
      airToAirMissilesRemaining: 1,
      airMissileLockRemaining: null,
    };
    enemy.mesh.position.set(0, 300, -3000);
    enemy.mesh.userData.mainRotor = new THREE.Group();
    enemy.mesh.userData.tailRotor = new THREE.Group();
    const fireHelicopterAirMissile = vi.fn();
    const battle = {
      player: { position: new THREE.Vector3(0, 300, 0) },
      playerVelocity: new THREE.Vector3(),
      friendlyGroundUnits: [],
      terrain: { worldSize: 32000, sampleHeight: () => 0 },
      weaponAI: { fireHelicopterAirMissile },
    };
    const restoreFiringSolution = () => {
      enemy.mesh.position.set(0, 300, -3000);
      enemy.mesh.rotation.set(0, 0, 0);
      enemy.heading = 0;
      enemy.pitch = 0;
      enemy.speed = 70;
    };

    restoreFiringSolution();
    ai.updateAttackHelicopter(battle, enemy, 0, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
    expect(enemy.airMissileLockRemaining).toBe(2.5);
    expect(fireHelicopterAirMissile).not.toHaveBeenCalled();

    for (let index = 0; index < 4; index++) {
      restoreFiringSolution();
      ai.updateAttackHelicopter(battle, enemy, .5, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
      expect(enemy.airMissileLockRemaining).toBeGreaterThan(0);
      expect(fireHelicopterAirMissile).not.toHaveBeenCalled();
    }

    restoreFiringSolution();
    ai.updateAttackHelicopter(battle, enemy, .5, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
    expect(fireHelicopterAirMissile).toHaveBeenCalledOnce();
    expect(enemy.airMissileLockRemaining).toBeNull();
  });

  it('reports lock and ground tracking as distinct RWR warning states', async () => {
    const previousDocument = globalThis.document;
    if (!previousDocument) {
      globalThis.document = {
        createElement: () => ({
          getContext: () => ({
            createRadialGradient: () => ({ addColorStop() {} }),
            fillRect() {},
          }),
        }),
      };
    }
    const { CombatWorld } = await import('../../src/combat/world.js');
    if (!previousDocument) delete globalThis.document;
    const player = {};
    const warningState = state => CombatWorld.prototype.getPlayerRadarWarningState.call({
      player,
      enemies: [],
      redUnits: [],
      ...state,
    });

    expect(warningState({
      enemies: [{ identified: true, missileLockRemaining: .5, phase: 'inbound' }],
    })).toBe('lock');
    expect(warningState({
      enemies: [{ identified: true, missileLockRemaining: .5, missileLockSeeker: 'ir', phase: 'inbound' }],
    })).toBe('irLock');
    expect(warningState({
      enemies: [{ identified: true, missileLockRemaining: .5, missileLockTarget: {}, phase: 'inbound' }],
    })).toBeNull();
    expect(warningState({
      enemies: [{ identified: false, missileLockRemaining: .5, phase: 'inbound' }],
    })).toBeNull();
    expect(warningState({
      redUnits: [{ dead: false, aaPlayerTracking: true }],
    })).toBe('groundTrack');
  });
});
