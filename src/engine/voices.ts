import { duckMusic, getAudioContext, getBus, getVolumes } from './audio';

/**
 * The gods' voices (team request, Nov 15). Every god line is already captioned
 * as "Zeus: …", "Hades: …" or "Poseidon: …"; when such a caption appears, the
 * god speaks it.
 *
 * - Every line in the game is recorded (team request, Nov 18: "make the voices
 *   more real"): natural-sounding speech made offline with Kokoro, an open
 *   neural voice model, by `scripts/make-god-voices.py`, shipped as small mp3s
 *   in `public/voices/` and played through the same hall reverb as the divine
 *   layer. A line with no recording falls back to the browser's speech below.
 * - Fallback: the browser's own speech voices, **on-device ones only**
 *   (`localService`), so nothing goes over the network (itch.io rule). Each god
 *   has his own pitch and pace: Hades the deepest and slowest, Zeus commanding,
 *   Poseidon rolling.
 * - Under every line plays a synthesized divine layer through a long reverb:
 *   thunder and a bright shimmer for Zeus, an abyssal drone for Hades, a tide
 *   swell for Poseidon. The music dips while a god speaks.
 * - With no on-device voice (some browsers and headless tests), the line is a
 *   reverberant god-murmur instead: formant-shaped syllables at his pitch.
 *
 * Captions stay the source of truth: the voice never replaces them.
 */

export type GodVoiceId = 'zeus' | 'hades' | 'poseidon';

export interface GodVoice {
  id: GodVoiceId;
  /** Speech pitch and rate (SpeechSynthesisUtterance: 1 = normal). */
  pitch: number;
  rate: number;
  /** The divine layer's root note (Hz) and the murmur's speaking pitch. */
  root: number;
  /** On-device voices to prefer, in order (names vary by OS). */
  prefer: readonly string[];
}

export const GOD_VOICES: Readonly<Record<string, GodVoice>> = {
  // Pitched only a little below normal: pushing browser voices far down is what made them sound robotic.
  Zeus: { id: 'zeus', pitch: 0.92, rate: 0.95, root: 98, prefer: ['Daniel', 'Arthur', 'Microsoft George', 'Evan', 'Tom', 'Microsoft David', 'Aaron'] },
  Hades: { id: 'hades', pitch: 0.78, rate: 0.88, root: 65.4, prefer: ['Nathan', 'Evan', 'Tom', 'Microsoft David', 'Daniel', 'Arthur', 'Microsoft Mark'] },
  Poseidon: { id: 'poseidon', pitch: 0.85, rate: 0.92, root: 82.4, prefer: ['Arthur', 'Aaron', 'Reed', 'Microsoft Mark', 'Daniel', 'Microsoft David'] },
};

/**
 * A caption spoken by a god: who, and the words to say (stage directions in
 * brackets and key hints in parentheses are left out). Null for anything else.
 */
export function spokenLine(caption: string): { speaker: string; voice: GodVoice; words: string } | null {
  const match = /(?:^|\]\s*)(Zeus|Hades|Poseidon):\s*(.+)$/.exec(caption);
  if (!match) return null;
  const words = match[2]
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return null;
  return { speaker: match[1], voice: GOD_VOICES[match[1]], words };
}

/** Roughly how long a line takes to say at this rate (seconds). */
export function lineSeconds(words: string, rate: number): number {
  const count = words.split(/\s+/).filter(Boolean).length;
  return Math.max(1.2, (count / 2.6) / rate + 0.4);
}

interface Pending {
  voice: GodVoice;
  words: string;
}

/** public/voices/manifest.json: each recorded line's words, its file and length. */
export type VoiceManifest = Record<string, { file: string; seconds: number }>;

const VOICE_DIR = `${import.meta.env.BASE_URL}voices/`;

