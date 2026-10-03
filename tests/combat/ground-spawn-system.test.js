import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GroundSpawnSystem } from '../../src/combat/ground-spawn-system.js';
import { disposeGroundVehicleVisual } from '../../src/ground/vehicles.js';

describe('support ground target roles', () => {
  let battle;

  afterEach(() => {
    for (const unit of battle?.groundUnits ?? [...(battle?.friends ?? []), ...(battle?.redUnits ?? [])]) {
      disposeGroundVehicleVisual(unit.mesh);
    }
    battle = null;
  });

  it('places one marked reinforcement relay at the center of the logistics convoy', () => {
    battle = {
      mission: {
        id: 'support', groundBattle: true, groundPairs: 1, groundTrucks: 3,
        groundFriendlyTrucks: 0, groundFrontSpan: 5000, convoyArea: 4000,
        groundIto90Count: 0, groundShilkaCount: 1,
      },
      random: () => .5,
      terrain: { worldSize: 32000, sampleHeight: () => 0, isWater: () => false },
      battleCenter: new THREE.Vector3(0, 0, 0),
      routeForward: new THREE.Vector3(0, 0, 1),
      routeRight: new THREE.Vector3(1, 0, 0),
      scene: new THREE.Scene(),
      friends: [],
      redUnits: [],
      colliders: [],
      difficulty: {},
    };

    new GroundSpawnSystem().spawn(battle);

    const relays = battle.redUnits.filter(unit => unit.reinforcementSource);
    expect(relays).toHaveLength(1);
    expect(relays[0].role).toBe('logistics');
    expect(relays[0].missionTargetRoleKey).toBe('combat.groundTargetRole.logistics');
    expect(relays[0].mesh.position.x).toBeCloseTo(battle.battleCenter.x);
    expect(battle.redUnits.filter(unit => unit.role === 'logistics')).toHaveLength(3);
    expect(battle.redUnits.find(unit => unit.role === 'assault').missionTargetRoleKey)
      .toBe('combat.groundTargetRole.armor');
    expect(battle.redUnits.find(unit => unit.role === 'airDefense').missionTargetRoleKey)
      .toBe('combat.groundTargetRole.airDefense');
  });
});
