const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const AUDIO_FILES = {
  cannonLoop: 'cannon-loop.ogg',
  missileLaunch: 'missile-launch.ogg',
  explosion: 'explosion.ogg',
  jetSurge: 'jet-takeoff.ogg',
};

// AudioContext and bundled sound assets are initialized on the first user gesture
// to satisfy browser autoplay policies. Procedural effects remain as fallbacks.
export class GameAudio {
  constructor() {
    this.context = null;
    this.paused = false;
    this.master = null;
    this.effects = null;
    this.ui = null;
    this.noiseBuffer = null;
    this.sampleBuffers = Object.create(null);
    this.sampleLoadPromise = null;
    this.engine = null;
    this.gunLoop = null;
    this.missileLoops = new Map();
    this.lastDistantShot = -Infinity;
    this.lastIncomingWarning = -Infinity;
    this.lastEngineUpdate = 0;

    this.unlockFromGesture = () => this.unlock();
    document.addEventListener('pointerdown', this.unlockFromGesture, { capture: true, passive: true });
    document.addEventListener('keydown', this.unlockFromGesture, { capture: true });
    this.bindInterfaceSounds();
  }

  bindInterfaceSounds() {
    document.addEventListener('click', event => {
      const button = event.target.closest?.('#start-menu button, #credits-dialog button, #pause-dialog button, #death-screen button');
      if (!button || button.disabled) return;
      this.playMenuButton(button.id === 'launch-mission' ? 'confirm' : 'button');
    }, { capture: true });
    document.addEventListener('change', event => {
      if (event.target.matches?.('#language-select, #menu-theater')) this.playMenuButton('select');
    });
  }

