import * as THREE from 'three';

const MISSILE_SMOKE_FRESH = new THREE.Color('#929b9f');
const MISSILE_SMOKE_AGED = new THREE.Color('#c1c8ca');
const WING_VAPOR_COLOR = [0.88, 0.94, 0.97];

export class FlightFX {
  constructor(scene) {
    this.scene = scene;
    this.maxParticles = 1800;
    this.nextParticle = 0;
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);
    this.alphas = new Float32Array(this.maxParticles);
    this.glows = new Float32Array(this.maxParticles);
    this.ages = new Float32Array(this.maxParticles);
    this.lifetimes = new Float32Array(this.maxParticles);
    this.velocities = new Float32Array(this.maxParticles * 3);
    this.initialSizes = new Float32Array(this.maxParticles);
    this.initialAlphas = new Float32Array(this.maxParticles);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('glow', new THREE.BufferAttribute(this.glows, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, this.maxParticles);
    const material = new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: Math.min(globalThis.devicePixelRatio ?? 1, 2) } },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        attribute float glow;
        attribute vec3 color;
        varying float vAlpha;
        varying float vGlow;
        varying vec3 vColor;
        uniform float pixelRatio;
        void main() {
          vAlpha = alpha;
          vGlow = glow;
          vColor = color;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = clamp(size * pixelRatio * (230.0 / max(1.0, -viewPosition.z)), 1.2, 38.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying float vGlow;
        varying vec3 vColor;
        void main() {
          float radius = length(gl_PointCoord - vec2(0.5));
          float softEdge = 1.0 - smoothstep(0.12, 0.5, radius);
          float hotCore = exp(-radius * radius * 42.0) * vGlow;
          gl_FragColor = vec4(vColor * (1.0 + hotCore * 2.2), vAlpha * softEdge);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    this.particles = new THREE.Points(geometry, material);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    this.trailPointCapacity = 220;
    this.maxTrailSegments = 5500;
    this.trailPositions = new Float32Array(this.maxTrailSegments * 2 * 3);
    this.trailColors = new Float32Array(this.maxTrailSegments * 2 * 3);
    this.trailAlphas = new Float32Array(this.maxTrailSegments * 2);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setAttribute('alpha', new THREE.BufferAttribute(this.trailAlphas, 1).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setDrawRange(0, 0);
    this.contrailLines = new THREE.LineSegments(trailGeometry, new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 color;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() { gl_FragColor = vec4(vColor, vAlpha); }
      `,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }));
    this.contrailLines.frustumCulled = false;
    this.scene.add(this.contrailLines);

    this.vaporTrailCapacity = 38;
    this.maxVaporTrails = 48;
    this.vaporCrossSection = 5;
    this.maxVaporVertices = this.vaporTrailCapacity * this.vaporCrossSection * this.maxVaporTrails;
    this.vaporPositions = new Float32Array(this.maxVaporVertices * 3);
    this.vaporColors = new Float32Array(this.maxVaporVertices * 3);
    this.vaporAlphas = new Float32Array(this.maxVaporVertices);
    this.vaporIndices = new Uint32Array((this.vaporTrailCapacity - 1) * (this.vaporCrossSection - 1) * 6 * this.maxVaporTrails);
    const vaporGeometry = new THREE.BufferGeometry();
    vaporGeometry.setAttribute('position', new THREE.BufferAttribute(this.vaporPositions, 3).setUsage(THREE.DynamicDrawUsage));
    vaporGeometry.setAttribute('color', new THREE.BufferAttribute(this.vaporColors, 3).setUsage(THREE.DynamicDrawUsage));
    vaporGeometry.setAttribute('alpha', new THREE.BufferAttribute(this.vaporAlphas, 1).setUsage(THREE.DynamicDrawUsage));
    vaporGeometry.setIndex(new THREE.BufferAttribute(this.vaporIndices, 1).setUsage(THREE.DynamicDrawUsage));
    vaporGeometry.setDrawRange(0, 0);
    this.wingVaporRibbon = new THREE.Mesh(vaporGeometry, new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 color;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() { gl_FragColor = vec4(vColor, vAlpha); }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    this.wingVaporRibbon.frustumCulled = false;
    this.scene.add(this.wingVaporRibbon);

    this.missileTrailCapacity = 192;
    this.maxMissileTrails = 24;
    this.missileTrailCrossSection = 9;
    this.missileTrailLifetime = 4.8;
    this.maxMissileTrailVertices = this.missileTrailCapacity * this.missileTrailCrossSection * this.maxMissileTrails;
    this.missileTrailPositions = new Float32Array(this.maxMissileTrailVertices * 3);
    this.missileTrailColors = new Float32Array(this.maxMissileTrailVertices * 3);
    this.missileTrailAlphas = new Float32Array(this.maxMissileTrailVertices);
    this.missileTrailUvs = new Float32Array(this.maxMissileTrailVertices * 2);
    this.missileTrailIndices = new Uint32Array(
      (this.missileTrailCapacity - 1) * (this.missileTrailCrossSection - 1) * 6 * this.maxMissileTrails,
    );
    const missileTrailGeometry = new THREE.BufferGeometry();
    missileTrailGeometry.setAttribute('position', new THREE.BufferAttribute(this.missileTrailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    missileTrailGeometry.setAttribute('color', new THREE.BufferAttribute(this.missileTrailColors, 3).setUsage(THREE.DynamicDrawUsage));
    missileTrailGeometry.setAttribute('alpha', new THREE.BufferAttribute(this.missileTrailAlphas, 1).setUsage(THREE.DynamicDrawUsage));
    missileTrailGeometry.setAttribute('trailUv', new THREE.BufferAttribute(this.missileTrailUvs, 2).setUsage(THREE.DynamicDrawUsage));
    missileTrailGeometry.setIndex(new THREE.BufferAttribute(this.missileTrailIndices, 1).setUsage(THREE.DynamicDrawUsage));
    missileTrailGeometry.setDrawRange(0, 0);
    this.missileTrailMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        attribute vec3 color;
        attribute float alpha;
        attribute vec2 trailUv;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec2 vTrailUv;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vTrailUv = trailUv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec2 vTrailUv;
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 cell = floor(p);
          vec2 fraction = fract(p);
          fraction = fraction * fraction * (3.0 - 2.0 * fraction);
          float a = hash(cell);
          float b = hash(cell + vec2(1.0, 0.0));
          float c = hash(cell + vec2(0.0, 1.0));
          float d = hash(cell + vec2(1.0, 1.0));
          return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
        }
        void main() {
          float turbulence = noise(vTrailUv * vec2(118.0, 7.0) + vec2(time * 0.7, -time * 0.16));
          float wisps = mix(0.72, 1.12, turbulence);
          gl_FragColor = vec4(vColor, vAlpha * wisps);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.missileTrailMesh = new THREE.Mesh(missileTrailGeometry, this.missileTrailMaterial);
    this.missileTrailMesh.frustumCulled = false;
    this.scene.add(this.missileTrailMesh);

    this.tracerCapacity = 256;
    this.tracers = [];
    this.tracerPositions = new Float32Array(this.tracerCapacity * 2 * 3);
    this.tracerColors = new Float32Array(this.tracerCapacity * 2 * 3);
    const tracerGeometry = new THREE.BufferGeometry();
    tracerGeometry.setAttribute('position', new THREE.BufferAttribute(this.tracerPositions, 3).setUsage(THREE.DynamicDrawUsage));
    tracerGeometry.setDrawRange(0, 0);
    tracerGeometry.setAttribute('color', new THREE.BufferAttribute(this.tracerColors, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerLines = new THREE.LineSegments(tracerGeometry, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    this.tracerLines.frustumCulled = false;
    this.scene.add(this.tracerLines);

    this.contrailStates = new Map();
    this.wingVaporStates = new Map();
    this.missileTrailStates = new Map();
    this._world = new THREE.Vector3();
    this._wind = new THREE.Vector3();
    this._jitter = new THREE.Vector3();
    this._vaporTangent = new THREE.Vector3();
    this._vaporView = new THREE.Vector3();
    this._vaporSide = new THREE.Vector3();
    this._vaporPrev = new THREE.Vector3();
    this._vaporNext = new THREE.Vector3();
    this._missileTangent = new THREE.Vector3();
    this._missileView = new THREE.Vector3();
    this._missileSide = new THREE.Vector3();
    this._missilePrev = new THREE.Vector3();
    this._missileNext = new THREE.Vector3();
    this._missileCenter = new THREE.Vector3();
    this._missileColor = new THREE.Color();
    this._tracerHead = new THREE.Vector3();
    this._tracerTail = new THREE.Vector3();
  }

  addTracer(start, end, color = '#fff1ad') {
    if (this.tracers.length >= this.tracerCapacity) this.tracers.shift();
    this.tracers.push({ start: start.clone(), end: end.clone(), color: new THREE.Color(color), life: 0.085, maxLife: 0.085 });
  }

  addMovingTracer(start, velocity, color = '#ffd282', { life = 0.14, trailTime = 0.06, gravity = 0 } = {}) {
    if (this.tracers.length >= this.tracerCapacity) this.tracers.shift();
    this.tracers.push({
      start: start.clone(), velocity: velocity.clone(), color: new THREE.Color(color),
      life, maxLife: life, age: 0, trailTime, gravity,
    });
  }

  update(dt, aircraft, missiles, terrain, weather, camera) {
    this.updateWingVapor(dt, aircraft, terrain, weather, camera);
    this.updateContrails(dt, aircraft, terrain, weather);
    this.emitMissileTrails(dt, missiles, camera);
    this.updateParticles(dt);
    this.updateTracers(dt);
  }

  reset() {
    this.contrailStates.clear();
    this.wingVaporStates.clear();
    this.missileTrailStates.clear();
    this.tracers.length = 0;
    this.lifetimes.fill(0);
    this.alphas.fill(0);
    this.glows.fill(0);
    this.trailAlphas.fill(0);
    this.vaporAlphas.fill(0);
    this.contrailLines.geometry.setDrawRange(0, 0);
    this.wingVaporRibbon.geometry.setDrawRange(0, 0);
    this.missileTrailMesh.geometry.setDrawRange(0, 0);
    this.tracerLines.geometry.setDrawRange(0, 0);
    this.particles.geometry.attributes.alpha.needsUpdate = true;
    this.particles.geometry.attributes.glow.needsUpdate = true;
    this.contrailLines.geometry.attributes.alpha.needsUpdate = true;
    this.wingVaporRibbon.geometry.attributes.alpha.needsUpdate = true;
    this.missileTrailMesh.geometry.attributes.alpha.needsUpdate = true;
  }

  updateWingVapor(dt, aircraft, terrain, weather, camera) {
    const humidity = THREE.MathUtils.clamp(weather?.humidity ?? 0.78, 0, 1);
    const coverage = THREE.MathUtils.clamp(weather?.cloudCoverage ?? 0.62, 0, 1);
    const moisture = humidity * (0.55 + coverage * 0.45);
    const wind = weather?.wind ?? this._wind.set(5, 0.15, -3);
    const active = new Set(aircraft);
    const lifetime = 0.72;

    for (const [mesh, state] of this.wingVaporStates) {
      let hasPoints = false;
      for (const trail of state.trails) {
        for (let i = 0; i < trail.count; i++) {
          const index = (trail.head - trail.count + i + this.vaporTrailCapacity) % this.vaporTrailCapacity;
          trail.ages[index] += dt;
          const offset = index * 3;
          trail.positions[offset] += wind.x * dt;
          trail.positions[offset + 1] += wind.y * dt;
          trail.positions[offset + 2] += wind.z * dt;
        }
        while (trail.count > 0) {
          const oldest = (trail.head - trail.count + this.vaporTrailCapacity) % this.vaporTrailCapacity;
          if (trail.ages[oldest] < lifetime) break;
          trail.count--;
        }
        hasPoints ||= trail.count > 0;
      }
      if (!active.has(mesh) && !hasPoints) this.wingVaporStates.delete(mesh);
    }

    for (const mesh of aircraft) {
      if (!mesh?.parent || mesh.userData.destroyed) continue;
      const offsets = mesh.userData.vaporOffsets;
      if (!offsets?.length) continue;

      let state = this.wingVaporStates.get(mesh);
      if (!state) {
        const trails = offsets.map(() => ({
          positions: new Float32Array(this.vaporTrailCapacity * 3),
          ages: new Float32Array(this.vaporTrailCapacity),
          strengths: new Float32Array(this.vaporTrailCapacity),
          head: 0,
          count: 0,
          timer: Math.random() * 0.025,
        }));
        state = { trails };
        this.wingVaporStates.set(mesh, state);
      }

      const altitude = mesh.position.y - terrain.sampleHeight(mesh.position.x, mesh.position.z);
      const bank = Math.abs(mesh.userData.bankAngle ?? mesh.rotation.z);
      const turnLoad = THREE.MathUtils.smoothstep(bank, THREE.MathUtils.degToRad(23), THREE.MathUtils.degToRad(64));
      const coldAir = THREE.MathUtils.lerp(0.76, 1, THREE.MathUtils.smoothstep(altitude, 250, 5200));
      const strength = turnLoad * moisture * coldAir;
      mesh.userData.vaporStrength = strength;
      if (strength < 0.045) {
        for (const trail of state.trails) trail.timer = 0;
        continue;
      }

      for (let i = 0; i < state.trails.length; i++) {
        const trail = state.trails[i];
        trail.timer -= dt;
        if (trail.timer > 0) continue;
        const offset = offsets[i];
        this._world.set(offset[0], offset[1], offset[2]);
        mesh.localToWorld(this._world);
        this._jitter.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.38, (Math.random() - 0.5) * 0.7);
        this._world.add(this._jitter);

        const point = trail.head;
        const pointOffset = point * 3;
        trail.positions[pointOffset] = this._world.x;
        trail.positions[pointOffset + 1] = this._world.y;
        trail.positions[pointOffset + 2] = this._world.z;
        trail.ages[point] = 0;
        trail.strengths[point] = strength;
        trail.head = (point + 1) % this.vaporTrailCapacity;
        trail.count = Math.min(trail.count + 1, this.vaporTrailCapacity);
        trail.timer = 0.025;
      }
    }
    this.buildWingVaporGeometry(camera, lifetime);
  }

  buildWingVaporGeometry(camera, lifetime) {
    const widths = [-1, -0.52, 0, 0.52, 1];
    const edgeAlpha = [0, 0.62, 1, 0.62, 0];
    let vertexCount = 0, indexCount = 0;
    for (const state of this.wingVaporStates.values()) {
      for (const trail of state.trails) {
        if (trail.count < 2 || vertexCount + trail.count * this.vaporCrossSection > this.maxVaporVertices) continue;
        const oldest = (trail.head - trail.count + this.vaporTrailCapacity) % this.vaporTrailCapacity;
        const firstVertex = vertexCount;
        for (let i = 0; i < trail.count; i++) {
          const point = (oldest + i) % this.vaporTrailCapacity;
          const pointOffset = point * 3;
          this._vaporPrev.fromArray(trail.positions, ((oldest + Math.max(0, i - 1)) % this.vaporTrailCapacity) * 3);
          this._vaporNext.fromArray(trail.positions, ((oldest + Math.min(trail.count - 1, i + 1)) % this.vaporTrailCapacity) * 3);
          this._vaporTangent.subVectors(this._vaporNext, this._vaporPrev).normalize();
          this._vaporView.subVectors(camera.position, this._vaporPrev.set(trail.positions[pointOffset], trail.positions[pointOffset + 1], trail.positions[pointOffset + 2]));
          this._vaporSide.crossVectors(this._vaporTangent, this._vaporView).normalize();
          if (this._vaporSide.lengthSq() < 0.01) {
            this._vaporSide.set(0, 1, 0).cross(this._vaporTangent).normalize();
            if (this._vaporSide.lengthSq() < 0.01) this._vaporSide.set(1, 0, 0);
          }

          const age = trail.ages[point] / lifetime;
          const fadeIn = THREE.MathUtils.smoothstep(age, 0, 0.07);
          const fadeOut = 1 - THREE.MathUtils.smoothstep(age, 0.52, 1);
          const pointStrength = trail.strengths[point];
          const alpha = pointStrength * 0.72 * fadeIn * fadeOut;
          const width = (1.4 + pointStrength * 2.8) * (0.7 + age * 0.45);
          const centerX = trail.positions[pointOffset], centerY = trail.positions[pointOffset + 1], centerZ = trail.positions[pointOffset + 2];
          for (let edge = 0; edge < this.vaporCrossSection; edge++) {
            const vertex = vertexCount++;
            const offset = vertex * 3;
            const spread = widths[edge] * width * 0.5;
            this.vaporPositions[offset] = centerX + this._vaporSide.x * spread;
            this.vaporPositions[offset + 1] = centerY + this._vaporSide.y * spread;
            this.vaporPositions[offset + 2] = centerZ + this._vaporSide.z * spread;
            this.vaporColors[offset] = WING_VAPOR_COLOR[0];
            this.vaporColors[offset + 1] = WING_VAPOR_COLOR[1];
            this.vaporColors[offset + 2] = WING_VAPOR_COLOR[2];
            this.vaporAlphas[vertex] = alpha * edgeAlpha[edge];
          }
        }
        for (let i = 0; i < trail.count - 1; i++) {
          for (let edge = 0; edge < this.vaporCrossSection - 1; edge++) {
            const a = firstVertex + i * this.vaporCrossSection + edge;
            const b = a + 1;
            const c = a + this.vaporCrossSection;
            const d = c + 1;
            this.vaporIndices[indexCount++] = a; this.vaporIndices[indexCount++] = c; this.vaporIndices[indexCount++] = b;
            this.vaporIndices[indexCount++] = b; this.vaporIndices[indexCount++] = c; this.vaporIndices[indexCount++] = d;
          }
        }
      }
    }
    const geometry = this.wingVaporRibbon.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.alpha.needsUpdate = true;
    geometry.index.needsUpdate = true;
    geometry.setDrawRange(0, indexCount);
  }

  updateContrails(dt, aircraft, terrain, weather) {
    const base = weather?.contrailBaseAltitude ?? 5200;
    const full = weather?.contrailFullAltitude ?? 6800;
    const humidity = THREE.MathUtils.clamp(weather?.humidity ?? 0.78, 0, 1);
    const coverage = THREE.MathUtils.clamp(weather?.cloudCoverage ?? 0.62, 0, 1);
    const moisture = humidity * (0.52 + coverage * 0.48);
    const wind = weather?.wind ?? this._wind.set(5, 0.15, -3);
    const active = new Set(aircraft);
    for (const [mesh, state] of this.contrailStates) {
      let hasPoints = false;
      for (const trail of state.trails) {
        for (let i = 0; i < trail.count; i++) {
          const index = (trail.head - trail.count + i + this.trailPointCapacity) % this.trailPointCapacity;
          trail.ages[index] += dt;
          const offset = index * 3;
          trail.positions[offset] += wind.x * dt;
          trail.positions[offset + 1] += wind.y * dt;
          trail.positions[offset + 2] += wind.z * dt;
        }
        while (trail.count > 0) {
          const oldest = (trail.head - trail.count + this.trailPointCapacity) % this.trailPointCapacity;
          if (trail.ages[oldest] < (trail.lifetimes[oldest] || 14)) break;
          trail.count--;
        }
        hasPoints ||= trail.count > 0;
      }
      if (!active.has(mesh) && !hasPoints) this.contrailStates.delete(mesh);
    }

    for (const aircraftMesh of aircraft) {
      if (!aircraftMesh?.parent || aircraftMesh.userData.destroyed) continue;
      const altitude = aircraftMesh.position.y - terrain.sampleHeight(aircraftMesh.position.x, aircraftMesh.position.z);
      const cruiseContrail = THREE.MathUtils.smoothstep(altitude, base, full) * moisture;
      const afterburnerWake = aircraftMesh.userData.boosting
        ? THREE.MathUtils.smoothstep(altitude, 1800, 3600) * moisture * 0.24
        : 0;
      const density = Math.max(cruiseContrail, afterburnerWake);
      const shortAfterburnerWake = afterburnerWake > cruiseContrail;
      let state = this.contrailStates.get(aircraftMesh);
      if (!state) {
        const offsets = aircraftMesh.userData.trailOffsets ?? [[0, 0, -7]];
        const trails = offsets.map(() => ({
          positions: new Float32Array(this.trailPointCapacity * 3),
          ages: new Float32Array(this.trailPointCapacity),
          strengths: new Float32Array(this.trailPointCapacity),
          lifetimes: new Float32Array(this.trailPointCapacity),
          head: 0,
          count: 0,
          timer: 0,
        }));
        state = { trails };
        this.contrailStates.set(aircraftMesh, state);
      }
      if (density <= 0.025) continue;
      for (let i = 0; i < state.trails.length; i++) {
        const trail = state.trails[i];
        trail.timer -= dt;
        if (trail.timer > 0) continue;
        const offset = aircraftMesh.userData.trailOffsets?.[i] ?? [0, 0, -7];
        this._world.set(offset[0], offset[1], offset[2]);
        aircraftMesh.localToWorld(this._world);
        const index = trail.head;
        const positionOffset = index * 3;
        trail.positions[positionOffset] = this._world.x;
        trail.positions[positionOffset + 1] = this._world.y;
        trail.positions[positionOffset + 2] = this._world.z;
        trail.ages[index] = 0;
        trail.lifetimes[index] = shortAfterburnerWake ? 4.5 : 14;
        trail.strengths[index] = density * (shortAfterburnerWake ? 0.31 : 0.62);
        trail.head = (index + 1) % this.trailPointCapacity;
        trail.count = Math.min(trail.count + 1, this.trailPointCapacity);
        trail.timer = 0.07;
      }
    }
    this.buildContrailGeometry();
  }

  buildContrailGeometry() {
    let segments = 0;
    const color = [0.74, 0.84, 0.88];
    for (const state of this.contrailStates.values()) {
      for (const trail of state.trails) {
        if (trail.count < 2) continue;
        const oldest = (trail.head - trail.count + this.trailPointCapacity) % this.trailPointCapacity;
        for (let i = 0; i < trail.count - 1 && segments < this.maxTrailSegments; i++) {
          const a = (oldest + i) % this.trailPointCapacity;
          const b = (a + 1) % this.trailPointCapacity;
          const ageA = trail.ages[a] / (trail.lifetimes[a] || 14);
          const ageB = trail.ages[b] / (trail.lifetimes[b] || 14);
          const fadeA = trail.strengths[a] * THREE.MathUtils.smoothstep(ageA, 0, 0.018) * (1 - THREE.MathUtils.smoothstep(ageA, 0.68, 1));
          const fadeB = trail.strengths[b] * THREE.MathUtils.smoothstep(ageB, 0, 0.018) * (1 - THREE.MathUtils.smoothstep(ageB, 0.68, 1));
          if (fadeA < 0.006 && fadeB < 0.006) continue;
          const dst = segments * 6, srcA = a * 3, srcB = b * 3;
          this.trailPositions[dst] = trail.positions[srcA];
          this.trailPositions[dst + 1] = trail.positions[srcA + 1];
          this.trailPositions[dst + 2] = trail.positions[srcA + 2];
          this.trailPositions[dst + 3] = trail.positions[srcB];
          this.trailPositions[dst + 4] = trail.positions[srcB + 1];
          this.trailPositions[dst + 5] = trail.positions[srcB + 2];
          for (let vertex = 0; vertex < 2; vertex++) {
            const colorOffset = dst + vertex * 3;
            this.trailColors[colorOffset] = color[0];
            this.trailColors[colorOffset + 1] = color[1];
            this.trailColors[colorOffset + 2] = color[2];
          }
          this.trailAlphas[segments * 2] = fadeA;
          this.trailAlphas[segments * 2 + 1] = fadeB;
          segments++;
        }
      }
    }
    const geometry = this.contrailLines.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.alpha.needsUpdate = true;
    geometry.setDrawRange(0, segments * 2);
  }

  emitMissileTrails(dt, missiles, camera) {
    const active = new Set();
    const wind = this._wind.set(5, 0.15, -3);
    for (const missile of missiles) {
      if (missile.homing && missile.mesh?.parent) active.add(missile.mesh);
    }

    for (const [mesh, trail] of this.missileTrailStates) {
      for (let i = 0; i < trail.count; i++) {
        const point = (trail.head - trail.count + i + this.missileTrailCapacity) % this.missileTrailCapacity;
        trail.ages[point] += dt;
        const offset = point * 3;
        trail.positions[offset] += wind.x * dt;
        trail.positions[offset + 1] += wind.y * dt;
        trail.positions[offset + 2] += wind.z * dt;
      }
      while (trail.count > 0) {
        const oldest = (trail.head - trail.count + this.missileTrailCapacity) % this.missileTrailCapacity;
        if (trail.ages[oldest] < this.missileTrailLifetime) break;
        trail.count--;
      }
      if (!active.has(mesh) && trail.count === 0) this.missileTrailStates.delete(mesh);
    }

    for (const missile of missiles) {
      const mesh = missile.mesh;
      if (!missile.homing || !missile.motorBurning || !mesh?.parent) continue;
      let trail = this.missileTrailStates.get(mesh);
      if (!trail) {
        trail = {
          positions: new Float32Array(this.missileTrailCapacity * 3),
          ages: new Float32Array(this.missileTrailCapacity),
          head: 0,
          count: 0,
          timer: 0,
        };
        this.missileTrailStates.set(mesh, trail);
      }
      trail.timer -= dt;
      if (trail.timer > 0) continue;

      const point = trail.head;
      const rear = mesh.localToWorld(this._world.set(0, 0, -1.85));
      const offset = point * 3;
      trail.positions[offset] = rear.x;
      trail.positions[offset + 1] = rear.y;
      trail.positions[offset + 2] = rear.z;
      trail.ages[point] = 0;
      trail.head = (point + 1) % this.missileTrailCapacity;
      trail.count = Math.min(trail.count + 1, this.missileTrailCapacity);
      trail.timer = 0.025;
    }

    this.missileTrailMaterial.uniforms.time.value += dt;
    this.buildMissileTrailGeometry(camera);
  }

  buildMissileTrailGeometry(camera) {
    const crossSection = this.missileTrailCrossSection;
    const widths = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
    const opacity = [0, 0.13, 0.38, 0.67, 0.82, 0.67, 0.38, 0.13, 0];
    let vertexCount = 0, indexCount = 0, trailCount = 0;

    for (const trail of this.missileTrailStates.values()) {
      if (trail.count < 2 || trailCount >= this.maxMissileTrails) continue;
      if (vertexCount + trail.count * crossSection > this.maxMissileTrailVertices) break;
      const oldest = (trail.head - trail.count + this.missileTrailCapacity) % this.missileTrailCapacity;
      const firstVertex = vertexCount;

      for (let i = 0; i < trail.count; i++) {
        const point = (oldest + i) % this.missileTrailCapacity;
        const offset = point * 3;
        const center = this._missileCenter.set(trail.positions[offset], trail.positions[offset + 1], trail.positions[offset + 2]);
        const previous = (oldest + Math.max(0, i - 1)) % this.missileTrailCapacity;
        const next = (oldest + Math.min(trail.count - 1, i + 1)) % this.missileTrailCapacity;
        this._missileTangent.subVectors(
          this._missileNext.fromArray(trail.positions, next * 3),
          this._missilePrev.fromArray(trail.positions, previous * 3),
        ).normalize();
        this._missileView.subVectors(camera.position, center).normalize();
        this._missileSide.crossVectors(this._missileTangent, this._missileView).normalize();
        if (this._missileSide.lengthSq() < 0.01) {
          this._missileSide.set(0, 1, 0).cross(this._missileTangent).normalize();
          if (this._missileSide.lengthSq() < 0.01) this._missileSide.set(1, 0, 0);
        }

        const age = trail.ages[point];
        const ageRatio = THREE.MathUtils.clamp(age / this.missileTrailLifetime, 0, 1);
        const fade = 1 - THREE.MathUtils.smoothstep(age, 3.0, this.missileTrailLifetime);
        const expandingWidth = (1.15 + age * 2.55) * (0.94 + Math.sin(age * 3.2 + center.x * 0.0017) * 0.06);
        this._missileColor.lerpColors(MISSILE_SMOKE_FRESH, MISSILE_SMOKE_AGED, ageRatio);

        for (let edge = 0; edge < crossSection; edge++) {
          const vertex = vertexCount++;
          const positionOffset = vertex * 3;
          const colorOffset = positionOffset;
          const uvOffset = vertex * 2;
          const spread = widths[edge] * expandingWidth * 0.5;
          this.missileTrailPositions[positionOffset] = center.x + this._missileSide.x * spread;
          this.missileTrailPositions[positionOffset + 1] = center.y + this._missileSide.y * spread;
          this.missileTrailPositions[positionOffset + 2] = center.z + this._missileSide.z * spread;
          this.missileTrailColors[colorOffset] = this._missileColor.r;
          this.missileTrailColors[colorOffset + 1] = this._missileColor.g;
          this.missileTrailColors[colorOffset + 2] = this._missileColor.b;
          this.missileTrailAlphas[vertex] = fade * opacity[edge] * 0.62;
          this.missileTrailUvs[uvOffset] = ageRatio;
          this.missileTrailUvs[uvOffset + 1] = edge / (crossSection - 1);
        }
      }

      for (let i = 0; i < trail.count - 1; i++) {
        for (let edge = 0; edge < crossSection - 1; edge++) {
          const a = firstVertex + i * crossSection + edge;
          const b = a + 1;
          const c = a + crossSection;
          const d = c + 1;
          this.missileTrailIndices[indexCount++] = a;
          this.missileTrailIndices[indexCount++] = c;
          this.missileTrailIndices[indexCount++] = b;
          this.missileTrailIndices[indexCount++] = b;
          this.missileTrailIndices[indexCount++] = c;
          this.missileTrailIndices[indexCount++] = d;
        }
      }
      trailCount++;
    }

    const geometry = this.missileTrailMesh.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.alpha.needsUpdate = true;
    geometry.attributes.trailUv.needsUpdate = true;
    geometry.index.needsUpdate = true;
    geometry.setDrawRange(0, indexCount);
  }

  emitParticle(position, velocity, color, lifetime, size, alpha, glow = 0) {
    const index = this.nextParticle;
    this.nextParticle = (index + 1) % this.maxParticles;
    const offset = index * 3;
    this.positions[offset] = position.x;
    this.positions[offset + 1] = position.y;
    this.positions[offset + 2] = position.z;
    this.velocities[offset] = velocity.x;
    this.velocities[offset + 1] = velocity.y;
    this.velocities[offset + 2] = velocity.z;
    this.ages[index] = 0;
    this.lifetimes[index] = lifetime;
    this.initialSizes[index] = size;
    this.initialAlphas[index] = alpha;
    this.glows[index] = glow;
    this.colors[offset] = color.r;
    this.colors[offset + 1] = color.g;
    this.colors[offset + 2] = color.b;
    this.alphas[index] = alpha;
    this.sizes[index] = size;
  }

  updateParticles(dt) {
    for (let i = 0; i < this.maxParticles; i++) {
      const lifetime = this.lifetimes[i];
      if (lifetime <= 0) continue;
      const age = this.ages[i] + dt;
      if (age >= lifetime) {
        this.lifetimes[i] = 0;
        this.alphas[i] = 0;
        continue;
      }
      this.ages[i] = age;
      const offset = i * 3;
      if (this.glows[i] > 0.5) this.velocities[offset + 1] -= 18 * dt;
      this.positions[offset] += this.velocities[offset] * dt;
      this.positions[offset + 1] += this.velocities[offset + 1] * dt;
      this.positions[offset + 2] += this.velocities[offset + 2] * dt;
      const progress = age / lifetime;
      const fadeIn = THREE.MathUtils.smoothstep(progress, 0, 0.055);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(progress, 0.66, 1);
      const isSmoke = this.initialSizes[i] < 2;
      this.alphas[i] = this.initialAlphas[i] * fadeIn * fadeOut;
      this.sizes[i] = this.initialSizes[i] * (isSmoke ? 1 + progress * 1.8 : 0.7 + progress * 1.9);
    }
    const geometry = this.particles.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.size.needsUpdate = true;
    geometry.attributes.alpha.needsUpdate = true;
    geometry.attributes.glow.needsUpdate = true;
  }

  updateTracers(dt) {
    let count = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      if (tracer.velocity) tracer.age += dt;
      if (tracer.life <= 0) this.tracers.splice(i, 1);
    }
    for (const tracer of this.tracers) {
      if (count >= this.tracerCapacity) break;
      const offset = count * 6;
      let start = tracer.start;
      let end = tracer.end;
      if (tracer.velocity) {
        const headAge = tracer.age;
        const tailAge = Math.max(0, headAge - tracer.trailTime);
        end = this._tracerHead.copy(tracer.start).addScaledVector(tracer.velocity, headAge);
        end.y -= 0.5 * tracer.gravity * headAge * headAge;
        start = this._tracerTail.copy(tracer.start).addScaledVector(tracer.velocity, tailAge);
        start.y -= 0.5 * tracer.gravity * tailAge * tailAge;
      }
      this.tracerPositions[offset] = start.x;
      this.tracerPositions[offset + 1] = start.y;
      this.tracerPositions[offset + 2] = start.z;
      this.tracerPositions[offset + 3] = end.x;
      this.tracerPositions[offset + 4] = end.y;
      this.tracerPositions[offset + 5] = end.z;
      const fade = Math.min(1, tracer.life / tracer.maxLife);
      for (let vertex = 0; vertex < 2; vertex++) {
        const colorOffset = offset + vertex * 3;
        this.tracerColors[colorOffset] = tracer.color.r * fade;
        this.tracerColors[colorOffset + 1] = tracer.color.g * fade;
        this.tracerColors[colorOffset + 2] = tracer.color.b * fade;
      }
      count++;
    }
    const geometry = this.tracerLines.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.setDrawRange(0, count * 2);
  }
}
