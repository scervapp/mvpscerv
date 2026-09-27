# Scerv Release-Readiness Master Plan

Created: September 27, 2026 (America/New_York)
Owner: Founder (approval authority) · Engineering (execution) · Operations (acceptance)
Location: `docs/hardening/release-readiness-master-plan.md`
Supersedes: nothing. This plan controls **sequencing and gates**. The findings baseline stays in `Scerv-Architecture-Assessment.md`. Slice-level results stay in `phase-1-results.md`. External AI reviews, including Claude reviews, are advisory until reconciled against the repository and recorded here or in the decision log.

---

## 1. Title and objective

**Scerv Release-Readiness Master Plan: Local Hardening → Testing Lane → Pilot Gate**

Objective: move the Phase 1 hardening work, the Phase 2 order/payment correctness work, and the runtime upgrade from **local-only evidence** to a **deployed, device-tested `scervmvp-testing` lane**. Then produce the evidence packet the founder needs to approve one pilot restaurant.

This plan does not change the product roadmap. It decides what may ship, in what order, and with what proof.

---

## 2. Start condition (as of September 27, 2026)

Taken from the packet. Anything not stated there is treated as **unknown**, not as safe.

| Area | Known state | Evidence level |
|---|---|---|
| Phase 1 slices (F1–F4, F8, F10, staff reads, menu/table/profile, legacy rails) | Implemented in worktree `hardening/phase-0-baseline` | **Local only** (unit, mocked handler, emulator rules) |
| Deployments | None performed for any hardening slice | Stated in every slice |
| Commits/pushes | None recorded for hardening slices | Stated |
| Production rules/functions parity with source | **Unresolved drift** | Not verified |
| Testing lane (`scervmvp-testing`) | Project and app IDs registered; no hardening code deployed | Config only |
| F5 duplicate kitchen tickets | Still reproduces (expected-failing test) | Local |
| F6 fulfillment/outbox, F7 native retry/allocation | Not started | — |
| Browser kitchen submission + Stripe Checkout pay-now | Implemented (browser-first track) | Unknown whether deployed; concurrency unverified |
| Node runtime | Main workspace `functions/package.json` targets Node 20; hardening worktree has Node 22 and local backend initialization/tests passing | Local only; deployed runtime still unknown |
| Node 20 decommission | Oct 30, 2026 per assessment citation | **Recheck provider schedule** |
| F11 committed PayPal sandbox secret | No rotation record | Unknown |
| Admin god-mode Firestore endpoints | Exported; no review | Unknown |
| Direct client reads of `parties`, `shared_baskets`, `kitchen_orders`, `checkIns` | Still permitted by rules | Local source |
| Minimum app version gate | Not documented anywhere | Assume **absent** |
| Device QA / physical Terminal QA | None performed | — |
| Live restaurants/payments in production | **Unknown** (see OQ-001) | — |

---

## 3. End condition

This plan is complete when **all** of the following are true and recorded in the decision log:

1. All Phase 1 and Phase 2 work in scope is **deployed to `scervmvp-testing`**, with a recorded commit SHA, deploy timestamp and function list.
2. Testing-lane rules equal the reviewed rules source (diff recorded).
3. Functions run on a supported Node runtime in testing, and a production migration plan is approved or executed.
4. F11 is closed, with provider-side confirmation.
5. God-mode endpoints are contained per §11.
6. A minimum-version gate exists in the shipped native client, and a compatibility matrix is approved.
7. F5, F6 and F7 pass their acceptance tests **for both native and browser paths** in the testing lane.
8. The pilot evidence packet (§16) is complete, and the founder has signed a go/no-go.

Production deployment of this work is **not** part of the end condition. It is a separate founder-approved release under §14.5.

---

## 4. Scope

In scope:

- Phase 1 closeout: remaining endpoint dispositions, rules lockdown, admin containment.
- Testing-lane deployment of Phase 1 in waves.
- Node 22 runtime migration.
- F11 credential rotation verification.
- Minimum app version / compatibility control.
- Phase 2: F5, F6, F7 across **native, browser and staff/Terminal** paths, plus rewards and DGI invoice idempotency where they sit on the fulfillment path.
- Deployed-state inventory (read-only) of production.
- Device and Terminal QA scripts plus execution in the testing lane.
- The pilot evidence packet.

---

## 5. Non-goals / parking lot

These are **not** worked on under this plan. Anything moved out of the parking lot needs a decision-log entry.

| ID | Item | Reason parked |
|---|---|---|
| P-01 | Browser party mode (Stage 5) | Adds concurrency surface before F5/F7 are fixed |
| P-02 | Split pay, open tabs, pre-authorization (Stage 6) | Depends on F7 allocation |
| P-03 | Reservation hub build-out / Reserve with Google | Not on the safety path |
| P-04 | Raw WebSocket / realtime gateway | No measured need |
| P-05 | TypeScript migration, microservice split, file reorganization | Not required for safety |
| P-06 | Reintroducing PayPal or dLocalGo | Inactive/retired by D-011; any reintroduction needs a new payment-rail design |
| P-07 | Analytics warehouse, report rollups (F12) | Phase 3 |
| P-08 | Pacing redesign (F9), subscription lifecycle (F13) | Phase 3, unless a pilot needs pacing (see OQ) |
| P-09 | Load testing beyond the single-restaurant profile | Phase 4 |
| P-10 | Reward stacking, new promotion types | Financial surface |
| P-11 | Further low-risk read migrations with no matching rules lockdown | No security value until rules change |
| P-12 | App Check enforcement | Evaluate only; enforce after client registration is verified |