  unlock() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return null;
      try {
        this.context = new Context();
        this.configureGraph();
      } catch {
        this.context = null;
        return null;
      }
    }
    if (!this.paused && this.context.state === 'suspended') this.context.resume().catch(() => {});
    return this.context;
  }

  setPaused(paused) {
    this.paused = paused;
    if (!this.context) return;
    if (paused && this.context.state === 'running') this.context.suspend().catch(() => {});
    else if (!paused && this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  configureGraph() {
    const ctx = this.context;
    this.master = ctx.createGain();
    this.master.gain.value = 0.76;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 18;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.22;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);

    this.effects = ctx.createGain();
    this.effects.gain.value = 0.82;
    this.effects.connect(this.master);

    this.ui = ctx.createGain();
    this.ui.gain.value = 0.72;
    this.ui.connect(this.master);

    const impulse = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.15), ctx.sampleRate);
    const samples = impulse.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const fade = 1 - i / samples.length;
      samples[i] = (Math.random() * 2 - 1) * fade * fade * fade;
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse;
    this.reverbReturn = ctx.createGain();
    // Keep the effects close and punchy. A long, bright tail made impacts sound metallic.
    this.reverbReturn.gain.value = 0.075;
    this.effects.connect(this.reverb);
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);

    this.noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const noise = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
    this.loadAudioAssets(ctx);
  }

  loadAudioAssets(ctx) {
    if (this.sampleLoadPromise) return this.sampleLoadPromise;
    const base = `${import.meta.env.BASE_URL}assets/audio/`;
    this.sampleLoadPromise = Promise.all(Object.entries(AUDIO_FILES).map(async ([name, file]) => {
      try {
        const response = await fetch(`${base}${file}`);
        if (!response.ok) return;
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (ctx === this.context) this.sampleBuffers[name] = buffer;
      } catch {
        // Preserve the synthesized fallback when an optional sample cannot load.
      }
    }));
    return this.sampleLoadPromise;
  }

  playSample(name, { volume = 1, playbackRate = 1, bus = this.effects, loop = false } = {}) {
    const ctx = this.context ?? this.unlock();
    const buffer = this.sampleBuffers[name];
    if (!ctx || !buffer || !bus) return null;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = playbackRate;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(bus);
    source.start();
    return { source, gain };
  }

  getContext() {
    return this.context ?? this.unlock();
  }

  playTone(frequency, endFrequency, duration, volume, type = 'sine', bus = 'ui', delay = 0) {
    const ctx = this.getContext();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.012, duration * 0.22));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(bus === 'effects' ? this.effects : this.ui);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  playNoise(duration, volume, { low = 1500, high = 120, type = 'lowpass', q = 0.7, bus = 'effects', delay = 0 } = {}) {
    const ctx = this.getContext();
    if (!ctx || !this.noiseBuffer) return;
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(20, low), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, high), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.008, duration * 0.18));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus === 'ui' ? this.ui : this.effects);
    source.start(start);
    source.stop(start + duration + 0.025);
  }

  playMenuButton(kind = 'button') {
    if (kind === 'confirm') {
      this.playTone(480, 690, 0.085, 0.12, 'triangle');
      this.playTone(690, 910, 0.1, 0.09, 'sine', 'ui', 0.075);
      return;
    }
    if (kind === 'select') {
      this.playTone(610, 740, 0.065, 0.075, 'sine');
      return;
    }
    this.playTone(540, 430, 0.055, 0.08, 'triangle');
  }

  playRadarMode(mode) {
    const toGround = mode === 'ground';
    this.playTone(toGround ? 720 : 490, toGround ? 450 : 790, 0.105, 0.13, 'sine', 'ui');
    this.playTone(toGround ? 500 : 800, toGround ? 360 : 980, 0.075, 0.07, 'triangle', 'ui', 0.085);
  }

  playLockAcquire() {
    this.playTone(650, 960, 0.085, 0.11, 'sine', 'ui');
  }

  playLockReady() {
    this.playTone(940, 1180, 0.095, 0.13, 'sine', 'ui');
    this.playTone(1080, 1360, 0.12, 0.12, 'sine', 'ui', 0.115);
  }

  playLockLost() {
    this.playTone(460, 300, 0.12, 0.085, 'triangle', 'ui');
  }

  playWeaponNoLock() {
    this.playTone(380, 245, 0.16, 0.11, 'square', 'ui');
  }

  startEngine() {
    const ctx = this.getContext();
    if (!ctx || this.engine) return;
    const engineBus = ctx.createGain();
    const afterburnerBus = ctx.createGain();
    engineBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    engineBus.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 1.1);
    afterburnerBus.gain.value = 0.0001;
    engineBus.connect(this.master);
    afterburnerBus.connect(this.master);

    const makeOscillator = (type, frequency, filterType, cutoff, level, output) => {
      const oscillator = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      filter.type = filterType;
      filter.frequency.value = cutoff;
      filter.Q.value = 0.65;
      gain.gain.value = level;
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(output);
      oscillator.start();
      return { oscillator, filter, gain };
    };
    const makeNoiseLayer = (filterType, cutoff, level, output, q = 0.65) => {
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      filter.type = filterType;
      filter.frequency.value = cutoff;
      filter.Q.value = q;
      gain.gain.value = level;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(output);
      source.start();
      return { source, filter, gain };
    };

    // Push the idle sound into a low, irregular turbine rumble and keep the
    // narrow high whine subdued; that reads as engine mass instead of a vacuum.
    const core = makeOscillator('sawtooth', 54, 'lowpass', 165, 0.11, engineBus);
    const harmonic = makeOscillator('triangle', 96, 'lowpass', 285, 0.052, engineBus);
    const rumble = makeOscillator('sawtooth', 39, 'lowpass', 135, 0.095, engineBus);
    const combustion = makeNoiseLayer('lowpass', 185, 0.052, engineBus, 0.5);
    const turbine = makeOscillator('sine', 215, 'bandpass', 430, 0.012, engineBus);
    const airflow = makeNoiseLayer('lowpass', 390, 0.018, engineBus);
    const afterLow = makeOscillator('sawtooth', 48, 'lowpass', 150, 0.15, afterburnerBus);
    const afterMid = makeOscillator('triangle', 91, 'lowpass', 265, 0.095, afterburnerBus);
    const afterThrob = makeOscillator('sawtooth', 36, 'lowpass', 125, 0.13, afterburnerBus);
    const afterRoar = makeNoiseLayer('lowpass', 740, 0.075, afterburnerBus);
    const afterHiss = makeNoiseLayer('bandpass', 1200, 0.018, afterburnerBus, 0.45);
    this.engine = { engineBus, afterburnerBus, core, harmonic, rumble, combustion, turbine, airflow, afterLow, afterMid, afterThrob, afterRoar, afterHiss, elapsed: 0, stopping: false, boosting: false };
  }

  updateEngine(speed, boosting, dt) {
    const engine = this.engine;
    const ctx = this.context;
    if (!engine || !ctx || engine.stopping) return;
    engine.elapsed += dt;
    if (engine.elapsed < 0.085) return;
    engine.elapsed = 0;
    const now = ctx.currentTime;
    const speedRatio = clamp((speed - 180) / 250, 0, 1);
    if (boosting && !engine.boosting) {
      this.playSample('jetSurge', { volume: 0.15, playbackRate: 1.04 });
    }
    engine.boosting = boosting;
    engine.core.oscillator.frequency.setTargetAtTime(49 + speedRatio * 26, now, 0.18);
    engine.harmonic.oscillator.frequency.setTargetAtTime(88 + speedRatio * 40, now, 0.2);
    engine.rumble.oscillator.frequency.setTargetAtTime(36 + speedRatio * 17, now, 0.2);
    engine.combustion.filter.frequency.setTargetAtTime(150 + speedRatio * 100, now, 0.24);
    engine.turbine.oscillator.frequency.setTargetAtTime(185 + speedRatio * 130, now, 0.22);
    engine.airflow.filter.frequency.setTargetAtTime(310 + speedRatio * 280, now, 0.25);
    engine.engineBus.gain.setTargetAtTime(0.38 + speedRatio * 0.14, now, 0.28);
    engine.afterburnerBus.gain.setTargetAtTime(boosting ? 0.43 : 0.0001, now, boosting ? 0.2 : 0.38);
    engine.afterLow.oscillator.frequency.setTargetAtTime(boosting ? 68 + speedRatio * 23 : 48, now, 0.18);
    engine.afterMid.oscillator.frequency.setTargetAtTime(boosting ? 119 + speedRatio * 32 : 91, now, 0.2);
    engine.afterThrob.oscillator.frequency.setTargetAtTime(boosting ? 43 + speedRatio * 17 : 36, now, 0.18);
    engine.afterRoar.filter.frequency.setTargetAtTime(boosting ? 930 : 740, now, 0.24);
    engine.afterHiss.filter.frequency.setTargetAtTime(boosting ? 1600 : 1200, now, 0.25);
  }

  stopEngine(immediate = false) {
    const engine = this.engine;
    const ctx = this.context;
    if (!engine || !ctx || (engine.stopping && !immediate)) return;
    engine.stopping = true;
    const now = ctx.currentTime;
    const nodes = [engine.core.oscillator, engine.harmonic.oscillator, engine.rumble.oscillator, engine.combustion.source, engine.turbine.oscillator, engine.airflow.source, engine.afterLow.oscillator, engine.afterMid.oscillator, engine.afterThrob.oscillator, engine.afterRoar.source, engine.afterHiss.source];
    if (immediate) {
      for (const node of nodes) {
        try { node.stop(); } catch { /* already stopped */ }
      }
      if (this.engine === engine) this.engine = null;
      return;
    }
    engine.engineBus.gain.setTargetAtTime(0.0001, now, 0.42);
    engine.afterburnerBus.gain.setTargetAtTime(0.0001, now, 0.16);
    window.setTimeout(() => {
      if (this.engine !== engine) return;
      for (const node of nodes) {
        try { node.stop(); } catch { /* already stopped */ }
      }
      this.engine = null;
    }, 2600);
  }

  setGunFiring(active) {
    const ctx = this.getContext();
    if (!ctx) return;
    if (active && !this.gunLoop) {
      const bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, ctx.currentTime);
      bus.gain.linearRampToValueAtTime(0.31, ctx.currentTime + 0.04);
      bus.connect(this.effects);
      const sources = [];
      const cannonSample = this.sampleBuffers.cannonLoop;
      if (cannonSample) {
        const source = ctx.createBufferSource();
        source.buffer = cannonSample;
        source.loop = true;
        // Compress the slower recording to match the GAU-22/A's 55-round cadence.
        source.playbackRate.value = 3.93;
        const gritFilter = ctx.createBiquadFilter();
        gritFilter.type = 'lowpass';
        gritFilter.frequency.value = 1350;
        const gritGain = ctx.createGain();
        gritGain.gain.value = 0.19;
        source.connect(gritFilter);
        gritFilter.connect(gritGain);
        gritGain.connect(bus);
        source.start();
        sources.push(source);
      }

      // A fast, muted mechanical pulse gives the cannon its rotary cadence.
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 390;
      band.Q.value = 0.58;
      const pulse = ctx.createGain();
      pulse.gain.value = 0.22;
      noise.connect(band);
      band.connect(pulse);
      pulse.connect(bus);

      // Low barrel and muzzle energy carries more weight than a sharp machine-gun crack.
      const body = ctx.createOscillator();
      body.type = 'triangle';
      body.frequency.value = 82;
      const bodyFilter = ctx.createBiquadFilter();
      bodyFilter.type = 'lowpass';
      bodyFilter.frequency.value = 190;
      const bodyGain = ctx.createGain();
      bodyGain.gain.value = 0.16;
      body.connect(bodyFilter);
      bodyFilter.connect(bodyGain);
      bodyGain.connect(pulse);

      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 48;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.11;
      sub.connect(subGain);
      subGain.connect(pulse);

      // The real GAU-22/A cycles at roughly 55 rounds per second.
      const gate = ctx.createOscillator();
      gate.type = 'square';
      gate.frequency.value = 55;
      const gateDepth = ctx.createGain();
      gateDepth.gain.value = 0.12;
      gate.connect(gateDepth);
      gateDepth.connect(pulse.gain);

      // A restrained spool-up whine separates the rotary cannon from discrete gunfire.
      const rotor = ctx.createOscillator();
      rotor.type = 'sawtooth';
      rotor.frequency.setValueAtTime(92, ctx.currentTime);
      rotor.frequency.exponentialRampToValueAtTime(178, ctx.currentTime + 0.14);
      const rotorFilter = ctx.createBiquadFilter();
      rotorFilter.type = 'lowpass';
      rotorFilter.frequency.value = 430;
      const rotorGain = ctx.createGain();
      rotorGain.gain.value = 0.024;
      rotor.connect(rotorFilter);
      rotorFilter.connect(rotorGain);
      rotorGain.connect(bus);

      noise.start();
      body.start();
      sub.start();
      gate.start();
      rotor.start();
      sources.push(noise, body, sub, gate, rotor);
      this.gunLoop = { bus, sources };
    } else if (!active && this.gunLoop) {
      const loop = this.gunLoop;
      this.gunLoop = null;
      loop.bus.gain.cancelScheduledValues(ctx.currentTime);
      loop.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.035);
      window.setTimeout(() => loop.sources.forEach(source => { try { source.stop(); } catch { /* already stopped */ } }), 240);
    }
  }

  playDistantGun(distance = 500, source = 'air') {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastDistantShot < (source === 'ground' ? 0.24 : 0.12)) return;
    this.lastDistantShot = now;
    const attenuation = Math.exp(-Math.max(0, distance) / (source === 'ground' ? 850 : 650));
    this.playNoise(source === 'ground' ? 0.12 : 0.095, (source === 'ground' ? 0.09 : 0.12) * attenuation, {
      low: source === 'ground' ? 780 : 1800,
      high: source === 'ground' ? 130 : 360,
      type: 'lowpass',
    });
    this.playTone(source === 'ground' ? 74 : 110, source === 'ground' ? 38 : 58, source === 'ground' ? 0.2 : 0.1, 0.075 * attenuation, 'triangle', 'effects');
  }

  playMissileLaunch() {
    this.playSample('missileLaunch', { volume: 0.24, playbackRate: 0.96 + Math.random() * 0.08 });
    this.playTone(82, 49, 0.34, 0.22, 'sawtooth', 'effects');
    this.playNoise(0.6, 0.2, { low: 1300, high: 220, type: 'lowpass' });
    this.playNoise(0.24, 0.09, { low: 2600, high: 700, type: 'highpass' });
  }

  playIncomingMissile() {
    const ctx = this.getContext();
    if (!ctx || ctx.currentTime - this.lastIncomingWarning < 1.05) return;
    this.lastIncomingWarning = ctx.currentTime;
    this.playTone(920, 680, 0.11, 0.12, 'square', 'ui');
    this.playTone(760, 510, 0.12, 0.11, 'square', 'ui', 0.16);
  }

  playCountermeasure() {
    this.playNoise(0.18, 0.12, { low: 1850, high: 430, type: 'lowpass', q: 0.55 });
    this.playTone(185, 72, 0.14, 0.1, 'triangle', 'effects');
  }

  startMissileFlight(id) {
    const ctx = this.getContext();
    if (!ctx || this.missileLoops.has(id)) return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.16);
    bus.connect(this.effects);
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 920;
    filter.Q.value = 0.4;
    source.connect(filter);
    filter.connect(bus);
    source.start();
    this.missileLoops.set(id, { bus, source, elapsed: 0 });
  }

  updateMissileFlight(id, distance, dt) {
    const loop = this.missileLoops.get(id);
    const ctx = this.context;
    if (!loop || !ctx) return;
    loop.elapsed += dt;
    if (loop.elapsed < 0.1) return;
    loop.elapsed = 0;
    const gain = 0.1 * Math.exp(-Math.max(0, distance) / 950);
    loop.bus.gain.setTargetAtTime(Math.max(0.0001, gain), ctx.currentTime, 0.16);
  }

  stopMissileFlight(id) {
    const loop = this.missileLoops.get(id);
    const ctx = this.context;
    if (!loop || !ctx) return;
    this.missileLoops.delete(id);
    loop.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.045);
    window.setTimeout(() => { try { loop.source.stop(); } catch { /* already stopped */ } }, 260);
  }

  playExplosion(distance = 0, heavy = false) {
    const attenuation = (heavy ? 1.2 : 1) * Math.exp(-Math.max(0, distance) / 1250);
    if (attenuation < 0.035) return;
    this.playSample('explosion', { volume: 0.32 * attenuation, playbackRate: 0.94 + Math.random() * 0.12 });
    // A compact pressure crack followed by a broad low rumble; no bright metallic ring.
    this.playNoise(0.12, 0.27 * attenuation, { low: 1250, high: 190, type: 'lowpass', q: 0.45 });
    this.playNoise(0.78, 0.24 * attenuation, { low: 620, high: 58, type: 'lowpass', q: 0.5, delay: 0.025 });
    this.playTone(88, 31, 0.72, 0.3 * attenuation, 'sine', 'effects');
    this.playTone(54, 24, 1.05, 0.2 * attenuation, 'sine', 'effects', 0.035);
  }

  playCollision() {
    this.playSample('explosion', { volume: 0.44, playbackRate: 0.9 + Math.random() * 0.12 });
    this.playNoise(0.09, 0.26, { low: 1050, high: 180, type: 'lowpass', q: 0.5 });
    this.playNoise(0.36, 0.18, { low: 470, high: 65, type: 'lowpass', q: 0.55, delay: 0.02 });
    this.playTone(102, 32, 0.58, 0.28, 'sine', 'effects');
  }
}
