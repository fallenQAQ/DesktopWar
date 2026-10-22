type MusicMode = 'menu' | 'battle' | 'boss' | 'none';

export type SfxName =
  | 'fire'
  | 'hit'
  | 'enemyDie'
  | 'eliteDie'
  | 'playerHurt'
  | 'ramUp'
  | 'keycap'
  | 'buffInstall'
  | 'updateOpen'
  | 'waveClear'
  | 'diskMount'
  | 'bossAlarm'
  | 'bossPhase2'
  | 'legendary'
  | 'bsod'
  | 'shutdown'
  | 'reportTick'
  | 'unlock'
  | 'uiClick'
  | 'reroll';

const MENU_NOTES = [0, 2, 4, 7, 4, 2, 0, -3];
const BATTLE_NOTES = [0, 0, 7, 0, 3, 0, 5, 7];
const PENTA = [0, 2, 4, 7, 9];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicVolume = 0.6;
  private sfxVolume = 0.8;
  private mode: MusicMode = 'none';
  private timer: number | null = null;
  private step = 0;
  private nextNote = 0;
  private suspended = false;

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.suspended) void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 6;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    const master = ctx.createGain();
    master.gain.value = 0.8;
    const sfx = ctx.createGain();
    sfx.gain.value = this.sfxVolume;
    const music = ctx.createGain();
    music.gain.value = this.musicVolume * 0.55;
    sfx.connect(master);
    music.connect(master);
    master.connect(compressor);
    compressor.connect(ctx.destination);
    this.ctx = ctx;
    this.sfxBus = sfx;
    this.musicBus = music;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.mode !== 'none') {
      const pending = this.mode;
      this.mode = 'none';
      this.startMusic(pending);
    }
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(music * 0.55, this.ctx.currentTime, 0.02);
    }
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.02);
    }
  }

  suspend(): void {
    this.suspended = true;
    if (this.ctx && this.ctx.state === 'running' && this.mode !== 'none') {
      void this.ctx.suspend();
    }
  }

  resume(): void {
    this.suspended = false;
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(
    wave: OscillatorType,
    freq: number,
    freqEnd: number | null,
    duration: number,
    gain: number,
    delay = 0,
    dest: GainNode | null = null,
  ): void {
    const ctx = this.ctx;
    const bus = dest ?? this.sfxBus;
    if (!ctx || !bus) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(bus);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noiseBurst(
    duration: number,
    gain: number,
    filterFreq: number,
    q = 1.2,
    delay = 0,
    dest: GainNode | null = null,
  ): void {
    const ctx = this.ctx;
    const bus = dest ?? this.sfxBus;
    if (!ctx || !bus || !this.noise) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(bus);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  play(name: SfxName, variation = 0): void {
    if (!this.ctx || this.sfxVolume <= 0) return;
    switch (name) {
      case 'fire': {
        const base = [440, 554, 659, 880][Math.abs(variation) % 4] ?? 440;
        const detune = (Math.random() * 2 - 1) * 0.06;
        this.tone('square', base * (1 + detune), null, 0.06, 0.12);
        break;
      }
      case 'hit':
        this.noiseBurst(0.04, 0.18, 2000);
        break;
      case 'enemyDie':
        this.tone('sawtooth', 300, 80, 0.25, 0.2);
        this.noiseBurst(0.08, 0.08, 1200, 0.9);
        break;
      case 'eliteDie':
        this.tone('sawtooth', 300, 80, 0.3, 0.2);
        this.tone('sine', 392, null, 0.35, 0.1);
        this.tone('sine', 523, null, 0.35, 0.08, 0.04);
        break;
      case 'playerHurt':
        this.tone('square', 220, null, 0.12, 0.35);
        this.noiseBurst(0.12, 0.2, 500, 0.7);
        break;
      case 'ramUp':
        this.tone('sine', 523, null, 0.12, 0.14);
        this.tone('sine', 784, null, 0.16, 0.12, 0.08);
        break;
      case 'keycap':
        this.tone('triangle', 880, null, 0.14, 0.12);
        this.tone('triangle', 1174, null, 0.16, 0.08, 0.06);
        break;
      case 'buffInstall':
        this.tone('square', 523, null, 0.06, 0.16);
        this.tone('square', 659, null, 0.06, 0.16, 0.06);
        this.tone('square', 784, null, 0.1, 0.16, 0.12);
        break;
      case 'updateOpen':
        this.tone('sine', 440, 660, 0.16, 0.1);
        break;
      case 'waveClear':
        this.tone('triangle', 784, null, 0.08, 0.12);
        this.tone('triangle', 587, null, 0.08, 0.12, 0.08);
        this.tone('triangle', 440, null, 0.12, 0.12, 0.16);
        break;
      case 'diskMount':
        this.tone('sine', 110, null, 0.3, 0.12);
        this.tone('sine', 220, 440, 0.4, 0.1, 0.05);
        break;
      case 'bossAlarm':
        for (let i = 0; i < 6; i++) {
          this.tone('square', i % 2 ? 330 : 440, null, 0.1, 0.14, i * 0.12);
        }
        break;
      case 'bossPhase2':
        this.tone('sine', 55, null, 0.5, 0.25);
        this.noiseBurst(0.3, 0.2, 300, 0.8);
        break;
      case 'legendary':
        [523, 659, 784, 1046].forEach((f, i) =>
          this.tone('square', f, null, 0.18, 0.14, i * 0.08),
        );
        this.tone('sine', 1568, null, 0.4, 0.1, 0.32);
        break;
      case 'bsod':
        this.tone('sine', 110, null, 2.2, 0.18);
        this.tone('sine', 164.8, null, 2.2, 0.14);
        this.tone('sine', 220, null, 2.2, 0.1);
        break;
      case 'shutdown':
        this.tone('sine', 660, 110, 1.2, 0.2);
        break;
      case 'reportTick':
        this.tone('sine', 1200, null, 0.015, 0.06);
        break;
      case 'unlock':
        this.tone('triangle', 392, null, 0.1, 0.14);
        this.tone('triangle', 523, null, 0.1, 0.14, 0.08);
        this.tone('triangle', 659, null, 0.16, 0.14, 0.16);
        break;
      case 'uiClick':
        this.tone('square', 640, null, 0.04, 0.08);
        break;
      case 'reroll':
        this.tone('sawtooth', 200, 600, 0.18, 0.1);
        break;
    }
  }

  startMusic(mode: MusicMode): void {
    if (!this.ctx) {
      this.mode = mode;
      return;
    }
    if (this.mode === mode) return;
    this.mode = mode;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (mode === 'none') return;
    this.step = 0;
    this.nextNote = this.ctx.currentTime + 0.12;
    this.timer = window.setInterval(() => this.scheduleMusic(), 80);
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || this.mode === 'none' || this.suspended) return;
    const bpm = this.mode === 'menu' ? 96 : 128;
    const stepDur = 60 / bpm / 2;
    while (this.nextNote < ctx.currentTime + 0.22) {
      const isBattle = this.mode === 'battle' || this.mode === 'boss';
      const notes = isBattle ? BATTLE_NOTES : MENU_NOTES;
      const note = notes[this.step % notes.length] ?? 0;
      const bass = 110 * 2 ** ((note + (this.mode === 'boss' ? -12 : 0)) / 12);
      if (this.step % 2 === 0) {
        this.tone('triangle', bass / 2, null, stepDur * 1.6, 0.045, this.nextNote - ctx.currentTime, this.musicBus);
      }
      if (this.step % 2 === 1 || (isBattle && this.step % 4 === 2)) {
        const lead = 220 * 2 ** ((note + PENTA[this.step % PENTA.length]!) / 12);
        this.tone('square', lead, null, stepDur * 0.8, 0.018, this.nextNote - ctx.currentTime, this.musicBus);
      }
      if (isBattle && this.step % 4 === 0) {
        this.noiseBurst(0.05, 0.03, 8000, 1, this.nextNote - ctx.currentTime, this.musicBus);
      }
      this.step += 1;
      this.nextNote += stepDur;
    }
  }
}
