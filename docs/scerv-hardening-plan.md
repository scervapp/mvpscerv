# Scerv phased hardening plan

Created September 25, 2026. Owner: founder, with engineering execution and operations acceptance.

Objective: make Scerv safe and reliable for a controlled restaurant rollout, then establish a measured capacity envelope for 20 restaurants serving a population of 10,000 registered users. Registered users are not simultaneous users; capacity claims must state both.

Source: [architecture assessment](../output/architecture-audit-2026-09-25/Scerv-Architecture-Assessment.md). Findings F1–F16 refer to that assessment. This plan is the execution tracker; the assessment remains the baseline record.

**Release-readiness control:** Sequencing, gates, stop rules, task status, open questions and session discipline now live in [release-readiness master plan](hardening/release-readiness-master-plan.md). If this phased plan and the master plan conflict, pause and resolve the contradiction in the decision log before executing.

## Working rules

- Reconfirm each finding against current code, its callers, and deployed configuration before choosing a repair. Label source-confirmed, mock-reproduced, emulator-verified, staging-verified, or production-verified evidence accurately.
- Deliver small, reviewable changes with regression tests and rollback instructions. A fix is not complete because lint passes or one happy path works.
- Preserve existing uncommitted work. Use an isolated branch/worktree for implementation where practical; copy needed untracked audit fixtures explicitly rather than assuming a worktree contains them.
- Use synthetic identities/data and Stripe test mode for development and fault tests. Existing projects: development `scervmvp-dev`, testing `scervmvp-testing`, production `scervmvp`.
- Compare deployed rules/functions/runtime with the reviewed source using read-only metadata first. Do not infer live exposure or absence of exposure from local files.
- Preserve compatibility with installed mobile versions. Where a security fix intentionally removes unsafe behavior, document the required client update or bounded feature restriction; compatibility is not a reason to leave an authorization bypass.
- Use additive schema changes, versioned APIs where needed, and explicit migration verification. Do not restore a vulnerable release as the default rollback; disable the affected operation if a safe rollback is unavailable.
- Production deployments remain an explicit founder-approved release step after the tested change, migration, and rollback are reviewable. No production load tests.
- Completion requires evidence and an owner. Maintain `Not started → Reproduced → Fixed locally → Passed QA → Released → Verified` per finding. Document any disproven finding rather than changing its status to fixed.

## Phase 0 — Establish the repair and release baseline

**Status:** Started. Current working tree checked; all 16 findings mapped below. No application repairs or deployments performed by this planning step.

Work:

1. Record source version, dirty working-tree state, deployed versions/rules, runtime, project selection, and current live payment/restaurant use. Prioritize containment if a critical finding is deployed and exposed.
2. Turn isolated audit reproductions into maintained tests. Add a backend test command and Firestore emulator authorization tests; retain a baseline set of valid guest/staff journeys.
3. Repair the CI build paths and require backend/rules checks. Make project selection explicit and fail closed; cover rules and hosting as well as Functions.
4. Start supported Node runtime migration in its own change, verify installed SDK/native integration compatibility, and test in the nonproduction lane. The audit cites October 30, 2026 as the current Node 20 decommission date; recheck the provider schedule before release.
5. Inventory secrets without printing values; assess the tracked sandbox credential. Prepare replacement/configuration and provider rotation safely, verify consumers, and only then retire the old credential. Record external steps separately from code cleanup.

**Exit gate:** repeatable local/emulator checks, executable CI, documented release/environment selection, preserved baseline, and a tested runtime upgrade path. Do not delay an urgent narrowly scoped security repair solely to finish unrelated pipeline improvements.

Findings: F11, F14; verification foundation for all others.

## Phase 1 — Protect identities, permissions, and financial fields

Deliver in these reviewable slices:

1. **Financial input validation:** reject negative/fractional/nonfinite/out-of-range gratuities and unsupported payment inputs. Test legitimate zero-tip and normal-tip behavior across payment entry points (F4).
2. **Kitchen access:** derive restaurant/table/party associations from trusted records; authorize the caller and items before mutation. Test strangers, unrelated tenants, party members, and staff, including repeated calls (authorization portion of F2).
3. **Trusted data boundaries:** inventory legitimate client writes before tightening customer/restaurant rules. Separate profile/settings from server-owned Stripe mappings, wallet balances, entitlements, payment mode and fee policy. Verify existing Stripe-customer ownership (F1, F8).
4. **Staff identity:** choose an authenticated staff identity or server-issued PIN session that binds staff, restaurant, device/session and expiry. Update clients and handlers together; changing `staffId` must never grant privileges (F3).
5. **Authentication abuse controls:** atomic OTP attempt/consume logic, cryptographic generation, resend/guess limits, PIN throttling, session revocation and appropriate App Check rollout (F10). Inspect actual deployed controls before changing enforcement.

