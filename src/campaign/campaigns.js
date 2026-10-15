function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

const chapter = ({
  id,
  day,
  timeOfDay,
  areaId,
  baseMissionId,
  decisiveObjectiveId,
  missionOverrides,
  decisive,
  success,
  setback,
  sustainmentDecision,
  optionalObjectiveEffects,
}) => ({
  id,
  day,
  timeOfDay,
  areaId,
  baseMissionId,
  titleKey: `campaign.shadowBorder.chapter.${id}.title`,
  briefingKey: `campaign.shadowBorder.chapter.${id}.briefing`,
  radioBriefingKey: `campaign.radio.${id}`,
  decisiveObjectiveId,
  effects: { decisive, success, setback },
  ...(missionOverrides ? { missionOverrides } : {}),
  ...(sustainmentDecision ? { sustainmentDecision } : {}),
  ...(optionalObjectiveEffects ? { optionalObjectiveEffects } : {}),
});

const LIMITED_SUSTAINMENT = {
  id: 'limited-sustainment',
  descriptionKey: 'campaign.sustainment.description',
  choices: [
    {
      id: 'sparrow-wingman',
      titleKey: 'campaign.sustainment.choice.sparrowWingman.title',
      descriptionKey: 'campaign.sustainment.choice.sparrowWingman.description',
      mission: {
        campaignWingmanDelta: 1,
        campaignWingmanRadioId: 'varpunen',
      },
      readinessCost: 4,
    },
    {
      id: 'sergei-air-defense',
      titleKey: 'campaign.sustainment.choice.sergeiAirDefense.title',
      descriptionKey: 'campaign.sustainment.choice.sergeiAirDefense.description',
      mission: {
        groundBattle: true,
        groundSergeiCount: 3,
      },
      readinessCost: 5,
    },
    {
      id: 'rsrakh-mlrs',
      titleKey: 'campaign.sustainment.choice.rsrakhMlrs.title',
      descriptionKey: 'campaign.sustainment.choice.rsrakhMlrs.description',
      mission: {
        groundBattle: true,
        groundMlrsCount: 1,
      },
      readinessCost: 6,
    },
    {
      id: 'expanded-ordnance-capacity',
      titleKey: 'campaign.sustainment.choice.expandedOrdnanceCapacity.title',
      descriptionKey: 'campaign.sustainment.choice.expandedOrdnanceCapacity.description',
      mission: {
        campaignKitHardpointDelta: 4,
        campaignKitPayloadDeltaKg: 800,
      },
      readinessCost: 5,
    },
  ],
};

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
        id: 'unknown-track', day: 1, timeOfDay: 5.5, areaId: 'virolahti', baseMissionId: 'patrol',
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
            setback: { type: 'deadline', duration: 180 },
          },
        },
        decisive: airSuccess('intruders-profiled', 8),
        success: airSuccess('intruders-profiled', 5),
        setback: { airControl: -8, sortieReadiness: -2 },
        optionalObjectiveEffects: {
          'no-damage': {
            completed: { sortieReadiness: 3 },
            failed: { sortieReadiness: -1 },
          },
        },
      }),
      chapter({
        id: 'broken-silence', day: 1, timeOfDay: 23.5, areaId: 'virolahti', baseMissionId: 'intercept',
        decisiveObjectiveId: 'lead-intercept',
        missionOverrides: {
          // Keep the strike package at the far theater edge when the flight
          // reaches ingress. Sweep fighters screen the approach while the two
          // strike aircraft fly toward the protected anchor, giving the player
          // time to cross the sector and intercept them.
          hostileComposition: ['mig29', 'mig29', 'su27', 'su27'],
          hostileRoles: ['sweep', 'sweep', 'strike', 'strike'],
          hostileSpawnDistance: 18000,
          hostileMinimumSpawnDistance: 16500,
          hostileLateralSpacing: 1200,
          objective: {
            type: 'assetDefense',
            target: { collection: 'airHostiles', index: 2 },
            zoneRadius: 7200,
            graceDuration: 18,
            setback: { type: 'assetLost', graceDuration: 18 },
          },
        },
        decisive: airSuccess('relay-saved', 9),
        success: airSuccess('relay-saved', 5),
        setback: { airControl: -9, defenseIntegrity: -5, sortieReadiness: -3 },
        optionalObjectiveEffects: {
          'lead-intercept': {
            completed: { airControl: 3, defenseIntegrity: 5, addFlags: ['relay-protected'] },
            failed: { airControl: -2, defenseIntegrity: -5 },
          },
          'wingmen-home': {
            completed: { sortieReadiness: 3 },
            failed: { sortieReadiness: -3 },
          },
        },
      }),
      chapter({
        id: 'disperse', day: 2, timeOfDay: 8, areaId: 'paijanne', baseMissionId: 'patrol',
        decisiveObjectiveId: 'wingmen-home',
        missionOverrides: {
          objective: { type: 'holdPosition', duration: 240, setback: { type: 'deadline', duration: 300 } },
        },
        sustainmentDecision: LIMITED_SUSTAINMENT,
        decisive: { airControl: 4, defenseIntegrity: 2, sortieReadiness: 10, addFlags: ['road-base-supplied'] },
        success: { airControl: 2, defenseIntegrity: 1, sortieReadiness: 6, addFlags: ['road-base-supplied'] },
        setback: { airControl: -4, sortieReadiness: -10 },
        optionalObjectiveEffects: {
          'wingmen-home': {
            completed: { sortieReadiness: 4 },
            failed: { sortieReadiness: -4 },
          },
        },
      }),
      chapter({
        id: 'northern-feint', day: 3, timeOfDay: 20.5, areaId: 'ilomantsi', baseMissionId: 'intercept',
        decisiveObjectiveId: 'time-limit',
        missionOverrides: {
          objective: { type: 'clearAir', setback: { type: 'deadline', duration: 360 } },
        },
        decisive: airSuccess('main-axis-confirmed', 8),
        success: airSuccess('main-axis-confirmed', 4),
        setback: { airControl: -6, defenseIntegrity: -4 },
        optionalObjectiveEffects: {
          'time-limit': {
            completed: { airControl: 3 },
            failed: { airControl: -3 },
          },
        },
      }),
      chapter({
        id: 'first-wave', day: 4, timeOfDay: 5.5, areaId: 'kuusamo', baseMissionId: 'intercept',
        decisiveObjectiveId: 'wingmen-home',
        missionOverrides: {
          objective: { type: 'strikeDefense', setback: { type: 'deadline', duration: 300 } },
        },
        decisive: airSuccess('northern-axis-held', 10),
        success: airSuccess('northern-axis-held', 6),
        setback: { airControl: -10, defenseIntegrity: -6, sortieReadiness: -3 },
        optionalObjectiveEffects: {
          'wingmen-home': {
            completed: { defenseIntegrity: 3 },
            failed: { defenseIntegrity: -5 },
          },
        },
      }),
      chapter({
        id: 'border-breaks', day: 5, timeOfDay: 8, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'protect-friendly',
        missionOverrides: {
          objective: {
            type: 'forceDefense',
            minimumFriendlyStrength: 0.4,
            maximumGroundRemaining: 3,
            setback: { type: 'friendlyStrength', minimum: 0.4 },
          },
        },
        decisive: groundSuccess('border-line-stabilized', 10),
        success: groundSuccess('border-line-stabilized', 6),
        setback: { airControl: -3, defenseIntegrity: -12, sortieReadiness: -3 },
        optionalObjectiveEffects: {
          'protect-friendly': {
            completed: { defenseIntegrity: 5 },
            failed: { defenseIntegrity: -6 },
          },
          'wingmen-home': {
            completed: { sortieReadiness: 2 },
            failed: { sortieReadiness: -2 },
          },
        },
      }),
      chapter({
        id: 'hold-e18', day: 6, timeOfDay: 20.5, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'protect-friendly',
        missionOverrides: {
          objective: { type: 'holdPosition', duration: 300, setback: { type: 'friendlyStrength', minimum: 0.5 } },
        },
        sustainmentDecision: LIMITED_SUSTAINMENT,
        decisive: groundSuccess('e18-held', 10),
        success: groundSuccess('e18-held', 6),
        setback: { defenseIntegrity: -12, sortieReadiness: -6 },
        optionalObjectiveEffects: {
          'protect-friendly': {
            completed: { defenseIntegrity: 5, sortieReadiness: 2 },
            failed: { defenseIntegrity: -8 },
          },
        },
      }),
      chapter({
        id: 'blind-spear', day: 7, timeOfDay: 20.5, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'destroy-logistics',
        missionOverrides: {
          objective: { type: 'logisticsStrike', setback: { type: 'deadline', duration: 300 } },
        },
        decisive: { airControl: 7, defenseIntegrity: 4, sortieReadiness: 4, addFlags: ['local-air-defense-breached'] },
        success: { airControl: 4, defenseIntegrity: 2, sortieReadiness: 2, addFlags: ['counterattack-window-open'] },
        setback: { airControl: -8, defenseIntegrity: -5 },
        optionalObjectiveEffects: {
          'destroy-logistics': {
            completed: { defenseIntegrity: 4, addFlags: ['relay-logistics-broken'] },
            failed: { defenseIntegrity: -4 },
          },
        },
      }),
      chapter({
        id: 'counterstroke', day: 9, timeOfDay: 20.5, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'wingmen-home',
        missionOverrides: {
          objective: { type: 'holdPosition', duration: 360, setback: { type: 'friendlyStrength', minimum: 0.5 } },
        },
        sustainmentDecision: LIMITED_SUSTAINMENT,
        decisive: groundSuccess('spearhead-isolated', 12),
        success: groundSuccess('spearhead-isolated', 7),
        setback: { airControl: -5, defenseIntegrity: -10, sortieReadiness: -4 },
        optionalObjectiveEffects: {
          'wingmen-home': {
            completed: { airControl: 3, sortieReadiness: 2 },
            failed: { airControl: -4, sortieReadiness: -2 },
          },
        },
      }),
      chapter({
        id: 'border-holds', day: 10, timeOfDay: 12, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'protect-friendly',
        missionOverrides: {
          objective: { type: 'holdPosition', duration: 420, setback: { type: 'friendlyStrength', minimum: 0.45 } },
        },
        decisive: groundSuccess('border-restored', 15),
        success: groundSuccess('border-restored', 8),
        setback: { airControl: -5, defenseIntegrity: -12, sortieReadiness: -5 },
        optionalObjectiveEffects: {
          'protect-friendly': {
            completed: { defenseIntegrity: 4 },
            failed: { defenseIntegrity: -4 },
          },
        },
      }),
    ],
  },
});

export function getCampaignDefinition(id = 'shadow-border') {
  return CAMPAIGNS[id] ?? null;
}

