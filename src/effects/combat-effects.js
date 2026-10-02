import * as THREE from 'three';

const effectSphereGeo = new THREE.SphereGeometry(1, 14, 10);
const shockwaveGeo = new THREE.RingGeometry(.94, 1, 48);
const glowTexture = createGlowTexture();
const glowMaterial = new THREE.SpriteMaterial({
  map: glowTexture,
  color: '#ffffff',
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});
const explosionShellMaterial = new THREE.MeshBasicMaterial({
  color: '#ff5a22',
  transparent: true,
  opacity: .9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});
const shockwaveMaterial = new THREE.MeshBasicMaterial({
  color: '#ffd28c',
  transparent: true,
  opacity: .82,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  depthWrite: false,
  toneMapped: false,
});
const emberColor = new THREE.Color('#ffb441');
const hotEmberColor = new THREE.Color('#fff0a8');
const smokeColor = new THREE.Color('#82776f');
const effectVelocity = new THREE.Vector3();
const explosionDirection = new THREE.Vector3();
let effectResourcesDisposed = false;

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,245,1)');
  gradient.addColorStop(.12, 'rgba(255,244,190,.98)');
  gradient.addColorStop(.3, 'rgba(255,157,61,.72)');
  gradient.addColorStop(.62, 'rgba(255,94,22,.2)');
  gradient.addColorStop(1, 'rgba(255,64,8,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function addTransientGlow(parent, color, size, opacity = 1, blending = THREE.AdditiveBlending) {
  const material = glowMaterial.clone();
  material.color.set(color);
  material.opacity = opacity;
  material.blending = blending;
  material.userData.transient = true;
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(size);
  parent.add(sprite);
  return sprite;
}

function disposeTransientMaterials(object) {
  object.traverse(child => {
    if (child.material?.userData?.transient) child.material.dispose();
  });
}

function createExplosionEffect(position, intensity) {
  const group = new THREE.Group();
  group.position.copy(position);
  const core = addTransientGlow(group, '#fff1bd', 30 * intensity, 1);
  const fireball = new THREE.Mesh(effectSphereGeo, explosionShellMaterial.clone());
  fireball.material.userData.transient = true;
  group.add(fireball);
  const smoke = addTransientGlow(group, '#73665f', 26 * intensity, .38, THREE.NormalBlending);
  smoke.position.y = 4 * intensity;
  const ring = new THREE.Mesh(shockwaveGeo, shockwaveMaterial.clone());
  ring.material.userData.transient = true;
  const effect = {
    mesh: group,
    kind: 'explosion',
    life: 1.45,
    maxLife: 1.45,
    intensity,
    core,
    fireball,
    smoke,
    ring,
    innerColor: new THREE.Color('#fff0ab'),
    outerColor: new THREE.Color('#a72d18'),
  };
  group.add(ring);
  return effect;
}

/** Owns combat explosions, sparks, and their reusable scene objects. */
export class CombatEffects {
  constructor({ scene, player, fx, audio }) {
    this.scene = scene;
    this.player = player;
    this.fx = fx;
    this.audio = audio;
    this.activeEffects = [];
    this.sparkPool = [];
    this.explosionPool = [];
  }

  get activeCount() {
    return this.activeEffects.length;
  }

  addSpark(position) {
    for (let i = 0; i < 7; i++) {
      effectVelocity.set((Math.random() - .5) * 48, (Math.random() - .25) * 54, (Math.random() - .5) * 48);
      this.fx?.emitParticle(position, effectVelocity, i < 3 ? hotEmberColor : emberColor,
        .28 + Math.random() * .3, 2 + Math.random() * 1.5, .98, 1);
    }
    const sprite = this.sparkPool.pop() ?? addTransientGlow(this.scene, '#fff0ae', 5, .95);
    sprite.material.color.set('#fff0ae');
    sprite.material.opacity = .95;
    sprite.scale.setScalar(5);
    sprite.position.copy(position);
    this.scene.add(sprite);
    this.activeEffects.push({ mesh: sprite, kind: 'spark', material: sprite.material, life: .2, maxLife: .2 });
  }