---

## 6. Immediate stop / do-not-start list

Effective now, until the listed exit condition.

| # | Stop | Until |
|---|---|---|
| S-1 | No new browser-first features (party, split, tabs, reservation hub) | Phase C exit |
| S-2 | No production deploy of any kind (functions, rules, hosting, storage) without a signed founder approval record | Always |
| S-3 | No new exported endpoint without a row in the authority matrix and a rules decision | Always |
| S-4 | No changes to the Stripe fulfillment path except under Phase C tasks | Phase C |
| S-5 | No manual Firestore edits in testing/production to "fix" QA failures; file a defect instead | Always |
| S-6 | No marking a finding "Released" or "Verified" from local evidence | Always |
| S-7 | No new polling callable without a documented interval and cost estimate | Always |
| S-8 | No bundling Node migration with feature or rules changes in one deploy | Runtime migration done |
| S-9 | No use of god-mode endpoints against production data | Containment done (§11) |
| S-10 | No pilot promises (dates, offline mode, capacity) by sales/acquisitions | Pilot go decision |

---

## 7. Phase structure and gates

Evidence levels used below: **L** = local (unit/mock/emulator) · **T** = deployed to testing lane · **D** = device-verified in testing · **P** = production-verified.

### Phase A — Freeze and baseline

**Entry:** this plan is adopted.
**Work:** S-list in effect; prepare the hardening worktree for founder-approved commit/push; read-only production inventory; testing-lane baseline; F11 and Node triage started.
**Exit gate:**
- Hardening branch pushed, with CI running backend tests, emulator rules tests and lint.
- Production inventory recorded: deployed function names and runtimes, rules text, rules-vs-source diff, and whether live payments occur.
- Testing lane holds a deploy of the verified production baseline source identified by A-06 and passes a smoke script.
- OQ-001 (live production usage) answered.

### Phase B — Phase 1 to testing lane

**Entry:** Phase A exit.
**Work:** Node 22 in testing; admin containment; min-version gate in a client build; Phase 1 waves W1–W5 (§14); remaining Phase 1 endpoint dispositions.
**Exit gate:**
- Every Phase 1 slice at level **T**, and staff flows at **D**, on at least one iOS and one Android device plus one browser.
- Rules lockdown steps R1–R4 (§13) at **T**.
- The authority matrix has no "Needs Phase 1 review" rows left, except ones explicitly deferred with a decision-log entry.
- F11 closed. God-mode contained in testing, and the production plan approved.

### Phase C — Phase 2 order/payment correctness

**Entry:** Phase B exit, plus the §15 prerequisites.
**Work:** F5, F7, F6 across native, browser and Terminal; rewards/DGI idempotency; browser unpaid-order handling.
**Exit gate:** the §15 acceptance tests pass at **T**, and the Stripe test-mode reconciliation report is clean.

### Phase D — Pilot readiness

**Entry:** Phase C exit.
**Work:** full-shift QA script, fallback drill, alerting minimum, rules lockdown R5–R6, pilot evidence packet, founder go/no-go.
**Exit gate:** §16 complete and a signed go/no-go recorded.

---

## 8. Task table

Status values: `Not started` · `In progress` · `Fixed locally` · `On testing` · `Device-verified` · `Blocked` · `Done` · `Deferred (D-xxx)`
Owners: **FDR** founder · **ENG** engineering · **OPS** operations (Shuwanda) · **ACQ** acquisitions (Ivan) · **REV** independent payment/security reviewer (TBD)
Deployment status values: `None` · `Local` · `Dev` · `Testing` · `Prod`

### Phase A

