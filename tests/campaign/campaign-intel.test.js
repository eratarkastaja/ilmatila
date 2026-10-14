import { describe, expect, it } from 'vitest';
import { resolveCampaignIntel } from '../../src/campaign/campaign-intel.js';

describe('campaign intelligence estimates', () => {
  it('reports an uncertain strength range instead of authored formation details', () => {
    const intel = resolveCampaignIntel({ mission: { hostiles: 4, hostileHelicopters: 1, groundBattle: true, groundShilkaCount: 2 } }, {
      chapterIndex: 4,
      airControl: 39,
      flags: [],
    });

    expect(intel.minimumStrength).toBeLessThan(5);
    expect(intel.maximumStrength).toBeGreaterThan(5);
    expect(intel.reliability).toBeLessThan(60);
    expect(intel.samKey).toBe('campaign.intel.sam.uncertain');
    expect(intel.sectorKey).toBe('campaign.intel.sector.northeast');
  });

  it('improves reliability after a protected relay and strong air control', () => {
    const intel = resolveCampaignIntel({ mission: { hostiles: 2 } }, {
      chapterIndex: 3,
      airControl: 85,
      flags: ['relay-protected'],
    });

    expect(intel.reliability).toBeGreaterThan(75);
    expect(intel.maximumStrength - intel.minimumStrength).toBeLessThanOrEqual(2);
  });
});
