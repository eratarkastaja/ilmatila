import { afterEach, describe, expect, it } from 'vitest';
import { renderOptionalObjectives } from '../../src/ui/optional-objectives.js';

class MockElement {
  constructor(section = null) {
    this.hidden = false;
    this.dataset = {};
    this.children = [];
    this.textContent = '';
    this.section = section;
  }
  closest() { return this.section; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
}

const previousDocument = globalThis.document;

afterEach(() => {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
});

describe('optional objective presentation', () => {
  it('renders configured objective descriptions and their debrief results as shared rows', () => {
    const section = new MockElement();
    const container = new MockElement(section);
    const objectives = [
      { id: 'wingmen', type: 'allWingmenSurvive' },
      { id: 'missiles', type: 'preserveMissiles', minimumRemaining: 16 },
    ];
    const results = [
      { id: 'wingmen', status: 'completed', detailKey: 'mission.optionalObjective.result.wingmenReturned', params: { returned: 2, total: 2 } },
      { id: 'missiles', status: 'failed', detailKey: 'mission.optionalObjective.result.missilesBelowReserve', params: { remaining: 9, minimum: 16 } },
    ];
    globalThis.document = { createElement: () => new MockElement() };

    renderOptionalObjectives(container, objectives, results);

    expect(section.hidden).toBe(false);
    expect(container.children).toHaveLength(2);
    expect(container.children[0].children[0].children[0].textContent).toBe('BRING ALL WINGMEN HOME');
    expect(container.children[0].children[1].dataset.status).toBe('completed');
    expect(container.children[0].children[1].textContent).toBe('COMPLETED');
    expect(container.children[0].children[2].textContent).toBe('2/2 wingmen returned.');
    expect(container.children[1].children[1].dataset.status).toBe('failed');
    expect(container.children[1].children[2].textContent).toContain('9');
    expect(container.children[1].children[2].textContent).toContain('16');
  });

  it('hides and clears the optional objective section when none are configured', () => {
    const section = new MockElement();
    const container = new MockElement(section);
    container.children.push(new MockElement());
    globalThis.document = { createElement: () => new MockElement() };

    renderOptionalObjectives(container, []);

    expect(section.hidden).toBe(true);
    expect(container.children).toEqual([]);
  });
});
