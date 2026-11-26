# Test risk map

| Risk | Primary level | Current protection |
| --- | --- | --- |
| Campaign persistence, retry and replay isolation | Campaign/integration | `campaign-session`, `campaign-progress`, `main-session` |
| One resolved kit/briefing/world objective plan | Campaign/integration | `campaign-kit`, `campaign-session`, `optional-objectives`, `main-session` |
| Mission and campaign feasibility | Configuration/campaign | `campaign-objective-feasibility`, `validate-config` |
| Deterministic variants and encounter plans | Mission/campaign | `mission-variants`, `campaign-session`, combat scenarios |
| Weapon profiles, stores and payload limits | Combat/campaign | `campaign-kit`, `weapon-system`, projectile and world integration tests |
| Objective transitions and optional status | Mission/combat | mission-flow, mission-objective and optional-objective suites |
| Radio priority and one-shot lifecycle | Combat/integration | radio, threat, world-session suites |
| Three.js ownership, abort and disposal | Assets/integration | asset, resource-lifecycle, sortie-controller and session suites |
| Pointer Lock and repeated application lifecycle | Integration/browser | `main-session`, sortie-controller and Playwright smoke |
| Localization and static translation references | UI | `i18n-coverage` and UI suites |

Tests are retained when they protect an observable invariant. The browser
matrix and human campaign play are separate from the Node/Vitest risk map.
