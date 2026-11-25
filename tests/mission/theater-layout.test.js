import { describe, expect, it } from 'vitest';
import { TERRAIN_AREAS } from '../../src/environment/terrain.js';
import { resolveTheaterMissionLayout } from '../../src/mission/theater-layout.js';

describe('resolveTheaterMissionLayout', () => {
  it('centers and narrows Virolahti ground missions without mutating their source', () => {
    const mission = {
      id: 'support',
      groundBattle: true,
      battlefieldIngressOffset: 5000,
      groundFrontSpan: 27000,
      convoyArea: 24000,
    };
    const sortieLayout = TERRAIN_AREAS.find(area => area.id === 'virolahti').sortieLayout;

    const resolved = resolveTheaterMissionLayout(mission, { sortieLayout });

    expect(resolved).toMatchObject({
      battlefieldIngressOffset: 1000,
      groundFrontSpan: 20000,
      convoyArea: 18000,
    });
    expect(mission).toMatchObject({
      battlefieldIngressOffset: 5000,
      groundFrontSpan: 27000,
      convoyArea: 24000,
    });
  });

  it('preserves mission identity when the theater has no special layout', () => {
    const mission = { id: 'support', groundBattle: true };
    expect(resolveTheaterMissionLayout(mission, {})).toBe(mission);
  });
});
