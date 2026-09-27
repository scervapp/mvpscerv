# Scerv hardening open questions

Open questions block work when assumptions would otherwise be unsafe. Close an item by adding an answer and, when needed, linking to a decision-log entry.

## Format

```markdown
### OQ-### — <question>
- Raised: YYYY-MM-DD by <who>
- Owner to answer: <role>
- Blocks: <task IDs>
- Needed by: <date or gate>
- Answer:
- Closed:
```

### OQ-001 — Are real restaurants or payments live in production today?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Founder
- Blocks: A-09, containment decisions
- Needed by: Phase A exit
- Answer: Firestore aggregate inventory found one production restaurant, marked `isTestAccount: true`, with `isLive: true` count 0, `canAcceptPayments: true` count 0, `stripeAccountMode: live` count 0, canonical `orders` count 0, active `parties` count 0 and active operational-session counts 0. Historical payment-attempt collections exist: `pending_orders` 29, `terminal_payments` 7 and top-level `payment_events` 36. Founder confirmed there are currently no live restaurants, with the first live restaurant expected next week.
- Closed: 2026-09-27 -> D-007

### OQ-002 — Must browser guests pay before items are sent, or only before leaving?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Founder + Operations
- Blocks: C-08
- Needed by: Phase C entry
- Answer:
- Closed:

### OQ-003 — Can a browser session and a native party share one table?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Founder
- Blocks: C-09, Phase 2 state machines
- Needed by: Phase C entry
- Answer:
- Closed:

### OQ-004 — What production native app versions are actively installed?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Engineering
- Blocks: Minimum-version gate and compatibility matrix
- Needed by: Phase B
- Answer:
- Closed:

### OQ-005 — What is the confirmed Node 20 decommission date from the provider?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Engineering
- Blocks: A-11, Node 22 production plan
- Needed by: Phase A
- Answer: Google Cloud runtime documentation lists Node.js 20 deprecation on 2026-04-30 and decommission on 2026-10-30. It lists Node.js 22 deprecation on 2027-10-31 and decommission on 2028-04-30.
- Closed: 2026-09-27 -> D-006

### OQ-006 — Have inactive PayPal/dLocalGo provider credentials been revoked or deleted?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Founder
- Blocks: F11 closeout
- Needed by: Phase B exit
- Answer: Local triage found tracked credential-bearing surfaces: `functions/test.js`, `functions/.env` and `src.zip`. PayPal and dLocal references were found by path/line-number scan without printing values. Engineering cleanup removed those files locally and `npm run security:secret-scan` now passes. Founder confirmed PayPal and dLocalGo are inactive payment workflows per D-011. Provider-side revocation/deletion evidence is still required before this can close.
- Closed:

### OQ-007 — Which Stripe Connect model is live?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Founder + Engineering
- Blocks: C-05, reconciliation model
- Needed by: Phase C
- Answer:
- Closed:

### OQ-008 — What KDS latency will operators accept, and what are current poll intervals?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Operations + Engineering
- Blocks: B-17, Phase 4 targets
- Needed by: Phase B
- Answer:
- Closed:

### OQ-009 — Is DGI invoicing live, and which environment can emit real invoices?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Founder
- Blocks: C-07
- Needed by: Phase C
- Answer:
- Closed:

### OQ-010 — Does production need god-mode reads or writes at all?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Founder
- Blocks: B-02
- Needed by: Phase B
- Answer:
- Closed:

### OQ-011 — Who is the independent payment/security reviewer?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Founder
- Blocks: C-12, E-15
- Needed by: Phase C exit
- Answer:
- Closed:

### OQ-012 — Is Terminal in pilot scope? Is pacing in pilot scope?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Founder + Operations
- Blocks: B-08, Phase D QA scope
- Needed by: Phase B
- Answer:
- Closed:

### OQ-013 — Is PITR/backup currently enabled in production?
- Raised: 2026-09-27 by release-readiness planning
- Owner to answer: Engineering
- Blocks: D-04
- Needed by: Phase D
- Answer: Read-only Firestore database inventory shows `pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_DISABLED` for production database `projects/scervmvp/databases/(default)`. A backup/restore policy decision and restore drill still remain under D-04.
- Closed:

### OQ-014 — Which development Firestore rules release is authoritative?
- Raised: 2026-09-27 by A-06 deployed-state inventory
- Owner to answer: Engineering
- Blocks: A-06, A-08
- Needed by: Phase A exit
- Answer: Development has two Firestore databases: `(default)` in `nam5` and named database `default` in `us-central1`. Native, web and admin configs use default SDK calls (`firestore()`, `getFirestore(app)`) with no custom database ID, so Scerv clients target `(default)`. The `cloud.firestore` rules release for `(default)` matches the local comparable Firestore rules hash. The named database `default` uses `cloud.firestore/default` and does not match local source.
- Closed: 2026-09-27 -> A-06 evidence

