const GRADE_WEIGHTS = {
  mission: 25,
  survival: 20,
  wingmen: 15,
  accuracy: 15,
  damage: 10,
  efficiency: 15,
};

const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

function scoredCriterion(key, ratio, reasonKey, params = {}) {
  const possible = GRADE_WEIGHTS[key];
  return {
    key,
    earned: Math.round(possible * clamp(ratio)),
    possible,
    reasonKey,
    params,
  };
}

function unscoredCriterion(key, reasonKey) {
  return { key, earned: 0, possible: 0, reasonKey, params: {} };
}

export function calculateDebriefGrade({
  outcome,
  gunRounds = 0,
  gunHits = 0,
  missilesFired = 0,
  missilesHit = 0,
  damageTaken = 0,
  playerMaxHull = 0,
  wingmenSurvived = 0,
  wingmenTotal = 0,
}) {
  const damage = Math.max(0, damageTaken);
  const hull = Math.max(0, playerMaxHull);
  const accuracy = Math.max(0, gunRounds) > 0 ? clamp(gunHits / gunRounds) : 0;
  const missileEfficiency = Math.max(0, missilesFired) > 0 ? clamp(missilesHit / missilesFired) : 0;
  const missionComplete = outcome === 'complete';
  const playerSurvived = outcome !== 'failed';
  const criteria = [
    scoredCriterion('mission', missionComplete ? 1 : 0,
      missionComplete ? 'mission.debrief.grade.missionComplete' : 'mission.debrief.grade.missionIncomplete'),
    scoredCriterion('survival', playerSurvived ? 1 : 0,
      playerSurvived ? 'mission.debrief.grade.survived' : 'mission.debrief.grade.lost'),
    wingmenTotal > 0
      ? scoredCriterion('wingmen', wingmenSurvived / wingmenTotal, 'mission.debrief.grade.wingmen', {
        survived: wingmenSurvived,
        total: wingmenTotal,
      })
      : unscoredCriterion('wingmen', 'mission.debrief.grade.noWingmen'),
    gunRounds > 0
      ? scoredCriterion('accuracy', accuracy, 'mission.debrief.grade.accuracy', {
        hits: gunHits,
        rounds: gunRounds,
        percent: Math.round(accuracy * 100),
      })
      : unscoredCriterion('accuracy', 'mission.debrief.grade.noGunfire'),
    scoredCriterion('damage', hull > 0 ? 1 - damage / hull : 0, 'mission.debrief.grade.damage', {
      damage: Math.round(damage),
      hull: Math.round(hull),
    }),
    missilesFired > 0
      ? scoredCriterion('efficiency', missileEfficiency, 'mission.debrief.grade.missileEfficiency', {
        hits: missilesHit,
        fired: missilesFired,
      })
      : unscoredCriterion('efficiency', 'mission.debrief.grade.noMissiles'),
  ];
  const earned = criteria.reduce((sum, criterion) => sum + criterion.earned, 0);
  const possible = criteria.reduce((sum, criterion) => sum + criterion.possible, 0);
  const percentage = possible > 0 ? earned / possible * 100 : 0;
  const letter = percentage >= 90 ? 'A'
    : percentage >= 80 ? 'B'
      : percentage >= 65 ? 'C'
        : percentage >= 50 ? 'D' : 'F';

  return { letter, earned, possible, percentage: Math.round(percentage), criteria };
}
