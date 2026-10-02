import { describe, expect, it } from 'vitest';
import { t } from '../../src/ui/i18n.js';

describe('countermeasure threat cues', () => {
  it('pairs each seeker warning with its effective countermeasure control', () => {
    expect(t('hud.irMissileInbound')).toBe('IR MISSILE → FLARES [F]');
    expect(t('hud.radarMissileInbound')).toBe('RADAR MISSILE → CHAFF [C]');
    expect(t('hud.irMissileLaunchDetected')).toBe('IR MISSILE LAUNCH → FLARES [F]');
    expect(t('hud.radarMissileLaunchDetected')).toBe('RADAR MISSILE LAUNCH → CHAFF [C]');
    expect(t('combat.irMissileLaunchDetected')).toBe('IR MISSILE LAUNCH → FLARES [F]');
    expect(t('combat.radarMissileLaunchDetected')).toBe('RADAR MISSILE LAUNCH → CHAFF [C]');
    expect(t('hud.radarWarning.track')).toBe('RADAR TRACK → CHAFF [C]');
  });
});