| ID | Description | Status | Owner | Deps | Definition of done | Evidence required | Deploy status | Rollback / disable |
|---|---|---|---|---|---|---|---|---|
| A-01 | Adopt stop list; notify team | Done | FDR | — | S-list acknowledged by ENG/OPS/ACQ | D-005 records founder approval to begin Phase A and activates the stop list | None | N/A |
| A-02 | Prepare hardening worktree for founder-approved commit; push to protected branch only after explicit approval; tag baseline | In progress | ENG + FDR | — | Branch pushed after approval; tag `hardening-phase1-local-YYYYMMDD` | `a-02-branch-baseline-report.md`; branch `codex/browser-ordering-mvp` and tag `hardening-phase1-local-20260927` pushed at commit `7ddb8aa288d1e12c598ebfc5951a7691c81a6792`; GitHub CI link and required-check proof still pending | None | Revert commits |
| A-03 | CI: backend tests + emulator rules tests + lint required on PR | Fixed locally | ENG | A-02 waived locally by D-012 | Failing test blocks merge | `a-03-ci-gate-report.md`; local `npm run ci:backend` passes with secret hygiene, functions lint, 4 backend unit tests and 5 Firestore emulator rules tests. GitHub PR run and required-check branch protection still pending. | None | Disable required check (logged) |
| A-04 | Fix the broken hosting-preview workflow (root build script) | Done | ENG | A-02 waived by D-010 | Workflow passes or is removed deliberately | `a-04-hosting-preview-workflow-report.md`; PR workflow changed to build-only checks and Firebase preview deploy removed deliberately | None | Revert workflow |
| A-05 | Fail-closed project selection for functions, rules, hosting and storage; remove prod default in `.firebaserc` | Done | ENG | A-02 waived by D-008 | Deploy with no explicit target fails; prod needs a confirmation variable for configured deploy surfaces | `a-05-deploy-guard-report.md`; local guard tests and simulated Firebase predeploy tests show no-project fails, dev passes, prod without confirmation fails and prod with confirmation passes | None | Revert script |
| A-06 | Read-only production inventory | Done | ENG + FDR | — | List of deployed functions, runtimes, regions; Firestore and storage rules inventory; rules/source diff or explicit unresolved-drift record | Function/hosting summaries, hosting live release refs, Firestore database inventory, deployed rule text evidence, Firestore rules hashes and storage rules hashes recorded in `deployed-state-inventory.md`; OQ-015 confirms reviewed storage rules source was not found and must be recreated/recovered before R6/E-01 parity | None | N/A (read-only) |
| A-07 | Answer: are real restaurants or payments live in prod? | Done | FDR | A-06 | OQ-001 closed | Firestore aggregate inventory recorded in `production-live-usage-report.md`; founder confirmed no current live restaurants in D-007 | None | N/A |
| A-08 | Testing-lane baseline: deploy the A-06 verified production baseline source to `scervmvp-testing`; run smoke | Blocked | ENG | A-05, A-06 | Baseline flows work in testing and the source used is recorded | Blocked by OQ-018 because the exact production functions source ref is not recorded; see `a-08-testing-baseline-blocker-report.md` and D-014 | Testing | Redeploy prior testing state |
| A-09 | Containment decision if A-07 shows live exposure of F1–F4 | Deferred (D-007) | FDR | A-07 | Decision recorded: disable feature, hotfix, or accept with rationale | D-007 confirms no current live restaurants; revisit when first live restaurant signs or any live payment activity appears | Prod only with approval | Feature disable |
| A-10 | F11 triage (see §10) | In progress | ENG + FDR | — | Steps 1–3 of §10 done | `f11-credential-triage-report.md`; tracked credential-bearing files found and removed locally; PayPal/dLocalGo confirmed inactive in D-011; inactive PayPal/dLocal exports fail closed locally per D-015; Secret Manager names inventoried for dev/prod; testing Secret Manager API is disabled per OQ-017; local/CI secret hygiene scanner added and passing; provider revocation/deletion and repo exposure answers still open via OQ-006/OQ-016 | None | N/A |
| A-11 | Recheck Node 20 decommission date against Google's published schedule | Done | ENG | — | Date confirmed with official Google runtime docs | D-006 records Node 20 deprecation/decommission dates and Node 22 dates | None | N/A |

### Phase B

