import { HERO_ROCK_TOP } from '../sim/terrain/meadow';

export type CameraPresetId = 'vista' | 'hero' | 'wide';

export interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
}

/** The style test's camera shots. M3's orbit camera takes over in play. */
export const CAMERA_PRESETS: Readonly<Record<CameraPresetId, CameraPreset>> = {
  vista: { position: [3.0, HERO_ROCK_TOP + 1.7, 5.2], target: [-2.0, HERO_ROCK_TOP + 1.9, -14] },
  hero: { position: [-0.55, HERO_ROCK_TOP + 1.95, -1.75], target: [0, HERO_ROCK_TOP + 1.82, 0] },
  wide: { position: [-38, HERO_ROCK_TOP + 14, 30], target: [6, HERO_ROCK_TOP - 4, -18] },
};

export const CAMERA_PRESET_IDS = Object.keys(CAMERA_PRESETS) as CameraPresetId[];