### OQ-015 — Where is the reviewed Storage rules source?
- Raised: 2026-09-27 by A-06 deployed-state inventory
- Owner to answer: Engineering
- Blocks: R6, E-01
- Needed by: Phase A exit
- Answer: No reviewed `storage.rules` source file was found in the current workspace or Git history. Repository search found only captured deployed storage rules evidence under `docs/hardening/evidence/deployed-rules/`. Storage source parity cannot be claimed until a reviewed source file is recreated from deployed evidence or recovered from another system.
- Closed: 2026-09-27 -> source not found; recreate/recover is follow-up work.

### OQ-016 — What is the repository exposure profile for tracked credential-bearing files?
- Raised: 2026-09-27 by A-10/F11 credential triage
- Owner to answer: Founder
- Blocks: A-10, F11 closeout
- Needed by: Phase B exit
- Answer: Remote is `https://github.com/scervapp/mvpscerv.git`. Current branch is `codex/browser-ordering-mvp`. `functions/.env` and `functions/test.js` were introduced in commit `016e56f`; `src.zip` appears in history around `08b50f6`, `90a3bc1` and `cff2bac`. Founder still needs to confirm whether the repo was private, who had access, and whether any forks/mirrors existed while these files were present.
- Closed:

### OQ-017 — Why does testing Secret Manager inventory return 403?
- Raised: 2026-09-27 by A-10/F11 credential triage
- Owner to answer: Engineering
- Blocks: A-10, F11 closeout
- Needed by: Phase B exit
- Answer: Read-only Secret Manager REST list returned `403` with ErrorInfo reason `SERVICE_DISABLED`: Secret Manager API has not been used in project `scervmvp-testing` before or it is disabled. This is not evidence that the testing project has no secrets; the API must be enabled before inventory can complete.
- Closed: 2026-09-27 -> OQ answered; enabling the API is a separate cloud-configuration action.

### OQ-018 — What exact source ref should be used for the A-08 testing baseline?
- Raised: 2026-09-27 by A-08 preflight
- Owner to answer: Engineering + Founder
- Blocks: A-08, Phase A exit
- Needed by: Phase A exit
- Answer: The exact source ref for the deployed production functions remains unknown. Founder explicitly approved waiving strict production-baseline parity and using the current hardening branch `codex/browser-ordering-mvp` as the testing-lane baseline for `scervmvp-testing`, accepting that this is no longer a production-parity W0 baseline. See D-023.
- Closed: 2026-09-27 -> D-023

### OQ-019 — Can `scervmvp-testing` be upgraded to Blaze for the testing-lane functions deploy?
- Raised: 2026-09-27 by A-08 testing deploy attempt
- Owner to answer: Founder
- Blocks: A-08, B-01, B-04, B-05, B-06, B-18
- Needed by: testing-lane deploy
- Answer: Deploy attempt `npx firebase-tools deploy --only functions --project scervmvp-testing` passed the deploy guard and lint predeploy, then failed because Firebase could not enable `artifactregistry.googleapis.com` without the `scervmvp-testing` project being on the Blaze plan. Founder upgraded `scervmvp-testing` to Blaze on 2026-09-27. A retry enabled `cloudbuild.googleapis.com` and `artifactregistry.googleapis.com` successfully, then moved to the next blocker.
- Closed: 2026-09-27 -> founder confirmation in chat

### OQ-020 — Can Secret Manager be enabled and testing secrets be provisioned for `scervmvp-testing`?
- Raised: 2026-09-27 by A-08 testing deploy retry
- Owner to answer: Founder + Engineering
- Blocks: A-08, B-01, B-04, B-05, B-06, B-18
- Needed by: testing-lane functions deploy
- Answer: Retry command `$env:FUNCTIONS_DISCOVERY_TIMEOUT='60000'; npx.cmd firebase-tools deploy --only functions --project scervmvp-testing` passed deploy guard, lint, required Cloud Functions/Cloud Build/Artifact Registry API checks and function discovery, then failed because `secretmanager.googleapis.com` was disabled for `scervmvp-testing`. Founder enabled Secret Manager. Engineering copied dev test-mode Stripe and Resend secrets into testing without printing values and set disabled placeholders for live-mode Stripe secret names in testing. Deploy then passed secret checks and moved to service/database prerequisites.
- Closed: 2026-09-27 -> testing secrets provisioned

### OQ-021 — Can Firebase Auth be initialized for `scervmvp-testing`?
- Raised: 2026-09-27 by A-08 testing deploy
- Owner to answer: Founder
- Blocks: A-08 completion, `onUserCreate` deployment, auth-trigger smoke tests
- Needed by: testing-lane functions deploy completion
- Answer: Full functions deploy created the testing Firestore database prerequisite gap. Engineering created Firestore database `(default)` in `nam5`; all Firestore-trigger functions then deployed successfully. The only remaining failed function is `onUserCreate`, blocked by `Failed to configure trigger for event-type:providers/firebase.auth/eventTypes/user.create ... Firebase Auth is not enabled in the project.` Enabling `identitytoolkit.googleapis.com` from CLI was successful/already active, but retrying `onUserCreate` still failed. This requires Firebase Auth initialization in the Firebase console for `scervmvp-testing`.
- Closed:
