import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GroundWeaponSystem } from '../../src/combat/ground-weapon-system.js';
import { createGroundVehicle, disposeGroundVehicleVisual } from '../../src/ground/vehicles.js';

describe('GroundWeaponSystem', () => {
  let vehicles = [];

  afterEach(() => {
    for (const vehicle of vehicles) disposeGroundVehicleVisual(vehicle);
    vehicles = [];
  });

  it('fires a six-rocket RSRAKH salvo with area-damage payloads', () => {
    const scene = new THREE.Scene();
    const unitMesh = createGroundVehicle('rsrakh06', 'finnish');
    const targetMesh = createGroundVehicle('t72', 'russian');
    vehicles.push(unitMesh, targetMesh);
    unitMesh.position.set(0, 0, 0);
    targetMesh.position.set(0, 0, 3600);
    scene.add(unitMesh, targetMesh);
    const addFriendlyProjectile = vi.fn();
    const battle = {
      scene,
      player: { position: new THREE.Vector3() },
      audio: { playDistantGun: vi.fn() },
      addFriendlyProjectile,
    };
    const unit = {
      mesh: unitMesh,
      team: 'blue',
    };
    const target = {
      mesh: targetMesh,
      velocity: new THREE.Vector3(),
    };

    new GroundWeaponSystem(() => .5).fireMlrs(battle, unit, target);

    expect(addFriendlyProjectile).toHaveBeenCalledTimes(6);
    expect(addFriendlyProjectile.mock.calls.every(([shot]) => shot.mlrs && shot.ally)).toBe(true);
    expect(addFriendlyProjectile.mock.calls.every(([shot]) => shot.damage === 3.5 && shot.splashDamage === 4.8))
      .toBe(true);
    expect(addFriendlyProjectile.mock.calls.every(([shot]) => shot.blastRadius === 260)).toBe(true);
  });
});
