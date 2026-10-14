# Campaign implementation: Shadow at the Border / Rajan varjo

This document describes the campaign layer shipped with ILMATILA. The campaign
is a fictional near-future crisis built around a ten-sortie escalation from an
airspace incursion near Virolahti to a Finnish counterattack. It uses public
geography as narrative context; unit names, dispositions, timings, and events
are fictional and are not a real operational plan.

## Scenario

The campaign opens when two unidentified military aircraft enter Finnish
airspace near Virolahti. The player identifies and escorts them under weapons
hold. Hours later, jamming and an attack on a coastal surveillance relay turn
the incident into an armed crisis. Subsequent sorties cover dispersed air
operations, a northern diversion, the invasion near Vaalimaa, the defense of
the E18 corridor, and the counterattack that restores the border.

The four terrain packages are tactical windows into the same conflict:

- Virolahti covers the incursion, the first armed clash, the invasion, and the
  counterattack.
- Päijänne represents dispersed air operations and the protected logistics
  rear.
- Ilomantsi represents diversionary eastern pressure.
- Kuusamo represents a northern interception that prevents a second
  breakthrough.

The campaign omits transit between regions. Briefings, radio traffic, and
strategic state changes describe events outside the active 32 × 32 km theater.

## Campaign state and lifecycle

`CampaignSession` owns one run and resolves the current chapter into a normal
mission definition. `CampaignProgress` stores one versioned save per
difficulty in browser storage. `resolveCampaignMission` applies the chapter,
campaign state, difficulty, deterministic seed, authored time, mission
overrides, and readiness-based wingman count before `SortieController` starts
the sortie.

Each run stores three visible values from 0 to 100:

- **Air control** affects warning time, pressure, and friendly air support.
- **Defense integrity** represents the local ground defense and determines the
  final campaign ending.
- **Sortie readiness** represents fuel, weapons, maintenance, and road-base
  support.

Accepted sorties carry the remaining air-to-air missiles, air-to-ground
missiles, cannon rounds, flares, chaff, and fuel minutes into the next chapter,
capped by the selected difficulty's normal stores. Before launch, the campaign
view opens a kit selector with a mission-aware recommended loadout or manual
values. Hardpoints, payload mass, inventory, and fuel endurance validate the
selection before it is passed to the sortie. The Disperse, Hold the E18, and
Counterstroke chapters expose the same limited sustainment choice: a small
partial rearm or field maintenance restoration with a readiness cost. The
selector shows current inventory, post-support inventory, and the chosen kit so
the readiness and support tradeoff is visible before takeoff.
The selector offers AMRAAM or Sidewinder for air combat and JASSM-ER, AARGM-ER,
StormBreaker, or JDAM for ground attack. Standard and Hard use four internal
plus six external weapon stations; Easy exposes two additional arcade stations.
Weapon choice changes missile behavior and mass, while the visual station row
makes the internal/external tradeoff legible without simulating every aircraft
integration restriction.
The overview also carries forward a short situation report and wingman return
status from the previous accepted sortie. During launch, each chapter adds a
semantic radio tasking message alongside the shared phase calls.

Optional objectives apply authored state effects when their result is accepted.
The implemented effects cover strike interception, wingman survival, friendly
force protection, and logistics destruction. A failed optional objective can
reduce a state value without changing the primary sortie result.

The three strategic values also shape the next sortie, not just its debrief.
Air control changes CAP pressure, reinforcement probability, radar sensor range,
and friendly fighter support. Defense integrity changes friendly ground support
vehicle and air-defense counts, defender durability, and the starting front
position. Sortie readiness changes wingmen, carried stores, and the player's
airframe condition. The campaign overview shows the nearest threshold and its
effect beside each meter, so values close to a threshold remain legible.

Every chapter also authors four distinct tactical outcomes: a decisive victory,
an ordinary success, a recoverable operational setback, and aircraft/pilot loss.
The first three are committable choices in the campaign debrief. Setbacks are
produced by the mission objective when a chapter deadline expires, a protected
asset is lost, or the friendly defensive line falls below its authored
threshold. The mission reports the setback, routes the surviving aircraft to
RTB, and lets the player accept the strategic consequences. Aircraft loss and
explicit sortie abort remain non-committable and require a retry or a return to
the menu.

