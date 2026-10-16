import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export const SUN_DIRECTION = new THREE.Vector3(-500, 650, 1500).normalize();

export class SunEffects {
  constructor(scene, camera) {
    this.camera = camera;
    this.sunDirection = SUN_DIRECTION.clone();
    this.moonDirection = SUN_DIRECTION.clone().negate();
    this.timeOfDay = 12;
    this._cameraForward = new THREE.Vector3();
    this._cameraPosition = new THREE.Vector3();
    this._sunScreenPosition = new THREE.Vector3();
    this._moonScreenPosition = new THREE.Vector3();
    this.cloudCoverage = .35;
    this.nightVision = false;

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
    this.moon = new THREE.Group();
    this.moon.renderOrder = 900;
    camera.add(this.moon);
    this.moonSprites = createMoonSprites(this.moon);
    const starField = createStarField();
    this.stars = starField.points;
    this.starMaterial = starField.material;
    this.stars.renderOrder = -900;
    this.stars.frustumCulled = false;
    scene.add(this.stars);
    this.setTimeOfDay(this.timeOfDay);
    this.update(camera);
  }

  setTimeOfDay(hours) {
    const time = THREE.MathUtils.euclideanModulo(Number.isFinite(hours) ? hours : 12, 24);
    const solarHeight = Math.sin((time - 6) / 12 * Math.PI);
    const azimuth = time / 24 * Math.PI * 2 - Math.PI * 0.5;
    const horizontal = Math.sqrt(Math.max(0, 1 - solarHeight * solarHeight));
    this.sunDirection.set(
      Math.cos(azimuth) * horizontal,
      solarHeight,
      Math.sin(azimuth) * horizontal,
    ).normalize();
    this.moonDirection.copy(this.sunDirection).negate();
    this.timeOfDay = time;
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDirection).multiplyScalar(10000);
  }

  setCloudCoverage(coverage) {
    this.cloudCoverage = THREE.MathUtils.clamp(Number.isFinite(coverage) ? coverage : 1, 0, 1);
  }

  setNightVision(enabled) {
    this.nightVision = Boolean(enabled);
  }

  update(camera) {
    // Keep the atmospheric sky centered on the chase camera so its horizon feels distant.
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    camera.updateMatrixWorld(true);

    const starSolarHeight = Math.sin((this.timeOfDay - 6) / 12 * Math.PI);
    const nightVisibility = 1 - THREE.MathUtils.smoothstep(starSolarHeight, -.06, .28);
    const cloudVisibility = 1 - THREE.MathUtils.smoothstep(this.cloudCoverage, .35, .9);
    const starOpacity = .78 * nightVisibility * cloudVisibility * (this.nightVision ? 1.18 : 1);
    this.starMaterial.uniforms.opacity.value = starOpacity;
    this.starMaterial.uniforms.nightVision.value = this.nightVision ? 1 : 0;
    this.stars.visible = starOpacity > .005;

    camera.getWorldPosition(this._cameraPosition);
    camera.getWorldDirection(this._cameraForward);
    const sunAlignment = this._cameraForward.dot(this.sunDirection);
    const angularVisibility = THREE.MathUtils.smoothstep(
      sunAlignment,
      Math.cos(THREE.MathUtils.degToRad(22)),
      Math.cos(THREE.MathUtils.degToRad(2.5)),
    );

    this._sunScreenPosition
      .copy(this._cameraPosition)
      .addScaledVector(this.sunDirection, 10000)
      .project(camera);
    const inFront = this._sunScreenPosition.z > -1 && this._sunScreenPosition.z < 1;
    const edge = Math.max(
      Math.abs(this._sunScreenPosition.x),
      Math.abs(this._sunScreenPosition.y),
    );
    const screenVisibility = 1 - THREE.MathUtils.smoothstep(edge, 0.72, 1.2);
    const visibility = inFront ? angularVisibility * screenVisibility : 0;

    const depth = 36;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * depth;
    const halfWidth = halfHeight * camera.aspect;
    const centerX = this._sunScreenPosition.x * halfWidth;
    const centerY = this._sunScreenPosition.y * halfHeight;

    for (const flare of this.flareSprites) {
      flare.sprite.visible = visibility > 0.005;
      flare.sprite.position.set(
        THREE.MathUtils.lerp(centerX, 0, flare.axis),
        THREE.MathUtils.lerp(centerY, 0, flare.axis),
        -depth,
      );
      const flareSize = flare.size * halfHeight * visibility;
      if (flare.aspect) {
        flare.sprite.scale.set(flareSize * flare.aspect, flareSize, 1);
      } else {
        flare.sprite.scale.setScalar(flareSize);
      }
      flare.material.opacity = flare.opacity * visibility;
    }

    const moonAlignment = this._cameraForward.dot(this.moonDirection);
    const moonAngularVisibility = THREE.MathUtils.smoothstep(
      moonAlignment,
      Math.cos(THREE.MathUtils.degToRad(18)),
      Math.cos(THREE.MathUtils.degToRad(2)),
    );
    this._moonScreenPosition
      .copy(this._cameraPosition)
      .addScaledVector(this.moonDirection, 10000)
      .project(camera);
    const moonInFront = this._moonScreenPosition.z > -1 && this._moonScreenPosition.z < 1;
    const moonEdge = Math.max(
      Math.abs(this._moonScreenPosition.x),
      Math.abs(this._moonScreenPosition.y),
    );
    const moonScreenVisibility = 1 - THREE.MathUtils.smoothstep(moonEdge, 0.72, 1.2);
    const solarHeight = Math.sin((this.timeOfDay - 6) / 12 * Math.PI);
    const moonPhaseVisibility = 1 - THREE.MathUtils.smoothstep(solarHeight, .08, .58);
    const moonVisibility = moonInFront
      ? moonAngularVisibility * moonScreenVisibility * moonPhaseVisibility
      : 0;
    const moonDepth = 38;
    const moonHalfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * moonDepth;
    const moonHalfWidth = moonHalfHeight * camera.aspect;
    const moonCenterX = this._moonScreenPosition.x * moonHalfWidth;
    const moonCenterY = this._moonScreenPosition.y * moonHalfHeight;
    for (const moon of this.moonSprites) {
      moon.sprite.visible = moonVisibility > 0.005;
      moon.sprite.position.set(
        moonCenterX,
        moonCenterY,
        -moonDepth,
      );
      moon.sprite.scale.setScalar(moon.size * moonHalfHeight * moonVisibility);
      moon.material.opacity = moon.opacity * moonVisibility;
    }
  }
}

