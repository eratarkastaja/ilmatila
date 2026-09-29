const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// All sounds are synthesized locally, so the game has no external audio downloads
// or additional asset licensing requirements. AudioContext is created on the first
// user gesture to satisfy browser autoplay policies.
export class GameAudio {
  constructor() {
    this.context = null;
    this.paused = false;
    this.master = null;
    this.effects = null;
    this.ui = null;
    this.noiseBuffer = null;
    this.engine = null;
    this.gunLoop = null;
    this.missileLoops = new Map();
    this.lastGunBurst = -Infinity;
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
    engineBus.gain.linearRampToValueAtTime(0.38, ctx.currentTime + 1.1);
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

    const core = makeOscillator('sawtooth', 68, 'lowpass', 210, 0.095, engineBus);
    const harmonic = makeOscillator('triangle', 122, 'lowpass', 390, 0.065, engineBus);
    const turbine = makeOscillator('sine', 330, 'bandpass', 720, 0.028, engineBus);
    const airflow = makeNoiseLayer('lowpass', 560, 0.028, engineBus);
    const afterLow = makeOscillator('sawtooth', 57, 'lowpass', 185, 0.13, afterburnerBus);
    const afterMid = makeOscillator('triangle', 104, 'lowpass', 330, 0.085, afterburnerBus);
    const afterRoar = makeNoiseLayer('lowpass', 840, 0.065, afterburnerBus);
    const afterHiss = makeNoiseLayer('bandpass', 1500, 0.032, afterburnerBus, 0.45);
    this.engine = { engineBus, afterburnerBus, core, harmonic, turbine, airflow, afterLow, afterMid, afterRoar, afterHiss, elapsed: 0, stopping: false };
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
    engine.core.oscillator.frequency.setTargetAtTime(58 + speedRatio * 27, now, 0.18);
    engine.harmonic.oscillator.frequency.setTargetAtTime(112 + speedRatio * 48, now, 0.2);
    engine.turbine.oscillator.frequency.setTargetAtTime(285 + speedRatio * 195, now, 0.22);
    engine.airflow.filter.frequency.setTargetAtTime(420 + speedRatio * 360, now, 0.25);
    engine.engineBus.gain.setTargetAtTime(0.33 + speedRatio * 0.12, now, 0.28);
    engine.afterburnerBus.gain.setTargetAtTime(boosting ? 0.36 : 0.0001, now, boosting ? 0.2 : 0.38);
    engine.afterLow.oscillator.frequency.setTargetAtTime(boosting ? 72 + speedRatio * 18 : 57, now, 0.18);
    engine.afterMid.oscillator.frequency.setTargetAtTime(boosting ? 128 + speedRatio * 24 : 104, now, 0.2);
    engine.afterRoar.filter.frequency.setTargetAtTime(boosting ? 1050 : 840, now, 0.24);
    engine.afterHiss.filter.frequency.setTargetAtTime(boosting ? 1950 : 1500, now, 0.25);
  }

  stopEngine(immediate = false) {
    const engine = this.engine;
    const ctx = this.context;
    if (!engine || !ctx || (engine.stopping && !immediate)) return;
    engine.stopping = true;
    const now = ctx.currentTime;
    const nodes = [engine.core.oscillator, engine.harmonic.oscillator, engine.turbine.oscillator, engine.airflow.source, engine.afterLow.oscillator, engine.afterMid.oscillator, engine.afterRoar.source, engine.afterHiss.source];
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
      bus.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.035);
      bus.connect(this.effects);
      // Short, low-mid noise pulses make a regular cannon rattle instead of a hiss.
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 470;
      band.Q.value = 0.72;
      const pulse = ctx.createGain();
      pulse.gain.value = 0.1;
      noise.connect(band);
      band.connect(pulse);
      pulse.connect(bus);

      // A gated low thump gives each pulse some body without adding a ringing tone.
      const body = ctx.createOscillator();
      body.type = 'triangle';
      body.frequency.value = 82;
      const bodyFilter = ctx.createBiquadFilter();
      bodyFilter.type = 'lowpass';
      bodyFilter.frequency.value = 190;
      const bodyGain = ctx.createGain();
      bodyGain.gain.value = 0.085;
      body.connect(bodyFilter);
      bodyFilter.connect(bodyGain);
      bodyGain.connect(pulse);

      // A square LFO is used only as an envelope: roughly 36 crisp pulses per second.
      const gate = ctx.createOscillator();
      gate.type = 'square';
      gate.frequency.value = 40;
      const gateDepth = ctx.createGain();
      gateDepth.gain.value = 0.095;
      gate.connect(gateDepth);
      gateDepth.connect(pulse.gain);
      noise.start();
      body.start();
      gate.start();
      this.gunLoop = { bus, sources: [noise, body, gate] };
    } else if (!active && this.gunLoop) {
      const loop = this.gunLoop;
      this.gunLoop = null;
      loop.bus.gain.cancelScheduledValues(ctx.currentTime);
      loop.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.035);
      window.setTimeout(() => loop.sources.forEach(source => { try { source.stop(); } catch { /* already stopped */ } }), 240);
    }
  }

  playGunBurst() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastGunBurst < 0.13) return;
    this.lastGunBurst = now;
    this.playNoise(0.04, 0.095, { low: 1150, high: 330, type: 'lowpass', q: 0.65 });
    this.playTone(105, 48, 0.075, 0.16, 'triangle', 'effects');
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
    // A compact pressure crack followed by a broad low rumble; no bright metallic ring.
    this.playNoise(0.12, 0.27 * attenuation, { low: 1250, high: 190, type: 'lowpass', q: 0.45 });
    this.playNoise(0.78, 0.24 * attenuation, { low: 620, high: 58, type: 'lowpass', q: 0.5, delay: 0.025 });
    this.playTone(88, 31, 0.72, 0.3 * attenuation, 'sine', 'effects');
    this.playTone(54, 24, 1.05, 0.2 * attenuation, 'sine', 'effects', 0.035);
  }

  playCollision() {
    this.playNoise(0.09, 0.26, { low: 1050, high: 180, type: 'lowpass', q: 0.5 });
    this.playNoise(0.36, 0.18, { low: 470, high: 65, type: 'lowpass', q: 0.55, delay: 0.02 });
    this.playTone(102, 32, 0.58, 0.28, 'sine', 'effects');
  }
}
