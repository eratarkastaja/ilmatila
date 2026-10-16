import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GroundBattle } from '../../src/combat/ground-battle.js';

function makeSupportBattle() {
  const battle = Object.create(GroundBattle.prototype);
  const unit = { dead: false, role: 'artillery', armed: true, mesh: { position: new THREE.Vector3(0, 0, 0) } };
  const target = { dead: false, team: 'red', armed: true, mesh: { position: new THREE.Vector3(0, 0, 4000) } };
  battle.friends = [unit];
  battle.mlrsSalvosTotal = 2;
  battle.mlrsSalvosUsed = 0;
  battle.mlrsPending = null;
  battle.weaponAI = { fireMlrs: vi.fn() };
  battle.onOperationalEvent = vi.fn();
  return { battle, unit, target };
}

describe('GroundBattle campaign fire support', () => {
  it('accepts one live hostile target and consumes a salvo after the delay', () => {
    const { battle, unit, target } = makeSupportBattle();

    expect(battle.requestMlrsFire(target)).toEqual({ accepted: true });
    expect(battle.requestMlrsFire(target).accepted).toBe(false);
    battle.updateMlrsSupport(2.3);
    expect(battle.weaponAI.fireMlrs).not.toHaveBeenCalled();
    battle.updateMlrsSupport(.2);
    expect(battle.weaponAI.fireMlrs).toHaveBeenCalledWith(battle, unit, target);
    expect(battle.mlrsSalvosUsed).toBe(1);
  });

  it('allows exactly two salvos and then reports an empty fire mission store', () => {
    const { battle, target } = makeSupportBattle();

    expect(battle.requestMlrsFire(target).accepted).toBe(true);
    battle.updateMlrsSupport(2.4);
    expect(battle.mlrsSalvosUsed).toBe(1);

    expect(battle.requestMlrsFire(target).accepted).toBe(true);
    battle.updateMlrsSupport(2.4);
    expect(battle.mlrsSalvosUsed).toBe(2);
    expect(battle.requestMlrsFire(target)).toMatchObject({
      accepted: false,
      reasonKey: 'combat.mlrsRequestEmpty',
    });
  });

  it('cancels a pending mission when its target or battery is destroyed', () => {
    const first = makeSupportBattle();
    expect(first.battle.requestMlrsFire(first.target).accepted).toBe(true);
    first.target.dead = true;
    first.battle.updateMlrsSupport(2.4);
    expect(first.battle.weaponAI.fireMlrs).not.toHaveBeenCalled();
    expect(first.battle.mlrsSalvosUsed).toBe(0);

    const second = makeSupportBattle();
    expect(second.battle.requestMlrsFire(second.target).accepted).toBe(true);
    second.unit.dead = true;
    second.battle.updateMlrsSupport(2.4);
    expect(second.battle.weaponAI.fireMlrs).not.toHaveBeenCalled();
    expect(second.battle.mlrsSalvosUsed).toBe(0);
  });

  it('rejects friendly, dead, and out-of-range targets', () => {
    const { battle, target } = makeSupportBattle();
    expect(battle.requestMlrsFire({ ...target, team: 'blue' }).accepted).toBe(false);
    expect(battle.requestMlrsFire({ ...target, dead: true }).accepted).toBe(false);
    expect(battle.requestMlrsFire({ ...target, mesh: { position: new THREE.Vector3(0, 0, 19000) } }).accepted).toBe(false);
  });
});
