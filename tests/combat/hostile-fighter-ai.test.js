import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HostileFighterAI } from '../../src/combat/hostile-fighter-ai.js';

describe('HostileFighterAI radar tracking', () => {
  it('holds a broken player track during chaff disruption and reacquires afterward', () => {
    const ai = new HostileFighterAI();
    const player = { position: new THREE.Vector3() };
    const ally = { mesh: { position: new THREE.Vector3(100, 0, 0) }, dead: false };
    const enemy = {
      mesh: { position: new THREE.Vector3(0, 0, 500) },
      radarTrackDisruptionRemaining: 2.8,
      groundStrafeCooldown: 10,
    };
    const battle = {
      player,
      allies: [ally],
      friendlyGroundUnits: [],
      difficulty: { fighter: { targeting: { airPriorityRange: 1000 } } },
    };

    expect(ai.selectEnemyEngagementTarget(battle, enemy, 500)).toEqual({ target: ally, domain: 'air' });

    enemy.radarTrackDisruptionRemaining = 0;
    expect(ai.selectEnemyEngagementTarget(battle, enemy, 500)).toEqual({ target: player, domain: 'air' });
  });

  it('blocks radar missile launches during a broken radar track but leaves IR launches alone', () => {
    const ai = new HostileFighterAI();
    const enemy = { radarTrackDisruptionRemaining: 2 };

    expect(ai.canLaunchMissile(enemy, 'radar')).toBe(false);
    expect(ai.canLaunchMissile(enemy, 'ir')).toBe(true);

    enemy.radarTrackDisruptionRemaining = 0;
    expect(ai.canLaunchMissile(enemy, 'radar')).toBe(true);
  });
});
