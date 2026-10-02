import * as THREE from 'three';
import { DIFFICULTY_PRESETS } from './difficulty.js';

const flareDecoyGeo = new THREE.SphereGeometry(.3, 8, 6);
const flareDecoyMaterial = new THREE.MeshBasicMaterial({ color: '#fff0b4', toneMapped: false });
const flarePlumeGeo = new THREE.ConeGeometry(.36, 2.25, 8, 1);
const flarePlumeMaterial = new THREE.MeshBasicMaterial({
  color: '#ff6a24', transparent: true, opacity: .74,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
});
const flareInnerPlumeGeo = new THREE.ConeGeometry(.16, 1.45, 7, 1);
const flareInnerPlumeMaterial = new THREE.MeshBasicMaterial({
  color: '#ffd16c', transparent: true, opacity: .9,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
});
const localForward = new THREE.Vector3(0, 0, 1);
const localRight = new THREE.Vector3(1, 0, 0);
const localUp = new THREE.Vector3(0, 1, 0);
const stationaryVelocity = new THREE.Vector3();
const flareParticleColor = new THREE.Color('#ffe4a0');
const flareSmokeColor = new THREE.Color('#756458');
const chaffParticleColor = new THREE.Color('#9aa9a7');

function addFlareBundle(cloud, addTransientGlow, random = Math.random) {
  for (let i = 0; i < 3; i++) {
    const offset = new THREE.Vector3((i - 1) * 1.35, (random() - .5) * .7, (random() - .5) * .8);
    const scale = .82 + random() * .28;

    const plume = new THREE.Mesh(flarePlumeGeo, flarePlumeMaterial);
    plume.position.copy(offset).addScaledVector(localForward, -1.1 * scale);
    plume.rotation.x = -Math.PI / 2;
    plume.scale.setScalar(scale);
    plume.userData.flarePlume = true;
    cloud.add(plume);

    const innerPlume = new THREE.Mesh(flareInnerPlumeGeo, flareInnerPlumeMaterial);
    innerPlume.position.copy(offset).addScaledVector(localForward, -.72 * scale);
    innerPlume.rotation.x = -Math.PI / 2;
    innerPlume.scale.setScalar(scale);
    innerPlume.userData.flarePlume = true;
    cloud.add(innerPlume);

    const core = new THREE.Mesh(flareDecoyGeo, flareDecoyMaterial);
    core.position.copy(offset);
    core.scale.set(.78, .78, 1.05).multiplyScalar(scale);
    cloud.add(core);

    const glow = addTransientGlow(cloud, '#fff0c0', 8.5 + random() * 2.5, .94);
    glow.position.copy(offset);
    glow.userData.baseSize = glow.scale.x;
    glow.userData.flareGlow = true;
    glow.userData.flickerPhase = random() * Math.PI * 2;
  }
}

function disposeTransientMaterials(object) {
  object.traverse(child => {
    if (child.material?.userData?.transient) child.material.dispose();
  });
}

/** Owns player and hostile countermeasure inventory, effects and cleanup. */
export class CountermeasureSystem {
  constructor({
    scene, player, playerVelocity, fx, audio, decoys = [], playerShots = [], hostileShots = [],
    hostileAircraft = [], addTransientGlow, onInventoryChange = () => {}, initialCount = 12,
    chaffConfig = DIFFICULTY_PRESETS.standard.player.chaff, random = Math.random,
  }) {
    this.scene = scene;
    this.player = player;
    this.playerVelocity = playerVelocity;
    this.fx = fx;
    this.audio = audio;
    this.decoys = decoys;
    this.playerShots = playerShots;
    this.hostileShots = hostileShots;
    this.hostileAircraft = hostileAircraft;
    this.addTransientGlow = addTransientGlow;
    this.random = random;
    this._drift=new THREE.Vector3();
    this._jitter=new THREE.Vector3();
    this._orientation=new THREE.Vector3();
    this._chaffPosition = new THREE.Vector3();
    this._chaffOrigin = new THREE.Vector3();
    this._chaffVelocity = new THREE.Vector3();
    this._chaffRear = new THREE.Vector3();
    this._chaffRight = new THREE.Vector3();
    this._chaffUp = new THREE.Vector3();
    this.onInventoryChange = onInventoryChange;
    this.chaffConfig = chaffConfig;
    this.telemetry = null;
    this.flares = initialCount;
    this.chaff = chaffConfig.count;
    this.cooldown = 0;
    this.chaffCooldown = 0;
    this.chaffDeploymentCount = 0;
    this.lastPlayerDeployment = 'ready';
    this.lastChaffDeployment = 'ready';
  }

