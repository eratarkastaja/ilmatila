# Implementation plan status — 2026-11-26

This report tracks the attached `ILMATILA_TOTEUTUSSUUNNITELMA.md` against the
repository state after implementation. “Implemented” means the requested code,
content, or existing boundary is present and covered by the applicable checks;
browser and human-play limitations are listed separately.

| ID | Status | Evidence / note |
| --- | --- | --- |
| A01 | Implemented, verified | Clean `1ca1e33` baseline, `npm ci`, unit, lint, build, and E2E results recorded in `docs/baseline.md`. |
| A02 | Implemented, verified | Persistence, retry, kit, reserve, and profile paths reproduced in focused regression tests. |
| A03 | Implemented, human sample open | Measurement protocol and explicit no-human-sample boundary in `docs/playtest-metrics.md`. |
| B01 | Implemented, verified | Temporary development/replay state no longer persists; session tests cover save isolation. |
| B02 | Implemented, verified | Retry preserves seed/readiness/support and creates a new attempt without a cost. |
| B03 | Implemented, verified | All ten chapters have decisive-benefit invariant coverage; blind-spear retains the success flag. |
| B04 | Implemented, verified | Validated versioned launch snapshots, exact replay, and legacy practice fallback. |
| C01 | Implemented, verified | Shared kit keys/validation, presets, and distinct StormBreaker profile. |
| C02 | Implemented, verified | Readiness inventory pressure is applied before selection; the accepted kit is consumed verbatim. |
| C03 | Implemented, verified | Missile reserve resolution is shared and `notApplicable` when no reserve is possible. |
| C04 | Implemented, verified | `CampaignSession.resolveCurrentMission()` exposes one resolved sortie plan used by briefing and launch inputs. |
| C05 | Implemented, verified | Restore-choice path removed; chapter transitions resupply to difficulty capacity. |
| C06 | Implemented, verified | Configuration and localization coverage updated for new kit, snapshot, objective, and narrative fields. |
| D01 | Implemented, verified | ITO90 duplicate removed where identical; distinct chapter overrides retained; decisive flags audited. |
| D02 | Implemented by existing boundary, verified | `main.js` remains composition root and delegates campaign state/plan ownership to `CampaignSession`; no second refactor was needed. |
| D03 | Implemented by existing boundary, verified | `CombatWorld` consumes launch data and reports sortie results; it does not own campaign persistence. |
| D04 | Implemented, verified | Feasibility seed sweep expanded to 4096 and passed. |
| D05 | Implemented, verified | Risk map added; existing behavior tests retained. CSS/browser and mock-boundary work remains represented by existing suites where the current implementation already provides the boundary. |
| E01 | Implemented, verified | Campaign bible, Kajo/Owl/Varpunen continuity, bilingual radio/debrief content are present in campaign data/docs. |
| E02 | Implemented, verified | Named wingman roster is normalized, saved on accepted results, and restored in replay snapshots. |
| E03 | Implemented, verified | Existing semantic radio/mission event systems remain the owners; campaign content uses their existing event boundaries. |
| E04 | Implemented, verified | Ten chapter-specific outcome narratives exist in Finnish and English; practice results are labeled. |
| E05 | Implemented, verified | Config and i18n coverage tests pass for the campaign content shape. |
| F01–F10 | Implemented, automated verification | All ten persistent chapter IDs, areas, variants, objectives, outcomes, and bilingual content remain in the campaign definition; feasibility and session suites pass. Human completion of all chapters was not performed in this environment. |
| G01 | Implemented, verified | Light/Balanced/Heavy presets plus manual selection use the same validator. |
| G02 | Implemented, measurement protocol open | Fuel is not readiness-scaled secretly; the prescribed human before/after fuel test is documented but not performed. |
| G03 | Implemented, verified | Three strategic metrics, readiness pressure, retry recovery rule, and outcome feedback are covered. |
| G04 | Implemented, automated verification | Chapter identity, variants, feasibility, and UI/session regressions pass; human pacing/clarity observations remain open. |
| G05 | Implemented, verified | Three ending IDs have deterministic fixtures and existing bilingual summary UI. |
| H01 | Implemented, verified | Full Vitest suite: 70 files, 421 tests passed. Focused campaign/config/mission/i18n suite: 102 tests passed. |
| H02 | Implemented, environment-limited | Playwright build passed and Firefox smoke passed; Chrome/Edge/WebKit launch was blocked by missing local browser dependencies. |
| H03 | Implemented, environment-limited | Existing lifecycle/performance protections retained; no human full-campaign performance run was possible. |
| H04 | Implemented, verified | Architecture, game design, campaign design, testing, baseline, release notes, browser compatibility, README, and localization were reconciled. |
| H05 | Implemented, verified with browser exceptions | `npm ci`, audit, test, lint, and build passed; exact local E2E blockers are recorded above. Release is `0.4.0-beta.1`; tagged Pages validation follows. |
| H06 | Implemented | This file is the requested task-by-task handoff report. |

## Verification summary

- `npm ci`: passed in 6 seconds; dependencies unchanged.
- `npm test`: 70 files / 421 tests passed in 16.82 seconds.
- `npm run lint`: passed.
- `npm run build`: passed; 100 modules transformed in 8.96 seconds.
- `npm run test:e2e`: build passed; Firefox had 3 passes and 6 skips, while 15 tests were blocked by missing Chrome, Edge, or WebKit host dependencies.
- Human play: no chapters were manually completed in this environment; use `docs/playtest-metrics.md` for the exact acceptance checklist.

The security follow-up updated only the locked development toolchain; no
application dependency or asset was added. The release commit and tag are
published only after the local checks above pass; the final GitHub Actions
result is recorded in the release notes and browser compatibility report.
