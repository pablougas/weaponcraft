import { getAudioContext, getBus } from './audio';

/** Which ambient piece is playing: one mood per region (SPEC §11). */
export type MusicMood = 'meadow' | 'underworld' | 'ocean';

interface MoodSpec {
  /** Seconds per step of the sequencer. */
  step: number;
  /** Chance a step plays a note. */
  density: number;
  /** Chord progression: each chord is drone roots (Hz) plus the scale the melody picks from (Hz). */
  chords: ReadonlyArray<{ drone: readonly number[]; notes: readonly number[] }>;
  /** Steps per chord. */
  stepsPerChord: number;
  /** Melody voice: a soft pluck or a bell. */
  voice: 'pluck' | 'bell';
  droneType: OscillatorType;
  droneCutoff: number;
  level: number;
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const notes = (...midi: number[]) => midi.map(hz);

/**
 * The meadow: warm D-major pentatonic plucks over a soft pad (D, Bm, G, A).
 * The Underworld: a low D drone, Phrygian colour, sparse glassy bells.
 */
const MOODS: Readonly<Record<MusicMood, MoodSpec>> = {
  meadow: {
    step: 0.42, density: 0.42, stepsPerChord: 16, voice: 'pluck', droneType: 'triangle', droneCutoff: 700, level: 0.5,
    chords: [
      { drone: notes(50, 57), notes: notes(62, 64, 66, 69, 71, 74, 76) },
      { drone: notes(47, 54), notes: notes(62, 66, 69, 71, 74, 78) },
      { drone: notes(43, 50), notes: notes(62, 64, 67, 71, 74, 79) },
      { drone: notes(45, 52), notes: notes(61, 64, 66, 69, 73, 76) },
    ],
  },
  /** The Ocean: slow A Dorian bells over a swelling pad, like light on deep water. */
  ocean: {
    step: 0.55, density: 0.3, stepsPerChord: 20, voice: 'bell', droneType: 'triangle', droneCutoff: 520, level: 0.5,
    chords: [
      { drone: notes(45, 52), notes: notes(64, 66, 67, 69, 72, 74, 76) },
      { drone: notes(43, 50), notes: notes(62, 66, 67, 71, 74, 78) },
      { drone: notes(41, 48), notes: notes(60, 64, 67, 69, 72, 76) },
      { drone: notes(43, 50), notes: notes(62, 64, 67, 71, 74, 79) },
    ],
  },
  underworld: {
    step: 0.6, density: 0.22, stepsPerChord: 24, voice: 'bell', droneType: 'sawtooth', droneCutoff: 320, level: 0.55,
    chords: [
      { drone: notes(38, 45), notes: notes(62, 63, 65, 69, 70, 74) },
      { drone: notes(38, 46), notes: notes(62, 65, 67, 70, 74, 77) },
      { drone: notes(36, 43), notes: notes(60, 63, 67, 70, 72, 75) },
      { drone: notes(38, 45), notes: notes(62, 63, 65, 69, 74, 75) },
    ],
  },
};

/** How far ahead notes are scheduled, seconds. */
const LOOKAHEAD = 0.25;

class MoodPlayer {
  readonly out: GainNode;
  private drones: OscillatorNode[] = [];
  private droneFade: GainNode | undefined;
  private nextStep = 0;
  private stepIndex = 0;
  private chord = -1;
  private seed: number;

  constructor(private readonly ctx: AudioContext, private readonly spec: MoodSpec, destination: AudioNode, seed: number) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(destination);
    this.seed = seed;
    this.nextStep = ctx.currentTime + 0.1;
  }

  /** Deterministic pseudo-random 0–1 (view-only; keeps the piece the same each time). */
  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Fades in or out; while audible, keeps scheduling notes ahead of time. */
  update(audible: boolean): void {
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(audible ? this.spec.level : 0.0001, now, audible ? 1.2 : 0.8);
    if (!audible && this.out.gain.value < 0.002) {
      this.stopDrones(now);
      this.nextStep = now + 0.1;
      return;
    }
    if (this.nextStep < now) this.nextStep = now + 0.05;
    while (this.nextStep < now + LOOKAHEAD) {
      this.playStep(this.nextStep);
      this.nextStep += this.spec.step;
    }
  }

  private playStep(at: number): void {
    const chordIndex = Math.floor(this.stepIndex / this.spec.stepsPerChord) % this.spec.chords.length;
    const chord = this.spec.chords[chordIndex];
    if (chordIndex !== this.chord || this.drones.length === 0) {
      this.chord = chordIndex;
      this.startDrones(chord.drone, at);
    }
    // Strong beats are likelier to sound; the rest is sparse.
    const accent = this.stepIndex % 4 === 0 ? 1.4 : 1;
    if (this.rand() < this.spec.density * accent) {
      const f = chord.notes[Math.floor(this.rand() * chord.notes.length)];
      if (this.spec.voice === 'pluck') this.pluck(f, at);
      else this.bell(f, at);
    }
    this.stepIndex += 1;
  }

  /** Crossfades the pad to new roots over two seconds. */
  private startDrones(roots: readonly number[], at: number): void {
    this.stopDrones(at + 2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.spec.droneCutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.06, at + 2);
    filter.connect(gain).connect(this.out);
    this.drones = roots.flatMap((f) => [f, f * 1.004].map((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = this.spec.droneType;
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start(at);
      return osc;
    }));
    this.droneFade = gain;
  }

  private stopDrones(at: number): void {
    if (this.drones.length === 0) return;
    const start = Math.max(this.ctx.currentTime, at - 2);
    this.droneFade?.gain.setTargetAtTime(0.0001, start, 0.6);
    for (const osc of this.drones) osc.stop(start + 3);
    this.drones = [];
    this.droneFade = undefined;
  }

  private pluck(freq: number, at: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.07, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
    osc.connect(gain).connect(this.out);
    osc.start(at);
    osc.stop(at + 1.5);
  }

  private bell(freq: number, at: number): void {
    // A glassy bell: the fundamental plus an inharmonic partial, long decay.
    for (const [ratio, volume, decay] of [[1, 0.05, 3.2], [2.76, 0.018, 1.6]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      osc.connect(gain).connect(this.out);
      osc.start(at);
      osc.stop(at + decay + 0.1);
    }
  }
}

/**
 * Procedural ambient music (Web Audio, no files): one mood per region,
 * crossfading when the local god changes region, ducked during cinematics.
 * Silent until the title-screen click unlocks audio.
 */
export class Music {
  private players: Partial<Record<MusicMood, MoodPlayer>> = {};
  private duck: GainNode | undefined;

  /** Call every frame with the mood to play (null = silence) and whether a cinematic is running. */
  update(mood: MusicMood | null, cinematic: boolean): void {
    const ctx = getAudioContext();
    const bus = getBus('music');
    if (!ctx || !bus || ctx.state !== 'running') return;
    if (!this.duck) {
      this.duck = ctx.createGain();
      this.duck.connect(bus);
    }
    this.duck.gain.setTargetAtTime(cinematic ? 0.25 : 1, ctx.currentTime, 0.8);
    for (const key of Object.keys(MOODS) as MusicMood[]) {
      if (key === mood && !this.players[key]) this.players[key] = new MoodPlayer(ctx, MOODS[key], this.duck, key === 'meadow' ? 7 : key === 'ocean' ? 23 : 13);
      this.players[key]?.update(key === mood);
    }
  }
}
