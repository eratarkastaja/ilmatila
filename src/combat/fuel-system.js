/** Tracks a sortie's fuel reserve and gates afterburner use. */
export class FuelSystem {
  constructor({ enduranceMinutes = null, afterburnerMultiplier = 5 } = {}) {
    this.unlimited = enduranceMinutes === null;
    this.capacitySeconds = this.unlimited ? null : Math.max(0, enduranceMinutes * 60);
    this.remainingSeconds = this.capacitySeconds;
    this.afterburnerMultiplier = Math.max(1, afterburnerMultiplier);
    this.afterburnerActive = false;
  }

  get hasFuel() {
    return this.unlimited || this.remainingSeconds > 0;
  }

  get fraction() {
    if (this.unlimited) return 1;
    if (!(this.capacitySeconds > 0)) return 0;
    return this.remainingSeconds / this.capacitySeconds;
  }

  update(dt, afterburnerRequested = false) {
    this.afterburnerActive = Boolean(afterburnerRequested && this.hasFuel);
    if (this.unlimited) return this.afterburnerActive;

    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const burnRate = this.afterburnerActive ? this.afterburnerMultiplier : 1;
    this.remainingSeconds = Math.max(0, this.remainingSeconds - elapsed * burnRate);
    return this.afterburnerActive;
  }
}
