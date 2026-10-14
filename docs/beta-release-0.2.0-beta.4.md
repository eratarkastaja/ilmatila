# ILMATILA beta 0.2.0-beta.4

## Release scope

This beta makes the sortie environment more deliberate and readable. The local
clock now advances at real-time speed, while selected campaign chapters are
authored around dawn, sunset, and night for stronger atmosphere.

Mission guidance now marks reinforcement relays and strike aircraft as priority
targets on the radar, and the objective HUD distinguishes waiting air
reinforcements from aircraft already in the engagement. Reinforcement radio
calls include an estimated bearing and range. Mi-24 air-to-air missiles use
difficulty-specific behavior and are less unforgiving on Hard.

The HUD also reports the selected air-to-air and air-to-ground weapon variant,
so kit selection and combat readouts remain consistent.

## Release validation

The release workflow validates unit and integration tests, ESLint, the
production build, the desktop browser smoke matrix, staging preflight, Pages
deployment, and the deployed beta smoke before promotion.

## Version identity

The application version is read from `package.json`; `package-lock.json`, the
menu, startup error screen, diagnostics, and this release note use
`0.2.0-beta.4`. The public Pages build writes its source commit and version to
`build-info.json` for deployed-smoke verification.
