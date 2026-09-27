# Deployed state inventory

Purpose: read-only record of what is actually deployed before hardening changes move to dev, testing or production. Do not infer deployed state from local source files.

Status: inventory captured; parity gaps remain. Last updated 2026-09-27T03:40:10-04:00.

## Inventory rules

- Read-only commands only unless a task explicitly authorizes deployment.
- Do not print secrets.
- Record project alias and concrete project ID.
- Record command, timestamp, account if visible, and output summary.
- Production changes require a decision-log approval; this file is not approval.

## Projects

| Lane | Project ID | Inventory status | Notes |
| --- | --- | --- | --- |
| Development | `scervmvp-dev` | Function, hosting, database and rules inventory captured | Firestore has two releases; the app-targeted `(default)` database rules match local raw source, but the named `default` database does not |
| Testing | `scervmvp-testing` | Function, hosting, database and rules inventory captured | No deployed functions found; Firestore rules text matches production, not current local source |
| Production | `scervmvp` | Function, hosting, database and rules inventory captured | Production Firestore rules text does not match current local source; live payment status still founder-owned |

## Local configuration snapshot

| Item | Current source value | Risk / note |
| --- | --- | --- |
| Firebase CLI | `13.35.1` | CLI emits `punycode` deprecation warning; not a blocker |
| `.firebaserc` default | `scervmvp` | Production remains the default alias in main workspace; A-05 must remove prod default/fail closed before deploy work |
| Main workspace Functions runtime | `functions/package.json` -> Node `20` | Hardening worktree has Node `22`; deployed projects still mostly Node `20` |
| Local Firestore rules SHA256 | Raw file: `D8C62D7C711AB353A8803661E90A082FFE2B4256FC5C62A068431A88D79D9E47`; Firebase comparable marker + file hash: `1DE384003278C126824BED7689790827F01D722DECB2BA5D15B60B96A6328607` | Raw-file hash compares to evidence files; comparable hash compares to the Rules API source payload |
| Local Storage rules source | No root `storage.rules` file found | Storage rules parity cannot be claimed from this workspace until the source file location is identified or recreated |
| Firebase config targets | Production hosting targets: `admin-scerv-com`, `scerv-com`, `scervmvp`, `mobile` | Dev/testing hosting targets are not configured in `.firebaserc` targets |

## Firestore databases

| Lane | Database(s) returned by read-only inventory | PITR | Notes |
| --- | --- | --- | --- |
| Development | `(default)` in `nam5`, created `2026-06-12T16:46:40.727243Z`; named database `default` in `us-central1`, created `2026-06-11T20:12:05.091828Z` | Disabled on both | App/admin/web configs use default SDK calls without a custom database ID, so Scerv clients target `(default)` unless code is explicitly changed |
| Testing | named database `default` in `us-central1`, created `2026-06-11T20:12:07.327123Z` | Disabled | Testing database shape differs from production because production uses `(default)` |
| Production | `(default)` in `nam5`, created `2024-04-24T11:00:06.347672Z` | Disabled | Production Firestore PITR is currently disabled, answering the inventory portion of OQ-013 but not the restore-drill decision |

## Functions

| Lane | Function count | Runtime(s) | Region(s) | Source/deploy ref | Inventory timestamp | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| Development | 174 | `nodejs20`: 174 | `us-central1` | Source/deploy hash varies by function; summary from `firebase functions:list --project scervmvp-dev --json` | 2026-09-27 | Browser table functions are present in dev; no Node 22 functions found |
| Testing | 0 | none | none | Summary from `firebase functions:list --project scervmvp-testing --json` | 2026-09-27 | Testing lane currently has no deployed functions; not yet a proving lane |
| Production | 134 | `nodejs20`: 133; `nodejs22`: 1 | `us-central1` | Summary from `firebase functions:list --project scervmvp --json` | 2026-09-27 | Only Node 22 function is the Firestore Send Email extension `ext-firestore-send-email-myyv-processqueue`; application functions are Node 20 |

## Deployed rules evidence

Deployed rule text was captured read-only into `docs/hardening/evidence/deployed-rules/`. The manifest is `docs/hardening/evidence/deployed-rules/manifest.json`.

