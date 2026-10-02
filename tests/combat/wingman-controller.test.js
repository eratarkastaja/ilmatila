import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DIFFICULTY_PRESETS } from '../../src/combat/difficulty.js';
import { WingmanController } from '../../src/combat/wingman-controller.js';

describe('WingmanController air combat', () => {
  it('keeps a wingman in a cannon attack when its air-to-air missiles are depleted', () => {
    const player = { position: new THREE.Vector3(0, 300, -10000), userData: {} };
    const targetMesh = new THREE.Object3D();
    targetMesh.position.set(0, 300, 0);
    const target = { mesh: targetMesh, velocity: new THREE.Vector3(), dead: false };
    const allyMesh = new THREE.Object3D();
    allyMesh.position.set(0, 300, -2000);
    const ally = {
      mesh: allyMesh,
      wing: -1,
      target,
      groundTarget: null,
      targetRefresh: 10,
      fireCooldown: 0,
      burstClock: 0,
      burstShots: 0,
      airMissiles: 0,
      airMissileCooldown: 0,
      groundMissiles: 0,
      groundMissileCooldown: 0,
      threatTarget: null,
      threatTimer: 0,
      defensiveTimer: 0,
      evasiveDirection: -1,
      evasiveTimer: 0,
      disengageTimer: 0,
      phase: 'extend',
      speed: 235,
      heading: 0,
      pitch: 0,
      velocity: new THREE.Vector3(0, 0, 235),
      waypoint: new THREE.Vector3(),
      steeringOffset: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      away: new THREE.Vector3(),
      separation: new THREE.Vector3(),
      lead: new THREE.Vector3(),
      leadOffset: new THREE.Vector3(),
    };
    const fireAlly = vi.fn();
    const battle = {
      player,
      playerVelocity: new THREE.Vector3(0, 0, 235),
      allies: [ally],
      enemies: [target],
      wingmanOrder: 'attack',
      difficulty: DIFFICULTY_PRESETS.standard,
      terrain: { sampleHeight: () => 0 },
      weaponAI: { fireAlly },
    };
    const controller = new WingmanController();

    controller.updateAllies(battle, 1 / 60, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
    controller.updateAllies(battle, 0.1, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));

    expect(ally.phase).toBe('attack');
    expect(ally.airMissiles).toBe(0);
    expect(fireAlly).toHaveBeenCalledWith(battle, ally, target);
  });
});
