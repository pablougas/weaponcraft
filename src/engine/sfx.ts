import type { Entity, GameEvent } from '../sim';
import { getAudioContext, getBus } from './audio';

/**
 * Synthesized sound effects (Web Audio, no files). Every sound is built from
 * oscillators and filtered noise when it plays. Silent until the title-screen
 * click unlocks audio. Important cues also get a caption (see `onCaption`).
 */
export class Sfx {
  private master: GainNode | undefined;
  private noise: AudioBuffer | undefined;
  private hum: { osc: OscillatorNode; gain: GainNode } | undefined;

  constructor(
    /** Only sounds from the local player's god and things it hits are played. */
    private readonly isLocal: (entityId: string | null) => boolean,
    /** Shows a caption for an important sound cue. */
    private readonly onCaption: (text: string) => void,
    /** Is this the local player (for player-level events: pickups, fusion, chests)? */
    private readonly isLocalPlayer: (playerId: string) => boolean = () => true,
  ) {}

  private ready(): AudioContext | undefined {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return undefined;
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(getBus('sfx') ?? ctx.destination);
      const length = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      // Fixed pseudo-random noise (no Math.random needed; any white noise will do).
      let seed = 12345;
      for (let i = 0; i < length; i += 1) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        data[i] = (seed / 4294967296) * 2 - 1;
      }
    }
    return ctx;
  }

  /** A burst of filtered noise. */
  private noiseBurst(ctx: AudioContext, opts: { duration: number; volume: number; type: BiquadFilterType; freq: number; freqEnd?: number; delay?: number }): void {
    const start = ctx.currentTime + (opts.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = this.noise!;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.setValueAtTime(opts.freq, start);
    if (opts.freqEnd) filter.frequency.exponentialRampToValueAtTime(opts.freqEnd, start + opts.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(opts.volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(start);
    source.stop(start + opts.duration + 0.05);
  }

  /** A pitched blip that slides from `from` to `to` Hz. */
  private tone(ctx: AudioContext, opts: { from: number; to: number; duration: number; volume: number; type: OscillatorType; delay?: number }): void {
    const start = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), start + opts.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(opts.volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
    osc.connect(gain).connect(this.master!);
    osc.start(start);
    osc.stop(start + opts.duration + 0.05);
  }

  handle(event: GameEvent): void {
    const ctx = this.ready();
    switch (event.type) {
      case 'ability:cast':
        if (!this.isLocal(event.casterId) || !ctx) return;
        if (event.abilityId === 'soul-bolts') {
          // A ghostly wail: a falling, wavering tone over a breathy whoosh.
          this.noiseBurst(ctx, { duration: 0.3, volume: 0.18, type: 'bandpass', freq: 1400, freqEnd: 300 });
          this.tone(ctx, { from: 720, to: 340, duration: 0.32, volume: 0.07, type: 'triangle' });
          this.tone(ctx, { from: 735, to: 330, duration: 0.32, volume: 0.05, type: 'sine' });
          return;
        }
        // Electric crack: a bright noise snap plus a falling zap.
        this.noiseBurst(ctx, { duration: 0.18, volume: 0.35, type: 'highpass', freq: 2500 });
        this.tone(ctx, { from: 1800, to: 220, duration: 0.22, volume: 0.12, type: 'sawtooth' });
        return;
      case 'ability:blink':
        if (!this.isLocal(event.casterId) || !ctx) return;
        if (event.abilityId === 'shadow-step') {
          // A dark rush of air that drops away.
          this.noiseBurst(ctx, { duration: 0.32, volume: 0.35, type: 'lowpass', freq: 1800, freqEnd: 160 });
          this.tone(ctx, { from: 240, to: 70, duration: 0.3, volume: 0.14, type: 'sine' });
          return;
        }
        // A sharp crack, then a short rising zap as he lands.
        this.noiseBurst(ctx, { duration: 0.12, volume: 0.45, type: 'highpass', freq: 3000 });
        this.tone(ctx, { from: 300, to: 2400, duration: 0.14, volume: 0.1, type: 'sawtooth', delay: 0.03 });
        return;
      case 'cutscene:beat':
        if (ctx) this.cinematic(ctx, event.beat);
        return;
      case 'ability:telegraph':
        if (!this.isLocal(event.casterId)) return;
        if (event.abilityId === 'skull-cage') {
          this.onCaption('[Bones rattle beneath the ground]');
          if (!ctx) return;
          this.tone(ctx, { from: 55, to: 75, duration: event.ticks / 30, volume: 0.2, type: 'triangle' });
          for (let i = 0; i < 6; i += 1) this.noiseBurst(ctx, { duration: 0.05, volume: 0.12, type: 'highpass', freq: 2200, delay: i * (event.ticks / 30 / 6) });
          return;
        }
        this.onCaption('[Storm clouds gather]');
        if (ctx) this.tone(ctx, { from: 60, to: 140, duration: event.ticks / 30, volume: 0.18, type: 'triangle' });
        return;
      case 'ability:strike':
        if (!this.isLocal(event.casterId)) return;
        if (event.abilityId === 'skull-cage') {
          this.onCaption('[The Skull Cage snaps shut]');
          if (!ctx) return;
          for (let i = 0; i < 3; i += 1) this.noiseBurst(ctx, { duration: 0.09, volume: 0.4, type: 'bandpass', freq: 1600 - i * 300, delay: i * 0.05 });
          this.tone(ctx, { from: 110, to: 40, duration: 0.6, volume: 0.35, type: 'sine' });
          return;
        }
        this.onCaption('[Thunder cracks]');
        if (!ctx) return;
        this.noiseBurst(ctx, { duration: 0.25, volume: 0.6, type: 'highpass', freq: 1200 });
        this.noiseBurst(ctx, { duration: 1.8, volume: 0.55, type: 'lowpass', freq: 900, freqEnd: 80 });
        this.tone(ctx, { from: 90, to: 35, duration: 1.4, volume: 0.35, type: 'sine' });
        return;
      case 'hero:attack':
        if (!this.isLocal(event.entityId) || !ctx) return;
        this.noiseBurst(ctx, { duration: event.kind === 'heavy' ? 0.3 : 0.14, volume: 0.15, type: 'bandpass', freq: 900, freqEnd: 400 });
        return;
      case 'combat:hit':
        if (!(this.isLocal(event.attackerId) || this.isLocal(event.targetId)) || !ctx || event.amount <= 0) return;
        this.tone(ctx, { from: 160, to: 70, duration: 0.12, volume: 0.25, type: 'sine' });
        this.noiseBurst(ctx, { duration: 0.08, volume: 0.2, type: 'lowpass', freq: 1200 });
        return;
      case 'hero:dodge':
        if (!this.isLocal(event.entityId) || !ctx) return;
        this.noiseBurst(ctx, { duration: 0.24, volume: 0.18, type: 'bandpass', freq: 500, freqEnd: 1600 });
        return;
      case 'hero:jump':
        if (!this.isLocal(event.entityId) || !ctx) return;
        this.noiseBurst(ctx, { duration: 0.15, volume: 0.1, type: 'bandpass', freq: 700, freqEnd: 1400 });
        return;
      case 'combat:blocked':
        if (!(this.isLocal(event.attackerId) || this.isLocal(event.targetId)) || !ctx) return;
        // A metallic clank on a shield or armour.
        this.tone(ctx, { from: 1250, to: 1150, duration: 0.18, volume: 0.08, type: 'square' });
        this.noiseBurst(ctx, { duration: 0.07, volume: 0.25, type: 'highpass', freq: 3000 });
        return;
      case 'item:picked':
        if (!this.isLocalPlayer(event.playerId) || !ctx) return;
        this.tone(ctx, { from: 660, to: 660, duration: 0.12, volume: 0.1, type: 'triangle' });
        this.tone(ctx, { from: 990, to: 990, duration: 0.22, volume: 0.1, type: 'triangle', delay: 0.09 });
        return;
      case 'fusion:created': {
        if (!this.isLocalPlayer(event.playerId) || !ctx) return;
        // A rising arpeggio and a shimmer; a legendary gets a held chord on top.
        const notes = [392, 494, 587, 784];
        notes.forEach((f, i) => this.tone(ctx, { from: f, to: f, duration: 0.5, volume: 0.09, type: 'triangle', delay: i * 0.09 }));
        this.noiseBurst(ctx, { duration: 0.9, volume: 0.06, type: 'highpass', freq: 5000, delay: 0.2 });
        if (event.legendary) for (const f of [523, 659, 784, 1047]) this.tone(ctx, { from: f, to: f, duration: 1.8, volume: 0.05, type: 'sine', delay: 0.4 });
        return;
      }
      case 'chest:opened':
        if (!this.isLocalPlayer(event.playerId) || !ctx) return;
        // A wooden creak, then a jingle if there was something inside.
        this.tone(ctx, { from: 180, to: 120, duration: 0.35, volume: 0.08, type: 'sawtooth' });
        if (event.weaponId) for (let i = 0; i < 4; i += 1) this.tone(ctx, { from: 1800 + i * 240, to: 1700 + i * 240, duration: 0.12, volume: 0.05, type: 'sine', delay: 0.3 + i * 0.06 });
        return;
      case 'barricade:broken':
        // (boot.ts captions this beat with Hades's line.)
        if (!ctx) return;
        this.noiseBurst(ctx, { duration: 1.2, volume: 0.5, type: 'lowpass', freq: 1200, freqEnd: 120 });
        for (let i = 0; i < 4; i += 1) this.tone(ctx, { from: 140 - i * 15, to: 60, duration: 0.2, volume: 0.25, type: 'sine', delay: i * 0.13 });
        return;
      case 'soldier:alarm':
        if (!ctx) return;
        if (event.kind === 'sentry' || event.kind === 'captain') {
          // A war horn: two reedy notes through a low-pass filter.
          this.horn(ctx, 196, 0.7, 0);
          this.horn(ctx, 233, 1.1, 0.65);
        } else {
          this.tone(ctx, { from: 300, to: 220, duration: 0.25, volume: 0.08, type: 'sawtooth' });
        }
        return;
      case 'soldier:strike':
        if (!ctx) return;
        this.noiseBurst(ctx, { duration: event.kind === 'captain' ? 0.35 : 0.16, volume: event.kind === 'captain' ? 0.18 : 0.08, type: 'bandpass', freq: 700, freqEnd: 300 });
        return;
      case 'hero:down':
        if (!this.isLocal(event.entityId) || !ctx) return;
        this.tone(ctx, { from: 330, to: 110, duration: 1.4, volume: 0.12, type: 'triangle' });
        this.tone(ctx, { from: 247, to: 82, duration: 1.6, volume: 0.08, type: 'sine', delay: 0.1 });
        return;
      case 'hero:rested':
        if (!this.isLocalPlayer(event.playerId) || !ctx) return;
        for (const [i, f] of [294, 370, 440].entries()) this.tone(ctx, { from: f, to: f, duration: 1.6, volume: 0.05, type: 'sine', delay: i * 0.12 });
        return;
      case 'party:switched':
        if (!this.isLocalPlayer(event.playerId) || !ctx) return;
        this.noiseBurst(ctx, { duration: 0.25, volume: 0.12, type: 'bandpass', freq: 600, freqEnd: 2000 });
        this.tone(ctx, { from: event.defId === 'hades' ? 330 : 440, to: event.defId === 'hades' ? 165 : 880, duration: 0.25, volume: 0.07, type: 'triangle' });
        return;
      case 'hero:exhausted':
        if (!this.isLocal(event.entityId)) return;
        this.onCaption('[Out of breath]');
        if (ctx) this.tone(ctx, { from: 420, to: 260, duration: 0.3, volume: 0.08, type: 'sine' });
        return;
      default:
    }
  }

  /** One footstep: soft grass on the surface, harder stone in the Underworld. */
  footstep(surface: 'grass' | 'stone', sprinting: boolean): void {
    const ctx = this.ready();
    if (!ctx) return;
    const volume = sprinting ? 0.09 : 0.06;
    if (surface === 'grass') this.noiseBurst(ctx, { duration: 0.09, volume, type: 'bandpass', freq: 1800, freqEnd: 900 });
    else {
      this.noiseBurst(ctx, { duration: 0.06, volume: volume * 1.2, type: 'bandpass', freq: 900, freqEnd: 500 });
      this.tone(ctx, { from: 120, to: 80, duration: 0.06, volume: volume * 0.8, type: 'sine' });
    }
  }

  /** A reedy horn note (sentries' alarm). */
  private horn(ctx: AudioContext, freq: number, duration: number, delay: number): void {
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 0.96, start);
    osc.frequency.exponentialRampToValueAtTime(freq, start + 0.12);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.08);
    gain.gain.setValueAtTime(0.12, start + duration - 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(filter).connect(gain).connect(this.master!);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  /** The charged move's rising hum (Lightning Fist; Grasp of the Dead, darker) while it charges (0–1), silent otherwise. */
  updateCharge(hero: Entity | undefined, fullChargeTicks: number): void {
    const charge = hero?.hero?.charge;
    const ctx = this.ready();
    if (charge == null || !ctx) {
      if (this.hum) {
        const { osc, gain } = this.hum;
        gain.gain.setTargetAtTime(0.0001, getAudioContext()?.currentTime ?? 0, 0.03);
        osc.stop((getAudioContext()?.currentTime ?? 0) + 0.15);
        this.hum = undefined;
      }
      return;
    }
    if (!this.hum) {
      const osc = ctx.createOscillator();
      osc.type = hero!.defId === 'hades' ? 'triangle' : 'sawtooth';
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setTargetAtTime(0.07, ctx.currentTime, 0.05);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      osc.connect(filter).connect(gain).connect(this.master!);
      osc.start();
      this.hum = { osc, gain };
    }
    const power = Math.min(1, charge / fullChargeTicks);
    const base = hero!.defId === 'hades' ? 55 : 90;
    this.hum.osc.frequency.setTargetAtTime(base + power * (base * 2.9), ctx.currentTime, 0.05);
  }

  /** The rocket cinematic's sting (SPEC §3.2): whine, boom, rumble, drums and horn, a closing chord. */
  private cinematic(ctx: AudioContext, beat: string): void {
    switch (beat) {
      case 'launch':
        this.tone(ctx, { from: 140, to: 1100, duration: 4.4, volume: 0.09, type: 'sawtooth' });
        this.noiseBurst(ctx, { duration: 4.4, volume: 0.18, type: 'bandpass', freq: 400, freqEnd: 2200 });
        return;
      case 'impact':
        this.noiseBurst(ctx, { duration: 0.4, volume: 0.6, type: 'highpass', freq: 900 });
        this.noiseBurst(ctx, { duration: 3.2, volume: 0.75, type: 'lowpass', freq: 700, freqEnd: 60 });
        this.tone(ctx, { from: 80, to: 28, duration: 2.6, volume: 0.45, type: 'sine' });
        return;
      case 'collapse':
        this.noiseBurst(ctx, { duration: 3.8, volume: 0.35, type: 'lowpass', freq: 260, freqEnd: 90 });
        return;
      case 'pan':
        for (let i = 0; i < 8; i += 1) {
          this.tone(ctx, { from: 110, to: 48, duration: 0.35, volume: i % 2 ? 0.28 : 0.4, type: 'sine', delay: i * 0.55 });
        }
        this.tone(ctx, { from: 146, to: 140, duration: 2.2, volume: 0.07, type: 'sawtooth', delay: 1.1 });
        return;
      case 'return':
        for (const [i, f] of [220, 277, 330].entries()) this.tone(ctx, { from: f, to: f, duration: 2.4, volume: 0.06, type: 'sine', delay: i * 0.08 });
        return;
      default:
    }
  }
}
