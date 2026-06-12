# Environment Lanes

Use separate Firebase projects and app IDs so feature work cannot affect the App Store / Play Store build.

## Lanes

| Lane | Firebase alias | Firebase project | iOS bundle ID | Android package |
| --- | --- | --- | --- | --- |
| Development | `dev` | `scervmvp-dev` | `com.scerv.app.dev` | `com.scerv.eat.dev` |
| Testing | `testing` | `scervmvp-testing` | `com.scerv.app.testing` | `com.scerv.eat.testing` |
| Production | `prod` | `scervmvp` | `com.scerv.app` | `com.scerv.eat` |

The development and testing native Firebase apps have been registered in fresh Firebase projects.

## Required Firebase App Files

Create the dev and testing apps inside their matching Firebase projects, then download their config files here:

```text
credentials/firebase/development/google-services.json
credentials/firebase/development/GoogleService-Info.plist
credentials/firebase/testing/google-services.json
credentials/firebase/testing/GoogleService-Info.plist
```

Production continues to use the existing root files:

```text
google-services.json
GoogleService-Info.plist
```

## Builds

Development build:

```powershell
eas build --profile development --platform android
eas build --profile development --platform ios
```

Testing/internal QA build:

```powershell
eas build --profile testing --platform android
eas build --profile testing --platform ios
```

Production store build:

```powershell
eas build --profile production --platform android
eas build --profile production --platform ios
```

## Cloud Functions Deploys

Deploy functions to dev while building features:

```powershell
npm run deploy:functions:dev
```

Deploy to testing for QA:

```powershell
npm run deploy:functions:testing
```

Production deploys require an explicit confirmation:

```powershell
$env:CONFIRM_PROD_DEPLOY="scervmvp"
npm run deploy:functions:prod
```

## Safety Rules

- Keep production callable functions backward compatible with old store app versions.
- Add new function names for risky changes, for example `redeemRewardV1` before replacing checkout behavior.
- Add new Firestore fields/collections before removing or renaming old ones.
- Keep rewards and other large features behind remote flags until testing proves them.
