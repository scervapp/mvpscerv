# B-03 Minimum Version Gate Report

Date: 2026-09-27

Status: Fixed locally. Not deployed.

## Scope

B-03 adds the first local implementation of the minimum supported client version gate.

The policy source is:

- `appConfig/clientVersions`

Expected policy shape:

```json
{
  "enabled": true,
  "minNativeVersion": "0.0.44",
  "minNativeBuildIos": 34,
  "minNativeBuildAndroid": 36,
  "message": "Please update Scerv to continue.",
  "updateUrls": {
    "ios": "https://...",
    "android": "https://..."
  }
}
```

## Local Changes

- Added `src/components/AppVersionGate.js`.
- Wrapped the native app startup in `AppVersionGate`.
- Added `src/utils/clientVersionPolicy.js` for native version/build comparisons.
- Added `functions/clientVersionPolicy.js` for server-side version/build comparisons.
- Added `functions/clientVersionFunctions.js` and exported `checkClientVersion`.
- Added unit tests for server-side version policy.
- Added Firestore rules coverage proving `appConfig/clientVersions` is public-readable and client-write denied.

## Behavior

- If no policy exists, or `enabled` is `false`, the app starts normally.
- If the app cannot read the policy because of a transient error, startup is allowed rather than bricking devices.
- If the installed version/build is below the configured minimum, the user sees a blocking update screen.
- If an update URL is configured for the platform, the screen opens it.
- The callable `checkClientVersion` returns the current support result or throws `failed-precondition` with policy details when an update is required.

## Validation

- `node --check functions/clientVersionPolicy.js` passed.
- `node --check functions/clientVersionFunctions.js` passed.
- `node --check functions/index.js` passed.
- `npm.cmd --prefix functions run lint` passed.
- `npm run ci:backend` passed outside the sandbox after the sandbox runner hit a Windows EPERM path-resolution error. Result: secret scan passed, functions lint passed, 16 unit tests passed, 6 Firestore rules tests passed.

## Remaining Work Before Done

- Deploy to the testing lane only after A-08 is resolved or explicitly waived.
- Create `appConfig/clientVersions` in testing with a non-blocking policy first.
- Build/install a testing-profile app and capture the below-minimum update screen.
- Capture a server `failed-precondition` response from `checkClientVersion` or a hardened callable using the shared policy helper.
- Add the client compatibility matrix before any breaking rules cutover.
