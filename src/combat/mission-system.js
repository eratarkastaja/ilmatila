import { evaluateMissionObjective, MISSION_OUTCOME } from './mission-objective.js';
import { t } from '../ui/i18n.js';

/** Owns objective progress/outcome and its mission-specific presentation. */
export class MissionSystem {
  constructor({ mission, objective, totals, getRemaining, nodes = {}, deferCompletion = false, initiallyActive = true }) {
    this.mission = mission;
    this.objective = objective;
    this.totals = totals;
    this.getRemaining = getRemaining;
    this.remaining = { airRemaining: 0, groundRemaining: 0 };
    this.evaluation={elapsed:0,airRemaining:0,groundRemaining:0,destroyed:false,outcome:MISSION_OUTCOME.ACTIVE};
    this.nodes = nodes;
    this.elapsed = 0;
    this.deferCompletion = deferCompletion;
    this.objectiveActive = initiallyActive;
    this.objectiveSatisfied = false;
    this.outcome = MISSION_OUTCOME.ACTIVE;
    this.missionComplete = false;
    this.missionFailed = false;
    this.noticeTimer = null;
    this.noticeDetailKey = `mission.complete.${this.mission.id}`;
    this.renderObjective();
  }

  update(dt, destroyed = false) {
    if (this.outcome !== MISSION_OUTCOME.ACTIVE || !this.objectiveActive || this.objectiveSatisfied) return;
    const remaining = this.getRemaining(this.remaining);
    if(this.objective.type==='training'){
      const delta=Number.isFinite(dt)?Math.max(0,dt):0;
      this.elapsed=Math.min(this.objective.duration??90,this.elapsed+delta);
    }
    this.evaluation.elapsed=this.elapsed;
    this.evaluation.airRemaining=remaining.airRemaining;
    this.evaluation.groundRemaining=remaining.groundRemaining;
    this.evaluation.destroyed=destroyed;
    this.evaluation.outcome=this.outcome;
    const evaluatedOutcome=evaluateMissionObjective(this.objective,this.evaluation);
    if (evaluatedOutcome === MISSION_OUTCOME.COMPLETE && this.deferCompletion) {
      this.objectiveSatisfied = true;
      this.renderObjective(remaining);
      return;
    }
    if (evaluatedOutcome === MISSION_OUTCOME.COMPLETE) {
      this.complete();
      return;
    }
    this.outcome=evaluatedOutcome;
    this.missionFailed=this.outcome!==MISSION_OUTCOME.ACTIVE&&this.outcome!==MISSION_OUTCOME.COMPLETE;
    this.renderObjective(remaining);
  }

  activate() {
    if (this.outcome === MISSION_OUTCOME.ACTIVE) this.objectiveActive = true;
  }

  markPlayerDestroyed() {
    const remaining = this.getRemaining(this.remaining);
    this.evaluation.elapsed=this.elapsed;
    this.evaluation.airRemaining=remaining.airRemaining;
    this.evaluation.groundRemaining=remaining.groundRemaining;
    this.evaluation.destroyed=true;
    this.evaluation.outcome=this.outcome;
    this.outcome = evaluateMissionObjective(this.objective,this.evaluation);
    this.missionComplete = this.outcome === MISSION_OUTCOME.COMPLETE;
    this.missionFailed = this.outcome !== MISSION_OUTCOME.ACTIVE && this.outcome !== MISSION_OUTCOME.COMPLETE;
  }

  renderObjective(remaining = this.getRemaining(this.remaining)) {
    const { objectiveTitle, objectiveProgress } = this.nodes;
    const titleText=t(`mission.objective.${this.objective.type}`);
    if (objectiveTitle&&objectiveTitle.textContent!==titleText) objectiveTitle.textContent = titleText;
    if (!objectiveProgress) return;
    if (this.missionComplete || this.objectiveSatisfied) {
      const text=t('mission.progress.complete');
      if(objectiveProgress.textContent!==text)objectiveProgress.textContent=text;
      return;
    }
    let progressText;
    if (this.objective.type === 'training') {
      const duration = this.objective.duration ?? 90;
      progressText = t('mission.progress.training', {
        elapsed: Math.min(duration, Math.floor(this.elapsed)), duration,
      });
    } else if (this.objective.type === 'support') {
      progressText = t('mission.progress.support', {
        airRemaining: remaining.airRemaining,
        airTotal: this.totals.air,
        groundRemaining: remaining.groundRemaining,
        groundTotal: this.totals.ground,
      });
    } else {
      progressText = t('mission.progress.air', { remaining: remaining.airRemaining });
    }
    if(objectiveProgress.textContent!==progressText)objectiveProgress.textContent=progressText;
  }

  renderComplete() {
    if (!this.missionComplete && !this.objectiveSatisfied) return;
    const title = this.nodes.notice?.querySelector('#mission-complete-title');
    if (title) title.textContent = t('mission.objectiveAchieved');
    if (this.nodes.detail) this.nodes.detail.textContent = t(this.noticeDetailKey);
  }

  complete() {
    if (this.missionComplete) return;
    this.finish(MISSION_OUTCOME.COMPLETE);
    this.noticeDetailKey = `mission.complete.${this.mission.id}`;
    this.renderComplete();
    this.showNotice(8500);
  }

  notifyObjectiveAchieved() {
    this.objectiveSatisfied = true;
    this.noticeDetailKey = 'mission.rtb.detail';
    this.renderObjective();
    this.renderComplete();
    this.showNotice(6500);
  }

  returnToBase() {
    if (this.nodes.statusText) this.nodes.statusText.textContent = t('mission.statusRtb');
    this.nodes.status?.classList.remove('complete');
  }

  finish(outcome) {
    if (this.outcome !== MISSION_OUTCOME.ACTIVE) return;
    this.outcome = outcome;
    this.missionComplete = outcome === MISSION_OUTCOME.COMPLETE;
    this.missionFailed = outcome !== MISSION_OUTCOME.ACTIVE && outcome !== MISSION_OUTCOME.COMPLETE;
    if (this.missionComplete) this.objectiveSatisfied = true;
    this.renderObjective();
    if (this.missionComplete) {
      this.renderComplete();
      if (this.nodes.statusText) this.nodes.statusText.textContent = t('mission.statusComplete');
      this.nodes.status?.classList.add('complete');
    } else if (this.missionFailed) {
      if (this.nodes.statusText) this.nodes.statusText.textContent = t('mission.statusFailed');
      this.nodes.status?.classList.add('destroyed');
    }
  }

  showNotice(duration) {
    const notice = this.nodes.notice;
    if (!notice) return;
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    notice.hidden = false;
    notice.classList.remove('visible');
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => notice.classList.add('visible'));
    } else {
      notice.classList.add('visible');
    }
    this.noticeTimer = setTimeout(() => {
      notice.classList.remove('visible');
      notice.hidden = true;
      this.noticeTimer = null;
    }, duration);
  }

  dispose() {
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
    this.nodes.notice?.classList.remove('visible');
    if (this.nodes.notice) this.nodes.notice.hidden = true;
  }
}