| Lane | Evidence files captured | Notes |
| --- | ---: | --- |
| Development | 3 | Firestore `(default)`, Firestore named `default`, Storage |
| Testing | 1 | Firestore only; no storage release returned |
| Production | 2 | Firestore `(default)`, Storage |

## Firestore rules

| Lane | Rules source hash/ref | Deployed hash/ref | Matches reviewed source | Inventory timestamp | Notes |
| --- | --- | --- | --- | --- | --- |
| Development | Local raw SHA256 `D8C62D7C711AB353A8803661E90A082FFE2B4256FC5C62A068431A88D79D9E47`; comparable SHA256 `1DE384003278C126824BED7689790827F01D722DECB2BA5D15B60B96A6328607` | `cloud.firestore`: ruleset `fc7edaa8-e780-49c6-949a-df7d4f0af500`, created `2026-06-11T20:12:54.313120Z`, comparable SHA256 `1DE384003278C126824BED7689790827F01D722DECB2BA5D15B60B96A6328607`, raw evidence SHA256 `D8C62D7C711AB353A8803661E90A082FFE2B4256FC5C62A068431A88D79D9E47`; `cloud.firestore/default`: ruleset `38742a7f-22f1-4595-81ae-a0a5e6374cb9`, raw evidence SHA256 `ECF30F940747DCC3C5BA4993093E9A11AC9FC5DF7E14B2A1512D2446923D84EB` | App database: yes; named `default` database: no | 2026-09-27 | `cloud.firestore` maps to the normal `(default)` database used by current app/admin/web SDK configs. `cloud.firestore/default` maps to the separate named database `default` and remains non-matching |
| Testing | Local raw SHA256 `D8C62D7C711AB353A8803661E90A082FFE2B4256FC5C62A068431A88D79D9E47`; comparable SHA256 `1DE384003278C126824BED7689790827F01D722DECB2BA5D15B60B96A6328607` | `cloud.firestore`: ruleset `be11c93d-01ef-4379-bd45-2fb99a2e6842`, created `2026-06-11T20:12:49.550115Z`, comparable SHA256 `06C637988CD29E2AAE859FD539642B8A018A5C943A2D2C992D1C3E2A3BEEC427`, raw evidence SHA256 `36FA8E530F6257C531211E9CB1ED088737611D630DC5DEED0DA1CB49137A77E0` | No | 2026-09-27 | Testing rules text matches production, not current local rules source |
| Production | Local raw SHA256 `D8C62D7C711AB353A8803661E90A082FFE2B4256FC5C62A068431A88D79D9E47`; comparable SHA256 `1DE384003278C126824BED7689790827F01D722DECB2BA5D15B60B96A6328607` | `cloud.firestore`: ruleset `750b0aec-d264-4eb6-9377-43efcf4e2dd4`, created `2024-04-24T11:00:13.859252Z`, comparable SHA256 `06C637988CD29E2AAE859FD539642B8A018A5C943A2D2C992D1C3E2A3BEEC427`, raw evidence SHA256 `36FA8E530F6257C531211E9CB1ED088737611D630DC5DEED0DA1CB49137A77E0` | No | 2026-09-27 | Production Firestore rules text matches testing, not current local rules source |

## Storage rules

| Lane | Local source hash/ref | Deployed hash/ref | Matches reviewed source | Inventory timestamp | Notes |
| --- | --- | --- | --- | --- | --- |
| Development | No root `storage.rules` found | `firebase.storage/scervmvp-dev.firebasestorage.app`: ruleset `17106fa3-86c2-406e-99d0-76852400e090`, created `2026-06-13T02:22:06.722386Z`, comparable SHA256 `66AFD92F95F654F725B821F0F3FAB73AFDE062ED4B7710DF855AD4201FD2F7C8`, raw evidence SHA256 `291333526E97D505549F4D82B7F3F879DD2E8EBF4A9E0626021FF6CF7B1EF039` | Unknown | 2026-09-27 | Deployed text captured; need locate intended storage rules source before any storage deploy |
| Testing | No root `storage.rules` found | No storage releases returned | Unknown | 2026-09-27 | Testing has no deployed storage release in this inventory |
| Production | No root `storage.rules` found | `firebase.storage/scervmvp.appspot.com`: ruleset `07dc92c6-5689-4fc0-bb07-138eb35e4c66`, created `2024-04-25T07:02:15.914808Z`, comparable SHA256 `C817D7092A78F0122DDFBCD9FCCFF3D873AD0E788DA18AE0C6BEA5A9FC87E50D`, raw evidence SHA256 `69601EEA68483ED002E4397A47CB10AFA9B3C7378D70F0FFB2946FBB639D91B0` | Unknown | 2026-09-27 | Deployed text captured, but production storage rules cannot be compared to local source yet |