| ID | Description | Status | Owner | Deps | Definition of done | Evidence required | Deploy status | Rollback / disable |
|---|---|---|---|---|---|---|---|---|
| B-01 | Node 22 migration in testing (§9) | Not started | ENG | A-08, A-11 | All functions on Node 22 in testing; tests pass on Node 22 | Deploy log with runtime, test run | Testing | Redeploy Node 20 build (only before decommission) |
| B-02 | Admin god-mode containment (§11) | Fixed locally | ENG + FDR | A-06; Phase B local start allowed by D-016 | §11 testing-lane steps done | `b-02-admin-god-mode-containment-report.md`; raw writes default off locally, sensitive path denylist added, read/write audit logging added, write audit records created transactionally before set/delete; testing deploy pending A-08 resolution or explicit waiver | Testing | Re-enable flag (logged, founder only) |
| B-03 | Min-version gate in native client + server check (§12) | Fixed locally | ENG | A-02; local start allowed by D-017 | Testing-profile build blocks below-min version with update screen | `b-03-min-version-gate-report.md`; native startup gate, server policy helper and `checkClientVersion` callable added locally; unit/rules coverage added; testing-profile screenshots and server rejection log pending testing deploy/build | Testing | Lower min version in config |
| B-04 | Wave W1: additive callables, no rules change (§14) | Not started | ENG | B-01 | New callables live in testing; old clients unaffected | Function list diff, baseline smoke rerun | Testing | Callables unused by old clients; delete if needed |
| B-05 | Wave W2: staff-session backend + hardened handlers | Not started | ENG | B-04 | Staff sessions issued/verified in testing | Emulator suite rerun against testing config; handler logs | Testing | Redeploy W1 functions |
| B-06 | Wave W3: testing-profile native client build using the new callables | Not started | ENG | B-03, B-05 | EAS testing build installed on ≥1 iOS, ≥1 Android | Build IDs | Testing | Reinstall prior testing build |
| B-07 | Staff device QA script executed (PIN, lock, expiry, roles, KDS, host, reservations, tables, menu, profile, reports, work day) | Not started | OPS + ENG | B-06 | Script passes or defects filed | Signed script with device/time/steps | Testing | N/A |
| B-08 | Physical Terminal QA in testing (test mode) | Not started | OPS + ENG | B-06 | Reader payment, webhook, closeout, table cleanup pass | Stripe test dashboard IDs matched to orders | Testing | Disable Terminal feature flag |
| B-09 | Rules lockdown R1–R4 in testing (§13) | Not started | ENG | B-07 | Each step deployed separately with rules tests run against testing | Rules diff per step, test output | Testing | Redeploy prior rules file (never a pre-hardening one) |
| B-10 | Customer/party/reservation ownership review (authority matrix rows) | Fixed locally | ENG | A-02; local start allowed by D-018 | Each row dispositioned: bounded, fail-closed or deferred with a D-entry | `b-10-customer-party-reservation-ownership-report.md`; `joinParty` now requires invite proof for new members, table-created parties now preserve `hostUserId`, check-in party association rules tightened; testing deploy and device QA pending A-08 resolution or explicit waiver | Local→Testing | Per endpoint |
| B-11 | `searchPIPs` privacy review | Fixed locally | ENG | — | Output fields minimized; rate limit decided | `b-11-search-pips-privacy-report.md`; raw email removed from shaped results, masked `emailHint` added, client display updated, unit coverage added; rate limiting/abuse monitoring still pending before `Done` | Local→Testing | Disable endpoint |
| B-12 | Restaurant root public-read split: public projection vs protected fields | Not started | ENG + FDR | B-10 | Protected fields (entitlements, fee policy, `isTestAccount`, Stripe IDs) not client-readable | Rules tests for anonymous read | Testing | Restore prior rules + projection stays |
| B-13 | Remove client authority over `isPhoneVerified` and similar legacy identity fields | Not started | ENG | B-10 | Rules deny client write; no server path trusts it | Rules tests, grep evidence | Testing | Revert rule |
| B-14 | Existing customer fee/rewards/Stripe mapping data review (read-only report) | Not started | ENG + FDR | A-06 | Report of suspicious values; remediation decision | Report file (redacted) | None | N/A |
| B-15 | Staff PIN historical exposure assessment + reset decision | Not started | FDR + ENG | A-06 | Decision recorded | Decision log | None | N/A |
| B-16 | PIN lockout DoS mitigation decision (manager override/unlock path) | Not started | FDR + OPS | B-07 | Decision + test if implemented | Decision log | Testing | Config |
| B-17 | Polling inventory: screen, callable, interval, invocations/device/hr | Not started | ENG | B-06 | Table committed; KDS interval compatible with latency target | Measured invocation counts in testing | N/A | Adjust intervals |
| B-18 | OTP testing-lane QA: Resend delivery, resend cooldown, lockout, first-time account | Not started | OPS + ENG | B-05 | Script passes | Script + Resend test logs | Testing | Disable browser OTP entry |

### Phase C

| ID | Description | Status | Owner | Deps | Definition of done | Evidence required | Deploy status | Rollback / disable |
|---|---|---|---|---|---|---|---|---|
| C-00 | Write state machines + invariants (§15.1) | Not started | ENG + FDR | Phase B exit | Reviewed by FDR, and by REV if available | Committed doc | None | N/A |
| C-01 | F5: transactional item claim, stable command ID, deterministic ticket ID, **native and browser** submission paths | Not started | ENG | C-00 | F5 known-issue test passes as a normal assertion; browser race test passes | Emulator concurrency tests (≥6 parallel), testing-lane rerun | Testing | Versioned callable; old one kept until clients move |
| C-02 | Audit every whole-array read/modify/write on baskets (staff entry, pacing, browser basket) | Not started | ENG | C-00 | Each path transactional or proven single-writer | Test per path | Testing | Per path |
| C-03 | F7: stable checkout attempt ID + item allocation across native/browser/Terminal | Not started | ENG | C-01 | Retry/restart/two-device tests pass | Emulator + Stripe test-mode runs | Testing | Versioned `preparePaymentV2`; disable split flows |
| C-04 | F6: fulfillment outbox; single fulfillment authority; `syncBrowserCheckoutSession` cannot double-fulfill | Not started | ENG | C-03 | Kill/retry at each boundary; duplicate/reordered webhooks safe | Fault-injection test log; reconciliation report | Testing | Disable sync endpoint; webhook stays authority |
| C-05 | Transfer idempotency keys for any separate-charge path (or confirm path unused) | Not started | ENG | OQ-007 | Keyed or fail-closed | Code + test | Testing | Fail-closed |
| C-06 | Rewards accrual/redemption idempotency on duplicate fulfillment | Not started | ENG | C-04 | One ledger entry per order under replay | Test | Testing | Disable accrual trigger |
| C-07 | `emitDgiInvoice` idempotency + environment guard | Not started | ENG + FDR | C-04, OQ-009 | One invoice per order; never emits from testing to a live tax authority | Test + config evidence | Testing | Disable trigger |
| C-08 | Browser unpaid-order handling: items appear on staff check; closeout accounts for them | Not started | ENG + OPS | C-00, OQ-002/003 | Walkout scenario passes the staff check/closeout script | Device script | Testing | Require pay-before-send flag |
| C-09 | Browser session vs native party at same table: single table service identity | Not started | ENG | C-00, OQ-003 | Invariant enforced server-side; tests | Emulator tests | Testing | Block browser session on occupied native table |
| C-10 | Money unit normalization (integer minor units at every server boundary) | Not started | ENG | C-00 | Documented contract; conversion tests | Tests | Testing | N/A |
| C-11 | Stripe test-mode reconciliation report (intents ↔ pending orders ↔ orders ↔ tickets ↔ rewards) | Not started | ENG | C-04 | Report runs clean over the QA dataset | Report output | Testing | N/A |
| C-12 | Independent payment/security review of C-01..C-07 | Not started | REV + FDR | C-04 | Findings dispositioned | Review notes | N/A | N/A |