**Exit gate:** all protected operations pass a tenant/role/ownership matrix; forbidden financial edits fail at create/update/remove boundaries; a worker cannot become a manager by changing payload IDs; invalid amounts fail before provider calls. Existing valid customer and staff flows pass regression QA.

**Release constraint:** critical access and financial-integrity defects block unrestricted live use. Limited UI exposure or low customer counts do not close this gate.

## Phase 2 — Make orders and money correct under retries and concurrency

Before implementation, write state transitions and invariants for submitted items, tickets, checkout attempts, payment allocations, fulfillment and table closure. Keep contracts shared across native, browser and staff/Terminal paths.

Work:

1. Stable order-command IDs, transactional item claims and deterministic ticket identities. Preserve concurrent basket changes; check every array read/modify/write path (F5).
2. Stable checkout attempts across retries/restarts. Atomically allocate the selected items so overlapping split payments cannot charge the same obligation twice. Handle abandoned/failed attempts and safe expiry (F7).
3. Separate captured payment from completed fulfillment. Persist pending side effects transactionally; execute them through retryable workers with stable provider keys, completion records and reconciliation (F6).
4. Verify reward accrual/redemption, tax/tip/fee arithmetic, failed or ambiguous capture, refund/void behavior, and table cleanup against settled item allocations. Do not close a table merely because one guest paid.
5. Consolidate only the shared domain logic necessary to enforce these invariants (part of F16); avoid a broad rewrite during payment repairs.

**Exit gate:** duplicate taps, parallel guests/staff, provider timeouts, duplicate/reordered webhooks, and crashes at each persistence boundary cause no lost item, unintended duplicate ticket, duplicate settlement, or stranded paid fulfillment. Every successful test payment reconciles to recorded allocations and the correct payout/fee/tip amounts.

## Phase 3 — Make a full restaurant shift dependable

Work:

1. Fix pacing due-time selection, ordering, pagination and safe overlapping releases; monitor oldest overdue work (F9).
2. Correct report completeness beyond 1,000 orders, then replace expensive scans where useful with aggregates or rebuildable summaries. Validate business-day/time-zone boundaries and refund adjustments (F12).
3. Fix auth subscription cleanup and stale callbacks. Measure active query payloads, screen subscriptions and KDS reconnect behavior (F13).
4. Review reservation approval/cancellation/waitlist/seating races, simultaneous table assignment, abandoned parties, staff device handoff and end-of-day closeout. Add failures to this tracker if newly discovered.
5. Establish alerts for order/KDS lag, payment-to-order mismatches, failed transfers, old pending work, OTP delivery and abnormal spend. Add support-visible correlation IDs with sensitive-data redaction (F15).
6. Verify Cloud IAM, Storage rules, data retention, backups/PITR and restore procedures. Practice an outage fallback with operations; distinguish cached screens from completed cloud commands (F15).
7. Dependency/secret/license scan; investigate actionable findings, test upgrades, and document remaining vendor constraints. Obtain experienced independent review of payment and authorization changes before broader rollout.

**Exit gate:** a scripted full shift passes on representative devices, including interrupted internet, KDS restart, partial payment and recovery. Reports reconcile. A clean-environment restore and its timing are recorded. Staff can identify unsent/pending work and follow a documented fallback.

## Phase 4 — Prove the 20-restaurant workload

Set assumptions first. Proposed synthetic test profiles, not current usage claims:

| Profile | Restaurants | Active tables per restaurant | Guests per table | Staff/display devices per restaurant |
|---|---:|---:|---:|---:|
| Initial service | 1 | 10 | 4 | 5 |
| Target busy service | 20 | 25 | 4 | 5 |
| Burst/headroom | 20 | 50 | 4 | 5 |

The target profile represents 2,000 seated guest sessions and 100 staff/display devices, not 2,000 requests every second. Define action cadence, staggered arrivals, basket size, payment rate, report requests, and history size separately. Seed 10,000 registered synthetic users so both population and activity are represented. Adjust assumptions using pilot evidence.

Work:

1. Validate correctness at one table under heavy contention before testing many tables.
2. Run staged ramps, a sustained busy service, bursts, reconnect storms and a long-duration stability test in a separate environment. Establish test resource/spend limits before execution.
3. Measure client-observed command-to-KDS latency, errors, transaction retries, queue age, reads/writes, document sizes, function durations and cost per completed dining party.
4. Exercise above-200 scheduled-ticket backlogs, above-1,000-order reports and large historical datasets.
5. Fix measured bottlenecks, then rerun the affected tests. A database/schema or function-generation change requires evidence, not an assumption that it is automatically faster.

