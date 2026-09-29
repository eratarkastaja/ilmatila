import * as THREE from 'three';
import { ATMOSPHERE } from './atmosphere.js';

export function makeClouds() {
  const group = new THREE.Group();
  let seed = 35;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const texture = makeCloudTexture(rand);
  const cloudCount = 300;
  const cloudGeometry = new THREE.PlaneGeometry(1, 1);
  const cloudVariants = new Float32Array(cloudCount);
  const cloudMesh = new THREE.InstancedMesh(cloudGeometry, new THREE.ShaderMaterial({
    uniforms: {
      cloudTexture: { value: texture },
      fogColor: { value: new THREE.Color(ATMOSPHERE.hazeColor) },
      fogDensity: { value: ATMOSPHERE.cloudFogDensity },
    },
    vertexShader: `
      #include <common>
      attribute float cloudVariant;
      varying vec2 vUv;
      varying float vDistance;
      void main() {
        vec3 centerWorld = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
        vec4 centerView = viewMatrix * vec4(centerWorld, 1.0);
        float width = length(instanceMatrix[0].xyz);
        float height = length(instanceMatrix[1].xyz);
        float angle = atan(instanceMatrix[0].y, instanceMatrix[0].x);
        mat2 spin = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        centerView.xy += spin * position.xy * vec2(width, height);
        gl_Position = projectionMatrix * centerView;
        float atlasInset = 0.018;
        vUv = vec2((cloudVariant + atlasInset + uv.x * (1.0 - atlasInset * 2.0)) * 0.25, uv.y);
        vDistance = -centerView.z;
      }
    `,
    fragmentShader: `
      uniform sampler2D cloudTexture;
      uniform vec3 fogColor;
      uniform float fogDensity;
      varying vec2 vUv;
      varying float vDistance;
      void main() {
        vec4 cloud = texture2D(cloudTexture, vUv);
        float fog = exp(-fogDensity * vDistance);
        float horizonFade = 1.0 - smoothstep(18000.0, 27000.0, vDistance);
        float topLight = smoothstep(0.06, 0.92, vUv.y);
        float illumination = clamp(0.42 + topLight * 0.24 + cloud.r * 0.42, 0.3, 1.0);
        vec3 shadowColor = vec3(0.40, 0.47, 0.50);
        vec3 sunlitColor = vec3(0.96, 0.97, 0.96);
        vec3 cloudColor = mix(shadowColor, sunlitColor, illumination);
        float alpha = cloud.a * 0.86 * fog * horizonFade;
        vec3 color = mix(fogColor, cloudColor, clamp(fog * 1.4, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  }), cloudCount);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < cloudCount; i += 3) {
    const variant = Math.floor(rand() * 4);
    const width = 1500 + rand() * 2900;
    const height = 480 + rand() * 1120;
    const x = (rand() - 0.5) * 20000;
    const y = 2300 + rand() * 2600;
    const z = (rand() - 0.5) * 20000;
    const angle = rand() * Math.PI * 2;
    const layerScales = [1, 0.5 + rand() * 0.3, 0.27 + rand() * 0.24];
    for (let layer = 0; layer < 3; layer++) {
      const direction = rand() < 0.5 ? -1 : 1;
      const spread = layer === 0 ? 0 : layer === 1 ? 0.07 : 0.16;
      const layerScale = layerScales[layer];
      dummy.position.set(
        x + direction * rand() * width * spread,
        y + (rand() - 0.5) * height * (layer === 0 ? 0.05 : 0.2),
        z + (rand() - 0.5) * width * spread
      );
      dummy.rotation.set(0, 0, angle + (layer ? (rand() - 0.5) * 0.72 : 0));
      dummy.scale.set(
        width * layerScale,
        height * layerScale * (layer === 1 ? 0.8 + rand() * 0.4 : 0.72 + rand() * 0.45),
        1
      );
      dummy.updateMatrix();
      cloudMesh.setMatrixAt(i + layer, dummy.matrix);
      cloudVariants[i + layer] = variant;
    }
  }
  cloudGeometry.setAttribute('cloudVariant', new THREE.InstancedBufferAttribute(cloudVariants, 1));
  cloudMesh.instanceMatrix.needsUpdate = true;
  cloudMesh.frustumCulled = false;
  group.add(cloudMesh);
  return group;
}

function makeCloudTexture(rand) {
  const tileWidth = 512;
  const height = 256;
  const variantCount = 4;
  const width = tileWidth * variantCount;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const smooth = (a, b, value) => {
    const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  const profiles = [
    { count: 9, center: 0.46, vertical: 0.28, top: 0.15, base: 0.74, baseWarp: 0.12, body: 0.34 },
    { count: 7, center: 0.49, vertical: 0.34, top: 0.18, base: 0.77, baseWarp: 0.16, body: 0.3 },
    { count: 10, center: 0.43, vertical: 0.39, top: 0.11, base: 0.72, baseWarp: 0.1, body: 0.28 },
    { count: 8, center: 0.52, vertical: 0.25, top: 0.2, base: 0.75, baseWarp: 0.14, body: 0.38 },
  ];

  for (let variant = 0; variant < variantCount; variant++) {
    const fields = [
      makeNoiseField(6, 4, rand),
      makeNoiseField(13, 9, rand),
      makeNoiseField(29, 19, rand),
      makeNoiseField(61, 39, rand),
      makeNoiseField(127, 79, rand),
    ];
    const profile = profiles[variant];
    const lobeCount = profile.count + Math.floor(rand() * 4);
    const lobes = Array.from({ length: lobeCount }, () => ({
      x: 0.06 + rand() * 0.88,
      y: profile.center + (rand() - 0.5) * profile.vertical,
      rx: 0.09 + rand() * 0.105,
      ry: 0.18 + rand() * (variant === 2 ? 0.27 : 0.2),
      strength: 0.55 + rand() * 0.65,
    }));

    for (let y = 0; y < height; y++) {
      const v = y / (height - 1);
      for (let x = 0; x < tileWidth; x++) {
        const u = x / (tileWidth - 1);
        const broadNoise = sampleNoise(fields[0], u, v);
        const warpX = (broadNoise - 0.5) * 0.045;
        const warpY = (sampleNoise(fields[1], u, v) - 0.5) * 0.065;
        const warpedU = u + warpX;
        const warpedV = v + warpY;
        let shape = profile.body * Math.exp(
          -Math.pow((warpedU - 0.5) / 0.53, 2) * 0.58
          - Math.pow((warpedV - 0.57) / 0.31, 2) * 1.45
        );
        for (const lobe of lobes) {
          const dx = (warpedU - lobe.x) / lobe.rx;
          const dy = (warpedV - lobe.y) / lobe.ry;
          shape += Math.exp(-(dx * dx * 0.85 + dy * dy * 1.05)) * lobe.strength;
        }
        shape = smooth(0.28, 0.9, shape * 0.54);

        const noise = sampleNoise(fields[1], warpedU, warpedV) * 0.32
          + sampleNoise(fields[2], warpedU, warpedV) * 0.27
          + sampleNoise(fields[3], warpedU, warpedV) * 0.24
          + sampleNoise(fields[4], warpedU, warpedV) * 0.17;
        const topEdge = profile.top
          + (sampleNoise(fields[0], u, 0.18) - 0.5) * 0.19
          + (sampleNoise(fields[2], u, 0.31) - 0.5) * 0.1
          + (sampleNoise(fields[3], u, 0.48) - 0.5) * 0.045;
        const baseEdge = profile.base
          + (sampleNoise(fields[0], u, 0.82) - 0.5) * profile.baseWarp
          + (sampleNoise(fields[2], u, 0.68) - 0.5) * 0.055;
        const verticalShape = smooth(topEdge - 0.05, topEdge + 0.16, v)
          * (1 - smooth(baseEdge - 0.045, baseEdge + 0.1, v));
        const density = shape * verticalShape * (0.38 + noise * 0.92);
        const edgeFade = smooth(0, 0.055, u) * (1 - smooth(0.945, 1, u));
        const alpha = smooth(0.28, 0.72, density) * smooth(0.025, 0.24, shape) * edgeFade;
        const shade = 0.62 + noise * 0.2 + (1 - smooth(0.18, 0.62, v)) * 0.13;
        const index = (y * width + variant * tileWidth + x) * 4;
        image.data[index] = 255 * shade;
        image.data[index + 1] = 255 * (shade * 0.995);
        image.data[index + 2] = 255 * (shade * 0.97);
        image.data[index + 3] = 255 * alpha;
      }
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function makeNoiseField(width, height, rand) {
  const values = new Float32Array(width * height);
  for (let i = 0; i < values.length; i++) values[i] = rand();
  return { width, height, values };
}

function sampleNoise(field, u, v) {
  const x = u * (field.width - 1), y = v * (field.height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(field.width - 1, x0 + 1), y1 = Math.min(field.height - 1, y0 + 1);
  const tx = x - x0, ty = y - y0;
  const a = THREE.MathUtils.lerp(field.values[y0 * field.width + x0], field.values[y0 * field.width + x1], tx);
  const b = THREE.MathUtils.lerp(field.values[y1 * field.width + x0], field.values[y1 * field.width + x1], tx);
  return THREE.MathUtils.lerp(a, b, ty);
}
