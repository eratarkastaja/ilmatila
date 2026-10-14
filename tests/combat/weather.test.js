import { describe, expect, it } from 'vitest';
import {
  daylightFactor,
  formatTimeOfDay,
  getWeatherTimeOfDay,
  isNightTime,
  resolveWeather,
  WEATHER_PRESETS,
} from '../../src/combat/weather.js';

describe('mission weather', () => {
  it('normalizes a preset without sharing its wind vector', () => {
    const weather = resolveWeather({ preset: 'fog' });
    expect(weather.id).toBe('fog');
    expect(weather.visualIdentificationRangeScale).toBeLessThan(1);
    expect(weather.radarRangeScale).toBeGreaterThan(.8);
    weather.wind.x = 999;
    expect(WEATHER_PRESETS.fog.wind.x).not.toBe(999);
  });

  it('supports authored wind and visibility overrides', () => {
    const weather = resolveWeather({
      preset: 'headwind',
      visibility: .7,
      wind: { x: 0, y: 0, z: -48 },
    });
    expect(weather.visibility).toBe(.7);
    expect(weather.wind.toArray()).toEqual([0, 0, -48]);
  });

  it('advances a readable local clock and preserves the day/night cycle', () => {
    const weather = resolveWeather({ preset: 'night' });
    const start = getWeatherTimeOfDay(weather, 0);
    const later = getWeatherTimeOfDay(weather, 300);

    expect(formatTimeOfDay(start)).toBe('23:06');
    expect(formatTimeOfDay(later)).toBe('23:11');
    expect(daylightFactor(12)).toBe(1);
    expect(isNightTime(23)).toBe(true);
    expect(isNightTime(12)).toBe(false);
  });
});
