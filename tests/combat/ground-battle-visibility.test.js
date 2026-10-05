import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GroundBattle } from '../../src/combat/ground-battle.js';

function makeBattle(units) {
  const battle = Object.create(GroundBattle.prototype);
  battle.player = { position: new THREE.Vector3() };
  battle.groundUnits = units;
  battle.groundVisibilityElapsed = 0.25;
  battle.unitAI = { update: vi.fn() };
  return battle;
}

describe('GroundBattle rendering distance', () => {
  it('hides distant vehicle models while leaving nearby models visible', () => {
    const nearby = { dead: false, mesh: { position: new THREE.Vector3(2_000, 0, 0), visible: true } };
    const distant = { dead: false, mesh: { position: new THREE.Vector3(8_001, 0, 0), visible: true } };
    const battle = makeBattle([nearby, distant]);

    battle.update(0);

    expect(nearby.mesh.visible).toBe(true);
    expect(distant.mesh.visible).toBe(false);
    expect(battle.unitAI.update).toHaveBeenCalledWith(battle, 0);
  });

  it('restores a vehicle model when the player moves back into range', () => {
    const vehicle = { dead: false, mesh: { position: new THREE.Vector3(9_000, 0, 0), visible: true } };
    const battle = makeBattle([vehicle]);

    battle.update(0);
    expect(vehicle.mesh.visible).toBe(false);

    battle.player.position.set(2_000, 0, 0);
    battle.groundVisibilityElapsed = 0;
    battle.update(0.25);

    expect(vehicle.mesh.visible).toBe(true);
  });

  it('keeps removed wrecks untouched by visibility updates', () => {
    const destroyed = { dead: true, mesh: { position: new THREE.Vector3(), visible: true } };
    const battle = makeBattle([destroyed]);

    battle.update(0);

    expect(destroyed.mesh.visible).toBe(true);
  });
});
