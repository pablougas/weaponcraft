import { TIME_OF_DAY_LOCKS, type TimeOfDayLock } from '../sim/time';
import type { SaveStorage } from './save';

/**
 * Player settings, saved per browser under a namespaced key (SPEC §11, §16).
 * Separate from the world save so "New game" keeps your settings.
 */
export const SETTINGS_KEY = 'weaponcraft:settings:v1';

export type QualityPreset = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | QualityPreset;
export const QUALITY_SETTINGS: readonly QualitySetting[] = ['auto', 'low', 'medium', 'high'];

export interface EffectSettings {
  bloom: boolean;
  godRays: boolean;
  outlines: boolean;
  colorGrade: boolean;
  particles: boolean;
}

export interface Settings {
  quality: QualitySetting;
  effects: EffectSettings;
  /** No camera shake, softened flashes, calmer particles and wind. */
  reduceMotion: boolean;
  timeOfDay: TimeOfDayLock;
  /** Mouse look speed multiplier (0.2–3). */
  mouseSensitivity: number;
  invertY: boolean;
  /** Camera swings back behind the god while moving, so the arrow keys steer without a mouse. */
  cameraAutoFollow: boolean;
  /** Master, music, sound-effect and voice volume, 0–1. */
  volume: { master: number; music: number; sfx: number; voice: number };
}

export interface QualityParams {
  /** Upper bound on devicePixelRatio. */
  pixelRatioCap: number;
  shadowMapSize: number;
  /** Fraction of grass blades / flowers drawn. */
  foliageDensity: number;
  /** God-ray samples per pixel. */
  raySamples: number;
}

/** What each quality preset changes: resolution, shadows, foliage density, god-ray cost. */
export const QUALITY_PRESETS: Readonly<Record<QualityPreset, QualityParams>> = {
  low: { pixelRatioCap: 1, shadowMapSize: 1024, foliageDensity: 0.4, raySamples: 32 },
  medium: { pixelRatioCap: 1.5, shadowMapSize: 2048, foliageDensity: 0.75, raySamples: 48 },
  high: { pixelRatioCap: 2, shadowMapSize: 2048, foliageDensity: 1, raySamples: 64 },
};

export function defaultSettings(prefersReducedMotion = false): Settings {
  return {
    quality: 'auto',
    effects: { bloom: true, godRays: true, outlines: true, colorGrade: true, particles: true },
    reduceMotion: prefersReducedMotion,
    timeOfDay: 'live',
    mouseSensitivity: 1,
    invertY: false,
    cameraAutoFollow: true,
    volume: { master: 0.8, music: 0.6, sfx: 0.8, voice: 0.9 },
  };
}

/** Merges stored JSON onto defaults, ignoring anything unknown or malformed. */
export function parseSettings(text: string | null, defaults: Settings): Settings {
  const settings = structuredClone(defaults);
  if (!text) return settings;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return settings;
  }
  if (typeof raw !== 'object' || raw === null) return settings;
  const value = raw as Record<string, unknown>;
  if (QUALITY_SETTINGS.includes(value.quality as QualitySetting)) settings.quality = value.quality as QualitySetting;
  if (typeof value.reduceMotion === 'boolean') settings.reduceMotion = value.reduceMotion;
  if (typeof value.invertY === 'boolean') settings.invertY = value.invertY;
  if (typeof value.cameraAutoFollow === 'boolean') settings.cameraAutoFollow = value.cameraAutoFollow;
  if (typeof value.mouseSensitivity === 'number' && Number.isFinite(value.mouseSensitivity)) {
    settings.mouseSensitivity = Math.min(3, Math.max(0.2, value.mouseSensitivity));
  }
  if (typeof value.volume === 'object' && value.volume !== null) {
    const volume = value.volume as Record<string, unknown>;
    for (const key of ['master', 'music', 'sfx', 'voice'] as const) {
      const v = volume[key];
      if (typeof v === 'number' && Number.isFinite(v)) settings.volume[key] = Math.min(1, Math.max(0, v));
    }
  }
  if (TIME_OF_DAY_LOCKS.includes(value.timeOfDay as TimeOfDayLock)) settings.timeOfDay = value.timeOfDay as TimeOfDayLock;
  if (typeof value.effects === 'object' && value.effects !== null) {
    const effects = value.effects as Record<string, unknown>;
    for (const key of Object.keys(settings.effects) as (keyof EffectSettings)[]) {
      if (typeof effects[key] === 'boolean') settings.effects[key] = effects[key] as boolean;
    }
  }
  return settings;
}

export class SettingsStore {
  private current: Settings;
  private readonly listeners = new Set<(settings: Settings) => void>();

  constructor(private readonly storage: SaveStorage | undefined, defaults: Settings = defaultSettings()) {
    let text: string | null = null;
    try {
      text = storage?.getItem(SETTINGS_KEY) ?? null;
    } catch {
      text = null;
    }
    this.current = parseSettings(text, defaults);
  }

  /** A copy of the current settings. */
  get(): Settings {
    return structuredClone(this.current);
  }

  /** Applies a change, saves it, and notifies listeners. */
  update(change: (draft: Settings) => void): void {
    const draft = structuredClone(this.current);
    change(draft);
    this.current = draft;
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(draft));
    } catch {
      // Storage blocked or full: settings still apply for this session.
    }
    for (const listener of this.listeners) listener(this.get());
  }

  /** Calls `listener` now and after every change. */
  subscribe(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }
}

/**
 * Chooses a preset from measured frame rate at Medium. Used once per session
 * when quality is "auto".
 */
export function pickAutoQuality(averageFps: number): QualityPreset {
  if (averageFps < 40) return 'low';
  if (averageFps >= 58) return 'high';
  return 'medium';
}
