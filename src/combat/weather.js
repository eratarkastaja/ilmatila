import * as THREE from 'three';

// Weather is authored per mission, then normalized once when a sortie starts.
// The modifiers are intentionally small and readable: radar remains useful in
// poor weather, while visual identification and unguided fire demand more
// deliberate flying.
export const WEATHER_PRESETS = Object.freeze({
  clear: Object.freeze({
    id: 'clear',
    labelKey: 'weather.clear',
    visibility: 1,
    radarRangeScale: 1,
    visualIdentificationRangeScale: 1,
    gunDispersionScale: 1,
    ballisticWindScale: 1,
    humidity: .62,
    cloudCoverage: .35,
    cloudBaseAltitude: 3500,
    contrailBaseAltitude: 5200,
    contrailFullAltitude: 6800,
    timeOfDay: 13.4,
    timeAdvanceHoursPerSecond: .012,
    wind: Object.freeze({ x: 5, y: .15, z: -3 }),
  }),
  fog: Object.freeze({
    id: 'fog',
    labelKey: 'weather.fog',
    visibility: .42,
    radarRangeScale: .96,
    visualIdentificationRangeScale: .42,
    gunDispersionScale: 1.2,
    ballisticWindScale: 1,
    humidity: .96,
    cloudCoverage: .86,
    cloudBaseAltitude: 1800,
    contrailBaseAltitude: 2200,
    contrailFullAltitude: 4200,
    timeAdvanceHoursPerSecond: .012,
    wind: Object.freeze({ x: 4, y: .1, z: -5 }),
  }),
  night: Object.freeze({
    id: 'night',
    labelKey: 'weather.night',
    visibility: .52,
    radarRangeScale: 1.04,
    visualIdentificationRangeScale: .5,
    gunDispersionScale: 1.1,
    ballisticWindScale: 1,
    humidity: .72,
    cloudCoverage: .55,
    cloudBaseAltitude: 3400,
    contrailBaseAltitude: 4200,
    contrailFullAltitude: 6000,
    timeOfDay: 23.1,
    timeAdvanceHoursPerSecond: .012,
    wind: Object.freeze({ x: 6, y: .1, z: -4 }),
  }),
  'low-cloud': Object.freeze({
    id: 'low-cloud',
    labelKey: 'weather.lowCloud',
    visibility: .74,
    radarRangeScale: .9,
    visualIdentificationRangeScale: .72,
    gunDispersionScale: 1.08,
    ballisticWindScale: 1,
    humidity: .9,
    cloudCoverage: .98,
    cloudBaseAltitude: 1050,
    contrailBaseAltitude: 900,
    contrailFullAltitude: 1800,
    timeOfDay: 10.2,
    timeAdvanceHoursPerSecond: .012,
    wind: Object.freeze({ x: 8, y: .15, z: -9 }),
  }),
  headwind: Object.freeze({
    id: 'headwind',
    labelKey: 'weather.headwind',
    visibility: .88,
    radarRangeScale: 1,
    visualIdentificationRangeScale: .88,
    gunDispersionScale: 1.06,
    ballisticWindScale: 1,
    humidity: .7,
    cloudCoverage: .58,
    cloudBaseAltitude: 4200,
    contrailBaseAltitude: 5000,
    contrailFullAltitude: 6600,
    timeOfDay: 17.3,
    timeAdvanceHoursPerSecond: .012,
    wind: Object.freeze({ x: 3, y: .12, z: -34 }),
  }),
});

const DEFAULT_WEATHER = WEATHER_PRESETS.clear;

export const TIME_OF_DAY_OPTIONS = Object.freeze([
  Object.freeze({ id: 'dawn', hours: 5.5, labelKey: 'timeOfDay.dawn' }),
  Object.freeze({ id: 'morning', hours: 8, labelKey: 'timeOfDay.morning' }),
  Object.freeze({ id: 'midday', hours: 12, labelKey: 'timeOfDay.midday' }),
  Object.freeze({ id: 'afternoon', hours: 16.5, labelKey: 'timeOfDay.afternoon' }),
  Object.freeze({ id: 'dusk', hours: 20.5, labelKey: 'timeOfDay.dusk' }),
  Object.freeze({ id: 'night', hours: 23.5, labelKey: 'timeOfDay.night' }),
]);

export function normalizeTimeOfDay(hours) {
  return THREE.MathUtils.euclideanModulo(Number.isFinite(hours) ? hours : 12, 24);
}

export function getWeatherTimeOfDay(weather, elapsedSeconds = 0) {
  const start = normalizeTimeOfDay(weather?.timeOfDay);
  const rate = Number.isFinite(weather?.timeAdvanceHoursPerSecond)
    ? weather.timeAdvanceHoursPerSecond
    : DEFAULT_WEATHER.timeAdvanceHoursPerSecond;
  return normalizeTimeOfDay(start + Math.max(0, elapsedSeconds) * rate);
}

/** Returns a soft daylight amount so dawn and dusk fade naturally. */
export function daylightFactor(hours) {
  const solarHeight = Math.sin((normalizeTimeOfDay(hours) - 6) / 12 * Math.PI);
  return THREE.MathUtils.smoothstep(solarHeight, -.08, .28);
}

export function isNightTime(hours) {
  return daylightFactor(hours) < .18;
}

export function formatTimeOfDay(hours) {
  const normalized = normalizeTimeOfDay(hours);
  const hour = Math.floor(normalized);
  const minute = Math.floor((normalized - hour) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function resolveWeather(config) {
  const authored = typeof config === 'string' ? { preset: config } : (config ?? {});
  const preset = WEATHER_PRESETS[authored.preset] ?? DEFAULT_WEATHER;
  const wind = authored.wind ?? preset.wind;
  return {
    ...preset,
    ...authored,
    id: authored.id ?? preset.id,
    labelKey: authored.labelKey ?? preset.labelKey,
    timeOfDay: normalizeTimeOfDay(authored.timeOfDay ?? preset.timeOfDay),
    timeAdvanceHoursPerSecond: Number.isFinite(authored.timeAdvanceHoursPerSecond)
      ? Math.max(0, authored.timeAdvanceHoursPerSecond)
      : preset.timeAdvanceHoursPerSecond,
    wind: new THREE.Vector3(
      Number.isFinite(wind?.x) ? wind.x : preset.wind.x,
      Number.isFinite(wind?.y) ? wind.y : preset.wind.y,
      Number.isFinite(wind?.z) ? wind.z : preset.wind.z,
    ),
  };
}

export function weatherLabelKey(weather) {
  return weather?.labelKey ?? DEFAULT_WEATHER.labelKey;
}
