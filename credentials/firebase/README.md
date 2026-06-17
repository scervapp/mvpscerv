# Firebase Credentials

Place non-production Firebase app config files in these folders:

```text
development/google-services.json
development/GoogleService-Info.plist
development-store/google-services.json
development-store/GoogleService-Info.plist
testing/google-services.json
testing/GoogleService-Info.plist
testing-store/google-services.json
testing-store/GoogleService-Info.plist
```

`development-store` is for TestFlight / Play internal builds that use the
production store bundle IDs while still pointing at the development Firebase
project. `testing-store` is reserved for the same setup against the testing
Firebase project once that project has billing and Firestore enabled.

These files are ignored by Git. Production keeps using the existing root-level Firebase files.
