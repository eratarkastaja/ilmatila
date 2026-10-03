import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DIFFICULTY_PRESETS } from '../../src/combat/difficulty.js';
import { WingmanController } from '../../src/combat/wingman-controller.js';

describe('WingmanController air combat', () => {
  it('warns and evades for an inbound missile without turning its rescue window into a death timer', () => {
    const controller = new WingmanController();
    const ally = {
      mesh: new THREE.Object3D(),
      radioId: 'wingman2',
      wing: 1,
      heading: 0,
      evasiveDirection: 1,
      defensiveTimer: 0,
      rescueTimer: 0,
      rescueLockActive: false,
      rescueMissile: null,
      rescueAttacker: null,
      rescueHighlight: false,
      dead: false,
    };
    const attacker = { mesh: new THREE.Object3D(), label: 'MiG-29', dead: false };
    attacker.mesh.position.set(300, 300, 0);
    const missile = {
      missile: true,
      life: 10,
      target: ally,
      sourceUnit: attacker,
      mesh: new THREE.Object3D(),
    };
    missile.mesh.position.set(100, 300, 0);
    const onWingmanRadio = vi.fn();
    const battle = { hostileProjectiles: [missile], onWingmanRadio };

    controller.beginMissileLock(battle, ally, attacker);
    expect(ally.rescueHighlight).toBe(true);
    expect(attacker.rescueHighlight).toBe(true);
    expect(onWingmanRadio).toHaveBeenLastCalledWith('missileLock', ally, expect.objectContaining({
      params: { attacker: 'MiG-29' },
    }));

    battle.hostileProjectiles.length = 0;
    ally.defensiveTimer = .01;
    controller.updateMissileDefense(battle, ally, 1);
    expect(ally.defensiveTimer).toBeCloseTo(.7);
    expect(ally.rescueTimer).toBe(13);

    battle.hostileProjectiles.push(missile);
    controller.reportMissileInbound(battle, ally, attacker, missile);
    controller.updateMissileDefense(battle, ally, 1);
    expect(ally.rescueTimer).toBe(13);
    expect(ally.defensiveTimer).toBeGreaterThan(0);
    expect(ally.evasiveDirection).toBe(-1);
    expect(onWingmanRadio).toHaveBeenLastCalledWith('rescueMissileInbound', ally, expect.objectContaining({
      params: { attacker: 'MiG-29' },
    }));

    controller.updateMissileDefense(battle, ally, 14);
    expect(ally.dead).toBe(false);
    expect(ally.rescueHighlight).toBe(true);

    battle.hostileProjectiles.length = 0;
    controller.updateMissileDefense(battle, ally, 0);
    expect(ally.rescueHighlight).toBe(false);
    expect(attacker.rescueHighlight).toBe(false);
    expect(ally.dead).toBe(false);
  });

  it('uses the disengage order for a wider break while a missile lock is active', () => {
    const controller = new WingmanController();
    const player = new THREE.Group();
    player.position.set(0, 300, -10000);
    const ally = {
      mesh: new THREE.Group(), wing: -1, heading: 0, pitch: 0, speed: 235,
      velocity: new THREE.Vector3(0, 0, 235), direction: new THREE.Vector3(0, 0, 1),
      waypoint: new THREE.Vector3(), steeringOffset: new THREE.Vector3(), away: new THREE.Vector3(),
      separation: new THREE.Vector3(), lead: new THREE.Vector3(), leadOffset: new THREE.Vector3(),
      target: null, groundTarget: null, targetRefresh: 0, fireCooldown: 0, burstClock: 0, burstShots: 0,
      airMissiles: 0, airMissileCooldown: 0, groundMissiles: 0, groundMissileCooldown: 0,
      threatTarget: null, threatTimer: 0, defensiveTimer: 0, evasiveDirection: -1,
      disengageTimer: 0, rescueLockActive: true, rescueMissile: null, rescueTimer: 14,
      rescueAttacker: { dead: false, mesh: new THREE.Group() }, rescueHighlight: true,
      phase: 'formation', dead: false,
    };
    const battle = {
      player,
      playerVelocity: new THREE.Vector3(0, 0, 235),
      allies: [ally],
      enemies: [],
      hostileProjectiles: [],
      wingmanOrder: 'disengage',
      terrain: { worldSize: 32000, sampleHeight: () => 0 },
      difficulty: DIFFICULTY_PRESETS.standard,
      weaponAI: {},
    };

    controller.updateAllies(battle, 0, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));

    expect(ally.waypoint.z).toBeGreaterThan(2400);
    expect(ally.waypoint.x).toBeLessThan(-1000);
  });

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
