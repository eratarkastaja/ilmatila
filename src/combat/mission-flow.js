import * as THREE from 'three';
import { formatNumber, t } from '../ui/i18n.js';
import { MISSION_OUTCOME } from './mission-objective.js';

export const MISSION_PHASE = Object.freeze({
  DEPARTURE: 'departure',
  NAVIGATION: 'navigation',
  CONTACT: 'contact',
  ENGAGEMENT: 'engagement',
  OBJECTIVE: 'objective',
  RTB: 'rtb',
  DEBRIEF: 'debrief',
});

const forward = new THREE.Vector3(0, 0, 1);
const horizontal = new THREE.Vector3();

/** Sortie progression from launch through ingress, tasking, recovery, and debrief. */
export class MissionFlowSystem {
  constructor({ mission, player, terrain, nodes = {}, onIngress = () => {}, onObjectiveActive = () => {}, onObjectiveComplete = () => {}, onRtb = () => {}, onPhaseChange = () => {}, onEnd = () => {} }) {
    this.mission = mission;
    this.player = player;
    this.terrain = terrain;
    this.nodes = nodes;
    this.onIngress = onIngress;
    this.onObjectiveActive = onObjectiveActive;
    this.onObjectiveComplete = onObjectiveComplete;
    this.onRtb = onRtb;
    this.onPhaseChange = onPhaseChange;
    this.onEnd = onEnd;
    this.outcome = MISSION_OUTCOME.ACTIVE;
    this.elapsed = 0;
    this.phaseElapsed = 0;
    this.contactSeen = false;
    this.contactDetected = false;
    this.ingressReached = false;
    this.objectiveNotified = false;

    this.home = player.position.clone();
    horizontal.copy(forward).applyQuaternion(player.quaternion);
    horizontal.y = 0;
    if (horizontal.lengthSq() < 1e-6) horizontal.set(0, 0, 1);
    else horizontal.normalize();
    const halfTheater = (terrain?.worldSize ?? 32000) * 0.5;
    // Use more of the mapped theater for ingress and recovery routes while keeping
    // the waypoint comfortably inside the terrain boundary.
    const ingressDistance = Math.min(mission.navigationDistance ?? 4200, Math.max(900, halfTheater * 0.55));
    this.ingress = this.home.clone().addScaledVector(horizontal, ingressDistance);
    this.ingressAltitudeAgl = Math.max(0, mission.ingressAltitudeAgl ?? 0);
    if (this.ingressAltitudeAgl > 0) {
      const ingressGround = terrain?.sampleHeight?.(this.ingress.x, this.ingress.z) ?? 0;
      this.ingress.y = ingressGround + this.ingressAltitudeAgl;
    }
    this.navigationRadius = mission.navigationRadius ?? 850;
    this.extractionRadius = mission.extractionRadius ?? 1250;
    this.phase = MISSION_PHASE.DEPARTURE;
    this.render();
  }

  get waypoint() {
    if (this.phase === MISSION_PHASE.NAVIGATION) return this.ingress;
    if (this.phase === MISSION_PHASE.RTB) return this.home;
    return null;
  }

  update(dt, {
    detectedHostiles = 0,
    playerEngaged = false,
    hostileEngaged = false,
    targetDestroyed = false,
    objectiveSatisfied = false,
    destroyed = false,
  } = {}) {
    if (this.phase === MISSION_PHASE.DEBRIEF) return;
    const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.elapsed += delta;
    this.phaseElapsed += delta;

    if (destroyed) {
      this.finish(MISSION_OUTCOME.FAILED);
      return;
    }

    if (this.phase === MISSION_PHASE.DEPARTURE) {
      if (this.phaseElapsed >= (this.mission.departureDuration ?? 4)) this.setPhase(MISSION_PHASE.NAVIGATION);
    }

    if (this.phase === MISSION_PHASE.NAVIGATION) {
      const groundHeight = this.terrain?.sampleHeight?.(this.player.position.x, this.player.position.z);
      const altitudeAgl = Number.isFinite(groundHeight)
        ? this.player.position.y - groundHeight
        : this.ingressAltitudeAgl;
      const altitudeReady = this.ingressAltitudeAgl <= 0 || altitudeAgl >= this.ingressAltitudeAgl;
      if (altitudeReady && this.horizontalDistanceTo(this.ingress) <= this.navigationRadius) this.enterIngress();
    } else if (this.phase === MISSION_PHASE.CONTACT) {
      this.contactDetected ||= detectedHostiles > 0;
      if (this.contactDetected || hostileEngaged) this.contactSeen = true;
      if (this.contactSeen && (playerEngaged || hostileEngaged)) this.setPhase(MISSION_PHASE.ENGAGEMENT);
    } else if (this.phase === MISSION_PHASE.ENGAGEMENT && targetDestroyed) {
      this.setPhase(MISSION_PHASE.OBJECTIVE);
    }

    if (objectiveSatisfied && !this.objectiveNotified) {
      this.objectiveNotified = true;
      if (this.phase !== MISSION_PHASE.OBJECTIVE) this.setPhase(MISSION_PHASE.OBJECTIVE);
      else this.phaseElapsed = 0;
      this.onObjectiveComplete();
    }
    if (objectiveSatisfied && this.phase !== MISSION_PHASE.RTB && this.phase !== MISSION_PHASE.DEBRIEF) {
      if (this.phaseElapsed >= (this.mission.objectiveReportDuration ?? 4)) this.enterRtb();
    }
    if (this.phase === MISSION_PHASE.RTB && this.horizontalDistanceTo(this.home) <= this.extractionRadius) {
      this.finish(MISSION_OUTCOME.COMPLETE);
    }

    this.render();
  }

