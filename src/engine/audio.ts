let context: AudioContext | undefined;
let buses: { master: GainNode; music: GainNode; sfx: GainNode } | undefined;
let volumes: AudioVolumes = { master: 0.8, music: 0.6, sfx: 0.8 };

/** Volume levels, 0–1 (stored in settings). */
export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
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

/** The music or SFX mix bus (master volume on top). Undefined until audio is unlocked. */
export function getBus(name: 'music' | 'sfx'): GainNode | undefined {
  if (!context) return undefined;
  if (!buses) {
    const master = context.createGain();
    master.connect(context.destination);
    const music = context.createGain();
    music.connect(master);
    const sfx = context.createGain();
    sfx.connect(master);
    buses = { master, music, sfx };
    applyVolumes();
  }
  return buses[name];
}

/** Sets the three volume levels (from the settings menu). */
export function setVolumes(next: AudioVolumes): void {
  volumes = { ...next };
  applyVolumes();
}

function applyVolumes(): void {
  if (!buses || !context) return;
  // Squared, so the slider feels even to the ear.
  const now = context.currentTime;
  buses.master.gain.setTargetAtTime(volumes.master ** 2, now, 0.03);
  buses.music.gain.setTargetAtTime(volumes.music ** 2, now, 0.03);
  buses.sfx.gain.setTargetAtTime(volumes.sfx ** 2, now, 0.03);
}
