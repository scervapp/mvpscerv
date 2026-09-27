# F11 credential triage report

Task: A-10 / F11
Status: Engineering cleanup done locally; provider rotation still required
Date: 2026-09-27
Deploy status: None

## Scope

This report inventories credential exposure without printing secret values. Commands reported file paths, line numbers, commit IDs and Secret Manager secret names only.

## Local tracked-source findings

| Item | Finding |
| --- | --- |
| `functions/test.js` | Tracked file exists. Pattern scan found PayPal/client/secret references at line numbers only. No values printed. |
| `functions/.env` | Tracked file exists. Pattern scan found PayPal and dLocal references at line numbers only. No values printed. |
| `src.zip` | Tracked archive exists and appears in PayPal/dLocal tracked-file search results. Contents were not extracted during this task. |
| `.gitignore` | Ignores `.env*.local`, but not `.env`; ignores credential/service-account files, but not `src.zip`. |
| Git remote | `https://github.com/scervapp/mvpscerv.git` |
| Current branch | `codex/browser-ordering-mvp` |

## Commit exposure

| File | Introduced / observed commits |
| --- | --- |
| `functions/test.js` | `016e56f` — `setting up paypal` |
| `functions/.env` | `016e56f` — `setting up paypal` |
| `src.zip` | Observed in history around `08b50f6`, `90a3bc1`, `cff2bac` — `Added Pickup Window Workflow and made numberous bug fixes` |

## Secret Manager name inventory

Evidence file: `docs/hardening/evidence/secret-name-inventory.json`

Secret values were not accessed.

| Project | Result |
| --- | --- |
| `scervmvp-dev` | 15 secret names listed, including Stripe, Resend, PayPal sandbox and dLocal sandbox/live naming families |
| `scervmvp-testing` | Secret listing returned `403 Forbidden` because Secret Manager API is disabled for the testing project; this is not evidence of no secrets |
| `scervmvp` | 24 secret names listed, including Stripe, Resend, PayPal, dLocal and the email extension SMTP password naming families |

## Current interpretation

F11 is broader than a single PayPal sandbox key. The repo has tracked credential-bearing surfaces: `functions/.env`, `functions/test.js` and `src.zip`. PayPal and dLocalGo are inactive payment workflows for the MVP per D-011. Because they are inactive, the preferred provider action is revocation/deletion rather than long-term rotation/maintenance.

Stripe and Resend secrets exist in Secret Manager by name, but this task did not prove their values were exposed in tracked source. Because `src.zip` is a tracked archive and was not extracted in this task, a full secret scan should treat Stripe, Resend, PayPal and dLocal as requiring provider-side review.

## Required founder/provider actions

- Revoke/delete PayPal sandbox/live credentials and apps shown in provider dashboards unless there is a separate non-Scerv reason to keep them.
- Revoke/delete dLocal/dLocalGo sandbox/live credentials and apps if they correspond to Scerv-created provider assets.
- Review Stripe and Resend dashboards for exposed keys if `src.zip` or any prior archive may contain live env/config material.
- Capture provider-side proof of revocation/rotation without pasting secret values into chat or docs.

## Engineering next steps

- Keep `functions/test.js`, `functions/.env` and `src.zip` removed from the repo.
- Keep ignore rules for `.env`, `.env.*`, `*.zip` and other generated archives.
- Use `npm run security:secret-scan` as the local pre-commit/release check.
- Keep the GitHub `Secret hygiene` workflow active so pull requests and release/hardening branch pushes run the scanner.
- Enable Secret Manager API for `scervmvp-testing` before testing-lane deployment work needs secret inventory or secret-backed functions.
- Keep inactive PayPal and dLocal/dLocalGo exports fail-closed until a new payment-rail design is approved.

## Guardrail added

`scripts/check-secret-hygiene.js` checks tracked files only and prints paths/rules without printing values. Current expected failure:

- None. After local removal of `functions/.env`, `functions/test.js` and `src.zip`, `npm run security:secret-scan` passes.

## Local cleanup completed

- Removed `functions/.env` from the working tree.
- Removed `functions/test.js` from the working tree.
- Removed `src.zip` from the working tree.
- Added `functions/.env.example` with empty placeholder names only.
- Added `.github/workflows/secret-hygiene.yml`.
- Added `.gitignore` coverage for `.env`, `.env.*` and generated archives.
- Added local fail-closed export overrides for PayPal and dLocal/dLocalGo handlers.
- Added `tests/unit/inactive-payment-rails.test.cjs` to guard those overrides.

## Validation after inactive-rail containment

| Command | Result |
| --- | --- |
| `npm run test:functions` | Pass: 6 unit tests |
| `npm.cmd --prefix functions run lint` | Pass |
| `npm run ci:backend` | Pass: secret scan, functions lint, 6 unit tests and 5 Firestore rules tests |