### Phase D

| ID | Description | Status | Owner | Deps | Definition of done | Evidence required | Deploy status | Rollback / disable |
|---|---|---|---|---|---|---|---|---|
| D-01 | Rules lockdown R5–R6 in testing | Not started | ENG | Phase C | §13 steps at T | Rules tests vs testing | Testing | Prior hardened rules |
| D-02 | Full-shift QA script (single-restaurant profile) incl. KDS reboot, network loss, partial payment, browser + native mix | Not started | OPS + ENG | D-01 | Pass or defects closed | Signed script, timings | Testing | N/A |
| D-03 | Minimum alerting: failed payments, stale pending orders, outbox age, KDS lag, OTP send failure | Not started | ENG | Phase C | Alerts fire in a testing drill | Screenshot/log of fired alerts | Testing | N/A |
| D-04 | Backup/PITR decision + restore drill into a nonproduction project | Not started | ENG + FDR | A-06 | Restore completed; time recorded | Drill log | N/A | N/A |
| D-05 | Restaurant fallback procedure + drill (paper tickets, manual Terminal) | Not started | OPS | D-02 | Drill done with staff | Drill notes | N/A | N/A |
| D-06 | Production release plan: waves, approvals, rollback, min-version bump timing | Not started | ENG + FDR | D-02 | Plan approved | Signed plan | None | Per wave |
| D-07 | Pilot evidence packet (§16) + go/no-go | Not started | FDR | all | Signed | Packet | None | N/A |

---

## 9. Node 22 runtime migration plan

**Why now:** the assessment cites an Oct 30, 2026 Node 20 decommission, after which deploys and updates are blocked and workloads may be disabled. A security fix you cannot deploy is not a fix. Confirm the date (A-11).

Steps:

1. **Isolate.** Make the runtime change in its own branch and its own deploy (S-8). Do not bundle it with Phase 1 waves.
2. **Change.** Carry forward the hardening worktree's `engines.node: 22` change into the runtime branch. Update `firebase-functions` and `firebase-admin` only if verification shows the existing versions are not compatible with Node 22. Record the exact versions. Check native addons, especially **bcrypt**, which needs a Node 22-compatible build.
3. **Local.** Run the full backend suite, emulator suite and lint on Node 22. Record the Node version in the test output.
4. **Dev lane.** Deploy the runtime-only change to `scervmvp-dev`. Confirm every function reports a Node 22 runtime. Run the smoke script.
5. **Testing lane.** Deploy the runtime-only change on top of the A-08 baseline. Smoke test, including PIN verification (bcrypt), a Stripe test payment, OTP send and a webhook.
6. **Production plan.** Prepare a runtime-only production deploy of **current production source** on Node 22. This decouples the deadline from Phase 1 readiness. It needs founder approval, a rollback plan (redeploy on Node 20 while that is still allowed) and a monitoring window.
7. **Deadline rule.** If Phase 1 is not ready by about Oct 16, ship step 6 anyway. Do not let the runtime deadline force Phase 1 into production early.

Evidence: package diff, test logs on Node 22, and the per-lane function runtime listing.

---

## 10. F11 credential rotation verification plan

1. **Locate** (no values printed): confirm `functions/test.js` contents by pattern match; list the commits where the secret exists (`git log -S` on a non-secret fragment such as the variable name).
2. **Assess exposure:** is the repo private? Who has had access? Are there forks or mirrors? Record in the decision log.
3. **Revoke/delete at the provider:** revoke the PayPal sandbox app secret in the PayPal developer dashboard, or delete the app. PayPal and dLocalGo are inactive payment workflows per D-011, so nothing legitimate should depend on them. Confirm that no Secret Manager or functions config references active credentials for those inactive rails.
4. **Verify revocation:** get provider-side confirmation from a dashboard screenshot showing the credential revoked or the app deleted. **Do not** "test" the old secret with a token call from a shared machine.
5. **Remove from source:** delete `functions/test.js` (it is not a test). Add secret scanning to CI (gitleaks or GitHub secret scanning) with a baseline.
6. **History cleanup:** decide whether to rewrite history. It is optional once the secret is revoked. If done, coordinate with everyone holding clones and record it.
7. **Sweep:** run the scanner across the full history for other provider keys (Stripe, Resend). Any hit triggers the same procedure.

Done when: provider revocation evidence is in the log, the file is removed, and CI scanning is active.

---

## 11. Admin god-mode containment plan

Endpoints: `getScervFirestoreCollection`, `getScervFirestoreDocument`, `setScervFirestoreDocument`, `deleteScervFirestoreDocument`.

Default position: **write endpoints disabled in production.** Read endpoints restricted to super-admin with audit logging.

Steps:

