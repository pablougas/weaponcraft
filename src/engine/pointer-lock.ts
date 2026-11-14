/**
 * Requests pointer lock without ever throwing or leaving an unhandled
 * rejection. Resolves to whether the lock was granted. The itch.io iframe may
 * refuse it, in which case the camera falls back to drag-to-orbit (M3).
 */
export async function requestPointerLockSafely(element: HTMLElement): Promise<boolean> {
  if (!('requestPointerLock' in element)) return false;
  try {
    // Chrome returns a promise; older browsers return undefined and report
    // failure through the pointerlockerror event instead.
    const result = element.requestPointerLock() as unknown as Promise<void> | undefined;
    if (result && typeof result.then === 'function') {
      await result;
      return document.pointerLockElement === element;
    }
    return await new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        document.removeEventListener('pointerlockchange', onChange);
        document.removeEventListener('pointerlockerror', onError);
        resolve(ok);
      };
      const onChange = () => done(document.pointerLockElement === element);
      const onError = () => done(false);
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onError);
      setTimeout(() => done(document.pointerLockElement === element), 1000);
    });
  } catch {
    return false;
  }
}