  tick(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.chaffCooldown = Math.max(0, this.chaffCooldown - dt);
  }

  setTelemetry(telemetry) {
    this.telemetry = telemetry;
  }

  deployPlayer() {
    return this.deployFlare();
  }

  get countermeasures() {
    return this.flares;
  }

  set countermeasures(value) {
    this.flares = value;
  }

  deployFlare() {
    if (this.cooldown > 0) {
      this.lastPlayerDeployment = 'rearming';
      this.playUnavailableCue();
      this.onInventoryChange();
      return false;
    }
    if (this.flares <= 0) {
      this.lastPlayerDeployment = 'empty';
      this.playUnavailableCue();
      this.onInventoryChange();
      return false;
    }
    this.lastPlayerDeployment = 'deployed';
    this.flares--;
    this.cooldown = .85;
    const attitude = this.player.quaternion;
    const rear = localForward.clone().negate().applyQuaternion(attitude).normalize();
    const right = localRight.clone().applyQuaternion(attitude).normalize();
    const up = localUp.clone().applyQuaternion(attitude).normalize();

    const flareVelocity = this.playerVelocity.clone().addScaledVector(rear, 115)
      .addScaledVector(right, (this.random() - .5) * 18).addScaledVector(up, 18);
    const flareCloud = new THREE.Group();
    flareCloud.position.copy(this.player.position).addScaledVector(rear, 6);
    flareCloud.quaternion.setFromUnitVectors(localForward, this._orientation.copy(flareVelocity).normalize());
    addFlareBundle(flareCloud, this.addTransientGlow, this.random);
    this.scene.add(flareCloud);
    this.decoys.push({
      team: 'player', source: this.player, type: 'ir', mesh: flareCloud, position: flareCloud.position,
      previousPosition: flareCloud.position.clone(),
      velocity: flareVelocity,
      life: 2.7, maxLife: 2.7, active: true, age: 0, trailClock: 0, spoofChance: .62,
    });
    this.audio?.playCountermeasure();
    this.telemetry?.recordCountermeasureUse('player', 'flare');
    this.onInventoryChange();
    return true;
  }

  deployChaff() {
    if (this.cooldown > 0 || this.chaffCooldown > 0) {
      this.lastChaffDeployment = 'rearming';
      this.lastPlayerDeployment = 'rearming';
      this.playUnavailableCue();
      this.onInventoryChange();
      return false;
    }
    if (this.chaff <= 0) {
      this.lastChaffDeployment = 'empty';
      this.lastPlayerDeployment = 'empty';
      this.playUnavailableCue();
      this.onInventoryChange();
      return false;
    }

    this.lastChaffDeployment = 'deployed';
    this.lastPlayerDeployment = 'deployed';
    this.chaff--;
    this.cooldown = .85;
    this.chaffCooldown = this.chaffConfig.cooldown;
    this.emitChaffEffect();
    this.chaffDeploymentCount++;
    this.telemetry?.recordCountermeasureUse('player', 'chaff');
    this.interfereWithRadarTracks();
    this.interfereWithRadarMissiles();
    if (this.audio?.playChaffCountermeasure) this.audio.playChaffCountermeasure();
    else this.audio?.playCountermeasure();
    this.onInventoryChange();
    return true;
  }

  playUnavailableCue() {
    if (this.audio?.playCountermeasureUnavailable) this.audio.playCountermeasureUnavailable();
    else this.audio?.playWeaponNoLock();
  }