1. **Inventory usage:** find who calls these in the admin portal, and how often. Read admin audit logs if they exist (read-only).
2. **Environment flag:** add a server-side flag (not client-controlled) `adminRawWriteEnabled`, default `false`. It is only settable through deploy config, never through Firestore. When false, `set`/`delete` throw `failed-precondition` before any read.
3. **Guard order in every handler:** auth → super-admin claim → environment check → collection denylist (`staffSessions`, `emailOtpChallenges`, `staffPinAttempts`, payment and ledger collections, `employees/*/private`) → **audit log write before the mutation** → mutation.
4. **Audit record:** actor UID, environment, path, before-hash, after-hash, reason string (required, non-empty), timestamp.
5. **Break-glass (production):** enable only through a founder-approved deploy with a time box. Disable in the next deploy. Log a decision entry for each use.
6. **Replace common uses** with purpose-built support actions over time. Do not add features to god-mode.
7. **Tests:** non-admin denied; admin (not super) denied; super-admin with flag off denied; denylisted path denied with flag on; audit record written before the mutation; audit failure aborts the mutation.

Done in testing: B-02 evidence. Production: the flag defaults to off in the first production release that includes this code.

---

## 12. Minimum app version / backward compatibility plan

Problem: Phase 1 deliberately makes older clients fail closed, while `environment-lanes.md` requires production callables to stay backward compatible. The two rules must be reconciled explicitly.

**Policy (proposed D-004):** Backward compatibility is preserved for **non-security** changes. Security fixes may break old clients **only** with a shipped min-version gate and a published compatibility matrix. Where possible, old endpoints fail with an update-required error rather than a generic one.

Steps:

1. **Config source:** a public-read, server-write doc `appConfig/clientVersions` holding `{ minNativeVersion, minNativeBuildIos, minNativeBuildAndroid, message, updateUrls }`. Rules: read public, write denied to clients.
2. **Client gate:** the native app checks at launch and resume. Below the minimum, it shows a blocking update screen. Ship this in a **store release before any breaking cutover**, because old installs cannot check.
3. **Server signal:** clients send `clientVersion` in callable data. New or hardened callables reject below-minimum versions with `failed-precondition` and code `update-required`. This is advisory; authorization never depends on the version string.
4. **Compatibility matrix:** a table of app version × callables used × direct collections read/written × status after each rules step (R1–R6). Committed next to this plan.
5. **Install base:** measure active production installs by version (analytics or auth last-seen). This drives how long W-waves can overlap. See OQ-004.
6. **Sequence:** gate release to stores → wait for adoption threshold (founder decision) → raise `minNativeVersion` → apply breaking rules.
7. **Browser:** hosted web deploys atomically, but open tabs hold old JS. Add a version check that forces a reload.

---

## 13. Firestore rules lockdown sequence by collection

Principle: rules changes deploy **separately** from function deploys, one step at a time. Rules tests run against each step. Rollback goes to the **previous hardened rules**, never to pre-hardening rules.

| Step | Collections | Change | Prerequisite | Risk if skipped |
|---|---|---|---|---|
| R1 | `staffSessions`, `staffPinAttempts`, `emailOtpChallenges`, `pending_orders`, `terminal_payments` | Deny all client access (already local) | W1/W2 callables live | Low client impact; high security value |
| R2 | `restaurants/{id}/employees`, `.../private`; remove recursive restaurant subdocument grant | Deny client access | `listStaffDirectory` live + W3 client installed | PIN hash exposure (F8) |
| R3 | `menuItems`, `tables`, restaurant root **updates**, `work_days`, `payment_events`, raw `orders` restaurant reads | Deny client writes/reads as specified in Phase 1 | Menu/table/profile/work-day/report callables + W3 client | Platform-field tampering |
| R4 | `customers` field allowlist; restaurant create allowlist; legacy `otp_codes` deny | Field-level rules | Profile flows verified on device | F1 financial fields |
| R5 | `kitchen_orders`, `parties`, `shared_baskets`, `checkIns`, `baskets`, `reservations`, `reservationWaitlist` | Staff direct reads denied; customer reads narrowed to membership/ownership | All staff screens on callables (done locally) **plus** customer read paths inventoried and either callable-backed or rule-scoped; min-version raised | Staff data readable by modified clients |
| R6 | Restaurant root **reads**: public projection split; `browserTableSessions`; storage rules | Protected fields not publicly readable; storage verified | B-12 projection live; storage rules inventoried | Entitlement/fee/test-mode exposure |

Each step records: rules diff, test output against testing, the compatibility matrix row, and deploy timestamp.

---

## 14. Phase 1 testing-lane deployment sequence

All waves target `scervmvp-testing` only. Each wave: deploy → smoke → targeted QA → record → next.

