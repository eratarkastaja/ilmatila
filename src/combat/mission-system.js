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
    this.evaluation={
      elapsed:0,airRemaining:0,groundRemaining:0,identifiedCount:0,contactCount:0,
      escortElapsed:0,priorityTargetsRemaining:0,protectedAssetLost:false,
      friendlyStrengthFraction:1,destroyed:false,outcome:MISSION_OUTCOME.ACTIVE,
    };
    this._progressParams={
      elapsed:0,duration:0,remaining:0,airRemaining:0,airTotal:0,
      groundRemaining:0,groundTotal:0,identified:0,total:0,seconds:0,strength:0,
    };
    this.nodes = nodes;
    this.elapsed = 0;
    this.deferCompletion = deferCompletion;
    this.objectiveActive = initiallyActive;
    this.objectiveSatisfied = false;
    this.objectiveResult = MISSION_OUTCOME.ACTIVE;
    this.outcome = MISSION_OUTCOME.ACTIVE;
    this.missionComplete = false;
    this.missionFailed = false;
    this.noticeTimer = null;
    this.noticeFrame = null;
    this.noticeGeneration = 0;
    this.noticeDetailKey = `mission.complete.${this.mission.id}`;
    this.renderObjective();
  }

  update(dt, destroyed = false) {
    if (this.outcome !== MISSION_OUTCOME.ACTIVE || !this.objectiveActive || this.objectiveSatisfied) return;
    const remaining = this.getRemaining(this.remaining);
    const delta=Number.isFinite(dt)?Math.max(0,dt):0;
    this.elapsed=this.objective.type==='training'
      ? Math.min(this.objective.duration??90,this.elapsed+delta)
      : this.elapsed+delta;
    Object.assign(this.evaluation,remaining);
    this.evaluation.elapsed=this.elapsed;
    this.evaluation.airRemaining=remaining.airRemaining;
    this.evaluation.groundRemaining=remaining.groundRemaining;
    this.evaluation.destroyed=destroyed;
    this.evaluation.outcome=this.outcome;
    const evaluatedOutcome=evaluateMissionObjective(this.objective,this.evaluation);
    if ((evaluatedOutcome === MISSION_OUTCOME.COMPLETE || evaluatedOutcome === MISSION_OUTCOME.SETBACK)
      && this.deferCompletion) {
      this.objectiveSatisfied = true;
      this.objectiveResult = evaluatedOutcome;
      this.renderObjective(remaining);
      return;
    }
    if (evaluatedOutcome === MISSION_OUTCOME.COMPLETE || evaluatedOutcome === MISSION_OUTCOME.SETBACK) {
      if (evaluatedOutcome === MISSION_OUTCOME.COMPLETE) this.complete();
      else this.finish(MISSION_OUTCOME.SETBACK);
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
      const text=t(this.objectiveResult===MISSION_OUTCOME.SETBACK
        ?'mission.progress.setback'
        :'mission.progress.complete');
      if(objectiveProgress.textContent!==text)objectiveProgress.textContent=text;
      return;
    }
    let progressText;
    const params=this._progressParams;
    if (this.objective.type === 'training') {
      const duration = this.objective.duration ?? 90;
      params.elapsed=Math.min(duration,Math.floor(this.elapsed));
      params.duration=duration;
      progressText = t('mission.progress.training',params);
    } else if (this.objective.type === 'support') {
      params.airRemaining=remaining.airRemaining;
      params.airTotal=this.totals.air;
      params.groundRemaining=remaining.groundRemaining;
      params.groundTotal=this.totals.ground;
      progressText = t('mission.progress.support',params);
    } else if (this.objective.type === 'airPolicing') {
      params.identified=remaining.identifiedCount??0;
      params.total=remaining.contactCount??this.objective.requiredContacts??0;
      params.seconds=Math.max(0,Math.ceil((this.objective.escortDuration??0)-(remaining.escortElapsed??0)));
      progressText=params.identified<Math.min(params.total,this.objective.requiredContacts??params.total)
        ?t('mission.progress.airPolicingIdentify',params)
        :t('mission.progress.airPolicingEscort',params);
    } else if (this.objective.type === 'assetDefense') {
      params.remaining=remaining.priorityTargetsRemaining??0;
      params.airRemaining=remaining.airRemaining??0;
      progressText=t('mission.progress.assetDefense',params);
    } else if (this.objective.type === 'forceDefense') {
      params.airRemaining=remaining.airRemaining;
      params.airTotal=this.totals.air;
      params.groundRemaining=remaining.groundRemaining;
      params.groundTotal=this.totals.ground;
      params.strength=Math.round((remaining.friendlyStrengthFraction??0)*100);
      progressText=t('mission.progress.forceDefense',params);
    } else {
      params.remaining=remaining.airRemaining;
      progressText = t('mission.progress.air',params);
    }
    if(objectiveProgress.textContent!==progressText)objectiveProgress.textContent=progressText;
  }

  renderComplete() {
    if (!this.missionComplete && !this.objectiveSatisfied) return;
    const title = this.nodes.notice?.querySelector('#mission-complete-title');
    if (title) title.textContent = t(this.objectiveResult===MISSION_OUTCOME.SETBACK
      ?'mission.objectiveSetback'
      :'mission.objectiveAchieved');
    if (this.nodes.detail) this.nodes.detail.textContent = t(this.noticeDetailKey);
  }

  complete() {
    if (this.missionComplete) return;
    this.finish(MISSION_OUTCOME.COMPLETE);
    this.objectiveResult = MISSION_OUTCOME.COMPLETE;
    this.noticeDetailKey = `mission.complete.${this.mission.id}`;
    this.renderComplete();
    this.showNotice(8500);
  }

  notifyObjectiveAchieved() {
    this.objectiveSatisfied = true;
    this.objectiveResult = MISSION_OUTCOME.COMPLETE;
    this.noticeDetailKey = 'mission.rtb.detail';
    this.renderObjective();
    this.renderComplete();
    this.showNotice(6500);
  }

  notifyObjectiveSetback() {
    this.objectiveSatisfied = true;
    this.objectiveResult = MISSION_OUTCOME.SETBACK;
    this.noticeDetailKey = 'mission.rtb.setbackDetail';
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
    this.objectiveResult = outcome === MISSION_OUTCOME.SETBACK ? outcome : this.objectiveResult;
    this.missionComplete = outcome === MISSION_OUTCOME.COMPLETE;
    this.missionFailed = outcome !== MISSION_OUTCOME.ACTIVE && outcome !== MISSION_OUTCOME.COMPLETE;
    if (this.missionComplete) this.objectiveSatisfied = true;
    this.renderObjective();
    if (this.missionComplete) {
      this.renderComplete();
      if (this.nodes.statusText) this.nodes.statusText.textContent = t('mission.statusComplete');
      this.nodes.status?.classList.add('complete');
    } else if (this.missionFailed) {
      if (this.nodes.statusText) this.nodes.statusText.textContent = t(
        outcome === MISSION_OUTCOME.SETBACK ? 'mission.statusSetback' : 'mission.statusFailed',
      );
      this.nodes.status?.classList.add('destroyed');
    }
  }

  showNotice(duration) {
    const notice = this.nodes.notice;
    if (!notice) return;
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.cancelNoticeFrame();
    notice.hidden = false;
    notice.classList.remove('visible');
    if (typeof requestAnimationFrame === 'function') {
      const generation = this.noticeGeneration;
      this.noticeFrame = requestAnimationFrame(() => {
        if (generation !== this.noticeGeneration) return;
        this.noticeFrame = null;
        notice.classList.add('visible');
      });
    } else {
      notice.classList.add('visible');
    }
    this.noticeTimer = setTimeout(() => {
      notice.classList.remove('visible');
      notice.hidden = true;
      this.noticeTimer = null;
    }, duration);
  }

  cancelNoticeFrame() {
    this.noticeGeneration++;
    if (this.noticeFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.noticeFrame);
    }
    this.noticeFrame = null;
  }

  dispose() {
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
    this.cancelNoticeFrame();
    this.nodes.notice?.classList.remove('visible');
    if (this.nodes.notice) this.nodes.notice.hidden = true;
  }
}