  emitChaffEffect() {
    if (!this.fx?.emitParticle) return;
    const attitude = this.player.quaternion;
    const rear = this._chaffRear.set(0, 0, -1).applyQuaternion(attitude).normalize();
    const right = this._chaffRight.set(1, 0, 0).applyQuaternion(attitude).normalize();
    const up = this._chaffUp.set(0, 1, 0).applyQuaternion(attitude).normalize();
    this._chaffOrigin.copy(this.player.position).addScaledVector(rear, 4);
    for (let i = 0; i < 14; i++) {
      const offset = this._jitter.set(
        (this.random() - .5) * 8,
        (this.random() - .5) * 5,
        (this.random() - .5) * 8,
      );
      const velocity = this._chaffVelocity.copy(this.playerVelocity)
        .addScaledVector(rear, 32 + this.random() * 36)
        .addScaledVector(right, (this.random() - .5) * 38)
        .addScaledVector(up, (this.random() - .5) * 24);
      this._chaffPosition.copy(this._chaffOrigin).add(offset);
      this.fx.emitParticle(
        this._chaffPosition,
        velocity,
        chaffParticleColor,
        .8 + this.random() * .45,
        1.1 + this.random() * .8,
        .38 + this.random() * .2,
        0,
      );
    }
  }

  interfereWithRadarTracks() {
    const config = this.chaffConfig;
    for (const enemy of this.hostileAircraft) {
      if (!enemy || enemy.dead || enemy.kind === 'attack-helicopter') continue;
      const trackingPlayer = enemy.phase !== 'staging'
        && (enemy.engagementTarget === this.player || enemy.burstTarget === this.player);
      if (!trackingPlayer || enemy.chaffTrackReevaluationRemaining > 0) continue;
      enemy.chaffTrackReevaluationRemaining = config.radarTrackReevaluationCooldown;
      this.telemetry?.recordCountermeasureAttempt('player', 'chaff', 'radarTrack');
      if (this.random() >= config.radarTrackBreakChance) continue;
      enemy.radarTrackDisruptionRemaining = Math.max(
        enemy.radarTrackDisruptionRemaining ?? 0,
        config.radarTrackDisruptionDuration,
      );
      this.telemetry?.recordCountermeasureSuccess('player', 'chaff', 'radarTrack');
    }
  }

  interfereWithRadarMissiles() {
    const config = this.chaffConfig;
    for (const missile of this.hostileShots) {
      if (!missile?.missile || missile.seeker !== 'radar' || !missile.guidanceActive
        || missile.life <= 0
        || missile.lastChaffAttemptDeployment === this.chaffDeploymentCount
        || (missile.chaffDisruptedRemaining ?? 0) > 0
        || !missile.mesh || (missile.target && missile.target !== this.player)
        || missile.mesh.position.distanceTo(this.player.position) > config.radarMissileEffectRange) continue;
      // One probability roll per missile for this chaff burst. A later burst
      // can try again after a failed roll or after the previous disruption ends.
      missile.lastChaffAttemptDeployment = this.chaffDeploymentCount;
      missile.chaffAttemptCount = (missile.chaffAttemptCount ?? 0) + 1;
      this.telemetry?.recordCountermeasureAttempt('player', 'chaff', 'radarMissile');
      if (this.random() >= config.radarMissileBreakChance) continue;
      missile.chaffDisruptedRemaining = Math.max(
        missile.chaffDisruptedRemaining ?? 0,
        config.radarMissileDisruptionDuration,
      );
      this.telemetry?.recordCountermeasureSuccess('player', 'chaff', 'radarMissile');
    }
  }

