# A-05 deploy guard report

Task: A-05
Status: Done locally
Date: 2026-09-27
Deploy status: None

## Scope

A-05 installs local guardrails so Firebase deploy commands do not silently default to production. This task did not deploy functions, rules, hosting or storage, and did not mutate any Firebase project.

## Changes

- Removed the production `default` project alias from `.firebaserc`.
- Expanded `scripts/guard-firebase-deploy.js` so deploys require an explicit Firebase project target.
- Added Firebase predeploy guard hooks for functions, Firestore rules and hosting in `firebase.json`.
- Allowed only Scerv-approved project IDs:
  - `scervmvp-dev`
  - `scervmvp-testing`
  - `scervmvp`
- Required `CONFIRM_PROD_DEPLOY=scervmvp` for production deploys.
- Added package deploy scripts for guarded functions, Firestore rules and hosting deploy paths.

## Verification

| Check | Result |
| --- | --- |
| `node --check scripts\guard-firebase-deploy.js` | Pass |
| `node scripts\guard-firebase-deploy.js` | Fails closed: no explicit Firebase project |
| `node scripts\guard-firebase-deploy.js --project dev --surface functions` | Passes for `scervmvp-dev` |
| `node scripts\guard-firebase-deploy.js --project prod --surface hosting` | Fails closed without production confirmation |
| `CONFIRM_PROD_DEPLOY=scervmvp` with prod guard command | Passes guard |
| Simulated Firebase predeploy with `GCLOUD_PROJECT=scervmvp-dev` | Passes guard |
| Simulated Firebase predeploy with `GCLOUD_PROJECT=scervmvp` and no confirmation | Fails closed |
| Simulated Firebase predeploy with `GCLOUD_PROJECT=scervmvp` and production confirmation | Passes guard |
| `package.json` JSON parse | Pass |
| `.firebaserc` JSON parse | Pass |
| `firebase.json` JSON parse | Pass |

## Limits

This is a guardrail, not a complete permission system.

- Functions, Firestore rules and Hosting deploys run the guard from `firebase.json` predeploy.
- Direct manual Firebase CLI commands for future surfaces not configured in `firebase.json` can still bypass package-level guards.
- Production deploys remain governed by D-003: no production deploy without a specific founder approval record.
- Storage deploy scripts were not added because this workspace currently has no reviewed local `storage.rules` source. OQ-015 remains open.

## Next

A-08 can now use explicit testing targets when preparing the testing-lane baseline. Before any production deployment, the operator must provide both an explicit production project and `CONFIRM_PROD_DEPLOY=scervmvp`, with the founder approval record required by D-003.
