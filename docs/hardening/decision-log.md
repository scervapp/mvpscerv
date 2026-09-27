# Scerv hardening decision log

Append-only record for release-readiness decisions. Corrections are new entries that reference the old decision ID.

## Format

```markdown
### D-### — <short title>
- Date: YYYY-MM-DD
- Decided by: <name/role>
- Context: <1-3 sentences, with links to task IDs or open questions>
- Decision: <what was decided>
- Alternatives rejected: <brief>
- Risk accepted: <explicit, or "none">
- Evidence: <links/commit SHAs/test output>
- Reversal trigger: <what would make us revisit>
- Supersedes: <D-### or none>
```

### D-001 — Adopt release-readiness master plan
- Date: 2026-09-27
- Decided by: Founder
- Context: External Claude review identified drift risk, local-only hardening risk, browser/payment concurrency risk and missing release gates. The founder approved installing a master plan to control execution.
- Decision: `docs/hardening/release-readiness-master-plan.md` governs sequencing, gates and anti-drift rules for hardening work.
- Alternatives rejected: Continue with informal "next task" execution.
- Risk accepted: The plan may need updates as deployed state is inventoried.
- Evidence: `docs/hardening/release-readiness-master-plan.md`
- Reversal trigger: Founder replaces this plan with a signed successor.
- Supersedes: none

### D-002 — Stripe-only payment rail for MVP hardening
- Date: 2026-09-27
- Decided by: Founder/Engineering
- Context: PayPal and dLocal are not current MVP payment rails, and inactive payment paths create unacceptable blast radius if callable.
- Decision: Stripe remains the only supported payment rail for current MVP hardening. PayPal and dLocal stay disabled/fail-closed until a new server-priced design and compliance review are approved.
- Alternatives rejected: Leave dormant payment rails callable because they are hidden from the UI.
- Risk accepted: Panama/Jamaica or other non-Stripe rail expansion is deferred.
- Evidence: `docs/hardening/phase-1-results.md`, `docs/hardening/exported-endpoint-authority-matrix.md`
- Reversal trigger: Founder approves a regional payment rail design with server pricing, provider confirmation, webhook replay handling and reconciliation tests.
- Supersedes: none

### D-003 — Production deploys require explicit founder approval
- Date: 2026-09-27
- Decided by: Founder
- Context: Hardening changes affect auth, rules, payments, admin controls and app compatibility.
- Decision: No production deploy of functions, rules, hosting, storage, native builds or data migrations happens without a specific founder approval record.
- Alternatives rejected: Treat dev/testing approval as implied production approval.
- Risk accepted: Slower release cadence.
- Evidence: `docs/hardening/release-readiness-master-plan.md`
- Reversal trigger: Founder defines a new release authority process.
- Supersedes: none

### D-004 — Backward compatibility policy pending approval
- Date: 2026-09-27
- Decided by: Pending founder approval
- Context: Phase 1 intentionally makes unsafe old client behavior fail closed, which conflicts with ordinary backward compatibility.
- Decision: Proposed policy: non-security changes preserve backward compatibility; security fixes may break old clients only with a shipped minimum-version gate and compatibility matrix.
- Alternatives rejected: Keep vulnerable compatibility forever; break old clients without a clear update path.
- Risk accepted: Pending.
- Evidence: `docs/hardening/release-readiness-master-plan.md`
- Reversal trigger: Founder chooses a different compatibility policy.
- Supersedes: none

### D-005 — Begin Phase A freeze and baseline
- Date: 2026-09-27
- Decided by: Founder
- Context: Founder instructed engineering to move forward with Phase A after installing the release-readiness master plan.
- Decision: Phase A is active. The stop/do-not-start list in `docs/hardening/release-readiness-master-plan.md` §6 is in force. New feature work is parked until the plan allows it, and work proceeds task-by-task through Phase A.
- Alternatives rejected: Continue broad hardening or feature work without a task ID.
- Risk accepted: Execution slows down while deployed state, runtime, credentials and release gates are verified.
- Evidence: `docs/hardening/release-readiness-master-plan.md` task A-01 marked `Done`.
- Reversal trigger: Founder pauses or replaces the release-readiness master plan.
- Supersedes: none

### D-006 — Node 20 runtime schedule confirmed
- Date: 2026-09-27
- Decided by: Engineering
- Context: A-11 required rechecking the provider runtime schedule instead of relying only on the original assessment.
- Decision: Google Cloud runtime documentation lists Node.js 20 deprecation on 2026-04-30 and decommission on 2026-10-30. It lists Node.js 22 deprecation on 2027-10-31 and decommission on 2028-04-30. Node 22 migration remains schedule-critical.
- Alternatives rejected: Treat the assessment's date as unverified or defer runtime planning until Phase 1 deploy.
- Risk accepted: Provider schedules can change; recheck before production migration.
- Evidence: Google Cloud Functions runtime docs: `https://docs.cloud.google.com/functions/docs/runtime-support`; Google Cloud Run functions runtimes: `https://docs.cloud.google.com/run/docs/runtimes/function-runtimes`; `docs/hardening/deployed-state-inventory.md`
- Reversal trigger: Google changes the published runtime schedule.
- Supersedes: none

