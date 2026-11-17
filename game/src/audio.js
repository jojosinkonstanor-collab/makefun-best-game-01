// Every sound in EMBERWARD is synthesised with WebAudio: no audio files, no network.
// SFX are short oscillator/noise envelopes; the music is a quiet generative loop in A minor
// (bass pulse + plucked arpeggio) whose tempo and density rise with the wave.

const MUSIC_ROOT = 110; // A2
const MINOR_SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.intensity = 0; // 0..1, set from the wave
    this.noiseBuffer = null;
  }

  /** Call from a user gesture; creating the context earlier would stay suspended. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  tone({ type = 'sine', freq = 440, freqEnd = null, dur = 0.15, vol = 0.3, attack = 0.005, delay = 0, dest = null }) {
    if (!this.ctx) return;
    const t0 = this.now() + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(dest || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.3, filterFreq = 1200, filterEnd = null, type = 'lowpass', delay = 0 }) {
    if (!this.ctx || !this.noiseBuffer) return;
    const t0 = this.now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(filterFreq, t0);
    if (filterEnd !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(20, filterEnd), t0 + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ---- game sounds -------------------------------------------------------
  shoot() {
    this.tone({ type: 'square', freq: 720, freqEnd: 240, dur: 0.09, vol: 0.12 });
    this.tone({ type: 'sine', freq: 1440, freqEnd: 900, dur: 0.05, vol: 0.06 });
  }
  hit() {
    this.noise({ dur: 0.06, vol: 0.14, filterFreq: 2600, type: 'bandpass' });
  }
  explode() {
    this.noise({ dur: 0.35, vol: 0.35, filterFreq: 900, filterEnd: 120 });
    this.tone({ type: 'sine', freq: 160, freqEnd: 40, dur: 0.3, vol: 0.3 });
  }
  hurt() {
    this.tone({ type: 'sawtooth', freq: 220, freqEnd: 70, dur: 0.25, vol: 0.28 });
    this.noise({ dur: 0.15, vol: 0.2, filterFreq: 500, filterEnd: 150 });
  }
  pickup() {
    this.tone({ type: 'sine', freq: 880, dur: 0.07, vol: 0.14 });
    this.tone({ type: 'sine', freq: 1320, dur: 0.09, vol: 0.12, delay: 0.05 });
  }
  heart() {
    this.tone({ type: 'sine', freq: 523, dur: 0.1, vol: 0.16 });
    this.tone({ type: 'sine', freq: 784, dur: 0.16, vol: 0.16, delay: 0.08 });
  }
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.22, vol: 0.2, delay: i * 0.07 }));
  }
  waveHorn() {
    this.tone({ type: 'sawtooth', freq: 110, dur: 0.5, vol: 0.16 });
    this.tone({ type: 'sawtooth', freq: 165, dur: 0.5, vol: 0.12 });
    this.tone({ type: 'sawtooth', freq: 220, freqEnd: 330, dur: 0.5, vol: 0.1, delay: 0.1 });
  }
  bossRoar() {
    this.tone({ type: 'sawtooth', freq: 82, freqEnd: 41, dur: 0.9, vol: 0.3 });
    this.noise({ dur: 0.8, vol: 0.22, filterFreq: 300, filterEnd: 90 });
  }
  click() {
    this.tone({ type: 'sine', freq: 660, dur: 0.05, vol: 0.14 });
  }
  dash() {
    this.noise({ dur: 0.18, vol: 0.16, filterFreq: 1800, filterEnd: 400, type: 'bandpass' });
  }
  spitterShoot() {
    this.tone({ type: 'square', freq: 300, freqEnd: 140, dur: 0.12, vol: 0.1 });
  }
  bossBurst() {
    this.tone({ type: 'sawtooth', freq: 130, freqEnd: 65, dur: 0.3, vol: 0.14 });
    this.noise({ dur: 0.25, vol: 0.12, filterFreq: 700, filterEnd: 200 });
  }
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.4, vol: 0.2, delay: i * 0.16 }));
  }
  victory() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.35, vol: 0.2, delay: i * 0.09 }));
    this.tone({ type: 'sine', freq: 1568, dur: 0.7, vol: 0.14, delay: 0.5 });
  }

  // ---- generative music --------------------------------------------------
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.musicTick(), 240);
  }

  stopMusic() {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  musicTick() {
    if (!this.ctx || this.muted) return;
    const step = this.musicStep;
    this.musicStep += 1;
    const bar = Math.floor(step / 8) % 4;
    const roots = [0, -4, -2, 3]; // Am, F, G, C-ish movement in semitones from A
    const root = MUSIC_ROOT * Math.pow(2, roots[bar] / 12);
    if (step % 8 === 0) {
      this.tone({ type: 'triangle', freq: root / 2, dur: 1.6, vol: 0.5, dest: this.musicGain });
      this.tone({ type: 'triangle', freq: root, dur: 1.2, vol: 0.22, dest: this.musicGain });
    }
    if (step % 2 === 0) {
      const degree = MINOR_SCALE[(step * 3 + bar) % MINOR_SCALE.length];
      const freq = root * 2 * Math.pow(2, degree / 12);
      const loud = this.intensity > 0.4 || step % 4 === 0;
      if (loud) this.tone({ type: 'sine', freq, dur: 0.5, vol: 0.1, dest: this.musicGain });
    }
    if (this.intensity > 0.55 && step % 4 === 2) {
      this.tone({ type: 'sine', freq: root * 4, dur: 0.2, vol: 0.05, dest: this.musicGain });
    }
  }
}
