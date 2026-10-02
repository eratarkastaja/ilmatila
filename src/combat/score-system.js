/** Owns sortie score and destruction statistics. */
export class ScoreSystem {
  constructor() {
    this.score = 0;
    this.airKills = 0;
    this.groundKills = 0;
    this.gunHits = 0;
    this.objectiveAwarded = false;
    this.missionCompletionAwarded = false;
  }

  recordAircraftDestroyed(credited = true) {
    this.airKills++;
    if (credited) this.score += 500;
  }

  recordGroundUnitDestroyed(team, credited = true) {
    if (team !== 'red') return;
    this.groundKills++;
    if (credited) this.score += 100;
  }

  recordGunHit() {
    this.gunHits++;
  }

  awardObjectiveCompletion() {
    if (this.objectiveAwarded) return false;
    this.objectiveAwarded = true;
    this.score += 750;
    return true;
  }

  awardMissionCompletion() {
    if (this.missionCompletionAwarded) return false;
    this.missionCompletionAwarded = true;
    this.score += 500;
    return true;
  }
}
