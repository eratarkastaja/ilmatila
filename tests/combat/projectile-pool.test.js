import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMissile, disposeMissilePool, releaseMissile } from '../../src/combat/projectiles.js';
import { ProjectileSystem } from '../../src/combat/projectile-system.js';
import { WeaponSystem } from '../../src/combat/weapon-system.js';

afterEach(() => disposeMissilePool());

describe('missile mesh pool', () => {
  it('reuses a released missile and resets its flight state', () => {
    const missile = createMissile('#d3d9d2');
    missile.position.set(100, 200, 300);
    missile.rotation.set(.2, .4, .6);
    missile.userData.engineFlame.visible = true;

    expect(releaseMissile(missile)).toBe(true);
    expect(missile.parent).toBeNull();
    expect(missile.visible).toBe(false);

    const reused = createMissile('#c5c5bc');
    expect(reused).toBe(missile);
    expect(reused.position.toArray()).toEqual([0, 0, 0]);
    expect(reused.rotation.toArray()).toEqual([0, 0, 0, 'XYZ']);
    expect(reused.userData.engineFlame.visible).toBe(false);
    expect(reused.userData.bodyMaterial.color.getHexString()).toBe('c5c5bc');
  });
});

describe('cannon round pool', () => {
  it('reuses a tracer round after the projectile system retires it', () => {
    const scene=new THREE.Scene();
    const player={position:new THREE.Vector3(),quaternion:new THREE.Quaternion()};
    const shots=[];
    const projectileSystem=new ProjectileSystem({scene,player,playerShots:shots});
    const weaponSystem=new WeaponSystem({
      player,scene,playerVelocity:new THREE.Vector3(),
      addProjectile:shot=>projectileSystem.addPlayerProjectile(shot),
    });

    weaponSystem.fireGun();
    const firstRound=shots.pop();
    projectileSystem.recycleProjectile(firstRound);
    weaponSystem.gunRoundCount=4;
    weaponSystem.fireGun();

    expect(shots[0]).toBe(firstRound);
    expect(shots[0].tracer).toBe(true);
    projectileSystem.dispose();
  });
});
