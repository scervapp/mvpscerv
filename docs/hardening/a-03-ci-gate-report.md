# A-03 CI Gate Report

Date: 2026-09-27
Task: A-03 — CI: backend tests + emulator rules tests + lint required on PR
Evidence level: L (local validation only)
Deploy status: None

## Scope

A-03 installs a backend quality gate for pull requests. The gate is intentionally limited to backend safety surfaces:

- secret hygiene scan
- Cloud Functions lint
- backend unit tests
- Firestore emulator rules tests

No Firebase deploys were performed.

## Files changed

- `.github/workflows/backend-quality.yml`
- `package.json`
- `package-lock.json`
- `tests/unit/backend-core.test.cjs`
- `tests/rules/firestore.rules.test.cjs`

## CI behavior

The new workflow runs on pull requests that touch functions, Firestore rules, tests, backend package files, secret hygiene scanning or the workflow itself.

The workflow steps are:

1. install root dependencies with `npm ci`
2. install functions dependencies with `npm --prefix functions ci`
3. run `npm run ci:backend`

The `ci:backend` script runs:

```bash
npm run security:secret-scan
npm --prefix functions run lint
npm run test:functions
npm run test:rules
```

## Local validation

Passed:

- `npm run test:functions`
  - 4 backend unit tests passed.
- `npm run test:rules`
  - 5 Firestore emulator rules tests passed.
- `npm.cmd --prefix functions run lint`
  - ESLint passed.
- `npm run ci:backend`
  - secret hygiene passed
  - functions lint passed
  - 4 backend unit tests passed
  - 5 Firestore emulator rules tests passed

Notes:

- On Windows, the sandbox blocked Node module resolution with `EPERM` when running test commands. The same commands passed when run with elevated local execution.
- Firebase emulator runs left a Java process listening on port `8080` after completion. The process was stopped after validation.
- Firebase emitted the existing `punycode` deprecation warning during emulator startup. It did not fail the suite.

## Remaining A-03 evidence

A-03 is `Fixed locally`, not `Done`, until the branch is pushed and GitHub Actions produces a real PR run showing the backend quality gate passing. The repository also still needs branch protection configured so this check is required before merge.

## 2026-09-29 Update

The CI workflow source was refreshed for the current hardening lane:

- `.github/workflows/backend-quality.yml` now uses Node.js `22`, matching the Functions runtime used in testing.
- `.github/workflows/secret-hygiene.yml` now includes `codex/**` branch pushes, so secret hygiene is not limited away from the active hardening branch.

Local validation after the W1 callable work passed:

- `npm run ci:backend`
  - secret hygiene passed
  - functions lint passed
  - backend unit tests passed: `27` passed, `0` failed
  - Firestore emulator rules tests passed: `9` passed, `0` failed

A-03 remains `Fixed locally` until GitHub Actions produces a passing PR run and branch protection marks the backend quality gate as required.
