import { advanceMissionObjective, evaluateMissionObjective, MISSION_OUTCOME } from './mission-objective.js';
import { t } from '../i18n.js';

/** Owns objective progress/outcome and its mission-specific presentation. */
export class MissionSystem {
  constructor({ mission, objective, totals, getRemaining, nodes = {} }) {
    this.mission = mission;
    this.objective = objective;
    this.totals = totals;
    this.getRemaining = getRemaining;
    this.nodes = nodes;
    this.elapsed = 0;
    this.outcome = MISSION_OUTCOME.ACTIVE;
    this.missionComplete = false;
    this.missionFailed = false;
    this.noticeTimer = null;
    this.renderObjective();
  }

  update(dt, destroyed = false) {
    if (this.outcome !== MISSION_OUTCOME.ACTIVE) return;
    const remaining = this.getRemaining();
    const next = advanceMissionObjective(this.objective, {
      elapsed: this.elapsed,
      outcome: this.outcome,
    }, dt, { ...remaining, destroyed });
    this.elapsed = next.elapsed;
    this.outcome = next.outcome;
    this.missionFailed = next.outcome === MISSION_OUTCOME.FAILED;
    if (next.outcome === MISSION_OUTCOME.COMPLETE) {
      this.complete();
      return;
    }
    this.renderObjective(remaining);
  }

  markPlayerDestroyed() {
    const remaining = this.getRemaining();
    this.outcome = evaluateMissionObjective(this.objective, {
      ...remaining,
      elapsed: this.elapsed,
      destroyed: true,
      outcome: this.outcome,
    });
    this.missionComplete = this.outcome === MISSION_OUTCOME.COMPLETE;
    this.missionFailed = this.outcome === MISSION_OUTCOME.FAILED;
  }

  renderObjective(remaining = this.getRemaining()) {
    const { objectiveTitle, objectiveProgress } = this.nodes;
    if (objectiveTitle) objectiveTitle.textContent = t(`mission.objective.${this.objective.type}`);
    if (!objectiveProgress) return;
    if (this.missionComplete) {
      objectiveProgress.textContent = t('mission.progress.complete');
      return;
    }
    if (this.objective.type === 'training') {
      const duration = this.objective.duration ?? 90;
      objectiveProgress.textContent = t('mission.progress.training', {
        elapsed: Math.min(duration, Math.floor(this.elapsed)), duration,
      });
    } else if (this.objective.type === 'support') {
      objectiveProgress.textContent = t('mission.progress.support', {
        airRemaining: remaining.airRemaining,
        airTotal: this.totals.air,
        groundRemaining: remaining.groundRemaining,
        groundTotal: this.totals.ground,
      });
    } else {
      objectiveProgress.textContent = t('mission.progress.air', { remaining: remaining.airRemaining });
    }
  }

  renderComplete() {
    if (!this.missionComplete) return;
    const title = this.nodes.notice?.querySelector('#mission-complete-title');
    if (title) title.textContent = t('mission.objectiveAchieved');
    if (this.nodes.detail) this.nodes.detail.textContent = t(`mission.complete.${this.mission.id}`);
  }

  complete() {
    if (this.missionComplete) return;
    this.missionComplete = true;
    this.missionFailed = false;
    this.outcome = MISSION_OUTCOME.COMPLETE;
    this.renderObjective();
    this.renderComplete();
    if (this.nodes.statusText) this.nodes.statusText.textContent = t('mission.statusComplete');
    this.nodes.status?.classList.add('complete');
    const notice = this.nodes.notice;
    if (!notice) return;
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
    }, 8500);
  }

  dispose() {
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
    this.nodes.notice?.classList.remove('visible');
    if (this.nodes.notice) this.nodes.notice.hidden = true;
  }
}
