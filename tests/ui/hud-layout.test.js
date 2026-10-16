import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '../..');

describe('combat HUD lower-left layout', () => {
  it('keeps campaign support inside the systems panel', () => {
    const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
    const weaponsStart = html.indexOf('<section class="weapons">');
    const weaponsEnd = html.indexOf('</section>', weaponsStart);
    const supportStatus = html.indexOf('id="campaign-support-status"');

    expect(weaponsStart).toBeGreaterThanOrEqual(0);
    expect(weaponsEnd).toBeGreaterThan(weaponsStart);
    expect(supportStatus).toBeGreaterThan(weaponsStart);
    expect(supportStatus).toBeLessThan(weaponsEnd);
  });

  it('uses normal document flow for the embedded support module', () => {
    const css = readFileSync(resolve(projectRoot, 'src/ui/styles/hud.css'), 'utf8');

    expect(css).toContain('.weapons>.campaign-support-status {');
    expect(css).toContain('position: static;');
  });
});