export class GodVoices {
  private queue: Pending[] = [];
  private speaking = false;
  private reverb: ConvolverNode | null = null;
  private wet: GainNode | null = null;
  /** Stops the divine layer of the line being spoken. */
  private release: (() => void) | null = null;
  private timer: number | null = null;
  /** Bumped by stop(), so callbacks from a cancelled line are ignored. */
  private generation = 0;
  private manifest: VoiceManifest = {};
  /** Each recording's bytes, fetched ahead (the whole set is well under 1 MB), then decoded once. */
  private readonly bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly decoded = new Map<string, Promise<AudioBuffer | null>>();
  private recording: AudioBufferSourceNode | null = null;

  constructor() {
    // Chrome loads its voice list lazily: ask once now so it's ready by the first line.
    try { window.speechSynthesis?.getVoices(); } catch { /* not available */ }
    if (typeof fetch === 'function') {
      fetch(`${VOICE_DIR}manifest.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((m: VoiceManifest) => {
          this.manifest = m;
          for (const { file } of Object.values(m)) this.fetchBytes(file);
        })
        .catch(() => undefined);
    }
  }

  private fetchBytes(file: string): Promise<ArrayBuffer | null> {
    let p = this.bytes.get(file);
    if (!p) {
      p = fetch(VOICE_DIR + file).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
      this.bytes.set(file, p);
    }
    return p;
  }

  private buffer(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
    let p = this.decoded.get(file);
    if (!p) {
      // decodeAudioData takes the bytes over, so decode a copy.
      p = this.fetchBytes(file).then((b) => (b ? ctx.decodeAudioData(b.slice(0)) : null)).catch(() => null);
      this.decoded.set(file, p);
    }
    return p;
  }

  /** Speaks a caption if a god says it. Returns true if it will be voiced. */
  say(caption: string): boolean {
    const line = spokenLine(caption);
    if (!line || getVolumes().voice <= 0 || !getAudioContext()) return false;
    // Keep up with the scene: if lines pile up, drop the oldest waiting ones.
    if (this.queue.length >= 2) this.queue.splice(0, this.queue.length - 1);
    this.queue.push({ voice: line.voice, words: line.words });
    if (!this.speaking) this.next();
    return true;
  }

  /** Silences everything at once (a skipped scene, a reset, a new game). */
  stop(): void {
    this.generation += 1;
    this.queue = [];
    this.speaking = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    try { window.speechSynthesis?.cancel(); } catch { /* not available */ }
    try { this.recording?.stop(); } catch { /* already stopped */ }
    this.recording = null;
    this.release?.();
    this.release = null;
    duckMusic(1);
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) {
      this.speaking = false;
      duckMusic(1);
      return;
    }
    this.speaking = true;
    duckMusic(0.35);
    const generation = this.generation;
    let finished = false;
    const done = () => {
      // Once per line (the end event and the safety net may both fire), and never for a cancelled one.
      if (finished || generation !== this.generation) return;
      finished = true;
      if (this.timer !== null) window.clearTimeout(this.timer);
      this.timer = null;
      this.release?.();
      this.release = null;
      // A breath between lines.
      this.timer = window.setTimeout(() => { this.timer = null; if (generation === this.generation) this.next(); }, 250);
    };
    this.release = this.aura(item.voice);
    const recorded = this.manifest[item.words];
    const ctx = getAudioContext();
    if (recorded && ctx) {
      // The recording; if it can't be played after all, the browser's voice instead.
      this.timer = window.setTimeout(done, (recorded.seconds + 3) * 1000);
      void this.buffer(ctx, recorded.file).then((buffer) => {
        if (finished || generation !== this.generation) return;
        if (!buffer || !this.play(ctx, buffer, done)) this.fallback(item, done);
      });
      return;
    }
    this.fallback(item, done);
  }

  /** The browser's speech, or the murmur. */
  private fallback(item: Pending, done: () => void): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    const seconds = lineSeconds(item.words, item.voice.rate);
    const spoken = this.speak(item, done);
    if (!spoken) this.murmur(item, seconds);
    // Safety net: never wait on a voice forever (speech engines can drop their end event).
    this.timer = window.setTimeout(done, (spoken ? seconds * 1.8 + 2 : seconds + 0.2) * 1000);
  }

  /** Plays a recorded line: mostly dry, with some of the hall behind it. */
  private play(ctx: AudioContext, buffer: AudioBuffer, done: () => void): boolean {
    const bus = getBus('voice');
    const hall = this.hall(ctx);
    if (!bus || !hall) return false;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const dry = ctx.createGain();
    dry.gain.value = 1;
    const send = ctx.createGain();
    send.gain.value = 0.28;
    src.connect(dry).connect(bus);
    src.connect(send).connect(hall.reverb);
    src.onended = () => {
      if (this.recording === src) this.recording = null;
      done();
    };
    this.recording = src;
    src.start();
    return true;
  }

  /** Speaks the words with an on-device voice. False if there is none. */
  private speak(item: Pending, done: () => void): boolean {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return false;
    const voice = pickVoice(synth.getVoices(), item.voice);
    if (!voice) return false;
    const utterance = new SpeechSynthesisUtterance(item.words);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.pitch = item.voice.pitch;
    utterance.rate = item.voice.rate;
    const v = getVolumes();
    utterance.volume = Math.min(1, v.master * v.voice * 1.1);
    utterance.onend = done;
    utterance.onerror = done;
    try {
      synth.speak(utterance);
    } catch {
      return false;
    }
    return true;
  }

  /** The shared long reverb (a generated hall: decaying noise, a little darker each second). */
  private hall(ctx: AudioContext): { reverb: ConvolverNode; wet: GainNode } | null {
    const bus = getBus('voice');
    if (!bus) return null;
    if (!this.reverb || !this.wet) {
      const seconds = 3.2;
      const length = Math.floor(ctx.sampleRate * seconds);
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      let seed = 1234567;
      const noise = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x3fffffff - 1;
      };
      for (let ch = 0; ch < 2; ch += 1) {
        const data = impulse.getChannelData(ch);
        let low = 0;
        for (let i = 0; i < length; i += 1) {
          const t = i / length;
          low += (noise() - low) * (0.6 - t * 0.5);
          data[i] = low * (1 - t) ** 2.4;
        }
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = impulse;
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.9;
      this.reverb.connect(this.wet).connect(bus);
    }
    return { reverb: this.reverb, wet: this.wet };
  }

  /**
   * The divine layer under a god's line: it swells in, holds while he speaks
   * and fades through the hall when released. Returns the release.
   */
  private aura(voice: GodVoice): () => void {
    const ctx = getAudioContext();
    const bus = getBus('voice');
    const hall = ctx ? this.hall(ctx) : null;
    if (!ctx || !bus || !hall) return () => undefined;
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(1, now + 0.5);
    const dry = ctx.createGain();
    dry.gain.value = 0.55;
    out.connect(dry).connect(bus);
    out.connect(hall.reverb);
    const sources: AudioScheduledSourceNode[] = [];
    const tone = (freq: number, type: OscillatorType, level: number, detune = 0, cutoff = 900) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(filter).connect(gain).connect(out);
      osc.start(now);
      sources.push(osc);
      return gain;
    };
    const noise = (type: BiquadFilterType, freq: number, level: number, q = 0.7) => {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = 987654;
      for (let i = 0; i < data.length; i += 1) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        data[i] = seed / 0x3fffffff - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = level;
      src.connect(filter).connect(gain).connect(out);
      src.start(now);
      sources.push(src);
      return gain;
    };
    const lfo = (target: AudioParam, rate: number, depth: number) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = rate;
      const amount = ctx.createGain();
      amount.gain.value = depth;
      osc.connect(amount).connect(target);
      osc.start(now);
      sources.push(osc);
    };
    const r = voice.root;
    if (voice.id === 'zeus') {
      // Sky and storm: an open fifth with a high shimmer, thunder rolling underneath.
      tone(r, 'triangle', 0.05);
      tone(r * 1.5, 'triangle', 0.03);
      const shimmer = tone(r * 8, 'sine', 0.008, 6, 4000);
      lfo(shimmer.gain, 5.5, 0.005);
      const thunder = noise('lowpass', 140, 0.22);
      thunder.gain.setValueAtTime(0.0001, now);
      thunder.gain.exponentialRampToValueAtTime(0.25, now + 0.35);
      thunder.gain.exponentialRampToValueAtTime(0.06, now + 2.2);
    } else if (voice.id === 'hades') {
      // The deep below: a sub drone, a slow-beating dark pair, a hollow wind.
      tone(r / 2, 'sine', 0.09);
      tone(r, 'sawtooth', 0.018, -7, 300);
      tone(r, 'sawtooth', 0.018, 7, 300);
      tone(r * 1.19, 'triangle', 0.015, 0, 400);
      const wind = noise('bandpass', 260, 0.05, 2.5);
      lfo(wind.gain, 0.18, 0.03);
    } else {
      // The sea: a warm chord and a swell of surf rising and falling like a wave.
      tone(r, 'triangle', 0.045);
      tone(r * 1.26, 'sine', 0.025);
      tone(r * 2, 'sine', 0.015);
      const surf = noise('bandpass', 700, 0.08, 0.6);
      lfo(surf.gain, 0.3, 0.07);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      for (const s of sources) s.stop(t + 1.5);
    };
  }

  /**
   * No on-device voice: a god-murmur. Syllables at his pitch, each a sawtooth
   * shaped by two vowel formants with a falling contour, through the hall.
   */
  private murmur(item: Pending, seconds: number): void {
    const ctx = getAudioContext();
    const bus = getBus('voice');
    const hall = ctx ? this.hall(ctx) : null;
    if (!ctx || !bus || !hall) return;
    const VOWELS = [[730, 1090], [530, 1840], [400, 2000], [570, 840], [440, 1020]] as const;
    const pitch = item.voice.root * 2 * (0.7 + item.voice.pitch * 0.4);
    const syllables = Math.max(3, Math.round(item.words.replace(/[^a-z]/gi, '').length / 3));
    const step = Math.min(0.32, (seconds - 0.3) / syllables);
    let hash = 0;
    for (const ch of item.words) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const start = ctx.currentTime + 0.05;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(bus);
    out.connect(hall.reverb);
    for (let i = 0; i < syllables; i += 1) {
      hash = (hash * 1103515245 + 12345) >>> 0;
      const vowel = VOWELS[hash % VOWELS.length];
      const at = start + i * step;
      const length = step * 0.85;
      // Phrases fall towards their end, like speech.
      const contour = 1 + 0.12 * Math.sin(i * 1.7) - 0.15 * (i / syllables);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(pitch * contour, at);
      osc.frequency.linearRampToValueAtTime(pitch * contour * 0.94, at + length);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.18, at + 0.04);
      env.gain.exponentialRampToValueAtTime(0.0001, at + length);
      for (const [f, level] of [[vowel[0], 1], [vowel[1], 0.45]] as const) {
        const formant = ctx.createBiquadFilter();
        formant.type = 'bandpass';
        formant.frequency.value = f;
        formant.Q.value = 6;
        const g = ctx.createGain();
        g.gain.value = level;
        osc.connect(formant).connect(g).connect(env);
      }
      env.connect(out);
      osc.start(at);
      osc.stop(at + length + 0.05);
    }
  }
}

/** The best on-device English voice for this god (never a network voice). */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], god: GodVoice): SpeechSynthesisVoice | undefined {
  const local = voices.filter((v) => v.localService && /^en/i.test(v.lang));
  for (const name of god.prefer) {
    const found = local.find((v) => v.name.toLowerCase().includes(name.toLowerCase()));
    if (found) return found;
  }
  return local.find((v) => /male|man|guy/i.test(v.name) && !/female|woman/i.test(v.name)) ?? local[0];
}
