// Rapier is loaded with a dynamic import so it lands in its own chunk.
// The -compat build inlines its WASM, so there is no extra network request
// and it works from itch.io's CDN subfolder.
export type Rapier = typeof import('@dimforge/rapier3d-compat');

let loading: Promise<Rapier> | undefined;

export function loadPhysics(): Promise<Rapier> {
  loading ??= import('@dimforge/rapier3d-compat').then(async (module) => {
    const RAPIER = (module.default ?? module) as Rapier;
    await RAPIER.init();
    return RAPIER;
  });
  return loading;
}
