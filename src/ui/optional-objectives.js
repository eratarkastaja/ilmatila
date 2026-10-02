import { formatNumber, t } from './i18n.js';

function targetLabel(objective) {
  const labelKey = objective.target?.labelKey;
  return labelKey ? t(labelKey) : t('mission.optionalObjective.target.generic');
}

function descriptionParams(objective) {
  return {
    limit: formatNumber(objective.limitSeconds ?? 0),
    count: formatNumber(objective.minimumRemaining ?? 0),
    radius: formatNumber(objective.zoneRadius ?? 0),
    target: targetLabel(objective),
  };
}

function resultParams(params = {}) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [
    key,
    key === 'target'
      ? value ? t(value) : t('mission.optionalObjective.target.generic')
      : typeof value === 'number' ? formatNumber(value) : value,
  ]));
}

/** Renders any configured objective through the shared briefing/debrief list. */
export function renderOptionalObjectives(container, objectives = [], results = null) {
  if (!container) return;
  const rows = Array.isArray(objectives) ? objectives : [];
  const section = container.closest('[data-optional-objectives]');
  if (section) section.hidden = rows.length === 0;
  container.replaceChildren();
  if (rows.length === 0) return;

  const resultsById = results ? new Map(results.map(result => [result.id, result])) : null;
  for (const objective of rows) {
    const item = document.createElement('li');
    item.className = 'optional-objective-item';
    const content = document.createElement('div');
    content.className = 'optional-objective-copy';
    const title = document.createElement('strong');
    title.textContent = t(`mission.optionalObjective.${objective.type}.title`);
    const description = document.createElement('p');
    description.textContent = t(`mission.optionalObjective.${objective.type}.briefing`, descriptionParams(objective));
    content.append(title, description);
    item.append(content);

    if (resultsById) {
      const result = resultsById.get(objective.id);
      const status = document.createElement('span');
      status.className = 'optional-objective-status';
      status.dataset.status = result?.status ?? 'pending';
      status.textContent = t(`mission.optionalObjective.status.${result?.status ?? 'pending'}`);
      const detail = document.createElement('small');
      detail.className = 'optional-objective-detail';
      detail.textContent = t(result?.detailKey ?? 'mission.optionalObjective.result.pending', resultParams(result?.params));
      item.append(status, detail);
    }
    container.append(item);
  }
}
