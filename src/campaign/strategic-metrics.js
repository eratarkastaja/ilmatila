const METRIC_THRESHOLDS = Object.freeze({
  airControl: Object.freeze([
    { value: 30, operator: 'below', effectKey: 'campaign.metric.airControl.below30' },
    { value: 40, operator: 'below', effectKey: 'campaign.metric.airControl.below40' },
    { value: 70, operator: 'atLeast', effectKey: 'campaign.metric.airControl.at70' },
    { value: 75, operator: 'atLeast', effectKey: 'campaign.metric.airControl.at75' },
  ]),
  defenseIntegrity: Object.freeze([
    { value: 35, operator: 'below', effectKey: 'campaign.metric.defenseIntegrity.below35' },
    { value: 75, operator: 'atLeast', effectKey: 'campaign.metric.defenseIntegrity.at75' },
  ]),
  sortieReadiness: Object.freeze([
    { value: 35, operator: 'below', effectKey: 'campaign.metric.sortieReadiness.below35' },
    { value: 80, operator: 'atLeast', effectKey: 'campaign.metric.sortieReadiness.at80' },
  ]),
});

export function getMetricThresholds(metric) {
  return METRIC_THRESHOLDS[metric] ?? [];
}

export function isMetricThresholdActive(threshold, value) {
  if (!threshold || !Number.isFinite(value)) return false;
  return threshold.operator === 'below'
    ? value < threshold.value
    : value >= threshold.value;
}
