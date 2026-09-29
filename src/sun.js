import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export const SUN_DIRECTION = new THREE.Vector3(-500, 650, 1500).normalize();

export class SunEffects {
  constructor(scene, camera) {
    this.camera = camera;
    this.sunDirection = SUN_DIRECTION.clone();

    this.sky = new Sky();
    this.sky.scale.setScalar(18000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    const uniforms = this.sky.material.uniforms;
    // Keep the horizon clear: high Mie density creates a broad white band when
    // the camera points toward the sun at low altitude.
    uniforms.turbidity.value = 3.6;
    uniforms.rayleigh.value = 1.35;
    uniforms.mieCoefficient.value = 0.0018;
    uniforms.mieDirectionalG.value = 0.79;
    uniforms.sunPosition.value.copy(this.sunDirection).multiplyScalar(10000);
    scene.add(this.sky);

    scene.environment = makeReflectionEnvironment(this.sunDirection);

    this.flare = new THREE.Group();
    this.flare.renderOrder = 1000;
    camera.add(this.flare);
    this.flareSprites = createFlareSprites(this.flare);
    this.update(camera);
  }

  update(camera) {
    // Keep the atmospheric sky centered on the chase camera so its horizon feels distant.
    this.sky.position.copy(camera.position);
    camera.updateMatrixWorld(true);

    const source = camera.position.clone().addScaledVector(this.sunDirection, 10000);
    source.project(camera);
    const inFront = source.z > -1 && source.z < 1;
    const edge = Math.max(Math.abs(source.x), Math.abs(source.y));
    const visibility = inFront
      ? 1 - THREE.MathUtils.smoothstep(edge, 0.72, 1.2)
      : 0;

    const depth = 36;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * depth;
    const halfWidth = halfHeight * camera.aspect;
    const centerX = source.x * halfWidth;
    const centerY = source.y * halfHeight;

    for (const flare of this.flareSprites) {
      flare.sprite.visible = visibility > 0.005;
      flare.sprite.position.set(
        THREE.MathUtils.lerp(centerX, 0, flare.axis),
        THREE.MathUtils.lerp(centerY, 0, flare.axis),
        -depth,
      );
      flare.sprite.scale.setScalar(flare.size * halfHeight * visibility);
      flare.material.opacity = flare.opacity * visibility;
    }
  }
}

function createFlareSprites(parent) {
  const textures = {
    halo: makeFlareTexture('halo'),
    star: makeFlareTexture('star'),
    ghost: makeFlareTexture('ghost'),
  };
  const definitions = [
    { type: 'halo', axis: 0, size: 0.22, opacity: 0.14, color: '#ffe7c0' },
    { type: 'star', axis: 0, size: 0.075, opacity: 0.16, color: '#fff3d8' },
    { type: 'ghost', axis: 0.36, size: 0.12, opacity: 0.065, color: '#9ad8e7' },
    { type: 'ghost', axis: 0.72, size: 0.08, opacity: 0.055, color: '#f7cba0' },
    { type: 'ghost', axis: 1.08, size: 0.12, opacity: 0.045, color: '#b7d9df' },
    { type: 'ghost', axis: 1.38, size: 0.06, opacity: 0.04, color: '#e5b8a2' },
  ];

  return definitions.map((definition) => {
    const material = new THREE.SpriteMaterial({
      map: textures[definition.type],
      color: definition.color,
      transparent: true,
      opacity: definition.opacity,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 10000;
    sprite.frustumCulled = false;
    parent.add(sprite);
    return { ...definition, sprite, material };
  });
}

function makeFlareTexture(type) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const center = size * 0.5;

  if (type === 'halo') {
    const glow = context.createRadialGradient(center, center, 0, center, center, center);
    glow.addColorStop(0, 'rgba(255,248,226,0.86)');
    glow.addColorStop(0.08, 'rgba(255,233,190,0.46)');
    glow.addColorStop(0.28, 'rgba(255,205,145,0.12)');
    glow.addColorStop(0.62, 'rgba(255,206,157,0.045)');
    glow.addColorStop(1, 'rgba(255,206,157,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);
  } else if (type === 'star') {
    const glow = context.createRadialGradient(center, center, 0, center, center, center);
    glow.addColorStop(0, 'rgba(255,255,242,0.98)');
    glow.addColorStop(0.025, 'rgba(255,247,219,0.9)');
    glow.addColorStop(0.11, 'rgba(255,227,177,0.22)');
    glow.addColorStop(1, 'rgba(255,227,177,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);

    context.save();
    context.translate(center, center);
    for (const [angle, length, width, alpha] of [[0, 116, 1.3, 0.38], [Math.PI / 2, 82, 1, 0.24], [Math.PI / 4, 52, 0.65, 0.12]]) {
      context.save();
      context.rotate(angle);
      const ray = context.createLinearGradient(0, -length, 0, length);
      ray.addColorStop(0, 'rgba(255,238,207,0)');
      ray.addColorStop(0.5, `rgba(255,248,224,${alpha})`);
      ray.addColorStop(1, 'rgba(255,238,207,0)');
      context.fillStyle = ray;
      context.fillRect(-width / 2, -length, width, length * 2);
      context.restore();
    }
    context.restore();
  } else {
    const glow = context.createRadialGradient(center, center, size * 0.08, center, center, center * 0.92);
    glow.addColorStop(0, 'rgba(255,255,255,0.4)');
    glow.addColorStop(0.14, 'rgba(255,255,255,0.18)');
    glow.addColorStop(0.24, 'rgba(255,255,255,0.025)');
    glow.addColorStop(0.4, 'rgba(255,255,255,0.16)');
    glow.addColorStop(0.48, 'rgba(255,255,255,0.025)');
    glow.addColorStop(0.7, 'rgba(255,255,255,0.025)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeReflectionEnvironment(sunDirection) {
  const width = 1024, height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#436b82');
  sky.addColorStop(0.28, '#86aab7');
  sky.addColorStop(0.44, '#b7c7c5');
  sky.addColorStop(0.50, '#aab9b1');
  sky.addColorStop(0.57, '#78877f');
  sky.addColorStop(0.7, '#4c5b55');
  sky.addColorStop(1, '#303d3b');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const sunU = THREE.MathUtils.euclideanModulo(Math.atan2(sunDirection.z, sunDirection.x) / (Math.PI * 2) + 0.5, 1);
  const sunV = 0.5 - Math.asin(THREE.MathUtils.clamp(sunDirection.y, -1, 1)) / Math.PI;
  const sunX = sunU * width;
  const sunY = sunV * height;
  for (const x of [sunX - width, sunX, sunX + width]) {
    const glow = context.createRadialGradient(x, sunY, 0, x, sunY, 170);
    glow.addColorStop(0, 'rgba(255,241,209,0.95)');
    glow.addColorStop(0.035, 'rgba(255,230,190,0.56)');
    glow.addColorStop(0.2, 'rgba(255,218,172,0.16)');
    glow.addColorStop(1, 'rgba(255,218,172,0)');
    context.fillStyle = glow;
    context.fillRect(x - 170, sunY - 170, 340, 340);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