The tactical debrief is shown before the campaign result. The player can accept
a committable result or retry the chapter. Retries keep the chapter seed and do
not apply strategic effects, but each retry costs 3 points of sortie readiness.
If a limited sustainment window was selected for the failed attempt, that
window is consumed as well: its choice is cleared, its readiness cost is paid,
and it is not offered again on the retry. Aircraft loss and aborted sorties
cannot be accepted. Accepted attempt ids make state application idempotent.
The final ending is `border-secured`, `invasion-contained`, or
`unresolved-front`.

Campaign flags are operational state, not only narrative labels. If the relay
is not protected, the next chapter's radar picture is degraded. Without
`main-axis-confirmed`, First Wave receives an additional Strike pair.
`relay-logistics-broken` suppresses the Counterstroke reinforcement encounter,
while `border-line-stabilized` moves the final front farther forward and gives
its friendly ground force additional support. The flight record retains each
accepted chapter's result and score and is shown in the campaign overview.

## Implemented chapter arc

| # | Chapter | Area | Base mission | Implemented objective and campaign effect |
| ---: | --- | --- | --- | --- |
| 1 | Unknown Track / Tuntematon maali | Virolahti | Patrol | Identify and escort two non-combatant contacts under weapons hold; a missed deadline is a recoverable setback. |
| 2 | Broken Silence / Hiljaisuus murtuu | Virolahti | Intercept | Protect the surveillance relay from a distant Sweep/Strike package; losing the relay triggers RTB, while the lead Strike aircraft and wingmen are optional objectives. |
| 3 | Disperse / Hajautus | Päijänne | Patrol | Hold the dispersed road-base operation together for the transfer window; the sortie completes by surviving the hold period rather than clearing the airspace. |
| 4 | Northern Feint / Pohjoinen harhautus | Ilomantsi | Intercept | Clear the air picture and meet the authored time objective; deadline expiry triggers a recoverable setback. |
| 5 | First Wave / Ensimmäinen aalto | Kuusamo | Intercept | Stop the Strike aircraft from breaking through the sector before the deadline; surviving sweep aircraft may remain when the corridor is secure. |
| 6 | The Border Breaks / Raja murtuu | Virolahti | Support | Keep the friendly defensive line above its strength threshold while limiting hostile ground survivors; a line breach is a recoverable setback. |
| 7 | Hold the E18 / Pidä E18 | Virolahti | Support | Hold the corridor through the civilian and reserve transfer window; a defensive-line breach is a recoverable setback rather than a requirement to destroy every threat. |
| 8 | Blind the Spear / Sokaise keihäänkärki | Virolahti | Support | Destroy the marked logistics relay as the primary objective before the counterattack window closes; other threats can remain when the relay is disabled. |
| 9 | Counterstroke / Vastaisku | Virolahti | Support | Hold the defensive line while the counterattack advances; friendly-force loss triggers RTB, and the sortie completes when the protection window is survived. |
| 10 | The Border Holds / Raja pitää | Virolahti | Support | Hold the final defensive line through the extraction window; the campaign closes after the line survives, not only after every hostile unit is destroyed. |

Chapters reuse the standalone Patrol, Intercept, and Support combat systems,
but campaign resolution can select a campaign-specific objective. The
`holdPosition` objective completes after an authored protection window while
still allowing defensive-line setbacks; `logisticsStrike` completes when the
named reinforcement relay is destroyed. This keeps the air and ground combat
systems shared without reducing every chapter to a clear-air condition. The
authored decisive, success, setback, optional-objective, sustainment, and
strategic-state data remain separate from the ordinary combat systems.

## Rules of engagement and escalation

