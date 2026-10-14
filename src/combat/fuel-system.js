/** Tracks a sortie's fuel reserve and gates afterburner use. */
export class FuelSystem {
  constructor({
    enduranceMinutes = null,
    afterburnerMultiplier = 5,
    payloadMassKg = null,
    payloadMassLimitKg = 4200,
    fuelMassPerMinuteKg = 8,
  } = {}) {
    this.unlimited = enduranceMinutes === null;
    this.capacitySeconds = this.unlimited ? null : Math.max(0, enduranceMinutes * 60);
    this.remainingSeconds = this.capacitySeconds;
    this.afterburnerMultiplier = Math.max(1, afterburnerMultiplier);
    this.payloadMassKg = Number.isFinite(payloadMassKg) ? Math.max(0, payloadMassKg) : null;
    this.payloadMassLimitKg = Math.max(1, payloadMassLimitKg);
    this.fuelMassPerMinuteKg = Math.max(0, fuelMassPerMinuteKg);
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

  get currentPayloadMassKg() {
    if (this.payloadMassKg === null) return null;
    if (this.unlimited) return this.payloadMassKg;
    const burnedFuelMinutes = (this.capacitySeconds - this.remainingSeconds) / 60;
    return Math.max(0, this.payloadMassKg - burnedFuelMinutes * this.fuelMassPerMinuteKg);
  }

  /** A deliberately small speed penalty for a heavy campaign loadout. */
  get speedFactor() {
    const mass = this.currentPayloadMassKg;
    if (!Number.isFinite(mass)) return 1;
    return 1 - Math.min(.06, mass / this.payloadMassLimitKg * .06);
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