### D-007 — Production currently has no live restaurants
- Date: 2026-09-27
- Decided by: Founder
- Context: A-07 asked whether production has real restaurants or payment activity before hardening work moves toward testing and pilot gates. Firestore aggregate inventory showed no live restaurant, no restaurant accepting payments and no canonical orders. The founder confirmed there are currently no live restaurants, with the first live restaurant expected next week.
- Decision: Treat production as pre-live for immediate containment purposes. A-09 emergency production containment is not required today, but pilot-readiness work is time-sensitive because the first live restaurant is expected next week.
- Alternatives rejected: Assume production has live operational exposure despite founder confirmation; ignore historical payment-attempt records.
- Risk accepted: Historical production payment-attempt records still require reconciliation before cleanup, and Stripe/provider dashboard history has not been independently exported into this repo.
- Evidence: `docs/hardening/production-live-usage-report.md`; founder confirmation in chat on 2026-09-27.
- Reversal trigger: Any live restaurant signs, any real payment is processed, or Stripe/provider records show live charges.
- Supersedes: none

### D-008 — Allow A-05 deploy guard before branch preparation
- Date: 2026-09-27
- Decided by: Founder/Engineering
- Context: A-05 originally depended on A-02, but the founder asked to continue Phase A and the next practical risk reducer was fail-closed Firebase project selection. This change is local-only and does not deploy, mutate cloud state or alter application behavior.
- Decision: Proceed with A-05 before A-02. Remove production as the default Firebase project, require explicit deploy targets and require `CONFIRM_PROD_DEPLOY=scervmvp` for production deploy scripts and configured Firebase predeploy hooks across functions, Firestore rules and hosting.
- Alternatives rejected: Wait for A-02 before adding deploy guardrails; leave production as the default Firebase project while preparing testing-lane work.
- Risk accepted: Direct manual Firebase CLI commands for future surfaces not configured in `firebase.json` can still bypass package-level guard scripts, so operator discipline and production approval rules remain required. Storage remains blocked by missing reviewed source under OQ-015.
- Evidence: `docs/hardening/a-05-deploy-guard-report.md`; local guard command transcripts.
- Reversal trigger: Guard blocks an approved deploy path with no safe override, or CI/deploy workflow requires a different project-selection design.
- Supersedes: none

### D-009 — Remove tracked credential-bearing files locally
- Date: 2026-09-27
- Decided by: Engineering
- Context: A-10/F11 triage found tracked credential-bearing surfaces: `functions/.env`, `functions/test.js` and `src.zip`. Provider revocation remains required, but keeping the files in the working tree increased the chance of re-exposure.
- Decision: Remove those files locally, add a safe `functions/.env.example`, add `.gitignore` coverage for env/archive files and add local/CI secret hygiene scanning.
- Alternatives rejected: Wait for provider revocation before removing files from source; leave scanner disabled until cleanup was complete.
- Risk accepted: Git history still contains prior versions until provider revocation and any optional history-cleanup decision. Local removal does not revoke provider credentials.
- Evidence: `docs/hardening/f11-credential-triage-report.md`; `npm run security:secret-scan` passes after removal.
- Reversal trigger: A required runtime path depends on one of the removed files; in that case replace it with Secret Manager or an untracked local template, not a committed secret file.
- Supersedes: none

### D-010 — Replace Firebase PR preview deploy with build-only checks
- Date: 2026-09-27
- Decided by: Engineering
- Context: A-04 identified that the generated Firebase Hosting PR workflow called a missing root `npm run build` script and attempted a hosting preview deploy against production project `scervmvp`.
- Decision: Remove the PR preview deploy action for now and replace it with build-only checks for the public website and admin portal, plus the local secret hygiene scan.
- Alternatives rejected: Add a root build script while leaving the production-project preview deploy active; disable the workflow entirely.
- Risk accepted: Pull requests will not get automatic Firebase preview URLs until a testing/dev hosting preview lane is deliberately configured.
- Evidence: `docs/hardening/a-04-hosting-preview-workflow-report.md`.
- Reversal trigger: A safe non-production preview hosting target is configured and approved under the release-readiness plan.
- Supersedes: none

