let context: AudioContext | undefined;
let buses: { master: GainNode; music: GainNode; sfx: GainNode; voice: GainNode } | undefined;
let volumes: AudioVolumes = { master: 0.8, music: 0.6, sfx: 0.8, voice: 0.9 };
/** Music ducking while a god speaks (1 = full). */
let duck = 1;

/** Volume levels, 0–1 (stored in settings). */
export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  /** The gods' voices (spoken lines and their divine layer). */
  voice: number;
}

/**
 * Browsers block audio until a user gesture. Call this from the first click
 * (the title screen) to create and resume the shared AudioContext.
 */
export async function unlockAudio(): Promise<AudioContext | undefined> {
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return undefined;
  context ??= new Ctor();
  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined);
  }
  return context;
}

export function getAudioContext(): AudioContext | undefined {
  return context;
}

/** The music, SFX or voice mix bus (master volume on top). Undefined until audio is unlocked. */
export function getBus(name: 'music' | 'sfx' | 'voice'): GainNode | undefined {
  if (!context) return undefined;
  if (!buses) {
    const master = context.createGain();
    master.connect(context.destination);
    const music = context.createGain();
    music.connect(master);
    const sfx = context.createGain();
    sfx.connect(master);
    const voice = context.createGain();
    voice.connect(master);
    buses = { master, music, sfx, voice };
    applyVolumes();
  }
  return buses[name];
}

/** The current volume levels (the spoken voice reads its loudness from here). */
export function getVolumes(): AudioVolumes {
  return volumes;
}

/** Lowers the music while a god speaks (1 = full volume), easing over a moment. */
export function duckMusic(level: number): void {
  duck = Math.min(1, Math.max(0, level));
  applyVolumes();
}

/** Sets the volume levels (from the settings menu). */
export function setVolumes(next: AudioVolumes): void {
  volumes = { ...next };
  applyVolumes();
}

function applyVolumes(): void {
  if (!buses || !context) return;
  // Squared, so the slider feels even to the ear.
  const now = context.currentTime;
  buses.master.gain.setTargetAtTime(volumes.master ** 2, now, 0.03);
  buses.music.gain.setTargetAtTime(volumes.music ** 2 * duck, now, duck < 1 ? 0.15 : 0.6);
  buses.sfx.gain.setTargetAtTime(volumes.sfx ** 2, now, 0.03);
  buses.voice.gain.setTargetAtTime(volumes.voice ** 2, now, 0.03);
}