| Wave | Contents | Must not include | Exit check |
|---|---|---|---|
| W0 | Baseline: A-06 verified production baseline source (A-08) | Any hardening | Baseline smoke passes |
| W0.5 | Node 22 runtime-only (§9) | Code changes | Smoke + bcrypt PIN + Stripe test payment |
| W1 | Additive callables: directory, staff reads, profile/settings reads, `getStaffTerminalPaymentStatus`, `getCurrentWorkDayStatus`, admin guards (§11) | Rules changes; handler behavior changes | Old testing client still fully works |
| W2 | Hardened handlers: staff sessions, `restaurantAccess`, reservation/report policies, menu/table/profile mutations, gratuity validation, kitchen authorization, OTP vault, legacy rail fail-closed | Rules changes | New-client-only flows pass; old client behavior **recorded** (expected failures listed) |
| W3 | Testing-profile native build with credential wrapper, callables, min-version gate | — | B-07 staff device QA passes |
| W4 | Rules R1 → R2 → R3 → R4 (one per deploy) | Function changes | Rules tests against testing pass per step |
| W5 | Browser hosting build matching W2 backend | — | Browser QR → OTP → basket → send → pay (test mode) passes |

Production release of Phase 1 is a **separate plan** (D-06) and requires: Phase C exit or a founder decision to release Phase 1 alone, the min-version gate in stores, and signed approval.

---

## 15. Phase 2 prerequisites (browser + native ordering and payments)

### 15.1 Required before Phase C code starts

1. **State machines** committed, each with allowed transitions, owner, and writer (server only):
   - basket item: `draft → claimed → submitted(ticketId) → served → allocated(attemptId) → paid | voided`
   - kitchen ticket: `created → preparing → ready → served | cancelled` (monotonic)
   - checkout attempt: `created → provider_pending → succeeded | failed | expired`, with an allocation release rule
   - fulfillment: `payment_captured → outbox_pending → fulfilled | needs_attention`
   - table service session: one identity per table covering browser **and** native (resolves OQ-003)
2. **Invariants** written as testable statements:
   - one ticket per submitted item
   - one settlement per item
   - one fulfillment per payment
   - one reward entry per order
   - one invoice per order
   - a table cannot close with unpaid submitted items unless voided by an authorized staff action
3. **Channel coverage matrix:** every invariant × {native guest, browser guest, staff entry, Terminal, webhook, scheduled job}. No blank cells.
4. **Single fulfillment authority:** decide whether the webhook alone fulfills, or `syncBrowserCheckoutSession` may also fulfill through the same idempotent outbox claim. Record as a D-entry.
5. **Versioning:** risky changes ship as new callable names (`...V2`) per `environment-lanes.md`. The old version stays until the matrix shows no callers.
6. **Test harness:** an emulator-based concurrency harness (≥6 parallel callers) and a Stripe test-mode webhook replay tool (duplicate, reordered, delayed).

### 15.2 Phase C acceptance tests (must pass at T)

- Native and browser submit the same items concurrently → exactly one ticket per item.
- Guest add during staff entry during pacing release → no lost additions.
- Native pay retried after timeout / app restart → one settlement.
- Two payers select overlapping items → second allocation rejected.
- Browser Checkout: webhook before sync, sync before webhook, both simultaneously, webhook ×3 → one order, one reward entry, one invoice.
- Crash injected after capture and before the outbox write, and after the outbox write and before the ticket → recovery with no duplicates.
- Browser guest sends items and never pays → items visible on the staff check; closeout requires a payment or authorized void.
- Refund of a paid order → reward reversal and ledger entries correct.

---

## 16. Evidence required before pilot restaurant rollout

The founder signs go/no-go only when every item has an attached artifact.

| # | Evidence | Level |
|---|---|---|
| E-01 | Production inventory and rules/source diff (A-06) | P (read-only) |
| E-02 | Node 22 running in production **or** a scheduled approved runtime deploy before decommission | P |
| E-03 | F11 revocation confirmation | Provider |
| E-04 | God-mode writes disabled in production config of the release candidate | T + release config |
| E-05 | Min-version gate live in store builds; compatibility matrix signed | Store + T |
| E-06 | Phase 1 staff device QA script, signed | D |
| E-07 | Rules R1–R6 tests passing against testing | T |
| E-08 | Phase C acceptance tests (§15.2) passing against testing | T |
| E-09 | Stripe test-mode reconciliation report clean | T |
| E-10 | Physical Terminal QA pass | D |
| E-11 | Full-shift QA script for one restaurant (browser + native mix) | D |
| E-12 | Alert drill showing alerts fire and reach an owner | T |
| E-13 | Restore drill with measured duration | Non-prod |
| E-14 | Restaurant fallback drill | OPS |
| E-15 | Independent payment/security review notes, dispositioned | REV |
| E-16 | Production release plan with waves, rollback and feature-disable steps | Signed |
| E-17 | Named on-call/support person for pilot service hours | FDR |
| E-18 | Pilot expectations document reviewed by ACQ (no capacity/offline claims) | ACQ |

---

## 17. Decision log format

File: `docs/hardening/decision-log.md`. Append-only; corrections are new entries that reference the old ID.

```markdown
### D-### — <short title>
- Date: YYYY-MM-DD
- Decided by: <name/role>   (production decisions: founder required)
- Context: <1–3 sentences, link to task/OQ>
- Decision: <what was decided>
- Alternatives rejected: <brief>
- Risk accepted: <explicit, or "none">
- Evidence: <links/commit SHAs/test output>
- Reversal trigger: <what would make us revisit>
- Supersedes: <D-### or none>
```

Seed entries:

