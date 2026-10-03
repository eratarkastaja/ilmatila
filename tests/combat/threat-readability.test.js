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
    expect(t('hud.radarWarning.lock')).toContain('MANEUVER');
    expect(t('hud.radarWarning.irLock')).toContain('FLARES [F]');
    expect(t('hud.radarWarning.groundTrack')).toContain('GROUND AA TRACK');
    expect(t('hud.wingmanRescue.title', { callsign: 'RAVEN' })).toContain('RAVEN');
    expect(t('hud.wingmanRescue.inbound', { attacker: 'MiG-29', seconds: 12 })).toContain('12s');
    expect(t('combat.groundTargetRole.airDefense')).toContain('LOW FLIGHT');
    expect(t('combat.groundTargetRole.armor')).toContain('FRIENDLY FORCES');
    expect(t('combat.groundTargetRole.logistics')).toContain('BLOCK BACKUP');
  });
});
