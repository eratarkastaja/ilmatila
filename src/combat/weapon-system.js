import * as THREE from 'three';
import { createMissile, MISSILE_PROFILES } from './projectiles.js';
import {
  GUN_PROJECTILE_GRAVITY,
  GUN_PROJECTILE_LIFETIME,
  GUN_PROJECTILE_SPEED,
  GUN_ROUNDS_PER_SECOND,
} from './ballistics.js';

const gunTracerRoundGeo = new THREE.CylinderGeometry(.004, .012, .16, 6);
const gunTracerRoundMaterial = new THREE.MeshBasicMaterial({ color: '#ffc45e', toneMapped: false });
const forward = new THREE.Vector3(0, 0, 1);
const localRight = new THREE.Vector3(1, 0, 0);
const localUp = new THREE.Vector3(0, 1, 0);
const localBulletAxis = new THREE.Vector3(0, 1, 0);

/** Owns trigger cadence, weapon selection gates, ammunition and launch feedback. */
export class WeaponSystem {
  constructor({ player, scene, fx, audio, radar, playerVelocity, addProjectile }) {
    this.player = player;
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.radar = radar;
    this.playerVelocity = playerVelocity;
    this.addProjectile = addProjectile;
    this.missiles = { air: MISSILE_PROFILES.playerAir.count, ground: MISSILE_PROFILES.playerGround.count };
    this.cooldown = 0;
    this.gunClock = 0;
    this.gunRoundCount = 0;
    this.missileFeedbackKey = null;
    this.missileFeedbackTimer = 0;
  }

  update(dt, { gunFiring = false, missileRequested = false } = {}) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.missileFeedbackTimer = Math.max(0, this.missileFeedbackTimer - dt);
    this.audio?.setGunFiring(gunFiring);
    if (gunFiring) {
      this.gunClock -= dt;
      let roundsThisFrame = 0;
      while (this.gunClock <= 0 && roundsThisFrame < 3) {
        this.fireGun();
        this.gunClock += 1 / GUN_ROUNDS_PER_SECOND;
        roundsThisFrame++;
      }
    } else {
      this.gunClock = 0;
    }
    if (missileRequested) this.requestMissile();
  }

  stopGun() {
    this.audio?.setGunFiring(false);
    this.gunClock = 0;
  }

  clearFeedback() {
    this.missileFeedbackKey = null;
    this.missileFeedbackTimer = 0;
  }

  showFeedback(key, duration) {
    this.missileFeedbackKey = key;
    this.missileFeedbackTimer = duration;
    this.audio?.playWeaponNoLock();
  }

  fireGun() {
    const attitude = this.player.quaternion;
    const direction = forward.clone().applyQuaternion(attitude).normalize();
    const right = localRight.clone().applyQuaternion(attitude).normalize();
    const up = localUp.clone().applyQuaternion(attitude).normalize();
    direction
      .addScaledVector(right, (Math.random() - .5) * .0009)
      .addScaledVector(up, (Math.random() - .5) * .0009)
      .normalize();
    const muzzleOffset = new THREE.Vector3(-.78, .38, 2.65).applyQuaternion(attitude);
    const start = this.player.position.clone().add(muzzleOffset);
    const velocity = direction.multiplyScalar(GUN_PROJECTILE_SPEED).add(this.playerVelocity);
    const tracer = this.gunRoundCount++ % 4 === 0;
    const shot = tracer ? new THREE.Mesh(gunTracerRoundGeo, gunTracerRoundMaterial) : new THREE.Object3D();
    shot.position.copy(start);
    if (tracer) {
      shot.quaternion.setFromUnitVectors(localBulletAxis, velocity.clone().normalize());
      this.scene.add(shot);
      this.fx?.addMovingTracer(start, velocity, '#ffd282', {
        life: .14, trailTime: .06, gravity: GUN_PROJECTILE_GRAVITY,
      });
    }
    this.addProjectile({
      mesh: shot, velocity, life: GUN_PROJECTILE_LIFETIME, damage: .34,
      ballistic: true, gravity: GUN_PROJECTILE_GRAVITY, tracer,
    });
  }

  fireMissile() {
    if (!this.radar.target || this.radar.target.dead) return false;
    const targetDomain = this.radar.targetDomain;
    const missileProfile = targetDomain === 'ground' ? MISSILE_PROFILES.playerGround : MISSILE_PROFILES.playerAir;
    this.missiles[targetDomain]--;
    this.cooldown = 2.8;
    this.clearFeedback();
    const direction = forward.clone().applyQuaternion(this.player.quaternion).normalize();
    const mesh = createMissile('#d3d9d2');
    mesh.position.copy(this.player.position).addScaledVector(direction, 5);
    mesh.quaternion.setFromUnitVectors(forward, direction);
    this.scene.add(mesh);
    this.audio?.playMissileLaunch();
    this.audio?.startMissileFlight(mesh.id);
    if (mesh.userData.engineFlame) mesh.userData.engineFlame.visible = true;
    this.addProjectile({
      mesh,
      velocity: direction.clone().multiplyScalar(missileProfile.speed),
      speed: missileProfile.speed,
      life: missileProfile.life,
      burnRemaining: missileProfile.burnTime,
      coastDrag: missileProfile.coastDrag,
      motorBurning: true,
      guidanceActive: true,
      damage: missileProfile.damage,
      homing: true,
      target: this.radar.target,
      targetDomain,
      seeker: missileProfile.seeker,
      decoyTarget: null,
      decoyAttempts: new Set(),
      trail: 0,
    });
    return true;
  }

  requestMissile() {
    const mode = this.radar.mode;
    if (this.cooldown > 0 || this.missiles[mode] <= 0) {
      this.audio?.playWeaponNoLock();
      return false;
    }
    if (!this.radar.target || this.radar.target.dead) {
      this.showFeedback('combat.aimAtHostile', 1.5);
      return false;
    }
    if (!this.radar.inLockEnvelope) {
      this.showFeedback('combat.outOfRange', 1.5);
      return false;
    }
    if (!this.radar.lockCueConfirmed) {
      this.showFeedback('combat.lockNotReady', 1.3);
      return false;
    }
    return this.fireMissile();
  }
}