function createStarField() {
  const count = 260;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  let seed = 0x4f1a2b;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let index = 0; index < count; index++) {
    // Keep the star field above the world horizon. A full sphere would place
    // stars below the camera as well, making them visible through terrain when
    // the player looks down.
    const z = random();
    const azimuth = random() * Math.PI * 2;
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    const offset = index * 3;
    positions[offset] = Math.cos(azimuth) * radius * 16000;
    positions[offset + 1] = z * 16000;
    positions[offset + 2] = Math.sin(azimuth) * radius * 16000;
    sizes[index] = 1.1 + random() * 2.2;
    brightness[index] = .42 + random() * .58;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('starBrightness', new THREE.BufferAttribute(brightness, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      opacity: { value: 0 },
      nightVision: { value: 0 },
      pixelRatio: { value: Math.min(globalThis.devicePixelRatio ?? 1, 2) },
    },
    vertexShader: `
      attribute float starSize;
      attribute float starBrightness;
      varying float vBrightness;
      uniform float pixelRatio;
      void main() {
        vBrightness = starBrightness;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = starSize * pixelRatio;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      uniform float nightVision;
      varying float vBrightness;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float disc = 1.0 - smoothstep(0.5, 0.08, radius);
        float core = exp(-radius * radius * 42.0);
        vec3 color = mix(vec3(0.72, 0.84, 1.0), vec3(0.68, 1.0, 0.82), nightVision);
        gl_FragColor = vec4(color * (0.7 + core * 1.7), disc * vBrightness * opacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  return { points, material };
}

function createMoonSprites(parent) {
  const haloMaterial = new THREE.SpriteMaterial({
    map: makeMoonTexture('halo'),
    color: '#b8d6ff',
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const discMaterial = new THREE.SpriteMaterial({
    map: makeMoonTexture('disc'),
    color: '#d9e7ff',
    transparent: true,
    opacity: 0.88,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprites = [
    { sprite: new THREE.Sprite(haloMaterial), material: haloMaterial, size: .24, opacity: .16 },
    { sprite: new THREE.Sprite(discMaterial), material: discMaterial, size: .075, opacity: .88 },
  ];
  for (const moon of sprites) {
    moon.sprite.renderOrder = 10000;
    moon.sprite.frustumCulled = false;
    parent.add(moon.sprite);
  }
  return sprites;
}

function makeMoonTexture(type) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const center = size * .5;
  if (type === 'halo') {
    const gradient = context.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, 'rgba(219,235,255,.3)');
    gradient.addColorStop(.22, 'rgba(173,207,255,.12)');
    gradient.addColorStop(1, 'rgba(132,175,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  } else {
    const gradient = context.createRadialGradient(center * .8, center * .75, 2, center, center, center * .62);
    gradient.addColorStop(0, 'rgba(255,255,255,.98)');
    gradient.addColorStop(.68, 'rgba(218,231,250,.96)');
    gradient.addColorStop(1, 'rgba(157,180,215,.5)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(center, center, center * .62, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(130,155,190,.14)';
    for (const crater of [[48, 46, 7], [76, 61, 5], [57, 77, 4]]) {
      context.beginPath();
      context.arc(crater[0], crater[1], crater[2], 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createFlareSprites(parent) {
  const textures = {
    halo: makeFlareTexture('halo'),
    star: makeFlareTexture('star'),
    ghost: makeFlareTexture('ghost'),
    streak: makeFlareTexture('streak'),
  };
  const definitions = [
    { type: 'halo', axis: 0, size: 0.22, opacity: 0.17, color: '#ffe7c0' },
    { type: 'star', axis: 0, size: 0.075, opacity: 0.17, color: '#fff3d8' },
    { type: 'streak', axis: 0, size: 0.12, aspect: 4.5, opacity: 0.075, color: '#ffe8c7' },
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
  } else if (type === 'streak') {
    const horizontal = context.createLinearGradient(0, 0, size, 0);
    horizontal.addColorStop(0, 'rgba(255,238,205,0)');
    horizontal.addColorStop(0.28, 'rgba(255,238,205,0.08)');
    horizontal.addColorStop(0.46, 'rgba(255,248,229,0.32)');
    horizontal.addColorStop(0.5, 'rgba(255,255,245,0.58)');
    horizontal.addColorStop(0.54, 'rgba(255,248,229,0.32)');
    horizontal.addColorStop(0.72, 'rgba(255,238,205,0.08)');
    horizontal.addColorStop(1, 'rgba(255,238,205,0)');
    context.fillStyle = horizontal;
    context.fillRect(0, 0, size, size);

    context.globalCompositeOperation = 'destination-in';
    const vertical = context.createLinearGradient(0, 0, 0, size);
    vertical.addColorStop(0, 'rgba(255,255,255,0)');
    vertical.addColorStop(0.46, 'rgba(255,255,255,0.06)');
    vertical.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    vertical.addColorStop(0.54, 'rgba(255,255,255,0.06)');
    vertical.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = vertical;
    context.fillRect(0, 0, size, size);
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
