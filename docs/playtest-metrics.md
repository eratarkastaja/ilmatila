# Campaign playtest metrics

This is the shared A03/G02 measurement sheet for human play and deterministic
scenario runs. It is a protocol, not a claim that a human campaign has been
completed.

For each chapter, record the seed, difficulty, chapter start/end timestamps,
phase timestamps (ingress, objective, RTB), active-input time, paused/empty
waiting time, retries, selected kit and support, starting/ending fuel and
stores, primary and optional outcomes, wingman outcomes, strategic values, and
any visible radio/HUD ambiguity. Record at least one normal and one low-state
campaign path when balancing a change. Keep human observations separate from
automated feasibility or combat simulations.

For fuel and loadout checks, compare the accepted menu kit with the initial
`WeaponSystem`, countermeasure and `FuelSystem` stores. Measure cruise and
afterburner consumption over the same flight segment, then repeat with Light,
Balanced and Heavy kits. A valid recommendation must retain enough fuel for
ingress, the authored objective window, and RTB; Easy remains unlimited.

The beta9 baseline had no new human-play sample available for this
implementation pass. Automated checks confirm that the selected kit is used
without a second readiness scale and that fuel is not hidden by readiness
pressure. Human play of all ten chapters, perceived pressure, waiting time and
package readability remain explicit acceptance work rather than invented
feedback.
