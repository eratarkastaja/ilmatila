import * as THREE from 'three';

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

function addFlareBundle(cloud, addTransientGlow) {
  for (let i = 0; i < 3; i++) {
    const offset = new THREE.Vector3((i - 1) * 1.35, (Math.random() - .5) * .7, (Math.random() - .5) * .8);
    const scale = .82 + Math.random() * .28;

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

    const glow = addTransientGlow(cloud, '#fff0c0', 8.5 + Math.random() * 2.5, .94);
    glow.position.copy(offset);
    glow.userData.baseSize = glow.scale.x;
    glow.userData.flareGlow = true;
    glow.userData.flickerPhase = Math.random() * Math.PI * 2;
  }
}

function disposeTransientMaterials(object) {
  object.traverse(child => {
    if (child.material?.userData?.transient) child.material.dispose();
  });
}

/** Owns flare inventory, deployment, decoy motion and cleanup. */
export class CountermeasureSystem {
  constructor({
    scene, player, playerVelocity, fx, audio, decoys = [], playerShots = [], hostileShots = [],
    addTransientGlow, onInventoryChange = () => {}, initialCount = 12,
  }) {
    this.scene = scene;
    this.player = player;
    this.playerVelocity = playerVelocity;
    this.fx = fx;
    this.audio = audio;
    this.decoys = decoys;
    this.playerShots = playerShots;
    this.hostileShots = hostileShots;
    this.addTransientGlow = addTransientGlow;
    this._drift=new THREE.Vector3();
    this._jitter=new THREE.Vector3();
    this._orientation=new THREE.Vector3();
    this.onInventoryChange = onInventoryChange;
    this.countermeasures = initialCount;
    this.cooldown = 0;
    this.lastPlayerDeployment = 'ready';
  }

  tick(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  deployPlayer() {
    if (this.cooldown > 0) {
      this.lastPlayerDeployment = 'rearming';
      if (this.audio?.playCountermeasureUnavailable) this.audio.playCountermeasureUnavailable();
      else this.audio?.playWeaponNoLock();
      this.onInventoryChange();
      return false;
    }
    if (this.countermeasures <= 0) {
      this.lastPlayerDeployment = 'empty';
      if (this.audio?.playCountermeasureUnavailable) this.audio.playCountermeasureUnavailable();
      else this.audio?.playWeaponNoLock();
      this.onInventoryChange();
      return false;
    }
    this.lastPlayerDeployment = 'deployed';
    this.countermeasures--;
    this.cooldown = .85;
    const attitude = this.player.quaternion;
    const rear = localForward.clone().negate().applyQuaternion(attitude).normalize();
    const right = localRight.clone().applyQuaternion(attitude).normalize();
    const up = localUp.clone().applyQuaternion(attitude).normalize();

    const flareVelocity = this.playerVelocity.clone().addScaledVector(rear, 115)
      .addScaledVector(right, (Math.random() - .5) * 18).addScaledVector(up, 18);
    const flareCloud = new THREE.Group();
    flareCloud.position.copy(this.player.position).addScaledVector(rear, 6);
    flareCloud.quaternion.setFromUnitVectors(localForward, this._orientation.copy(flareVelocity).normalize());
    addFlareBundle(flareCloud, this.addTransientGlow);
    this.scene.add(flareCloud);
    this.decoys.push({
      team: 'player', source: this.player, type: 'ir', mesh: flareCloud, position: flareCloud.position,
      previousPosition: flareCloud.position.clone(),
      velocity: flareVelocity,
      life: 2.7, maxLife: 2.7, active: true, age: 0, trailClock: 0, spoofChance: .62,
    });
    this.audio?.playCountermeasure();
    this.onInventoryChange();
    return true;
  }

  deployHostile(enemy) {
    if (!enemy?.mesh || enemy.dead || enemy.countermeasures <= 0 || enemy.countermeasureCooldown > 0) return false;
    enemy.countermeasures--;
    enemy.countermeasureCooldown = (enemy.countermeasureCooldownBase ?? 4.5)
      + Math.random() * (enemy.countermeasureCooldownJitter ?? 1.5);
    const evasiveDuration = enemy.countermeasureEvasionDuration ?? 2.4;
    enemy.evasiveTimer = Math.max(enemy.evasiveTimer ?? 0, evasiveDuration);
    enemy.evasiveDuration = Math.max(enemy.evasiveDuration ?? 0, evasiveDuration);
    enemy.evasiveDirection = Math.random() < .5 ? -1 : 1;

    const attitude = enemy.mesh.quaternion;
    const rear = localForward.clone().negate().applyQuaternion(attitude).normalize();
    const right = localRight.clone().applyQuaternion(attitude).normalize();
    const up = localUp.clone().applyQuaternion(attitude).normalize();
    const cloud = new THREE.Group();
    cloud.position.copy(enemy.mesh.position).addScaledVector(rear, 6).addScaledVector(up, 1);
    const velocity = (enemy.velocity ?? stationaryVelocity).clone()
      .addScaledVector(rear, 105)
      .addScaledVector(right, (Math.random() - .5) * 18)
      .addScaledVector(up, 18);
    cloud.quaternion.setFromUnitVectors(localForward, this._orientation.copy(velocity).normalize());
    addFlareBundle(cloud, this.addTransientGlow);
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
            .add(this._jitter.set((Math.random() - .5) * 5, Math.random() * 6, (Math.random() - .5) * 5));
          const hotEmber = Math.random() < .72;
          this.fx?.emitParticle(
            decoy.position,
            drift,
            hotEmber ? flareParticleColor : flareSmokeColor,
            hotEmber ? .22 + Math.random() * .18 : .48 + Math.random() * .28,
            hotEmber ? .55 + Math.random() * .8 : 1.1 + Math.random() * .7,
            hotEmber ? .9 : .2,
            hotEmber ? .9 : .12,
          );
          decoy.trailClock = .025 + Math.random() * .055;
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
