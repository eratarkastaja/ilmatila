import * as THREE from 'three';

export function makeClouds() {
  const group = new THREE.Group();
  let seed = 35;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const texture = makeCloudTexture(rand);
  const cloudCount = 220;
  const cloudMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: {
      cloudTexture: { value: texture },
      fogColor: { value: new THREE.Color('#9baeb4') },
      fogDensity: { value: 0.00016 },
    },
    vertexShader: `
      #include <common>
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
        vUv = uv;
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
        float fog = exp(-fogDensity * vDistance * 0.78);
        float horizonFade = 1.0 - smoothstep(11000.0, 19000.0, vDistance);
        float alpha = cloud.a * 0.84 * fog * horizonFade;
        vec3 color = mix(fogColor, cloud.rgb, clamp(fog, 0.0, 1.0));
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
  for (let i = 0; i < cloudCount; i += 2) {
    const width = 430 + rand() * 720;
    const height = 180 + rand() * 290;
    const x = (rand() - 0.5) * 18000;
    const y = 2200 + rand() * 1700;
    const z = (rand() - 0.5) * 18000;
    const angle = rand() * Math.PI * 2;
    for (let layer = 0; layer < 2; layer++) {
      const puffScale = layer ? 0.68 : 1;
      dummy.position.set(
        x + (layer ? (rand() - 0.5) * width * 0.2 : 0),
        y + layer * 55,
        z + (layer ? (rand() - 0.5) * width * 0.12 : 0)
      );
      dummy.rotation.set(0, 0, angle + (layer ? (rand() - 0.5) * 0.8 : 0));
      dummy.scale.set(width * puffScale, height * (layer ? 1.12 : 1), 1);
      dummy.updateMatrix();
      cloudMesh.setMatrixAt(i + layer, dummy.matrix);
    }
  }
  cloudMesh.instanceMatrix.needsUpdate = true;
  cloudMesh.frustumCulled = false;
  group.add(cloudMesh);
  return group;
}

function makeCloudTexture(rand) {
  const width = 512, height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const fields = [
    makeNoiseField(7, 5, rand),
    makeNoiseField(15, 10, rand),
    makeNoiseField(31, 19, rand),
    makeNoiseField(63, 35, rand),
  ];
  const puffs = [
    [0.18, 0.58, 0.2, 0.3], [0.36, 0.45, 0.25, 0.42], [0.57, 0.53, 0.27, 0.4],
    [0.79, 0.58, 0.2, 0.31], [0.48, 0.68, 0.36, 0.23],
  ];
  const smooth = (a, b, value) => {
    const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      let shape = 0;
      for (const [cx, cy, rx, ry] of puffs) {
        const dx = (u - cx) / rx, dy = (v - cy) / ry;
        shape = Math.max(shape, Math.exp(-(dx * dx + dy * dy) * 1.35));
      }
      const noise = sampleNoise(fields[0], u, v) * 0.42
        + sampleNoise(fields[1], u, v) * 0.29
        + sampleNoise(fields[2], u, v) * 0.19
        + sampleNoise(fields[3], u, v) * 0.10;
      const density = shape * (0.78 + (noise - 0.5) * 0.82);
      const alpha = smooth(0.27, 0.65, density) * smooth(0.08, 0.28, shape);
      const shade = 0.82 + noise * 0.15 + (0.5 - v) * 0.05;
      const index = (y * width + x) * 4;
      image.data[index] = 255 * shade;
      image.data[index + 1] = 255 * (shade * 0.995);
      image.data[index + 2] = 255 * (shade * 0.97);
      image.data[index + 3] = 255 * alpha;
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

