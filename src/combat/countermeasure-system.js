import * as THREE from 'three';

const flareDecoyGeo = new THREE.SphereGeometry(1, 7, 5);
const flareDecoyMaterial = new THREE.MeshBasicMaterial({ color: '#ff8c37', toneMapped: false });
const chaffDecoyGeo = new THREE.TetrahedronGeometry(.18, 0);
const chaffDecoyMaterial = new THREE.MeshBasicMaterial({ color: '#d9e2d8', transparent: true, opacity: .72, toneMapped: false });
const localForward = new THREE.Vector3(0, 0, 1);
const localRight = new THREE.Vector3(1, 0, 0);
const localUp = new THREE.Vector3(0, 1, 0);
const stationaryVelocity = new THREE.Vector3();
const flareParticleColor = new THREE.Color('#ffae42');
const chaffParticleColor = new THREE.Color('#c9d3ce');

function disposeTransientMaterials(object) {
  object.traverse(child => {
    if (child.material?.userData?.transient) child.material.dispose();
  });
}

/** Owns flare/chaff inventory, deployment, decoy motion and cleanup. */
export class CountermeasureSystem {
  constructor({
    scene, player, playerVelocity, fx, audio, decoys = [], playerShots = [], hostileShots = [],
    addTransientGlow, onInventoryChange = () => {},
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
    this.onInventoryChange = onInventoryChange;
    this.countermeasures = 12;
    this.cooldown = 0;
  }

  tick(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  deployPlayer() {
    if (this.cooldown > 0 || this.countermeasures <= 0) {
      this.audio?.playWeaponNoLock();
      return false;
    }
    this.countermeasures--;
    this.cooldown = .85;
    const attitude = this.player.quaternion;
    const rear = localForward.clone().negate().applyQuaternion(attitude).normalize();
    const right = localRight.clone().applyQuaternion(attitude).normalize();
    const up = localUp.clone().applyQuaternion(attitude).normalize();

    const flareCloud = new THREE.Group();
    flareCloud.position.copy(this.player.position).addScaledVector(rear, 6);
    for (let i = 0; i < 3; i++) {
      const flareMesh = new THREE.Mesh(flareDecoyGeo, flareDecoyMaterial);
      flareMesh.position.set((i - 1) * 1.8, (Math.random() - .5) * 1.8, (Math.random() - .5) * 1.8);
      flareMesh.scale.setScalar(1.1 + Math.random() * .7);
      flareCloud.add(flareMesh);
      const glow = this.addTransientGlow(flareCloud, '#ff9b35', 15 + Math.random() * 7, .96);
      glow.position.copy(flareMesh.position);
      glow.userData.baseSize = glow.scale.x;
      glow.userData.flareGlow = true;
    }
    this.scene.add(flareCloud);
    this.decoys.push({
      team: 'player', type: 'ir', mesh: flareCloud, position: flareCloud.position,
      previousPosition: flareCloud.position.clone(),
      velocity: this.playerVelocity.clone().addScaledVector(rear, 115)
        .addScaledVector(right, (Math.random() - .5) * 18).addScaledVector(up, 18),
      life: 2.7, maxLife: 2.7, active: true, age: 0, trailClock: 0,
    });

    const chaffCloud = new THREE.Group();
    chaffCloud.position.copy(this.player.position).addScaledVector(rear, 4).addScaledVector(up, -1);
    for (let i = 0; i < 18; i++) {
      const piece = new THREE.Mesh(chaffDecoyGeo, chaffDecoyMaterial);
      piece.position.set((Math.random() - .5) * 5, (Math.random() - .5) * 4, (Math.random() - .5) * 6);
      piece.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      chaffCloud.add(piece);
    }
    this.scene.add(chaffCloud);
    this.decoys.push({
      team: 'player', type: 'radar', mesh: chaffCloud, position: chaffCloud.position,
      previousPosition: chaffCloud.position.clone(),
      velocity: this.playerVelocity.clone().addScaledVector(rear, 62)
        .addScaledVector(right, (Math.random() - .5) * 12).addScaledVector(up, -5),
      life: 2.7, maxLife: 2.7, active: true, age: 0, trailClock: 0,
    });
    this.audio?.playCountermeasure();
    this.onInventoryChange();
    return true;
  }

  deployHostile(enemy, seeker = null) {
    if (!enemy?.mesh || enemy.dead || enemy.countermeasures <= 0 || enemy.countermeasureCooldown > 0) return false;
    enemy.countermeasures--;
    enemy.countermeasureCooldown = 4.5 + Math.random() * 1.5;
    enemy.evasiveTimer = 2.4;
    enemy.evasiveDirection = Math.random() < .5 ? -1 : 1;

    const attitude = enemy.mesh.quaternion;
    const rear = localForward.clone().negate().applyQuaternion(attitude).normalize();
    const right = localRight.clone().applyQuaternion(attitude).normalize();
    const up = localUp.clone().applyQuaternion(attitude).normalize();
    const types = seeker ? [seeker] : ['ir', 'radar'];
    for (const type of types) {
      const cloud = new THREE.Group();
      cloud.position.copy(enemy.mesh.position).addScaledVector(rear, type === 'ir' ? 6 : 4);
      cloud.position.addScaledVector(up, type === 'ir' ? 1 : -1);
      if (type === 'ir') {
        for (let i = 0; i < 3; i++) {
          const flareMesh = new THREE.Mesh(flareDecoyGeo, flareDecoyMaterial);
          flareMesh.position.set((i - 1) * 1.8, (Math.random() - .5) * 1.8, (Math.random() - .5) * 1.8);
          flareMesh.scale.setScalar(1.1 + Math.random() * .7);
          cloud.add(flareMesh);
          const glow = this.addTransientGlow(cloud, '#ff9b35', 15 + Math.random() * 7, .96);
          glow.position.copy(flareMesh.position);
          glow.userData.baseSize = glow.scale.x;
          glow.userData.flareGlow = true;
        }
      } else {
        for (let i = 0; i < 18; i++) {
          const piece = new THREE.Mesh(chaffDecoyGeo, chaffDecoyMaterial);
          piece.position.set((Math.random() - .5) * 5, (Math.random() - .5) * 4, (Math.random() - .5) * 6);
          piece.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
          cloud.add(piece);
        }
      }
      this.scene.add(cloud);
      const velocity = (enemy.velocity ?? stationaryVelocity).clone()
        .addScaledVector(rear, type === 'ir' ? 105 : 62)
        .addScaledVector(right, (Math.random() - .5) * 18)
        .addScaledVector(up, type === 'ir' ? 18 : -5);
      this.decoys.push({
        team: 'enemy', source: enemy, type, mesh: cloud, position: cloud.position,
        previousPosition: cloud.position.clone(), velocity, life: 2.7, maxLife: 2.7,
        active: true, age: 0, trailClock: 0, spoofChance: type === 'ir' ? .62 : .58,
      });
    }
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
        decoy.mesh.rotation.y += dt * (decoy.type === 'ir' ? 1.5 : .4);
        const progress = 1 - decoy.life / decoy.maxLife;
        if (decoy.type === 'ir') {
          decoy.mesh.scale.setScalar(1 + progress * .42);
          for (const child of decoy.mesh.children) {
            if (!child.userData.flareGlow) continue;
            const flicker = .84 + Math.sin(decoy.age * 43 + child.position.x) * .16;
            child.material.opacity = (1 - progress) ** .72 * flicker;
            child.scale.setScalar(child.userData.baseSize * (.72 + progress * .75) * flicker);
          }
          decoy.trailClock -= dt;
          if (decoy.trailClock <= 0) {
            const drift = decoy.velocity.clone().multiplyScalar(.055)
              .add(new THREE.Vector3((Math.random() - .5) * 7, Math.random() * 8, (Math.random() - .5) * 7));
            this.fx?.emitParticle(decoy.position, drift, flareParticleColor, .42, 2.4 + Math.random() * 1.2, .98, 1);
            decoy.trailClock = .035;
          }
        } else {
          decoy.mesh.scale.setScalar(1 + progress * .72);
          decoy.trailClock -= dt;
          if (decoy.trailClock <= 0) {
            const drift = decoy.velocity.clone().multiplyScalar(.025)
              .add(new THREE.Vector3((Math.random() - .5) * 9, (Math.random() - .5) * 6, (Math.random() - .5) * 9));
            this.fx?.emitParticle(decoy.position, drift, chaffParticleColor, .34, 1.15 + Math.random() * .55, .58, .3);
            decoy.trailClock = .11;
          }
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
