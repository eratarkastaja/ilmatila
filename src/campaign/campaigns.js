function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

const chapter = ({
  id,
  day,
  areaId,
  baseMissionId,
  decisiveObjectiveId,
  missionOverrides,
  decisive,
  success,
  setback,
}) => ({
  id,
  day,
  areaId,
  baseMissionId,
  titleKey: `campaign.shadowBorder.chapter.${id}.title`,
  briefingKey: `campaign.shadowBorder.chapter.${id}.briefing`,
  decisiveObjectiveId,
  effects: { decisive, success, setback },
  ...(missionOverrides ? { missionOverrides } : {}),
});

const airSuccess = (flag, airControl = 5) => ({
  airControl,
  defenseIntegrity: 1,
  sortieReadiness: 2,
  addFlags: [flag],
});

const groundSuccess = (flag, defenseIntegrity = 6) => ({
  airControl: 1,
  defenseIntegrity,
  sortieReadiness: 1,
  addFlags: [flag],
});

export const CAMPAIGNS = deepFreeze({
  'shadow-border': {
    id: 'shadow-border',
    titleKey: 'campaign.shadowBorder.title',
    descriptionKey: 'campaign.shadowBorder.description',
    initialState: {
      airControl: 60,
      defenseIntegrity: 70,
      sortieReadiness: 70,
      flags: [],
    },
    chapters: [
      chapter({
        id: 'unknown-track', day: 1, areaId: 'virolahti', baseMissionId: 'patrol',
        decisiveObjectiveId: 'no-damage',
        missionOverrides: {
          disableVariants: true,
          rulesOfEngagement: 'weaponsHold',
          hostileDisposition: 'noncombatant',
          hostiles: 2,
          wingmanInitialOrder: 'regroup',
          objective: {
            type: 'airPolicing',
            identifyRange: 3400,
            identifyDuration: 3,
            escortRange: 4200,
            escortDuration: 15,
          },
        },
        decisive: airSuccess('intruders-profiled', 8),
        success: airSuccess('intruders-profiled', 5),
        setback: { airControl: -8, sortieReadiness: -2 },
      }),
      chapter({
        id: 'broken-silence', day: 1, areaId: 'virolahti', baseMissionId: 'intercept',
        decisiveObjectiveId: 'lead-intercept',
        missionOverrides: {
          objective: {
            type: 'assetDefense',
            target: { collection: 'airHostiles', index: 2 },
            zoneRadius: 7200,
          },
        },
        decisive: airSuccess('relay-saved', 9),
        success: airSuccess('relay-saved', 5),
        setback: { airControl: -9, defenseIntegrity: -5, sortieReadiness: -3 },
      }),
      chapter({
        id: 'disperse', day: 2, areaId: 'paijanne', baseMissionId: 'patrol',
        decisiveObjectiveId: 'wingmen-home',
        decisive: { airControl: 4, defenseIntegrity: 2, sortieReadiness: 10, addFlags: ['road-base-supplied'] },
        success: { airControl: 2, defenseIntegrity: 1, sortieReadiness: 6, addFlags: ['road-base-supplied'] },
        setback: { airControl: -4, sortieReadiness: -10 },
      }),
      chapter({
        id: 'northern-feint', day: 3, areaId: 'ilomantsi', baseMissionId: 'intercept',
        decisiveObjectiveId: 'time-limit',
        decisive: airSuccess('main-axis-confirmed', 8),
        success: airSuccess('main-axis-confirmed', 4),
        setback: { airControl: -6, defenseIntegrity: -4 },
      }),
      chapter({
        id: 'first-wave', day: 4, areaId: 'kuusamo', baseMissionId: 'intercept',
        decisiveObjectiveId: 'wingmen-home',
        decisive: airSuccess('northern-axis-held', 10),
        success: airSuccess('northern-axis-held', 6),
        setback: { airControl: -10, defenseIntegrity: -6, sortieReadiness: -3 },
      }),
      chapter({
        id: 'border-breaks', day: 5, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'protect-friendly',
        missionOverrides: {
          objective: {
            type: 'forceDefense',
            minimumFriendlyStrength: 0.4,
            maximumGroundRemaining: 3,
          },
        },
        decisive: groundSuccess('border-line-stabilized', 10),
        success: groundSuccess('border-line-stabilized', 6),
        setback: { airControl: -3, defenseIntegrity: -12, sortieReadiness: -3 },
      }),
      chapter({
        id: 'hold-e18', day: 6, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'protect-friendly',
        decisive: groundSuccess('e18-held', 10),
        success: groundSuccess('e18-held', 6),
        setback: { defenseIntegrity: -12, sortieReadiness: -6 },
      }),
      chapter({
        id: 'blind-spear', day: 7, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'destroy-logistics',
        decisive: { airControl: 7, defenseIntegrity: 4, sortieReadiness: 4, addFlags: ['local-air-defense-breached'] },
        success: { airControl: 4, defenseIntegrity: 2, sortieReadiness: 2, addFlags: ['counterattack-window-open'] },
        setback: { airControl: -8, defenseIntegrity: -5 },
      }),
      chapter({
        id: 'counterstroke', day: 9, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'wingmen-home',
        decisive: groundSuccess('spearhead-isolated', 12),
        success: groundSuccess('spearhead-isolated', 7),
        setback: { airControl: -5, defenseIntegrity: -10, sortieReadiness: -4 },
      }),
      chapter({
        id: 'border-holds', day: 10, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'protect-friendly',
        decisive: groundSuccess('border-restored', 15),
        success: groundSuccess('border-restored', 8),
        setback: { airControl: -5, defenseIntegrity: -12, sortieReadiness: -5 },
      }),
    ],
  },
});

export function getCampaignDefinition(id = 'shadow-border') {
  return CAMPAIGNS[id] ?? null;
}

