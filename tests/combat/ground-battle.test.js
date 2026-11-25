import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GroundBattle } from '../../src/combat/ground-battle.js';

describe('ground battle support visibility', () => {
  it('places the centered Virolahti battlefield near the theater midpoint', () => {
    const player = {
      position: new THREE.Vector3(0, 100, -6000),
      quaternion: new THREE.Quaternion(),
    };
    const battle = new GroundBattle({
      scene: new THREE.Scene(),
      player,
      playerVelocity: new THREE.Vector3(),
      terrain: { worldSize: 32000 },
      mission: {
        groundBattle: false,
        navigationDistance: 5000,
        battlefieldIngressOffset: 1000,
      },
    });

    expect(battle.battleCenter.x).toBe(0);
    expect(battle.battleCenter.z).toBe(0);
  });

  it('keeps support batteries visible beyond the ordinary vehicle cutoff', () => {
    const player = { position: new THREE.Vector3() };
    const support = { role: 'airDefense', mesh: new THREE.Group(), dead: false };
    const artillery = { role: 'artillery', mesh: new THREE.Group(), dead: false };
    const ordinary = { role: 'assault', mesh: new THREE.Group(), dead: false };
    support.mesh.position.set(0, 0, 10_000);
    artillery.mesh.position.set(0, 0, -10_000);
    ordinary.mesh.position.set(0, 0, 10_000);

    const battle = Object.create(GroundBattle.prototype);
    battle.player = player;
    battle.groundUnits = [support, artillery, ordinary];
    battle.groundVisibilityElapsed = .25;
    battle.updateMlrsSupport = vi.fn();
    battle.unitAI = { update: vi.fn() };

    battle.update(0);

    expect(support.mesh.visible).toBe(true);
    expect(artillery.mesh.visible).toBe(true);
    expect(ordinary.mesh.visible).toBe(false);
  });
});
