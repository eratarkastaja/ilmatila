import * as THREE from 'three';
import { createMissile, MISSILE_PROFILES } from '../combat/projectiles.js';

const forward = new THREE.Vector3(0, 0, 1);
const gunDirection = new THREE.Vector3();
const effectPosition = new THREE.Vector3();

/** Repeatable development-only combat load used for browser profiling. */
export class CombatStressScenario {
  constructor({ combat, scene, player, renderer }) {
    this.combat = combat;
    this.scene = scene;
    this.player = player;
    this.renderer = renderer;
    this.originalDestroyPlayer = combat.destroyPlayer;
    this.preventedDeaths = 0;
    combat.destroyPlayer = () => { this.preventedDeaths++; };
    this.gunClock = 0;
    this.missileClock = 0;
    this.effectClock = 0;
    this.sparkClock = 0;
    this.missileIndex = 0;
    this.started = performance.now();
    this.active = true;
    this._lastSample = this.started;
    this._sampleCount = 0;
    this._sampleCursor = 0;
    this._frameSamples = new Float32Array(2400);
    this.cleanupProbeClock=0;
    this.cleanupProbed=false;
    this.cleanupProbeAt=0;
    this.geometryStart=null;
    this.geometryPeak=0;
    this.geometryAfterCleanup=null;
    this.geometryPostCleanup=null;
    this.geometryBeforeCleanup=null;
  }

  update(dt) {
    if (!this.active) return;
    this.gunClock += dt;
    this.missileClock += dt;
    this.effectClock += dt;
    this.sparkClock += dt;
    this.cleanupProbeClock+=dt;

    if(!this.cleanupProbed&&this.cleanupProbeClock>=7){
      this.cleanupProbed=true;
      this.cleanupProbeAt=performance.now();
      this.geometryBeforeCleanup=this.renderer.info.memory.geometries;
      const enemy=this.combat.enemies.find(unit=>!unit.dead);
      const ground=this.combat.redUnits.find(unit=>!unit.dead);
      if(enemy)this.combat.killJet(enemy,false);
      if(ground)this.combat.destroyUnit(ground);
      this.geometryAfterCleanup=this.renderer.info.memory.geometries;
    }

    // About 64 cannon rounds per second, above the normal firing rate.
    while (this.gunClock >= 1 / 64) {
      this.combat.weaponSystem.fireGun();
      this.gunClock -= 1 / 64;
    }

    while (this.missileClock >= .85) {
      this.fireMissile();
      this.missileClock -= .85;
    }

    while (this.effectClock >= .34) {
      effectPosition.copy(this.player.position).add(
        this._offset.set((Math.random() - .5) * 900, (Math.random() - .5) * 360, 300 + Math.random() * 1100),
      );
      this.combat.addExplosion(effectPosition, .72 + Math.random() * .55);
      this.effectClock -= .34;
    }

    while (this.sparkClock >= .08) {
      effectPosition.copy(this.player.position).add(
        this._offset.set((Math.random() - .5) * 1100, (Math.random() - .5) * 420, 150 + Math.random() * 1000),
      );
      this.combat.addSpark(effectPosition);
      this.sparkClock -= .08;
    }
  }

  _offset = new THREE.Vector3();

  fireMissile() {
    const enemies = this.combat.enemies;
    if (!enemies.length) return;
    const target = enemies[this.missileIndex++ % enemies.length];
    if (target.dead) return;

    const mesh = createMissile('#d3d9d2');
    const direction = gunDirection.copy(target.mesh.position).sub(this.player.position).normalize();
    mesh.position.copy(this.player.position).addScaledVector(direction, 5);
    mesh.quaternion.setFromUnitVectors(forward, direction);
    this.scene.add(mesh);
    if (mesh.userData.engineFlame) mesh.userData.engineFlame.visible = true;
    const profile = MISSILE_PROFILES.playerAir;
    this.combat.projectileSystem.addPlayerProjectile({
      mesh,
      velocity: direction.clone().multiplyScalar(profile.speed),
      speed: profile.speed,
      life: profile.life,
      burnRemaining: profile.burnTime,
      coastDrag: profile.coastDrag,
      motorBurning: true,
      guidanceActive: true,
      damage: profile.damage,
      homing: true,
      target,
      targetDomain: 'air',
      seeker: profile.seeker,
      decoyTarget: null,
      decoyAttempts: new Set(),
      trail: 0,
    });
  }

  recordFrame(now) {
    if (!this.active) return;
    if (this._lastSample > 0) {
      this._frameSamples[this._sampleCursor] = now - this._lastSample;
      this._sampleCursor = (this._sampleCursor + 1) % this._frameSamples.length;
      this._sampleCount = Math.min(this._sampleCount + 1, this._frameSamples.length);
    }
    this._lastSample = now;
    const geometries=this.renderer.info.memory.geometries;
    if(this.geometryStart===null&&now-this.started>1500)this.geometryStart=geometries;
    this.geometryPeak=Math.max(this.geometryPeak,geometries);
    if(this.cleanupProbed&&this.geometryPostCleanup===null&&now-this.cleanupProbeAt>1000)this.geometryPostCleanup=geometries;
  }

  snapshot() {
    const samples = Array.from(this._frameSamples.subarray(0, this._sampleCount)).sort((a, b) => a - b);
    const percentile = value => samples[Math.min(samples.length - 1, Math.floor(samples.length * value))] ?? 0;
    const frameTime = percentile(.5);
    const maxFrameTime = percentile(.95);
    return {
      seconds: (performance.now() - this.started) / 1000,
      fps: frameTime > 0 ? 1000 / frameTime : 0,
      frameMsMedian: frameTime,
      frameMsP95: maxFrameTime,
      frameSamples: samples.length,
      enemies: this.combat.enemies.length,
      allies: this.combat.allies.length,
      groundUnits: this.combat.friends.length + this.combat.redUnits.length,
      playerProjectiles: this.combat.playerShots.length,
      hostileProjectiles: this.combat.hostiles.length,
      effects: this.combat.effects.length,
      destroyedAircraft: this.combat.enemies.reduce((count,unit)=>count+(unit.dead?1:0),0),
      destroyedGroundUnits: this.combat.redUnits.reduce((count,unit)=>count+(unit.dead?1:0),0),
      cleanupProbe: this.cleanupProbed,
      geometryCountStart: this.geometryStart,
      geometryCountPeak: this.geometryPeak,
      geometryCountAfterCleanup: this.geometryAfterCleanup,
      geometryCountPostCleanup: this.geometryPostCleanup,
      geometryCountBeforeCleanup: this.geometryBeforeCleanup,
      particles: this.combat.fx?.maxParticles ?? 0,
      renderer: { ...this.renderer.info.render },
      gpuResources: { ...this.renderer.info.memory },
    };
  }

  stop() {
    this.active = false;
    this.combat.destroyPlayer = this.originalDestroyPlayer;
  }
}
