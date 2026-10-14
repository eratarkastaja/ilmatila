const METRIC_THRESHOLDS = Object.freeze({
  airControl: Object.freeze([
    { value: 40, effectKey: 'campaign.metric.airControl.below40' },
    { value: 70, effectKey: 'campaign.metric.airControl.at70' },
    { value: 75, effectKey: 'campaign.metric.airControl.at75' },
  ]),
  defenseIntegrity: Object.freeze([
    { value: 35, effectKey: 'campaign.metric.defenseIntegrity.below35' },
    { value: 75, effectKey: 'campaign.metric.defenseIntegrity.at75' },
  ]),
  sortieReadiness: Object.freeze([
    { value: 35, effectKey: 'campaign.metric.sortieReadiness.below35' },
    { value: 80, effectKey: 'campaign.metric.sortieReadiness.at80' },
  ]),
});

export function getNearestMetricThreshold(metric, value) {
  const thresholds = METRIC_THRESHOLDS[metric] ?? [];
  return thresholds.reduce((nearest, threshold) => (
    !nearest || Math.abs(value - threshold.value) < Math.abs(value - nearest.value)
      ? threshold
      : nearest
  ), null);
}