- **D-001** This plan governs sequencing; the stop list is in effect.
- **D-002** Stripe is the only supported rail; PayPal and dLocal stay fail-closed until a new design is approved.
- **D-003** Production deploys require a signed founder approval entry per deploy.
- **D-004** Backward-compatibility policy (§12), *pending approval*.
- **D-018** Local B-10 ownership hardening may proceed while A-08 is blocked.

---

## 18. Open questions format

File: `docs/hardening/open-questions.md`.

```markdown
### OQ-### — <question>
- Raised: YYYY-MM-DD by <who>
- Owner to answer: <role>
- Blocks: <task IDs>
- Needed by: <date or gate>
- Answer: <empty until answered>
- Closed: YYYY-MM-DD → D-### (if it produced a decision)
```

Seed questions:

| ID | Question | Owner | Blocks |
|---|---|---|---|
| OQ-001 | Are real restaurants/payments live in production today? | FDR | A-09, containment |
| OQ-002 | Must browser guests pay before items are sent, or before leaving? Walkout policy? | FDR + OPS | C-08 |
| OQ-003 | Can a browser session and a native party share a table? Whose check wins? | FDR | C-09, §15.1 |
| OQ-004 | Active production installs by app version? | ENG | §12 step 6 |
| OQ-005 | Confirmed Node 20 decommission date? | ENG | §9 |
| OQ-006 | Have inactive PayPal/dLocalGo provider credentials been revoked or deleted? | FDR | §10 |
| OQ-007 | Which Stripe Connect model is live: destination charges or separate charges + transfers? | FDR + ENG | C-05 |
| OQ-008 | Acceptable KDS latency for pilot, and the current poll intervals? | OPS + ENG | B-17 |
| OQ-009 | Is DGI invoicing live? Which environment emits to which authority endpoint? | FDR | C-07 |
| OQ-010 | Does production need god-mode reads/writes at all? | FDR | §11 |
| OQ-011 | Who is the independent payment/security reviewer? | FDR | C-12, E-15 |
| OQ-012 | Is Terminal in pilot scope? Is pacing in pilot scope? | FDR + OPS | B-08, P-08 |
| OQ-013 | PITR/backup currently enabled in production? | ENG | D-04 |

---

## 19. Session start checklist

Run at the start of every engineering or AI-assisted session.

- [ ] Read this plan's task table and the last 3 decision-log entries.
- [ ] State the **one** task ID being worked on. If it isn't in the table, stop and add it (with dependencies) first.
- [ ] Confirm the task's dependencies are `Done` or explicitly waived by a D-entry.
- [ ] Confirm the working branch/worktree and `git status`. Note any uncommitted work you did not create.
- [ ] Confirm the target Firebase project explicitly (`dev` or `testing`). Production is never a session default.
- [ ] Check the stop list (§6) for conflicts.
- [ ] Note the evidence level the task will produce (L/T/D/P).
- [ ] Check open questions that block this task.

---

## 20. Session closeout checklist

- [ ] Update the task status, using the exact status vocabulary.
- [ ] Record evidence: commands run, pass/fail counts, commit SHA, deploy target and timestamp (if any).
- [ ] State the evidence level honestly (L/T/D/P). Never upgrade it by inference.
- [ ] List newly discovered defects or risks as new tasks or OQs, not as prose buried in a results doc.
- [ ] Update the compatibility matrix if a callable, rule or client contract changed.
- [ ] Record any decision made during the session in the decision log.
- [ ] Confirm no stray emulator processes remain, and no secrets appear in output or commits.
- [ ] Write a 5-line handoff: what changed, evidence, deploy status, risks, next task ID.

---

## 21. Rules to prevent AI or engineering drift

1. **One task ID per session.** Work outside the current task is noted as a new task, not done.
2. **The task table is the single source of status.** Results docs link to task IDs; they do not declare phase completion.
3. **No evidence upgrade by inference.** "Tests pass" means L. Deployed to testing means T. Only a device run makes it D. Only production verification makes it P.
4. **Never write "production-ready", "secure", "scales to N" or "fixed"** without the evidence level attached.
5. **No new endpoints, collections or feature flags** without an authority-matrix row and a rules decision in the same change.
6. **No speculative refactors.** Changes stay within the files the task requires. Consolidation (F16) happens only where an invariant needs it.
7. **Assumptions are written down.** If a doc doesn't say it, it's an OQ, not a fact.
8. **Stop on contradiction.** If two docs disagree (for example, listener vs polling, compatibility vs fail-closed), open an OQ and resolve it before building on either side.
9. **The parking lot is binding.** Items leave it only through a D-entry.
10. **Production actions are never taken by an AI session**, and never without a signed founder approval entry for that specific deploy.
11. **Rollback never restores a known vulnerability by default.** Prefer a feature-disable flag, a versioned endpoint, or the previous *hardened* state.
12. **Every money or order change names its channels** (native, browser, staff, Terminal, webhook, job) and its idempotency key. If any channel is missing, the change is incomplete.
13. **Secrets are never printed, pasted or committed.** Verification uses provider dashboards, not live calls with suspect credentials.
14. **Stale docs are defects.** When a status changes, update the plan in the same session or file a task to do it.
15. **External AI plans are inputs, not authority.** Claude, Codex or any other AI-generated plan must be reconciled against source, deployed state, founder decisions and this task table before it changes execution.
