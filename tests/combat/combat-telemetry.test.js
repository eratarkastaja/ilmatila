import { describe, expect, it } from 'vitest';
import { CombatTelemetry } from '../../src/performance/combat-telemetry.js';

describe('CombatTelemetry', () => {
  it('counts missile seeker mix, countermeasure attempts and successes, and player damage sources', () => {
    const telemetry = new CombatTelemetry({ difficulty: 'standard' });
    telemetry.recordMissileLaunch('player', 'radar');
    telemetry.recordMissileLaunch('hostile', 'ir');
    telemetry.recordMissileLaunch('hostile', 'radar');
    telemetry.recordCountermeasureUse('player', 'chaff');
    telemetry.recordCountermeasureAttempt('player', 'chaff', 'radarMissile');
    telemetry.recordCountermeasureSuccess('player', 'chaff', 'radarMissile');
    telemetry.recordPlayerDamage('combat.hostileMissile', 28.5);
    telemetry.recordPlayerDamage('combat.hostileFire', 4);

    expect(telemetry.snapshot()).toEqual({
      difficulty: 'standard',
      missileLaunches: {
        total: 3,
        byTeam: { player: { radar: 1 }, hostile: { ir: 1, radar: 1 } },
        bySeeker: { radar: 2, ir: 1 },
      },
      countermeasures: {
        uses: { player: { chaff: 1 } },
        attempts: { chaff: { player: { radarMissile: 1 } } },
        successes: { chaff: { player: { radarMissile: 1 } } },
      },
      playerDamage: {
        total: 32.5,
        bySource: { 'combat.hostileMissile': 28.5, 'combat.hostileFire': 4 },
      },
    });
  });

  it('returns independent snapshots', () => {
    const telemetry = new CombatTelemetry();
    telemetry.recordMissileLaunch('player', 'ir');

    const snapshot = telemetry.snapshot();
    snapshot.missileLaunches.bySeeker.ir = 0;

    expect(telemetry.snapshot().missileLaunches.bySeeker.ir).toBe(1);
  });
});
