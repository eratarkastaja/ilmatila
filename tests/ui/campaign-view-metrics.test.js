import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignView } from '../../src/ui/campaign-view.js';

class MockElement {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.style = {};
    this.textContent = '';
    this.open = false;
    this.listeners = new Map();
    this.classList = {
      values: new Set(),
      toggle: (name, force) => {
        const enabled = force ?? !this.classList.values.has(name);
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
      },
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener({ target: this });
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function installDocument() {
  const metricButtons = ['airControl', 'defenseIntegrity', 'sortieReadiness'].map(metric => {
    const button = new MockElement();
    button.dataset.campaignMetric = metric;
    return button;
  });
  const elements = new Map();
  globalThis.document = {
    querySelector: selector => {
      if (!elements.has(selector)) elements.set(selector, new MockElement());
      return elements.get(selector);
    },
    querySelectorAll: selector => selector === '[data-campaign-metric]' ? metricButtons : [],
    createElement: () => new MockElement(),
  };
  return { elements, metricButtons };
}

const previousDocument = globalThis.document;

afterEach(() => {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
});

describe('campaign metric details', () => {
  it('opens a compact table for the selected metric and marks active effects', () => {
    const { elements, metricButtons } = installDocument();
    const view = new CampaignView(globalThis.document);
    view.stateNodes.airControl.value.textContent = '75';

    view.showMetricDetails('airControl');

    const dialog = elements.get('#campaign-metric-dialog');
    const rows = elements.get('#campaign-metric-dialog-rows');
    expect(dialog.open).toBe(true);
    expect(elements.get('#campaign-metric-dialog-title').textContent).toBe('AIR CONTROL');
    expect(rows.children).toHaveLength(4);
    expect(rows.children.map(row => row.dataset.active)).toEqual(['false', 'false', 'true', 'true']);
    expect(rows.children[0].children[0].textContent).toBe('< 30');
    expect(rows.children[3].children[2].textContent).toBe('ACTIVE');
    expect(metricButtons.map(button => button.getAttribute('aria-expanded')))
      .toEqual(['true', 'false', 'false']);
  });

  it('opens the reset confirmation and only invokes reset after confirmation', () => {
    const { elements } = installDocument();
    const view = new CampaignView(globalThis.document);
    const resetOpen = elements.get('#campaign-reset-open');
    const resetCancel = elements.get('#campaign-reset-cancel');
    const resetConfirm = elements.get('#campaign-reset-confirm');
    const resetDialog = elements.get('#campaign-reset-dialog');
    const onResetCampaign = vi.fn();
    view.onResetCampaign = onResetCampaign;

    resetOpen.dispatch('click');
    expect(resetDialog.open).toBe(true);
    expect(onResetCampaign).not.toHaveBeenCalled();

    resetCancel.dispatch('click');
    expect(resetDialog.open).toBe(false);
    expect(onResetCampaign).not.toHaveBeenCalled();

    resetOpen.dispatch('click');
    resetConfirm.dispatch('click');
    expect(resetDialog.open).toBe(false);
    expect(onResetCampaign).toHaveBeenCalledOnce();
  });
});