  addExplosion(position, intensity = 1) {
    const distance = position.distanceTo(this.player.position);
    this.audio?.playExplosion(distance, intensity > 1.05);
    const effect = this.explosionPool.pop() ?? createExplosionEffect(position, intensity);
    effect.mesh.position.copy(position);
    effect.mesh.visible = true;
    effect.intensity = intensity;
    effect.life = 1.65;
    effect.maxLife = 1.65;
    effect.core.scale.setScalar(36 * intensity);
    effect.core.material.opacity = 1;
    effect.fireball.scale.setScalar(9 * intensity);
    effect.fireball.material.opacity = .94;
    effect.fireball.material.color.set('#fff0ab');
    effect.smoke.position.y = 4 * intensity;
    effect.smoke.scale.setScalar(26 * intensity);
    effect.smoke.material.opacity = .42;
    effect.ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    effect.ring.scale.setScalar(10 * intensity);
    effect.ring.material.opacity = .86;
    effect.innerColor.set('#fff0ab');
    effect.outerColor.set('#a72d18');
    this.scene.add(effect.mesh);
    this.activeEffects.push(effect);

    for (let i = 0; i < 26; i++) {
      const direction = explosionDirection.set(Math.random() - .5, Math.random() - .35, Math.random() - .5).normalize();
      if (i < 17) {
        direction.multiplyScalar((24 + Math.random() * 78) * intensity);
        direction.y += 8 + Math.random() * 22;
        const color = i < 6 ? hotEmberColor : emberColor;
        this.fx?.emitParticle(position, direction, color, .48 + Math.random() * .58, 2.2 + Math.random() * 2.2, .96, 1);
      } else {
        direction.multiplyScalar(5 + Math.random() * 16);
        direction.y += 12 + Math.random() * 17;
        this.fx?.emitParticle(position, direction, smokeColor, 1.05 + Math.random() * .55, 1.35 + Math.random() * 1.1, .42, .08);
      }
    }
  }

  update(dt) {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const effect = this.activeEffects[i];
      effect.life -= dt;
      if (effect.life <= 0) {
        this.scene.remove(effect.mesh);
        if (effect.kind === 'spark' && this.sparkPool.length < 24) {
          effect.material.opacity = 0;
          this.sparkPool.push(effect.mesh);
        } else if (effect.kind === 'explosion' && this.explosionPool.length < 32) {
          effect.mesh.visible = false;
          this.explosionPool.push(effect);
        } else {
          disposeTransientMaterials(effect.mesh);
        }
        this.activeEffects.splice(i, 1);
        continue;
      }

      const progress = 1 - effect.life / effect.maxLife;
      if (effect.kind === 'spark') {
        effect.material.opacity = (1 - progress) ** 1.7;
        effect.mesh.scale.setScalar(5 + progress * 9);
      } else {
        const intensity = effect.intensity;
        effect.core.material.opacity = 1 - THREE.MathUtils.smoothstep(progress, .02, .3);
        effect.core.scale.setScalar(intensity * (34 + progress * 25));
        effect.fireball.scale.setScalar(intensity * (9 + progress * 54));
        effect.fireball.material.opacity = .88 * (1 - THREE.MathUtils.smoothstep(progress, .08, .78));
        effect.fireball.material.color.copy(effect.innerColor).lerp(effect.outerColor, progress);
        effect.smoke.material.opacity = .42 * THREE.MathUtils.smoothstep(progress, .02, .24) * (1 - progress * .7);
        effect.smoke.position.y = intensity * (4 + progress * 30);
        effect.smoke.scale.setScalar(intensity * (24 + progress * 78));
        effect.ring.material.opacity = .76 * (1 - THREE.MathUtils.smoothstep(progress, .24, 1));
        effect.ring.scale.setScalar(intensity * (10 + progress * 96));
        effect.ring.rotation.z += dt * .75;
      }
    }
  }

  dispose() {
    for (const effect of this.activeEffects) {
      this.scene.remove(effect.mesh);
      disposeTransientMaterials(effect.mesh);
    }
    for (const effect of this.explosionPool) disposeTransientMaterials(effect.mesh);
    for (const spark of this.sparkPool) {
      this.scene.remove(spark);
      spark.material.dispose();
    }
    this.activeEffects.length = 0;
    this.sparkPool.length = 0;
    this.explosionPool.length = 0;
  }
}

export function disposeCombatEffectResources() {
  if (effectResourcesDisposed) return;
  effectResourcesDisposed = true;
  glowTexture.dispose();
  glowMaterial.dispose();
  effectSphereGeo.dispose();
  shockwaveGeo.dispose();
  explosionShellMaterial.dispose();
  shockwaveMaterial.dispose();
}