  deployHostile(enemy) {
    if (!enemy?.mesh || enemy.dead || enemy.countermeasures <= 0 || enemy.countermeasureCooldown > 0) return false;
    enemy.countermeasures--;
    this.telemetry?.recordCountermeasureUse('hostile', 'flare');
    enemy.countermeasureCooldown = (enemy.countermeasureCooldownBase ?? 4.5)
      + this.random() * (enemy.countermeasureCooldownJitter ?? 1.5);
    const evasiveDuration = enemy.countermeasureEvasionDuration ?? 2.4;
    enemy.evasiveTimer = Math.max(enemy.evasiveTimer ?? 0, evasiveDuration);
    enemy.evasiveDuration = Math.max(enemy.evasiveDuration ?? 0, evasiveDuration);
    enemy.evasiveDirection = this.random() < .5 ? -1 : 1;

    const attitude = enemy.mesh.quaternion;
    const rear = localForward.clone().negate().applyQuaternion(attitude).normalize();
    const right = localRight.clone().applyQuaternion(attitude).normalize();
    const up = localUp.clone().applyQuaternion(attitude).normalize();
    const cloud = new THREE.Group();
    cloud.position.copy(enemy.mesh.position).addScaledVector(rear, 6).addScaledVector(up, 1);
    const velocity = (enemy.velocity ?? stationaryVelocity).clone()
      .addScaledVector(rear, 105)
      .addScaledVector(right, (this.random() - .5) * 18)
      .addScaledVector(up, 18);
    cloud.quaternion.setFromUnitVectors(localForward, this._orientation.copy(velocity).normalize());
    addFlareBundle(cloud, this.addTransientGlow, this.random);
    this.scene.add(cloud);
    this.decoys.push({
      team: 'enemy', source: enemy, type: 'ir', mesh: cloud, position: cloud.position,
      previousPosition: cloud.position.clone(), velocity, life: 2.7, maxLife: 2.7,
      active: true, age: 0, trailClock: 0, spoofChance: .62,
    });
    return true;
  }

  update(dt) {
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const decoy = this.decoys[i];
      if (decoy.active) {
        decoy.life -= dt;
        decoy.age += dt;
        decoy.previousPosition.copy(decoy.position);
        decoy.mesh.position.addScaledVector(decoy.velocity, dt);
        decoy.velocity.multiplyScalar(Math.exp(-.24 * dt));
        const progress = 1 - decoy.life / decoy.maxLife;
        decoy.mesh.scale.setScalar(1 - progress * .18);
        for (const child of decoy.mesh.children) {
          const flicker = .78 + Math.sin(decoy.age * 47 + (child.userData.flickerPhase ?? child.position.x)) * .22;
          if (child.userData.flareGlow) {
            child.material.opacity = (1 - progress) ** .72 * flicker;
            child.scale.setScalar(child.userData.baseSize * (.78 + progress * .2) * flicker);
          } else if (child.userData.flarePlume) {
            child.scale.x = flicker;
            child.scale.y = .72 + flicker * .28;
          }
        }
        decoy.trailClock -= dt;
        if (decoy.trailClock <= 0) {
          const drift = this._drift.copy(decoy.velocity).multiplyScalar(.055)
            .add(this._jitter.set((this.random() - .5) * 5, this.random() * 6, (this.random() - .5) * 5));
          const hotEmber = this.random() < .72;
          this.fx?.emitParticle(
            decoy.position,
            drift,
            hotEmber ? flareParticleColor : flareSmokeColor,
            hotEmber ? .22 + this.random() * .18 : .48 + this.random() * .28,
            hotEmber ? .55 + this.random() * .8 : 1.1 + this.random() * .7,
            hotEmber ? .9 : .2,
            hotEmber ? .9 : .12,
          );
          decoy.trailClock = .025 + this.random() * .055;
        }
        if (decoy.life <= 0) {
          decoy.active = false;
          this.scene.remove(decoy.mesh);
        }
      }
      const trackedByMissile = this.hostileShots.some(missile => missile.missile && missile.decoyTarget === decoy)
        || this.playerShots.some(missile => missile.homing && missile.decoyTarget === decoy);
      if (!decoy.active && !trackedByMissile) {
        disposeTransientMaterials(decoy.mesh);
        this.decoys.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const decoy of this.decoys) {
      this.scene.remove(decoy.mesh);
      disposeTransientMaterials(decoy.mesh);
    }
    this.decoys.length = 0;
  }
}
