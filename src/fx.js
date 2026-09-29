import * as THREE from 'three';

const MISSILE_SMOKE_COLOR = new THREE.Color('#b6b9b5');
const MISSILE_FIRE_COLOR = new THREE.Color('#ff8b37');
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
    geometry.setDrawRange(0, this.maxParticles);
    const material = new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: Math.min(globalThis.devicePixelRatio ?? 1, 2) } },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        varying float vAlpha;
        varying vec3 vColor;
        uniform float pixelRatio;
        void main() {
          vAlpha = alpha;
          vColor = color;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = clamp(size * pixelRatio * (230.0 / max(1.0, -viewPosition.z)), 1.2, 38.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float radius = length(gl_PointCoord - vec2(0.5));
          float softEdge = 1.0 - smoothstep(0.12, 0.5, radius);
          gl_FragColor = vec4(vColor, vAlpha * softEdge);
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
    this.missileTimers = new Map();
    this._world = new THREE.Vector3();
    this._velocity = new THREE.Vector3();
    this._wind = new THREE.Vector3();
    this._jitter = new THREE.Vector3();
    this._vaporTangent = new THREE.Vector3();
    this._vaporView = new THREE.Vector3();
    this._vaporSide = new THREE.Vector3();
    this._vaporPrev = new THREE.Vector3();
    this._vaporNext = new THREE.Vector3();
  }

  addTracer(start, end, color = '#fff1ad') {
    if (this.tracers.length >= this.tracerCapacity) this.tracers.shift();
    this.tracers.push({ start: start.clone(), end: end.clone(), color: new THREE.Color(color), life: 0.085 });
  }

  update(dt, aircraft, missiles, terrain, weather, camera) {
    this.updateWingVapor(dt, aircraft, terrain, weather, camera);
    this.updateContrails(dt, aircraft, terrain, weather);
    this.emitMissileTrails(dt, missiles);
    this.updateParticles(dt);
    this.updateTracers(dt);
  }

  reset() {
    this.contrailStates.clear();
    this.wingVaporStates.clear();
    this.missileTimers.clear();
    this.tracers.length = 0;
    this.lifetimes.fill(0);
    this.alphas.fill(0);
    this.trailAlphas.fill(0);
    this.vaporAlphas.fill(0);
    this.contrailLines.geometry.setDrawRange(0, 0);
    this.wingVaporRibbon.geometry.setDrawRange(0, 0);
    this.tracerLines.geometry.setDrawRange(0, 0);
    this.particles.geometry.attributes.alpha.needsUpdate = true;
    this.contrailLines.geometry.attributes.alpha.needsUpdate = true;
    this.wingVaporRibbon.geometry.attributes.alpha.needsUpdate = true;
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
          if (trail.ages[oldest] < 14) break;
          trail.count--;
        }
        hasPoints ||= trail.count > 0;
      }
      if (!active.has(mesh) && !hasPoints) this.contrailStates.delete(mesh);
    }

    for (const aircraftMesh of aircraft) {
      if (!aircraftMesh?.parent || aircraftMesh.userData.destroyed) continue;
      const altitude = aircraftMesh.position.y - terrain.sampleHeight(aircraftMesh.position.x, aircraftMesh.position.z);
      const density = THREE.MathUtils.smoothstep(altitude, base, full) * moisture;
      let state = this.contrailStates.get(aircraftMesh);
      if (!state) {
        const offsets = aircraftMesh.userData.trailOffsets ?? [[0, 0, -7]];
        const trails = offsets.map(() => ({
          positions: new Float32Array(this.trailPointCapacity * 3),
          ages: new Float32Array(this.trailPointCapacity),
          strengths: new Float32Array(this.trailPointCapacity),
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
        trail.strengths[index] = density * 0.62;
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
          const ageA = trail.ages[a] / 14;
          const ageB = trail.ages[b] / 14;
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

  emitMissileTrails(dt, missiles) {
    const active = new Set();
    for (const missile of missiles) {
      if (!missile.homing || !missile.mesh?.parent) continue;
      active.add(missile.mesh);
      const remaining = (this.missileTimers.get(missile.mesh) ?? 0) - dt;
      if (remaining <= 0) {
        const rear = missile.mesh.localToWorld(new THREE.Vector3(0, 0, -1.85));
        this._velocity.copy(missile.velocity).multiplyScalar(0.025);
        this.emitParticle(rear, this._velocity, MISSILE_SMOKE_COLOR, 1.55, 1.25, 0.78);
        this._velocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3);
        this.emitParticle(rear, this._velocity, MISSILE_FIRE_COLOR, 0.22, 0.68, 0.92);
        this.missileTimers.set(missile.mesh, 0.035);
      } else {
        this.missileTimers.set(missile.mesh, remaining);
      }
    }
    for (const mesh of this.missileTimers.keys()) if (!active.has(mesh)) this.missileTimers.delete(mesh);
  }

  emitParticle(position, velocity, color, lifetime, size, alpha) {
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
  }

  updateTracers(dt) {
    let count = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      if (tracer.life <= 0) this.tracers.splice(i, 1);
    }
    for (const tracer of this.tracers) {
      if (count >= this.tracerCapacity) break;
      const offset = count * 6;
      this.tracerPositions[offset] = tracer.start.x;
      this.tracerPositions[offset + 1] = tracer.start.y;
      this.tracerPositions[offset + 2] = tracer.start.z;
      this.tracerPositions[offset + 3] = tracer.end.x;
      this.tracerPositions[offset + 4] = tracer.end.y;
      this.tracerPositions[offset + 5] = tracer.end.z;
      for (let vertex = 0; vertex < 2; vertex++) {
        const colorOffset = offset + vertex * 3;
        this.tracerColors[colorOffset] = tracer.color.r;
        this.tracerColors[colorOffset + 1] = tracer.color.g;
        this.tracerColors[colorOffset + 2] = tracer.color.b;
      }
      count++;
    }
    const geometry = this.tracerLines.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.setDrawRange(0, count * 2);
  }
}