Unknown Track uses four contact dispositions: `unknown`,
`identified-neutral`, `hostile`, and `departing`. Contacts appear as uncertain
radar returns, become identifiable inside the authored visual range, and remain
under weapons hold until the mission's hostile-action or authorization rule is
met. The objective requires identification dwell time and an escort corridor.

Broken Silence uses an asset-defense zone and a grace period. The long-range
Strike/Sweep formation spawns at its authored stand-off, approaches through the
staging line, and only then commits to the protected relay. The objective
remains incomplete while any required hostile aircraft is active.

The general threat sequence is detection, uncertain contact, identification,
lock warning, launch, and inbound warning. Radar mode, target selection, lock
state, weapons eligibility, radio priority, and HUD cues consume the same
combat state. Hostile formations use authored bearing variation, long-range
spawn margins, staging, pass/rejoin behavior, and role-specific targeting so
the player is not left with a permanent close orbit.

## Difficulty and authored atmosphere

Campaign resolution scales authored force counts by 0.68 on Easy, 1.0 on
Standard, and 1.28 on Hard. Easy widens air-policing identification and escort
windows, gives asset-defense missions more grace, and lowers force-defense
requirements. Hard tightens those objective margins while adding force and
shortening pressure timing. The normal difficulty presets then control damage,
aim, detection, missile behavior, weapon stores, fuel, countermeasures,
wingmen, and ground air-defense behavior.

Campaign chapter times are fixed in production for atmosphere: 05:30, 23:30,
08:00, 20:30, 05:30, 08:00, 20:30, 20:30, 20:30, and 12:00. Key dawn,
sunset, and night sorties are intentional dramatic beats. The local sortie
clock advances at 1:1 real time, so a normal flight does not jump several
hours during its engagement. Development mode
can override a chapter time without changing campaign state. Standalone
sorties expose the time selector in the normal menu.

## Data, validation, and persistence

Campaign definitions live in `src/campaign/campaigns.js`; state transitions,
sustainment, and selected kits are in `campaign-session.js`; kit limits and
recommendations are pure functions in `campaign-kit.js`; tolerant browser
persistence is in `campaign-progress.js`; pure chapter resolution is in
`resolve-campaign-mission.js`. The resolver uses the sortie seed and keeps
variant/encounter selection separate from combat random rolls. Built-in
campaign, mission, weather, and difficulty shapes are checked by
`validateGameConfig` and the configuration tests.

Campaign saves reject unknown campaigns and difficulties, clamp state values,
filter flags to the authored set, normalize stores to difficulty caps, retain
bounded history, and remain playable when browser storage is unavailable.
After the final chapter, the campaign overview offers a confirmed
“Start new campaign” action that clears only the selected difficulty's save.
Standalone career records use their existing independent storage and unlock
rules.

## Verification

Campaign state, deterministic resolution, optional effects, sustainment,
difficulty scaling, retry idempotence, and persistence are covered by the
campaign and configuration test suites. The integration suite exercises launch,
debrief, acceptance, retry, disposal, and a subsequent launch. The production
browser smoke checks the campaign/standalone menu, real terrain and aircraft
loading, pointer lock, pause/resume, and repeated sortie lifecycle.

Public context for the fictional setting: [Virolahti municipality](https://virolahti.fi/tietoa-virolahdesta/sijainti/),
[Finnish Ministry of Defence airspace-violation notice](https://www.defmin.fi/ajankohtaista/tiedotteet_ja_uutiset/epailty_ilmatilaloukkaus_suomenlahdella.15045.news),
[Finnish Air Force fact sheet](https://ilmavoimat.fi/documents/1951206/2016308/Finnish%2BAir%2BForce%2BFact%2BSheet%2B-%2BFA-18CD%2BHornet%2B%28JAN%2B18%29.pdf/6eb2f056-12a1-4182-ae1a-3705e8a25b47/Finnish%2BAir%2BForce%2BFact%2BSheet%2B-%2BFA-18CD%2BHornet%2B%28JAN%2B18%29.pdf),
and [NATO collective defense](https://www.nato.int/en/what-we-do/introduction-to-nato/collective-defence-and-article-5).
