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
  optionalObjectives,
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
  ...(optionalObjectives ? { optionalObjectives } : {}),
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
      optionalObjective: {
        id: 'support-varpunen',
        type: 'preserveForce',
        target: { collection: 'airFriendly', role: 'wingman', radioId: 'varpunen', labelKey: 'mission.optionalTarget.varpunen' },
        minimumAlive: 1,
        titleKey: 'campaign.objective.supportVarpunen.title',
        briefingKey: 'campaign.objective.supportVarpunen.briefing',
      },
      optionalObjectiveEffects: {
        completed: { sortieReadiness: 2 },
        failed: { sortieReadiness: -2 },
      },
    },
    {
      id: 'sergei-air-defense',
      titleKey: 'campaign.sustainment.choice.sergeiAirDefense.title',
      descriptionKey: 'campaign.sustainment.choice.sergeiAirDefense.description',
      mission: {
        groundBattle: true,
        groundSergeiCount: 3,
        campaignSupport: { sergei: true },
      },
      optionalObjective: {
        id: 'support-sergei',
        type: 'preserveForce',
        target: { collection: 'friendlyGround', role: 'airDefense', platform: 'sergei23', labelKey: 'mission.optionalTarget.sergei' },
        minimumAlive: 2,
        titleKey: 'campaign.objective.supportSergei.title',
        briefingKey: 'campaign.objective.supportSergei.briefing',
      },
      optionalObjectiveEffects: {
        completed: { defenseIntegrity: 2 },
        failed: { defenseIntegrity: -2 },
      },
    },
    {
      id: 'ito90-air-defense',
      titleKey: 'campaign.sustainment.choice.ito90AirDefense.title',
      descriptionKey: 'campaign.sustainment.choice.ito90AirDefense.description',
      requiredMetric: { key: 'defenseIntegrity', minimum: 65 },
      mission: {
        groundBattle: true,
        groundIto90SupportCount: 1,
        campaignSupport: { ito90: true },
        supportRequiresGroundBattle: true,
      },
      optionalObjective: {
        id: 'support-ito90', type: 'preserveForce',
        target: { collection: 'friendlyGround', role: 'airDefense', platform: 'ito90', labelKey: 'mission.optionalTarget.ito90' },
        minimumAlive: 1,
        titleKey: 'campaign.objective.supportIto90.title',
        briefingKey: 'campaign.objective.supportIto90.briefing',
      },
      optionalObjectiveByChapter: {
        'disperse': {
          id: 'support-ito90', type: 'preserveForce',
          target: { collection: 'friendlyGround', role: 'airDefense', platform: 'ito90', labelKey: 'mission.optionalTarget.ito90' },
          minimumAlive: 1,
          titleKey: 'campaign.objective.supportIto90.title',
          briefingKey: 'campaign.objective.supportIto90.briefing',
        },
      },
      optionalObjectiveEffects: {
        completed: { defenseIntegrity: 2 },
        failed: { defenseIntegrity: -2 },
      },
    },
    {
      id: 'awacs-battlespace-link',
      titleKey: 'campaign.sustainment.choice.awacs.title',
      descriptionKey: 'campaign.sustainment.choice.awacs.description',
      requiredMetric: { key: 'airControl', minimum: 70 },
      mission: {
        campaignSupport: { awacs: true },
        supportRequiresAirCombat: true,
      },
    },
    {
      id: 'rsrakh-mlrs',
      titleKey: 'campaign.sustainment.choice.rsrakhMlrs.title',
      descriptionKey: 'campaign.sustainment.choice.rsrakhMlrs.description',
      mission: {
        groundBattle: true,
        groundMlrsCount: 1,
        campaignSupport: { mlrs: true },
        groundMlrsManual: true,
        supportRequiresGroundBattle: true,
      },
      optionalObjective: {
        id: 'support-rsrakh',
        type: 'preserveForce',
        target: { collection: 'friendlyGround', role: 'artillery', platform: 'rsrakh06', labelKey: 'mission.optionalTarget.rsrakh' },
        minimumAlive: 1,
        titleKey: 'campaign.objective.supportRsrakh.title',
        briefingKey: 'campaign.objective.supportRsrakh.briefing',
      },
      optionalObjectiveEffects: {
        completed: { defenseIntegrity: 2 },
        failed: { defenseIntegrity: -2 },
      },
    },
    {
      id: 'expanded-ordnance-capacity',
      titleKey: 'campaign.sustainment.choice.expandedOrdnanceCapacity.title',
      descriptionKey: 'campaign.sustainment.choice.expandedOrdnanceCapacity.description',
      mission: {
        campaignKitHardpointDelta: 4,
        campaignKitPayloadDeltaKg: 800,
      },
      optionalObjective: {
        id: 'support-expanded-ordnance',
        type: 'destroyTargets',
        target: { collection: 'groundHostiles', role: 'airDefense', labelKey: 'mission.optionalTarget.airDefense' },
        required: 2,
        titleKey: 'campaign.objective.supportExpandedOrdnance.title',
        briefingKey: 'campaign.objective.supportExpandedOrdnance.briefing',
      },
      optionalObjectiveByChapter: {
        'hold-e18': {
          id: 'support-expanded-ordnance',
          type: 'destroyTargets',
          target: { collection: 'groundHostiles', role: 'assault', labelKey: 'mission.optionalTarget.assaultForce' },
          required: 3,
          titleKey: 'campaign.objective.supportExpandedOrdnance.title',
          briefingKey: 'campaign.objective.supportExpandedOrdnanceE18.briefing',
        },
        counterstroke: {
          id: 'support-expanded-ordnance',
          type: 'destroyTargets',
          target: { collection: 'groundHostiles', role: 'assault', labelKey: 'mission.optionalTarget.assaultForce' },
          required: 2,
          titleKey: 'campaign.objective.supportExpandedOrdnance.title',
          briefingKey: 'campaign.objective.supportExpandedOrdnanceCounterstroke.briefing',
        },
      },
      optionalObjectiveEffects: {
        completed: { airControl: 2 },
        failed: { airControl: -1 },
      },
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
        decisiveObjectiveId: 'flight-intact',
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
        optionalObjectives: [
          {
            id: 'clean-intercept', type: 'denyZone',
            target: { collection: 'airHostiles', role: 'sweep', labelKey: 'mission.optionalTarget.unknownContacts' },
            zone: { center: 'protectedAsset', radius: 4200 }, maximumPenetrations: 0,
            titleKey: 'campaign.objective.cleanIntercept.title',
            briefingKey: 'campaign.objective.cleanIntercept.briefing',
          },
          {
            id: 'flight-intact', type: 'preserveForce',
            target: { collection: 'airFriendly', role: 'wingman', labelKey: 'mission.optionalTarget.flight' },
            minimumFraction: 1,
            titleKey: 'campaign.objective.flightIntact.title',
            briefingKey: 'campaign.objective.flightIntact.briefing',
          },
        ],
        decisive: airSuccess('intruders-profiled', 8),
        success: airSuccess('intruders-profiled', 5),
        setback: { airControl: -8, sortieReadiness: -2 },
        optionalObjectiveEffects: {
          'clean-intercept': {
            completed: { sortieReadiness: 3 },
            failed: { sortieReadiness: -1 },
          },
          'flight-intact': {
            completed: { sortieReadiness: 3 },
            failed: { sortieReadiness: -2 },
          },
        },
      }),
      chapter({
        id: 'broken-silence', day: 1, timeOfDay: 23.5, areaId: 'virolahti', baseMissionId: 'intercept',
        decisiveObjectiveId: 'outer-screen',
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
        optionalObjectives: [
          {
            id: 'outer-screen', type: 'denyZone',
            target: { collection: 'airHostiles', role: 'strike', labelKey: 'mission.optionalTarget.strikeElement' },
            zone: { center: 'protectedAsset', radius: 12000 }, maximumPenetrations: 0,
            titleKey: 'campaign.objective.outerScreen.title',
            briefingKey: 'campaign.objective.outerScreen.briefing',
          },
          {
            id: 'relay-intact', type: 'denyZone',
            target: { collection: 'airHostiles', role: 'strike', labelKey: 'mission.optionalTarget.relay' },
            zone: { center: 'protectedAsset', radius: 7200 }, maximumPenetrations: 0,
            titleKey: 'campaign.objective.relayIntact.title',
            briefingKey: 'campaign.objective.relayIntact.briefing',
          },
          {
            id: 'flight-intact', type: 'preserveForce',
            target: { collection: 'airFriendly', role: 'wingman', labelKey: 'mission.optionalTarget.flight' },
            minimumFraction: 1,
            titleKey: 'campaign.objective.flightIntact.title',
            briefingKey: 'campaign.objective.flightIntact.briefing',
          },
        ],
        decisive: airSuccess('relay-saved', 9),
        success: airSuccess('relay-saved', 5),
        setback: { airControl: -9, defenseIntegrity: -5, sortieReadiness: -3 },
        optionalObjectiveEffects: {
          'outer-screen': {
            completed: { airControl: 3, defenseIntegrity: 5, addFlags: ['relay-protected'] },
            failed: { airControl: -2, defenseIntegrity: -5 },
          },
          'relay-intact': {
            completed: { defenseIntegrity: 3 },
            failed: { defenseIntegrity: -4 },
          },
        },
      }),
      chapter({
        id: 'disperse', day: 2, timeOfDay: 8, areaId: 'paijanne', baseMissionId: 'patrol',
        decisiveObjectiveId: 'preserve-logistics',
        missionOverrides: {
          groundBattle: true,
          groundPairs: 5,
          groundTrucks: 8,
          groundFriendlyTrucks: 6,
          groundFrontSpan: 18000,
          convoyArea: 15000,
          groundShilkaCount: 2,
          hostileHelicopters: 1,
          hostileHelicopterSpawnDistance: 13000,
          hostileHelicopterMinimumSpawnDistance: 11000,
          hostileHelicopterLateralSpacing: 1200,
          hostileHelicopterSpawnAltitude: 520,
          objective: { type: 'holdPosition', duration: 240, setback: { type: 'deadline', duration: 300 } },
        },
        optionalObjectives: [
          {
            id: 'preserve-logistics', type: 'preserveForce',
            target: { collection: 'friendlyGround', role: 'logistics', labelKey: 'mission.optionalTarget.logisticsColumn' },
            minimumFraction: .75,
            titleKey: 'campaign.objective.preserveLogistics.title',
            briefingKey: 'campaign.objective.preserveLogistics.briefing',
          },
          {
            id: 'ordnance-reserve', type: 'preserveMissiles', minimumRemaining: 12,
            titleKey: 'campaign.objective.ordnanceReserve.title',
            briefingKey: 'campaign.objective.ordnanceReserve.briefing',
          },
        ],
        sustainmentDecision: LIMITED_SUSTAINMENT,
        decisive: { airControl: 4, defenseIntegrity: 2, sortieReadiness: 10, addFlags: ['road-base-supplied'] },
        success: { airControl: 2, defenseIntegrity: 1, sortieReadiness: 6, addFlags: ['road-base-supplied'] },
        setback: { airControl: -4, sortieReadiness: -10 },
        optionalObjectiveEffects: {
          'preserve-logistics': {
            completed: { defenseIntegrity: 3, sortieReadiness: 4 },
            failed: { defenseIntegrity: -4, sortieReadiness: -4 },
          },
          'ordnance-reserve': {
            completed: { sortieReadiness: 3 },
            failed: { sortieReadiness: -2 },
          },
        },
      }),
      chapter({
        id: 'northern-feint', day: 3, timeOfDay: 20.5, areaId: 'ilomantsi', baseMissionId: 'intercept',
        decisiveObjectiveId: 'feint-contained',
        missionOverrides: {
          objective: { type: 'clearAir', setback: { type: 'deadline', duration: 360 } },
        },
        optionalObjectives: [
          {
            id: 'disrupt-strike-element', type: 'destroyTargets',
            target: { collection: 'airHostiles', role: 'strike', labelKey: 'mission.optionalTarget.strikeElement' },
            required: 1,
            titleKey: 'campaign.objective.disruptStrikeElement.title',
            briefingKey: 'campaign.objective.disruptStrikeElement.briefing',
          },
          {
            id: 'feint-contained', type: 'denyZone',
            target: { collection: 'airHostiles', role: 'strike', labelKey: 'mission.optionalTarget.strikeElement' },
            zone: { center: 'protectedAsset', radius: 7000 }, maximumPenetrations: 0,
            titleKey: 'campaign.objective.feintContained.title',
            briefingKey: 'campaign.objective.feintContained.briefing',
          },
        ],
        decisive: airSuccess('main-axis-confirmed', 8),
        success: airSuccess('main-axis-confirmed', 4),
        setback: { airControl: -6, defenseIntegrity: -4 },
        optionalObjectiveEffects: {
          'disrupt-strike-element': {
            completed: { airControl: 2 },
            failed: { airControl: -2 },
          },
          'feint-contained': {
            completed: { airControl: 3, defenseIntegrity: 3, addFlags: ['main-axis-confirmed'] },
            failed: { airControl: -3, defenseIntegrity: -3 },
          },
        },
      }),
      chapter({
        id: 'first-wave', day: 4, timeOfDay: 5.5, areaId: 'kuusamo', baseMissionId: 'intercept',
        decisiveObjectiveId: 'zero-penetrations',
        missionOverrides: {
          objective: { type: 'strikeDefense', setback: { type: 'deadline', duration: 300 } },
        },
        optionalObjectives: [
          {
            id: 'zero-penetrations', type: 'denyZone',
            target: { collection: 'airHostiles', role: 'strike', labelKey: 'mission.optionalTarget.strikeElement' },
            zone: { center: 'protectedAsset', radius: 7200 }, maximumPenetrations: 0,
            titleKey: 'campaign.objective.zeroPenetrations.title',
            briefingKey: 'campaign.objective.zeroPenetrations.briefing',
          },
          {
            id: 'break-sweep', type: 'destroyTargets',
            target: { collection: 'airHostiles', role: 'sweep', labelKey: 'mission.optionalTarget.sweepElement' },
            required: 2,
            titleKey: 'campaign.objective.breakSweep.title',
            briefingKey: 'campaign.objective.breakSweep.briefing',
          },
        ],
        decisive: airSuccess('northern-axis-held', 10),
        success: airSuccess('northern-axis-held', 6),
        setback: { airControl: -10, defenseIntegrity: -6, sortieReadiness: -3 },
        optionalObjectiveEffects: {
          'zero-penetrations': {
            completed: { defenseIntegrity: 4 },
            failed: { defenseIntegrity: -5 },
          },
          'break-sweep': {
            completed: { airControl: 2 },
            failed: { airControl: -2 },
          },
        },
      }),
      chapter({
        id: 'border-breaks', day: 5, timeOfDay: 8, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'preserve-line',
        missionOverrides: {
          objective: {
            type: 'forceDefense',
            minimumFriendlyStrength: 0.4,
            maximumGroundRemaining: 3,
            setback: { type: 'friendlyStrength', minimum: 0.4 },
          },
        },
        optionalObjectives: [
          {
            id: 'preserve-line', type: 'preserveForce',
            target: { collection: 'friendlyGround', role: 'defender', labelKey: 'mission.optionalTarget.defenders' },
            minimumFraction: .75,
            titleKey: 'campaign.objective.preserveLine.title',
            briefingKey: 'campaign.objective.preserveLine.briefing',
          },
          {
            id: 'blunt-armor', type: 'destroyTargets',
            target: { collection: 'groundHostiles', role: 'assault', labelKey: 'mission.optionalTarget.assaultForce' },
            required: 3,
            titleKey: 'campaign.objective.bluntArmor.title',
            briefingKey: 'campaign.objective.bluntArmor.briefing',
          },
        ],
        decisive: groundSuccess('border-line-stabilized', 10),
        success: groundSuccess('border-line-stabilized', 6),
        setback: { airControl: -3, defenseIntegrity: -12, sortieReadiness: -3 },
        optionalObjectiveEffects: {
          'preserve-line': {
            completed: { defenseIntegrity: 5 },
            failed: { defenseIntegrity: -6 },
          },
          'blunt-armor': {
            completed: { airControl: 2, defenseIntegrity: 2 },
            failed: { defenseIntegrity: -2 },
          },
        },
      }),
      chapter({
        id: 'hold-e18', day: 6, timeOfDay: 20.5, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'keep-column',
        missionOverrides: {
          objective: {
            type: 'protectUntilProgress', duration: 300, minimumLogisticsFraction: 0.5,
            setback: { type: 'friendlyLogistics', minimum: 0.5 },
          },
        },
        optionalObjectives: [
          {
            id: 'keep-column', type: 'preserveForce',
            target: { collection: 'friendlyGround', role: 'logistics', labelKey: 'mission.optionalTarget.logisticsColumn' },
            minimumFraction: .75,
            titleKey: 'campaign.objective.keepColumn.title',
            briefingKey: 'campaign.objective.keepColumn.briefing',
          },
          {
            id: 'suppress-air-defense', type: 'destroyTargets',
            target: { collection: 'groundHostiles', role: 'airDefense', labelKey: 'mission.optionalTarget.airDefense' },
            required: 2, requiredByDifficulty: { easy: 1, standard: 2, hard: 2 },
            titleKey: 'campaign.objective.suppressAirDefense.title',
            briefingKey: 'campaign.objective.suppressAirDefense.briefing',
          },
        ],
        sustainmentDecision: LIMITED_SUSTAINMENT,
        decisive: groundSuccess('e18-held', 10),
        success: groundSuccess('e18-held', 6),
        setback: { defenseIntegrity: -12, sortieReadiness: -6 },
        optionalObjectiveEffects: {
          'keep-column': {
            completed: { defenseIntegrity: 5, sortieReadiness: 2 },
            failed: { defenseIntegrity: -8 },
          },
          'suppress-air-defense': {
            completed: { airControl: 2 },
            failed: { airControl: -2 },
          },
        },
      }),
      chapter({
        id: 'blind-spear', day: 7, timeOfDay: 20.5, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'suppress-air-defense',
        missionOverrides: {
          objective: { type: 'logisticsStrike', setback: { type: 'deadline', duration: 300 } },
        },
        optionalObjectives: [
          {
            id: 'suppress-air-defense', type: 'destroyTargets',
            target: { collection: 'groundHostiles', role: 'airDefense', labelKey: 'mission.optionalTarget.airDefense' },
            required: 2, requiredByDifficulty: { easy: 1, standard: 2, hard: 2 },
            titleKey: 'campaign.objective.suppressAirDefense.title',
            briefingKey: 'campaign.objective.suppressAirDefense.briefing',
          },
          {
            id: 'ordnance-reserve', type: 'preserveMissiles', minimumRemaining: 8,
            titleKey: 'campaign.objective.ordnanceReserve.title',
            briefingKey: 'campaign.objective.ordnanceReserve.briefing',
          },
        ],
        decisive: { airControl: 7, defenseIntegrity: 4, sortieReadiness: 4, addFlags: ['relay-logistics-broken', 'local-air-defense-breached'] },
        success: { airControl: 4, defenseIntegrity: 2, sortieReadiness: 2, addFlags: ['relay-logistics-broken', 'counterattack-window-open'] },
        setback: { airControl: -8, defenseIntegrity: -5 },
        optionalObjectiveEffects: {
          'suppress-air-defense': {
            completed: { defenseIntegrity: 4, addFlags: ['local-air-defense-breached'] },
            failed: { defenseIntegrity: -4 },
          },
          'ordnance-reserve': {
            completed: { sortieReadiness: 3 },
            failed: { sortieReadiness: -2 },
          },
        },
      }),
      chapter({
        id: 'counterstroke', day: 9, timeOfDay: 20.5, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'preserve-assault-force',
        missionOverrides: {
          objective: {
            type: 'forceDefense', minimumFriendlyStrength: 0.5, maximumGroundRemaining: 3,
            setback: { type: 'friendlyStrength', minimum: 0.5 },
          },
        },
        optionalObjectives: [
          {
            id: 'preserve-assault-force', type: 'preserveForce',
            target: { collection: 'friendlyGround', role: 'defender', labelKey: 'mission.optionalTarget.counterattackForce' },
            minimumFraction: .7,
            titleKey: 'campaign.objective.preserveAssaultForce.title',
            briefingKey: 'campaign.objective.preserveAssaultForce.briefing',
          },
          {
            id: 'cut-reinforcements', type: 'destroyTargets',
            target: { collection: 'groundHostiles', role: 'logistics', reinforcementSource: true, labelKey: 'mission.optionalTarget.reinforcementLogistics' },
            required: 1,
            titleKey: 'campaign.objective.cutReinforcements.title',
            briefingKey: 'campaign.objective.cutReinforcements.briefing',
          },
          {
            id: 'suppress-air-defense', type: 'destroyTargets',
            target: { collection: 'groundHostiles', role: 'airDefense', labelKey: 'mission.optionalTarget.airDefense' },
            required: 2, requiredByDifficulty: { easy: 1, standard: 2, hard: 2 },
            titleKey: 'campaign.objective.suppressAirDefense.title',
            briefingKey: 'campaign.objective.suppressAirDefense.briefing',
          },
        ],
        sustainmentDecision: LIMITED_SUSTAINMENT,
        decisive: groundSuccess('spearhead-isolated', 12),
        success: groundSuccess('spearhead-isolated', 7),
        setback: { airControl: -5, defenseIntegrity: -10, sortieReadiness: -4 },
        optionalObjectiveEffects: {
          'preserve-assault-force': {
            completed: { defenseIntegrity: 5, sortieReadiness: 2 },
            failed: { defenseIntegrity: -6, sortieReadiness: -2 },
          },
          'cut-reinforcements': {
            completed: { airControl: 3 },
            failed: { airControl: -3 },
          },
          'suppress-air-defense': {
            completed: { airControl: 2 },
            failed: { airControl: -2 },
          },
        },
      }),
      chapter({
        id: 'border-holds', day: 10, timeOfDay: 12, areaId: 'virolahti', baseMissionId: 'support',
        decisiveObjectiveId: 'line-holds',
        missionOverrides: {
          hostileComposition: ['su27', 'su27'],
          hostileRoles: ['strike', 'strike'],
          objective: {
            type: 'staged',
            stages: [
              { id: 'intercept-strike', type: 'strikeDefense', titleKey: 'mission.objective.stage.interceptStrike', setback: { type: 'deadline', duration: 300 } },
              { id: 'hold-line', type: 'forceDefense', titleKey: 'mission.objective.stage.holdLine', minimumFriendlyStrength: 0.45, maximumGroundRemaining: 3, setback: { type: 'friendlyStrength', minimum: 0.45 } },
              { id: 'break-assault', type: 'holdPosition', titleKey: 'mission.objective.stage.breakAssault', duration: 120, setback: { type: 'deadline', duration: 180 } },
            ],
          },
        },
        optionalObjectives: [
          {
            id: 'line-holds', type: 'preserveForce',
            target: { collection: 'friendlyGround', role: 'defender', labelKey: 'mission.optionalTarget.defenders' },
            minimumFraction: .85,
            titleKey: 'campaign.objective.lineHolds.title',
            briefingKey: 'campaign.objective.lineHolds.briefing',
          },
          {
            id: 'no-breakthrough', type: 'denyZone',
            target: { collection: 'airHostiles', role: 'strike', labelKey: 'mission.optionalTarget.strikeElement' },
            zone: { center: 'protectedAsset', radius: 7000 }, maximumPenetrations: 0,
            titleKey: 'campaign.objective.noBreakthrough.title',
            briefingKey: 'campaign.objective.noBreakthrough.briefing',
          },
          {
            id: 'flight-home', type: 'allWingmenReturned',
            titleKey: 'campaign.objective.flightHome.title',
            briefingKey: 'campaign.objective.flightHome.briefing',
          },
        ],
        decisive: groundSuccess('border-restored', 15),
        success: groundSuccess('border-restored', 8),
        setback: { airControl: -5, defenseIntegrity: -12, sortieReadiness: -5 },
        optionalObjectiveEffects: {
          'line-holds': {
            completed: { defenseIntegrity: 6 },
            failed: { defenseIntegrity: -6 },
          },
          'no-breakthrough': {
            completed: { airControl: 3 },
            failed: { airControl: -4 },
          },
          'flight-home': {
            completed: { sortieReadiness: 2 },
            failed: { sortieReadiness: -2 },
          },
        },
      }),
    ],
  },
});

export function getCampaignDefinition(id = 'shadow-border') {
  return CAMPAIGNS[id] ?? null;
}