  enterIngress() {
    if (this.ingressReached) return;
    this.ingressReached = true;
    this.onIngress();
    this.onObjectiveActive();
    this.setPhase(this.mission.hostiles > 0 ? MISSION_PHASE.CONTACT : MISSION_PHASE.OBJECTIVE);
  }

  enterRtb() {
    if (this.phase === MISSION_PHASE.RTB || this.phase === MISSION_PHASE.DEBRIEF) return;
    this.onRtb();
    this.setPhase(MISSION_PHASE.RTB);
  }

  finish(outcome) {
    if (this.phase === MISSION_PHASE.DEBRIEF) return;
    this.outcome = outcome;
    this.setPhase(MISSION_PHASE.DEBRIEF);
    this.onEnd(outcome, this.elapsed);
  }

  fail() {
    this.finish(MISSION_OUTCOME.FAILED);
  }

  abort() {
    this.finish(MISSION_OUTCOME.ABORTED);
  }

  setPhase(phase) {
    if (this.phase === phase) return;
    const previous = this.phase;
    this.phase = phase;
    this.phaseElapsed = 0;
    this.render();
    this.onPhaseChange(previous, phase);
  }

  horizontalDistanceTo(point) {
    return Math.hypot(point.x - this.player.position.x, point.z - this.player.position.z);
  }

  render() {
    const phaseTitle = t(`mission.phase.${this.phase}.title`);
    const phaseDetailKey = this.phase === MISSION_PHASE.CONTACT
      ? `mission.phase.contact.${this.contactDetected ? 'detected' : 'search'}`
      : this.phase === MISSION_PHASE.DEBRIEF
        ? `mission.phase.debrief.${this.outcome}`
        : `mission.phase.${this.phase}.detail`;
    const phaseDetail = t(phaseDetailKey);
    if (this.nodes.phaseTitle && this.nodes.phaseTitle.textContent !== phaseTitle) this.nodes.phaseTitle.textContent = phaseTitle;
    if (this.nodes.phaseDetail && this.nodes.phaseDetail.textContent !== phaseDetail) this.nodes.phaseDetail.textContent = phaseDetail;

    const waypoint = this.waypoint;
    const routeVisible = Boolean(waypoint);
    if (this.nodes.routeReadout) this.nodes.routeReadout.hidden = !routeVisible;
    if (this.nodes.waypointCue) {
      this.nodes.waypointCue.hidden = !routeVisible;
      this.nodes.waypointCue.classList.toggle('return-route', this.phase === MISSION_PHASE.RTB);
    }
    if (!routeVisible) return;

    const dx = waypoint.x - this.player.position.x;
    const dz = waypoint.z - this.player.position.z;
    const bearing = THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(Math.atan2(dx, dz)), 360);
    const distance = Math.hypot(dx, dz);
    const distanceText = distance >= 1000
      ? `${formatNumber(distance / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KM`
      : `${formatNumber(Math.round(distance))} M`;
    const bearingText = String(Math.round(bearing) % 360).padStart(3, '0');
    const label = t(this.phase === MISSION_PHASE.RTB ? 'mission.route.home' : 'mission.route.ingress');
    const range = `${bearingText}° · ${distanceText}`;
    if (this.nodes.routeLabel && this.nodes.routeLabel.textContent !== label) this.nodes.routeLabel.textContent = label;
    if (this.nodes.routeRange && this.nodes.routeRange.textContent !== range) this.nodes.routeRange.textContent = range;
    const altitudeNode = this.nodes.routeAltitude;
    if (altitudeNode) {
      const showAltitude = this.phase === MISSION_PHASE.NAVIGATION && this.ingressAltitudeAgl > 0;
      altitudeNode.hidden = !showAltitude;
      if (showAltitude) {
        const altitude = formatNumber(Math.round(this.ingressAltitudeAgl * 3.28084));
        const requirement = t('mission.route.altitudeRequirement', { altitude });
        if (altitudeNode.textContent !== requirement) altitudeNode.textContent = requirement;
      }
    }
  }
}