### D-011 — PayPal and dLocalGo are inactive payment workflows
- Date: 2026-09-27
- Decided by: Founder
- Context: A-10/F11 credential triage found historical PayPal and dLocal references in tracked source and Secret Manager names. The founder clarified that dLocalGo and PayPal are not current Scerv payment workflows.
- Decision: Treat PayPal and dLocalGo as inactive/retired for the MVP. Do not maintain, test or deploy those payment paths. Any future reintroduction requires a new founder-approved payment-rail design, server-priced checkout, provider confirmation, webhook/idempotency review and compliance review.
- Alternatives rejected: Keep inactive PayPal/dLocalGo workflows available because code exists; rotate credentials and continue carrying those paths as dormant options.
- Risk accepted: Regional payment expansion is deferred. Historical credentials may still need provider-side revocation/deletion because they were previously present in tracked files or provider configuration.
- Evidence: Founder confirmation in chat on 2026-09-27; `docs/hardening/f11-credential-triage-report.md`; D-002.
- Reversal trigger: Founder approves a new non-Stripe payment rail design.
- Supersedes: none

### D-012 — Allow A-03 CI scaffold before A-02 branch preparation
- Date: 2026-09-27
- Decided by: Engineering
- Context: A-03 originally depended on A-02, but the branch cannot produce useful CI evidence until the backend quality workflow and scripts exist. The work is local-only and does not deploy or mutate cloud state.
- Decision: Proceed with local A-03 CI scaffolding before A-02. Keep A-03 at `Fixed locally` until the branch is pushed and a GitHub PR run proves the workflow.
- Alternatives rejected: Wait for A-02 before creating the workflow; mark A-03 done from local command output alone.
- Risk accepted: GitHub branch protection and a real red-to-green PR run are still pending.
- Evidence: `docs/hardening/a-03-ci-gate-report.md`; `.github/workflows/backend-quality.yml`; `npm run ci:backend` local pass.
- Reversal trigger: GitHub Actions cannot run this workflow or the required check design changes.
- Supersedes: none

### D-013 — Push Phase A local hardening baseline branch and tag
- Date: 2026-09-27
- Decided by: Engineering
- Context: The founder asked to continue executing the release-readiness plan. A-02 requires a source-control baseline before hardening work can move toward testing-lane deployment.
- Decision: Commit and push the local Phase A hardening baseline to branch `codex/browser-ordering-mvp`, and create tag `hardening-phase1-local-20260927` at commit `7ddb8aa288d1e12c598ebfc5951a7691c81a6792`.
- Alternatives rejected: Keep the hardening baseline local-only; push unrelated workspace artifacts with the hardening commit.
- Risk accepted: GitHub CI evidence and required branch protection are still pending, so A-02 remains `In progress`.
- Evidence: `docs/hardening/a-02-branch-baseline-report.md`; pushed branch `codex/browser-ordering-mvp`; tag `hardening-phase1-local-20260927`.
- Reversal trigger: GitHub CI fails or the baseline must be rebuilt from a different source ref.
- Supersedes: none

### D-014 — Do not deploy current local source as the A-08 baseline
- Date: 2026-09-27
- Decided by: Engineering
- Context: A-08 requires a testing-lane deploy of the A-06 verified production baseline source. A-06 shows production/testing rules drift from local source, testing has no functions, and no exact production functions source ref is recorded.
- Decision: Do not deploy the current local branch to `scervmvp-testing` as A-08. Record A-08 as blocked until the source ref is identified or the founder approves a different baseline strategy.
- Alternatives rejected: Deploy current local source to testing and call it baseline; skip W0 and begin hardening deploys directly.
- Risk accepted: Phase A exit is delayed until the baseline source question is answered.
- Evidence: `docs/hardening/a-08-testing-baseline-blocker-report.md`; OQ-018.
- Reversal trigger: A production-parity source ref is identified or founder approves a non-production-parity baseline.
- Supersedes: none

### D-015 — Fail-close inactive PayPal and dLocal/dLocalGo exports locally
- Date: 2026-09-27
- Decided by: Founder/Engineering
- Context: Founder confirmed PayPal and dLocalGo are not active MVP payment workflows. A-10/F11 found that current source and production metadata still expose PayPal and dLocal/dLocalGo handlers.
- Decision: Keep legacy rail code available for future redesign, but override the exported PayPal and dLocal/dLocalGo handlers locally so they fail closed before touching provider APIs.
- Alternatives rejected: Leave inactive rails callable because the UI should not use them; delete all legacy rail code before a future regional payment design exists.
- Risk accepted: If an old client calls these rails after the change is deployed, it will receive a failed-precondition response and must use Stripe-supported paths.
- Evidence: `docs/hardening/f11-credential-triage-report.md`; `tests/unit/inactive-payment-rails.test.cjs`; `npm run ci:backend` passes locally.
- Reversal trigger: Founder approves a new non-Stripe payment-rail design with provider confirmation, server pricing, webhook replay/idempotency and compliance review.
- Supersedes: none
