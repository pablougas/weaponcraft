let context: AudioContext | undefined;

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
