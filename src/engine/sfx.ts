import type { Entity, GameEvent } from '../sim';
import { getAudioContext } from './audio';

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
  ) {}

  private ready(): AudioContext | undefined {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return undefined;
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);
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
        // Electric crack: a bright noise snap plus a falling zap.
        this.noiseBurst(ctx, { duration: 0.18, volume: 0.35, type: 'highpass', freq: 2500 });
        this.tone(ctx, { from: 1800, to: 220, duration: 0.22, volume: 0.12, type: 'sawtooth' });
        return;
      case 'ability:telegraph':
        if (!this.isLocal(event.casterId)) return;
        this.onCaption('[Storm clouds gather]');
        if (ctx) this.tone(ctx, { from: 60, to: 140, duration: event.ticks / 30, volume: 0.18, type: 'triangle' });
        return;
      case 'ability:strike':
        if (!this.isLocal(event.casterId)) return;
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
      case 'hero:exhausted':
        if (!this.isLocal(event.entityId)) return;
        this.onCaption('[Out of breath]');
        if (ctx) this.tone(ctx, { from: 420, to: 260, duration: 0.3, volume: 0.08, type: 'sine' });
        return;
      default:
    }
  }

  /** The Lightning Fist's rising hum while it charges (0–1), silent otherwise. */
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
      osc.type = 'sawtooth';
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
    this.hum.osc.frequency.setTargetAtTime(90 + power * 260, ctx.currentTime, 0.05);
  }
}