## Hosting

| Lane | Site/channel | Deployed version/ref | Inventory timestamp | Notes |
| --- | --- | --- | --- | --- |
| Development | `scervmvp-dev` -> `https://scervmvp-dev.web.app` | Live channel exists; no release object returned | 2026-09-27 | Channel create/update time `2026-06-11T20:13:43.940252702Z` |
| Testing | `scervmvp-testing` -> `https://scervmvp-testing.web.app` | Live channel exists; no release object returned | 2026-09-27 | Channel create/update time `2026-06-12T01:17:36.570322845Z` |
| Production | `admin-scerv-com` -> `https://admin-scerv-com.web.app` | Version `b6ca154c4bcf3439`; released `2026-08-31T15:22:30.628Z`; release `1788189750628000`; 17 files; 1,600,316 bytes | 2026-09-27 | Deployed by `scervapp@gmail.com` |
| Production | `scerv-com` -> `https://scerv-com.web.app` | Version `f9159eda0aa3810d`; released `2026-09-23T11:57:14.283Z`; release `1790164634283000`; 33 files; 15,600,484 bytes | 2026-09-27 | Deployed by `scervapp@gmail.com` |
| Production | `scerv-mobile-assets` -> `https://scerv-mobile-assets.web.app` | Version `7a5204a09204ef98`; released `2026-02-26T02:23:05.991Z`; release `1772072585991000`; 6 files; 4,144 bytes | 2026-09-27 | Deployed by `scervapp@gmail.com` |
| Production | `scervmvp` -> `https://scervmvp.web.app` | Version `3e6a180c26550d28`; released `2026-09-23T11:55:06.435Z`; release `1790164506435000`; 33 files; 15,600,484 bytes | 2026-09-27 | Deployed by `scervapp@gmail.com` |

## Payment/live-use summary

| Question | Answer | Evidence | Owner | Date |
| --- | --- | --- | --- | --- |
| Are production restaurants taking real payments? | No current live restaurants. Firestore shows no live/accepting-payment restaurants and zero canonical orders; founder confirmed no live restaurants today | `docs/hardening/production-live-usage-report.md`; D-007 | Founder/Engineering | 2026-09-27 |
| Are live Stripe charges occurring? | No current live restaurant exposure per founder; Firestore has historical payment-attempt records that require Stripe reconciliation before cleanup | `docs/hardening/evidence/production-live-usage-inventory.json`; D-007 | Founder/Engineering | 2026-09-27 |
| Is Terminal used in production? | Unknown |  | Founder/Operations |  |

## Phase A findings so far

- Production application functions are still on Node 20. Runtime migration cannot be treated as done because only the email extension is already Node 22.
- The testing Firebase project currently has no deployed functions, so it cannot validate hardening behavior until a baseline is deliberately deployed there.
- Main workspace `.firebaserc` defaults to production. A-05 should run before any deploy workflow work.
- Firestore deployed-rule metadata and hashes were retrieved through the Firebase Rules API via local Firebase CLI auth helpers because Firebase CLI 13.35.1 does not expose `firestore:rules:get`.
- Production and testing Firestore rules do not match the current local Firestore rules source hash. Development's app-targeted `(default)` database rules match the current local comparable hash, while the separate named `default` database does not.
- Storage rules are deployed in production and development, but no local root `storage.rules` file was found. Storage rules source control is therefore unresolved.