**Proposed gate:** p95 accepted-order-to-visible-KDS ≤2 seconds and p99 ≤5 seconds on the agreed healthy test network; no lost or unintended duplicate items; no double settlement; complete reconciliation. Measure tap-to-acknowledgment separately so slow command acceptance cannot be hidden. Agree payment latency targets by payment method because customer authentication and provider behavior differ. These are test targets, not advertised SLAs.

**Output:** capacity/cost report stating workload, environment, duration, limitations, observed headroom and the first failing service objective. Do not extrapolate to 10,000 simultaneous diners without testing that workload.

## Phase 5 — Release gradually and assemble due-diligence evidence

Work:

1. Package a versioned release, migration/backfill, compatibility matrix, verified rollback/feature-disable options, and go/no-go checklist for founder approval.
2. Begin with one supported pilot restaurant after Phases 1–3 gates pass. Progress through a small cohort before reaching 20; expansion requires Phase 4 evidence for the intended cohort and volume.
3. Review each cohort over complete service periods, including peak periods. Watch correctness, payment reconciliation, incidents, operator usability and cost; do not expand solely because a fixed number of days passed.
4. Keep emergency access controlled, alerts assigned, and a named support person available. Pause expansion for financial discrepancies, lost orders, tenant breaches, or recovery failures.
5. Assemble architecture/data-flow diagrams, permission matrix, command contracts, threat model, dependency inventory, risk register, test results, restore evidence, release record and pilot metrics (F16 and F15).

**Exit gate:** real service metrics support the workload claim, reconciliation is clean, operators can recover from documented failures, and material risks have explicit owners and dispositions. No unsupported claim of unlimited scale, full offline operation, or complete security certification.

## Finding tracker

All repairs below are currently **Not started**. Earlier audit reproductions are baseline evidence, not fixes.

| Finding | Primary phase | Repair/evidence needed |
|---|---|---|
| F1 Customer financial authority | 1 | Field restrictions, server-only mappings, provider identity checks, rules tests |
| F2 Kitchen party authorization | 1 | Server-resolved membership and tenant matrix |
| F3 Staff role impersonation | 1 | Verified staff session/identity and client migration |
| F4 Negative gratuity | 1, first implementation slice | Monetary input contract and handler regression tests |
| F5 Duplicate/lost order changes | 2 | Transactional command/item ownership and race tests |
| F6 Partial fulfillment/payout | 2 | Durable pending work, replay and reconciliation tests |
| F7 Native retries/split settlement | 2 | Stable attempt and allocation lifecycle |
| F8 Restaurant platform authority | 1 | Data ownership split, field allowlists and migration |
| F9 Pacing starvation | 3 | Due-time pagination and overlapping-job tests |
| F10 OTP/PIN abuse | 1 | Atomic attempt/consume and throttling evidence |
| F11 Committed credential | 0 | Exposure assessment, provider rotation and secret scanning |
| F12 Reporting completeness/cost | 3 | Complete ledger reconciliation, aggregation evidence |
| F13 Subscription lifecycle | 3 | Cleanup and device/reconnect tests |
| F14 CI/runtime/releases | 0 | Working checks, supported runtime and all-target guard |
| F15 Recovery/observability | 3, 5 | Live configuration verification, alerts, restore/fallback drill |
| F16 Domain contracts | 2, 5 | Shared invariants and current technical packet |

Each completed item must add: fixed commit, test command/result, QA version, deployed version (if any), rollback route, verification date and residual risk. Never mark an item Released from local test results alone.

## Team responsibilities and reporting

- **Engineering execution (Codex with founder review):** trace callers, implement bounded fixes, maintain tests, capture evidence, explain regressions and prepare reviewable releases. External provider changes and cloud permissions may need founder participation. Independent human payment/security review remains a separate checkpoint, not something automated tests replace.
- **Founder:** decide product invariants and supported service models, prioritize work, coordinate specialist review, and approve production releases and rollout expansion.
- **Shuwanda / operations:** run repeatable restaurant acceptance scripts, record device/time/steps when something fails, own onboarding/fallback instructions, and rehearse support escalation. Engineering supplies the scripts; she is not responsible for certifying security.
- **Ivan / acquisitions:** select willing pilot operators, set accurate expectations, collect service feedback, and avoid unsupported capacity/offline claims. Do not expose internal exploit details in sales materials.

Phase-end update format: what changed; tests and evidence; remaining risks/dependencies; deployment status; gate passed/failed; next bounded task. Calendar estimates follow Phase 0 and the first implementation slice; phase completion is based on evidence rather than a promised date.

## Next implementation task

Follow [release-readiness master plan](hardening/release-readiness-master-plan.md) Phase A. Current next work is plan adoption, read-only deployed-state inventory, F11 triage and Node runtime verification before any new feature work or production deploy. Do not continue from this historical phased-plan task list without checking the master plan and decision log first.

