# Phase 1: financial boundaries, guest authorization and email OTPs

Updated September 27, 2026, America/New_York. Worktree: `hardening/phase-0-baseline`.

**Status: financial/guest authorization, email OTP, staff-session, confidential staff-read, reservation/report permission, menu-management, table-management, restaurant-root profile-update, Restaurant Profile read-migration, pending-order server-only boundary, legacy alternate payment-rail fail-closed boundary, terminal-payment status-read, work-day status-read, service-request queue read-boundary, KDS screen read-migration, active-tables read-migration, Manage Party read-migration, table-order detail read-migration, Table Management operational-overlay read-migration, Manual Seating read-migration, restaurant operations pulse read-migration, operations badge hook read-migration, Pickup Queue read-migration, Host Stand read/write hardening, Reservation Operations read-migration, Menu Management read-migration, Reservation Settings read-migration, Rewards Settings read-migration and Back Office setup-status read-migration slices verified locally. Phase 1 remains in progress. No deployments, remote data edits, or real charges.**

## Changes and evidence

| Finding | Local repair | Verification / limit |
| --- | --- | --- |
| F4 unsafe gratuity | Shared integer-cent validation for native Stripe preparation, browser checkout, and legacy pending-order callable. Rejects negative, fractional, nonfinite, nonnumeric and >100,000-cent input. Browser alone defaults an omitted tip to zero. Native rejects unsupported payment types, invalid/duplicate item IDs. | Actual handler callbacks exercised with mocked boundaries: invalid values fail before database/provider access; zero/ordinary/max tips reach the next boundary. Not a completed Stripe charge test. Terminal tip calculation comes from provider data, not a client tip field, and was not changed. |
| F1 customer financial authority | Customer create/update field allowlist protects Stripe IDs, fee policy, rewards and unknown future fields, including addition/removal/nested mutation/replacement. Stripe helper verifies provider metadata (UID/environment, plus secondary ID if present) before updating/reusing a customer; native checkout always invokes it before exposing customer-scoped secrets. | Actual Firestore rules engine tests plus mocked provider ownership tests. Existing mappings missing matching metadata fail closed and require support reconciliation; existing data was not migrated or presumed clean. |
| F2 guest kitchen authorization | Derives restaurant, table and server from stored active party; checks authenticated membership, current table assignment, basket association, item/menu tenant ownership. Guest can send only their own items. Client table/server/order-entry-mode cannot override stored values. Legacy individual request resolves an owned accepted check-in to its party. | Actual handler with mocked routing/Firestore tests: strangers, forged owner IDs, stale/closed parties, foreign menus, legitimate members, pickups and sequential resend. Concurrent duplicate submission still reproduces (F5); authorization/table reads are not yet transactional with writes. Staff must use the separate staff order flow. |
| F8 restaurant financial authority | Restaurant create/update field allowlist permits profile edits but blocks platform entitlements, Stripe configuration, payment mode, fees and unknown financial fields. Profile form no longer resubmits the entire stored document. | Real rules tests exercise creation, nested edits, removal, whole-document replacement, allowed profile edits and unrelated tenant/worker rejection. This is the financial-write portion only; sensitive recursive reads and employee PIN-hash exposure remain open. |

Customer profile form also stopped spreading the entire stored customer record into its update. Legacy profile fields such as `isPhoneVerified` remain client-written for compatibility; they must not be treated as server identity proof. The allowlist protects financial fields, not every remaining legacy identity/session concern.

## Validation

- Backend unit/handler/import suite: **76 passed, 0 failed** after the legacy alternate payment-rail fail-closed slice.
- Firestore emulator suite: **39 passed, 0 failed, 0 TODO** after the latest pending-order server-only boundary slice.
- Known-issue suite: **1 passing F3 impersonation regression and 1 expected failing F5 TODO assertion** for duplicate kitchen tickets. F5 remains outstanding, not a passing security check.
- Backend ESLint and current-source credential-pattern scan: passed.
- Client syntax: 71 restaurant/context/component/utility JavaScript files parsed successfully, including JSX. No native build/device smoke test performed.
- Diff whitespace validation: passed.

Firestore test port moved to 18180 after the prior Windows emulator remained bound after reporting shutdown. Rules tests ran against the verified synthetic `demo-scerv-hardening` emulator only. Both leftover worktree-specific emulator processes were identified by full command line and stopped after validation.

## Release and compatibility gates

1. Resolve production rules/source drift and establish a working QA lane before release. These are local fixes, not production fixes.
2. Validate customer profile completion, phone login, restaurant profile save, reservation/reward settings, guest check-in, pickup, kitchen/bar, and normal zero-tip/tipped checkout on representative native/browser clients.
3. Review existing customer fee/rewards data and provider mappings: field restrictions do not retroactively prove previously client-writable values trustworthy. Reconcile mismatched Stripe metadata through a controlled support path; never simply relabel another customer's Stripe record.
4. Confirm legacy seating records have the party/table links required by the stricter submission boundary. Incomplete records fail closed. The shared basket must use the party ID as this endpoint's established storage key.
5. Validate modified profile clients alongside rules. Older clients that resend stale protected fields will now be denied rather than overwrite trusted configuration.
6. Keep the current $1,000 browser tip ceiling as the shared checkout policy for this slice; a different policy requires explicit review and matching client messaging.
7. Do not roll back to permissive financial writes as the standard recovery path. Restrict the affected operation while deploying a forward repair.

## Next Phase 1 slices / open blockers

- F3: core staff-session enforcement and restaurant-client propagation are implemented locally (see below). Full endpoint/direct-read coverage review, sensitive data migration and device QA remain release gates.
- F10: email OTP cryptography and atomic per-email controls are implemented locally (see below). Broader source/global abuse controls, provider-budget monitoring and an evidence-based App Check rollout remain open.
- F8 staff-read slice is now implemented locally: canonical employees/private records deny client access and selectors use a server-filtered directory. Service-request queue reads now use a verified staff callable with minimal output, Chef/Bar Q reads shaped prep tickets through a verified callable, Active Tables reads shaped party rows plus ready summaries through a verified callable, Table Management and Manual Seating derive occupied/dirty/ready overlays through that same verified staff path, the table-order detail modal uses a verified staff callable, Pickup Queue uses a verified pickup-only callable, Host Stand uses a verified front-floor callable, Reservation Operations uses a verified floor callable, Menu Management uses a verified manager callable, Reservation Settings uses a verified manager callable, Rewards Settings uses a verified manager callable, Back Office setup status uses a verified count-only manager callable, Restaurant Profile uses a verified editable-field manager callable, dashboard/nav operation badges use verified reservation and host-arrival callables, the shared restaurant operations pulse uses verified staff callables for badges/sounds, and Manage Party reads party/basket/reward/settings detail through a verified callable. Broader shared-login role boundaries, public restaurant-root contents, other operational reads and historical credential exposure still require review. See the latest entry below.
- **Additional observed concern now contained locally:** exported `createPendingOrder`, PayPal callables and dLocal callables/webhook are retired or fail-closed locally, and direct client reads/writes of `pending_orders` are denied. Installed-client/deployed usage is still unverified; QA must confirm checkout paths use server-priced Stripe preparation before release.
- F5 remains Phase 2: transactional item claiming, stable command/ticket IDs and retry recovery.

Phase 1 exit criteria have not been met. No load capacity or production-readiness claim follows from these tests.

## September 26: email OTP repair (F10 partial)

Implementation: `functions/emailOtp.js`, called by the existing `sendEmailOtp` and `verifyEmailOtp` handlers. Native and browser callers retain their existing email/code request and success/token response contracts. Browser purpose is informational and never grants authorization; both clients still perform the same email login.

- Uses Node cryptographic randomInt for six-digit codes and a random 32-byte salt. Stores a SHA-256 code digest, not the code itself. Hashing is defense in depth, not protection against offline brute force if the server vault is compromised.
- New server-only collection `emailOtpChallenges`, with a hashed normalized-email document ID. Existing catch-all rules deny all client reads/writes; actual rules tests cover anonymous, customer and tenant-owner clients. Hashed email identifiers are pseudonymous, not anonymized.
- Resend reservation and counters use Firestore transactions: 45-second cooldown and at most five sends per email in a 15-minute fixed window. Provider-delivery failure keeps its reservation and counts against limits.
- Verification expires at ten minutes, commits incorrect attempts atomically, and blocks after five incorrect attempts per issued code. A resend resets that challenge's attempt count but retains the send-window limit. These limits do not stop abuse distributed across many email addresses.
- Successful verification atomically marks the code consumed and clears the hash/salt BEFORE Firebase Auth lookup, account creation or token minting. Replay cannot mint a second token. An auth/provider failure after consumption requires a fresh code; availability cannot safely override one-use semantics.
- Inputs reject malformed email/code types and path separators. Internal verification errors return a generic client message.

Evidence: four handler/input unit tests cover request compatibility, throttling-before-delivery, consumption-before-token work, replay rejection, and provider-failure behavior. Five real emulator tests cover simultaneous send, simultaneous success, simultaneous wrong guesses, cooldown/window/expiry boundaries and replacement of an old challenge. Six concurrent requests were used in each race case; this verifies correctness under those races, not load capacity.

The first emulator run found a test-fixture reuse error (calling context.firestore() twice); corrected it and reran the full emulator suite successfully. CI's emulator job now installs functions dependencies because the transaction tests execute the actual backend helper using the Admin SDK. No live Resend delivery, Firebase Auth sign-in, device QA or cloud deployment was performed.

### OTP release gates

1. Deploy send and verify handlers together in the controlled QA/release workflow. Old plaintext `otp_codes` records are intentionally not accepted by the new verifier; users with an in-flight legacy code must request a new code. Mixed backend versions can interrupt login, so complete the paired rollout before opening QA traffic.
2. Exercise native signup/login and browser dining identity, including email delivery, incorrect/expired code, resend cooldown, throttling and successful token sign-in. Validate first-time Firebase Auth account creation and existing-account login against QA providers.
3. Verify deployed rules deny access to the new vault; production source/rules drift is still unresolved. Do not assume local rules are production rules.
4. Review cleanup/retention of both legacy plaintext OTP records and new expired vault records. No production records were deleted and no TTL policy was enabled. Do not delete live window counters to bypass throttling.
5. Add source/global abuse controls and provider spend alerts before claiming public-endpoint abuse resistance. App Check client registration/compatibility must be verified before enforcing it.
6. Prefer a forward repair or temporarily restricting OTP login over reverting to reusable, nontransactional verification.

Next bounded implementation after OTP was the staff-session slice documented below. Phase 1 remains open.

## September 26: verified staff sessions (F3 and PIN portion of F10)

### Implemented locally

- New `functions/staffSessions.js` validates Firebase authentication and restaurant scope before checking a PIN. Successful bcrypt verification issues a cryptographically random 256-bit bearer credential, with an eight-hour expiry. Only its SHA-256 digest is the server session document ID. The session stores restaurant, authenticated UID, employee ID and a digest of the current PIN hash; the raw credential is returned only to the client. Public profile output is an explicit allowlist, not a spread of the employee document.
- `restaurantAccess.js` requires that credential from the callable request body and resolves the current employee on each protected request. Merely choosing a manager's ID, omitting the ID to inherit the shared account's owner record, using another tenant/account or reusing an expired/revoked credential fails closed. Current role/job-title changes take effect on the next authorization check. Missing/inactive employee and changed PIN hash deny use. A later restoration of exactly the old credential/state is not permanent revocation; explicit session deletion is.
- Atomic per-employee PIN attempt reservations stop distributed concurrent guesses across restaurant accounts/devices after five outstanding/failed attempts in a 15-minute fixed window. Successful verification releases only its own reservation; it does not erase other failed attempts. Cross-tenant callers cannot consume this budget. Broader abuse/DoS limits still need work.
- Removed shared-owner account bypasses from work-day opening/closing and table-QR manager authorization. Retired the exported legacy `setEmployeeRole` callable with a fail-closed response; it previously changed Firebase claims using only the caller's claimed owner/manager role. No current source caller was found. Staff role changes remain through the checked `updateEmployee` path; login-claim provisioning belongs in internal administration. Installed/deployed legacy usage is not verified.
- First-owner creation requires the restaurant owner account, checks an empty employee collection and writes an initialization marker together with the owner in one transaction. Two simultaneous initializations cannot create two owners. An initialized restaurant cannot silently bootstrap again after employee deletion; support recovery is required. Existing restaurants are not backfilled with the marker in this slice.
- Restaurant screens, components and contexts now use an explicit callable wrapper that attaches the active credential at invocation time. Target employee IDs are preserved separately from the acting staff ID. The wrapper refuses a different restaurant and stops attaching credentials after expiry/account switch. The backend remains the authority.
- Staff credentials stay in memory. Removed restoration of trusted-looking profiles from AsyncStorage; stale stored profiles are discarded. App restart requires PIN unlock. Back-office PIN approval establishes the verified employee as the active staff member. First-owner creation verifies the newly configured PIN to establish a real session. Changing one's own PIN locks the client for fresh verification.
- Explicit local lock clears credentials immediately and attempts server revocation; individual device sessions revoke independently. Account/provider cleanup also attempts revocation. Expiry locks the current UI through a timer. `staffSessions` and `staffPinAttempts` are denied to direct clients by the current catch-all rules, verified on the emulator.

### Evidence and important limits

- Backend suite: 34 passing tests, including invocation-time client credential attachment, expiry/account isolation, separate target employee IDs, retired role endpoint and shared-owner work-day gate.
- Emulator suite: 26 passing tests. Staff coverage includes same-account employee impersonation, tenant/account/expiry isolation, current role/PIN/active state, explicit logout, independent sessions, successful-unlock budget preservation, six concurrent incorrect guesses and competing first-owner initialization.
- F3's original helper impersonation reproduction now passes as a normal assertion; F5 duplication still reproduces as an expected failing TODO. A stale fragment in the updated F3 test fixture was caught by the known-issue run, removed, and the suite rerun successfully.
- Backend lint, current-source credential scan and 70 client-file JSX/module syntax checks passed. No installed native build, physical Terminal, live Auth/provider or restaurant-service smoke test was run. Mock wrapper tests do not prove Metro packaging or callable transport on a device.
- Credentials are bearer tokens bound to a Firebase UID and tenant, not hardware-attested device identities. A copied valid credential used with the same shared Firebase account can be replayed until revocation/expiry. Memory-only storage reduces persistence, not that fundamental property. An in-flight authorized operation is not canceled by subsequent logout.
- Offline logout locks the local app but cannot guarantee immediate server revocation. A token whose revocation failed remains usable until its server expiry. Do not advertise offline/server revocation guarantees. Expired server records still need a retention/TTL plan; no cloud TTL or cleanup deployment was made.
- Crucially, employee records still contain client-readable PIN hashes and recursive subordinate reads remain broad (remaining F8). This undermines PIN secrecy and is a release blocker. The new session credential does not repair Firestore reads or callables that never invoke this permission boundary. Reservation/reporting/other legacy owner-UID guards need a complete endpoint authorization matrix before F3 is considered closed platform-wide.

### Staff release gates and next work

1. Complete the sanitized employee directory / sensitive-record migration and replace broad read rules together with compatible selectors and screens. Do not deploy a rules change that silently breaks staff selection.
2. Complete the callable and direct-read authorization matrix, including reservation operations, reporting, employee administration, table QR and Terminal paths. Recheck role-only/owner-UID guards outside the shared helper.
3. Coordinate backend and native client rollout in QA. Older clients have no credential and will fail closed. New callable `revokeStaffSession` must be deployed with verification and permission changes. Validate cold start, worker/manager/owner unlock, back-office verification, shift changes, expiry, lock/logout, own-PIN change, first-owner onboarding, table/kitchen/bar/reservations and physical Terminal.
4. Review the eight-hour session policy and fifteen-minute PIN lockout with operators, including manager assistance and lost/offline devices. Do not remove checks to work around QA failures.
5. Legacy Firebase role-claim usage and existing PIN-hash exposure require an assessment; no account claims, PINs, employee records or production sessions were changed remotely.

No deployment, commit, push or native release was performed. Phase 1 remains in progress. Next bounded task: sanitized employee directory and sensitive read restrictions, followed by remaining endpoint coverage and device QA.

## September 26: confidential staff reads and sanitized directory (F8 slice)

### What changed

- New tenant-scoped `listStaffDirectory` callable reads canonical employee records server-side and returns only ID, restaurant ID, name fields, role, job title, active status and validated service-rating summary numbers. Display strings are bounded and non-string values are rejected by the projector. PINs, PIN hashes, login UID, email, payroll and unknown future fields are never spread into this response.
- The directory is intentionally available before staff PIN unlock to a Firebase login authorized for that restaurant. It is display data, not authorization; staff actions still require the verified session. Anonymous, customer and other-tenant requests are rejected before database access.
- Native role/job-title helpers, POS/back-office selectors, roster, back-office staff counts and the direct server-assignment reader now use the sanitized directory. Source search found no remaining direct employee collection reads in native clients. The admin restaurant-profile employee list also uses this explicit projection instead of serializing entire employee records. Internal privileged raw-document administration remains a separate access-review concern.
- Roster and back-office counts replace raw document listeners with nonoverlapping 30-second refreshes while the relevant screen is focused and the app is active. Requests stop scheduling on background/unmount; late results are ignored. Mutations refresh the roster immediately. Directory failure appears as an error with retry, not a false empty roster suggesting first-owner setup. Existing selectors fetch when opened.
- Canonical `restaurants/{id}/employees` and `private` documents now deny direct client reads and writes. Removed the recursive restaurant-subdocument read grant that overrode narrower denials. Existing explicit tables, work_days and payment_events rules remain; reservationSettings has an explicit same-tenant read rule. Unknown future subcollections and nested credential/private records fail closed.
- No duplicated Firestore directory is created, so no remote data backfill, synchronization trigger or credential relocation is necessary. Credential hashes remain in canonical server-only employee records. This is a coordinated client/API/rules migration, not a database-content migration.

### Verification

- Backend suite: 38 passed. New tests exercise whitelist-only output, malformed field values, pre-unlock same-tenant access, rejection before reads, directory size boundary, and refresh cleanup/nonoverlap/background behavior.
- Emulator suite: 28 passed. New rules tests cover reads/writes/listing of employee/private/unknown collections and nested descendants for anonymous, customer, worker, manager, shared owner and unrelated tenant callers. Operational reads remain functional; workers cannot read payment_events through the removed recursive grant.
- Backend ESLint, current-source credential scan, diff whitespace checks and parsing of 71 client JS/JSX files passed. Node 22 backend initialization remains covered. The verified worktree-only emulator was stopped after testing.
- No live deployment, real-device build, physical Terminal test, cloud data mutation, account/PIN rotation or cache clearing was performed.

### Limits and rollout gates

1. Deploy the new directory callable before switching native clients, verify it in QA, then release compatible clients and apply the stricter rules in a controlled cutover. Old clients reading employee documents will fail after the rules cutover. Do not restore broad credential reads as a fallback.
2. Directory responses support up to 500 employees per restaurant and fail explicitly above that size (query capped at 501); no silent truncation. Full-directory refresh cost is proportional to staff count. This is suitable for a bounded pilot pending measurement, not a demonstrated scale/cost guarantee. If needed, introduce a versioned/cacheable sanitized projection or pagination as a separately tested design.
3. Roster/count changes from another device may take up to 30 seconds to appear. Authorization reads canonical records on each request and does not rely on that display refresh. Verify operator expectations and behavior on actual devices, including background/resume and failed networking.
4. Rules do not erase hashes previously fetched into device caches or otherwise exposed. Assess historical exposure, require compatible client versions, plan cache cleanup and controlled staff PIN resets where warranted. No assertion that previously readable PIN hashes remained confidential is made.
5. The remaining broader authorization review must cover public restaurant-root fields, root/menu/table writes on shared owner logins, work-day/payment-event reads, reservations/reporting callables and privileged internal document tools. A shared Firebase owner claim still does not distinguish the worker currently using a tablet for direct Firestore operations.
6. Run device QA for POS lock selection, owner/manager approval, first-owner onboarding, add/edit/delete staff, own PIN change, server assignment, reservation settings, reports, work-day opening/closing, orders and payments. Explicit subcollection rules were based on current source; confirm installed-client and cloud data usage before production rollout.

Phase 1 remains open. Next bounded task: inventory remaining restaurant callable/direct-Firestore permissions, close shared-login role bypasses with coordinated clients, and prepare the device acceptance checklist. The F5 concurrent-order defect remains assigned to Phase 2.

## September 26: reservation/report staff authorization and financial reads

- Added `restaurantPolicies.js` policies backed by the verified staff session. Reports require owner/manager; reservation operations require owner/manager or worker job title host/server, matching the existing front-of-house permission model. The actor ID is taken from callable transport data and must match the session; shared login claims alone never establish employee authority.
- Updated five reservation operations: offer waitlist slot, seat reservation, approve, decline and update status. Tenant authority comes from the stored reservation where applicable. Guest booking/cancellation and public availability behavior were not changed. Reservation settings retain their existing verified management gate.
- Updated all four report implementations (dashboard, ledger, order detail, daily sales), covering their dashboard/sales/aggregated aliases. Every authorization promise is awaited before a report is returned or queried. Order detail reads its requested order server-side first to resolve the stored tenant, but returns nothing without authorization. Dashboard/ledger now preserve authorization error codes rather than disguising them as internal failures.
- Found a separate legacy `getOrdersLedger.js` implementation that is not exported by current index.js. Added the same report policy to prevent a future accidental export from restoring the unchecked path. It was import/lint checked, not separately exercised as a deployed endpoint.
- Closed direct restaurant-client reads of raw `orders` and `restaurants/{id}/payment_events`, which could bypass the new report gate. Customer-owned order detail/history queries remain allowed. No current restaurant client direct reader of those financial collections was found; current report screens already use the credential-injecting callable wrapper. Installed legacy clients and deployed source parity still require review.

Verification: 47 backend tests and 30 emulator tests passed, with no failures or TODOs in those suites. Nine new handler tests run actual callback/helper source with mocked boundaries to prove that authorization is awaited before side effects/data responses. A real-session emulator matrix covers owner, manager, host, server, chef, bartender and runner, plus forged actor IDs, missing credentials and other tenants. Rules tests verify shared owner/manager/worker denial of raw order reads/listing while the customer's own history still works. These are permission tests, not completed reservation email, payment, or device acceptance flows. Backend lint, current-source scanner and diff checks passed. F5 duplicate kitchen tickets remains an expected failing TODO in the separate known-issue suite.

Remaining work: see `restaurant-permission-matrix.md`. Menu/table direct writes, restaurant profile/settings authority, work-day/operational read minimization and the legacy client-priced pending-order contract remain open. Reservation transition/idempotency correctness and validation of the assigned server are separate concerns, not resolved by an actor permission check. No comprehensive due-diligence or production-readiness claim follows.

Release: coordinated rules/backend/client QA is required. Existing native callers already use the staff wrapper, but older installed versions cannot call these repaired endpoints without a verified credential. No deployment, remote financial access, real email, charge, commit or push was performed.

## September 26: verified menu mutations and reputation preservation

- Added exported mutateRestaurantMenuItem callable and menuManagement.js. Save, archive and availability changes require a verified current owner/manager session. Stored item ownership is checked inside the transaction; shared Firebase owner claims alone cannot modify menu records.
- Native AddItemModal and MenuItem now use the staff callable wrapper. MenuManagementScreen uses restaurantId with UID fallback. Removed the unused direct-update callback and client authority over reputation/canonical IDs/timestamps. Public menu reads and existing rating subcollection rules remain unchanged. Direct menu create/update/delete is now denied for every client role. The unused native seedMenu utility will also be denied; use trusted development seeding instead.
- Editable menu fields are explicitly validated. Numeric prices must be finite, non-negative, at most 100000 currency units, and have at most two decimals; modifier IDs/selection limits, strings, arrays and image scheme are bounded. These are explicit compatibility limits requiring operator QA, particularly legacy modifier prices and oversized menus.
- Editing changes only editable fields, preserving server reputation and concurrent review updates. Archive keeps the record. Creating a dish matching an existing normalized name/category or previous name restores the original document and its rating subcollection. Multiple legacy matches fail with an actionable error rather than choosing the most favorable score. The client tells the operator when an existing dish was restored. Name/category similarity beyond these exact normalized matches is not a complete anti-manipulation solution.
- Creation uses a transactional tenant scan capped at 1001 documents and fails if more than 1000 exist; edits target one record. This is a bounded legacy compatibility bridge, not the final large-menu identity index. No backfill is deployed. Index migration, legacy duplicate resolution and rename/category identity policy remain follow-ups.

Validation is recorded after the final run below. No deployment, commit, push, real payment or live provider action was performed. Backend, compatible native clients and rules must be staged together in dev/QA; older direct-write clients will fail after rule cutover. Device acceptance must cover create/edit with modifiers, archive/restore, availability, image upload, owner/manager success and worker denial.

Scope: table management remains next. Inspection found rename/delete consistency and active-table checks that need their own transaction tests. Root/settings authority, operational read minimization and the legacy client-priced pending order remain open; Phase 1 is not complete.

Final verification for the menu slice: 52 backend tests passed; 36 Firestore emulator/rules/session tests passed, no failures or TODOs. The first emulator run exposed a test-harness Firestore context reuse error; after fixing the harness, the complete suite passed. All 71 restaurant/shared utility JavaScript files parsed. Backend lint, current-source secret-pattern scan and diff whitespace checks passed. These checks do not replace native device QA. The separate known F5 kitchen-ticket race is unchanged.

## September 26: table management and QR lifecycle

- Table create/update/delete now runs through verified owner/manager callables only. Direct client create/update/delete for `restaurants/{restaurantId}/tables/{tableId}` is denied for every role in Firestore rules while table reads remain public/operational.
- Table input is normalized and bounded server-side. Names, sections, table types and capacities are validated before writes, and each table stores a normalized display name for consistency.
- Table rename now preserves the stable table document ID. The old behavior created a new table document and deleted the old one, which could strand active parties, browser sessions, QR lookups, KDS tickets and table references. The callable now updates display fields on the existing table record.
- Structural changes are blocked while a table has active or uncleared service. The guard checks active statuses such as occupied, checked out and dirty, plus live references such as current party, check-in and customer IDs.
- Table deletion is transactional and only allowed for available, inactive tables. If the table has an active QR token, its lookup document is disabled in the same transaction before the table record is deleted.
- Existing table QR generation/regeneration remains callable-managed. This slice did not redesign QR token format or public browser behavior; it tightened mutation authority and lifecycle consistency around the current model.

Validation: full backend suite passed with 56 tests; full Firestore emulator/rules/session suite passed with 37 tests. New unit tests cover stable table rename, active-table structural-change denial, QR lookup disablement during delete and delete refusal for occupied/uncleared tables. New rules tests prove table documents are readable but no customer, anonymous user, worker, manager or owner can directly mutate them. Backend lint, current-source credential scan and diff whitespace checks passed.

Release gates: deploy backend callables, compatible restaurant clients and stricter rules together. Old clients that write table documents directly will fail after the rules cutover. Device QA must cover add/edit/delete table, rename with QR, regenerate/disable QR, occupied/dirty table protection, host/browser table session visibility and table cleanup after payment. No deployment, commit, push or native build was performed.

Remaining Phase 1 work: operational read minimization and full exported-endpoint inventory. Phase 1 is not complete, and F5 transactional kitchen-ticket/order claiming remains Phase 2.

## September 26: restaurant root profile update authority

- Added `saveRestaurantProfile`, a verified owner/manager callable for restaurant profile edits. Native `RestaurantProfile` now saves through the staff-session wrapper instead of directly merging into `restaurants/{restaurantId}`.
- Server-side profile normalization bounds editable text, validates coordinates and image URL shape, and derives `location`, `fullAddress` and `searchTokens` rather than trusting client-supplied convenience fields. Unsupported fields such as Stripe/account/payment configuration fail before writes.
- Firestore rules now deny direct updates to restaurant root documents. Public reads remain unchanged. Initial restaurant root creation remains temporarily compatible with the existing onboarding allowlist; ongoing profile changes are callable-only.
- First-owner employee setup now marks `staffOwnerInitialized` and `hasSetupEmployees` inside the server transaction that creates the first owner employee. The restaurant app no longer writes that root flag directly.

Validation: backend suite passed with 58 tests. New unit tests cover sanitized profile writes and forged protected-field rejection. Firestore emulator suite passed with 37 tests; the existing restaurant-root test now proves direct updates fail for owner/manager/worker/other-tenant clients while constrained initial creation remains compatible. Backend lint, current-source credential scan and diff whitespace checks passed. The first rules run was blocked by a stale emulator on the dedicated test port; the stale process was stopped and the full suite then passed.

Release gates: deploy the new callable before the stricter rules reach any client that still saves the profile directly. Device QA must cover first-owner setup, profile image upload/save, address/coordinate save, owner/manager success, worker denial and profile reads on customer discovery. No deployment, commit, push or native build was performed.

## September 26: pending-order server-only boundary

- Retired the exported `createPendingOrder` callable. It now authenticates and then fails closed with `failed-precondition` before any database access. The reason is intentional: the old contract accepted client-provided subtotal, gratuity and fee values and wrote money-bearing order records from those values.
- Firestore rules now deny all direct client reads and writes of `pending_orders`. Server payment functions, including the supported Stripe `preparePayment` flow, continue to create pending orders with server-authoritative item, tax, fee, reward and total calculations through the Admin SDK.
- Native legacy Panama/dLocal Smart Fields paths now fail early with an explicit secure-payment-update message instead of attempting a client-priced pending-order write that rules will reject. This keeps unused legacy payment paths fail-closed until they are rebuilt around server-priced preparation.
- This slice intentionally leaves legacy dLocal/PayPal-style client paths unsupported for MVP hardening. Those paths must not be reopened until they are migrated to a server-priced preparation flow with matching provider confirmation and reconciliation tests.

Validation: backend suite passed with 59 tests. The legacy callable test proves the endpoint is retired before database access. Firestore emulator suite passed with 39 tests, including a matrix proving customers, anonymous users, workers, managers and owners cannot read server-priced pending orders or create forged pending orders directly. Backend lint, current-source credential scan and diff whitespace checks passed on the previous full validation; rerun them after this documentation update before release. The first rules attempt hit a stale emulator port; after stopping the stale process, the complete suite passed.

Release gates: confirm QA clients use Stripe `preparePayment` for individual, party and pickup checkout. If Panama/dLocal or PayPal is reintroduced, build it as a server-priced flow rather than restoring client-created pending orders. No deployment, commit, push, real provider call or native build was performed.

## September 26: terminal payment status read boundary

- Added `getStaffTerminalPaymentStatus`, a verified staff callable that returns only minimal terminal-payment state: existence, paid flag, status and closeout-finalized flag. It derives the restaurant from the stored terminal payment record and requires a current owner/manager session or a server/bartender staff session for that restaurant.
- `RestaurantTerminalPaymentScreen` no longer subscribes directly to `terminal_payments/{paymentIntentId}`. It polls the callable while waiting for the Terminal payment webhook, preserving the existing payment flow without exposing raw terminal payment records to restaurant clients.
- Firestore rules now deny every direct client read and write of `terminal_payments`. The payment/webhook backend continues to use Admin SDK authority for the canonical record.

Validation: backend suite passed with 58 tests. Firestore emulator suite passed with 39 tests, including a new matrix proving anonymous users, customers, workers, managers, owners and other tenants cannot directly read or forge terminal payment records. Backend lint, current-source credential scan, JavaScript syntax checks and diff whitespace checks passed. The first rules attempt hit a stale emulator on the dedicated test port; after stopping it, the complete suite passed.

Release gates: test a physical Terminal payment in the dev/QA lane after deploying the callable and rules together. Confirm card reader flow, webhook settlement, timeout behavior, staff closeout, table cleanup and order history. No deployment, commit, push, real Terminal charge or native build was performed.

## September 26: work-day status read boundary

- Added `getCurrentWorkDayStatus`, a verified staff callable that returns a minimal open/closed work-day shape. It allows owner/manager and operational worker titles that need service-state visibility, but it does not expose raw work-day records.
- `WorkDayContext` now loads service status through the staff callable, refreshes periodically, and refreshes immediately after start/end day actions. The dashboard reads the callable's timestamp milliseconds instead of relying on Firestore snapshot timestamp objects.
- Firestore rules now deny direct client reads and writes of `restaurants/{restaurantId}/work_days/{workDayId}`. Reporting and closeout functions continue using Admin SDK reads internally.

Validation: backend suite passed with 59 tests, including a new test that verifies work-day status goes through the staff permission boundary and returns only shaped status data. Firestore emulator suite passed with 39 tests, proving reservation settings remain readable while work_days and payment_events are denied to direct clients. Backend lint, current-source credential scan and diff whitespace checks passed.

Release gates: deploy the callable and compatible client before applying the stricter rule. Device QA must cover owner/manager start service, close service, worker dashboard visibility, another-device open/close refresh timing, offline behavior and end-of-day cleanup. No deployment, commit, push or native build was performed.

## September 26: service-request queue read boundary

- Added `listStaffServiceRequests`, a verified staff callable that returns only the fields the service-request queue needs: table label, guest display name, party size, assigned server, request type/message and request timestamps.
- `ServiceRequestsScreen` now polls the callable instead of subscribing directly to raw `parties` records. Servers receive only requests for their assigned tables; owners, managers and approved floor roles can view the floor queue.
- This is a targeted read-boundary improvement, not a full party-read migration. Other operational screens still read `parties`, `shared_baskets`, `kitchen_orders`, `checkIns`, reservations and tables directly where realtime behavior is currently required.

Validation: backend suite passed with 60 tests, including a new test that proves service-request listing uses the verified staff boundary and filters server visibility to assigned tables. JavaScript syntax checks passed for the changed backend, client screen and test files. Rules were not changed for this slice, so the Firestore emulator suite was not rerun after this callable-only/client migration.

Release gates: deploy the callable with the compatible restaurant client. Device QA must cover service request creation by a guest, queue visibility as owner/manager/host/server/support, server-only assigned-table filtering, acknowledge/on-my-way behavior and refresh timing. No deployment, commit, push or native build was performed.

## September 26: KDS screen read migration

- Added `listStaffKitchenOrders`, a verified staff callable for Chef/Bar Q. It authorizes owner/manager plus prep station roles from the existing prep-ticket permission model, then returns shaped active tickets with only the KDS fields needed for display and station updates.
- `ChefsQScreen` now polls this callable instead of subscribing directly to raw `kitchen_orders`. The ticket screen still supports pacing, kitchen/bar station filtering, item-level updates and local optimistic updates.
- This is not yet a global `kitchen_orders` rules lockdown. Active tables, table management and pickup handoff now have bounded migrations, but related operational/customer views still need their own migrations or projections before rules can safely deny restaurant-wide raw reads.

Validation: backend suite passed with 61 tests, including a new test proving the KDS list callable uses verified prep-staff permission and returns shaped ticket rows. Functions lint and JavaScript syntax checks passed for the changed backend, KDS screen and unit test. Rules were not changed for this slice, so the Firestore emulator suite was not rerun after this KDS screen migration.

Release gates: deploy the callable with the compatible restaurant client. Device QA must cover Chef Q and Bar Q refresh timing, fullscreen behavior, scheduled/held ticket display, fire-now action, station/item status updates, and role denial for non-prep workers. No deployment, commit, push or native build was performed.

## September 26: active-tables read migration

- Added `listStaffActiveTables`, a verified staff callable for the restaurant Active Tables screen. It returns shaped active/dirty party rows and server-side ready-item summaries, rather than exposing raw party documents and raw kitchen tickets to the screen.
- `RestaurantActiveTables` now polls this callable instead of subscribing directly to `parties` and `kitchen_orders`. Server workers receive only their assigned tables plus unassigned tables that need a server; owners, managers and approved floor roles receive the active floor view.
- Ready-item calculations now happen server-side from active prep tickets and return counts plus ready ticket IDs needed by the existing "Mark Served" action.
- This does not yet remove every direct `parties` or `kitchen_orders` read from the app. Party management, table management and pickup handoff now have bounded migrations, but some customer and remaining operational views still require their own bounded migrations or explicit rule decisions.

Validation: backend suite passed with 62 tests, including a new test proving active-table listing uses verified staff permission, filters server visibility and joins ready-ticket summaries. Functions lint and JavaScript syntax checks passed for the changed backend, Active Tables screen and unit test. Rules were not changed for this slice, so the Firestore emulator suite was not rerun after this screen migration.

Release gates: deploy the callable with the compatible restaurant client. Device QA must cover owner/manager/host/server active-table visibility, server claiming unassigned tables, assigning a server, opening Manage Party, acknowledging service requests, marking ready items served, cleaning dirty tables and refresh timing. No deployment, commit, push or native build was performed.

## September 26: Manage Party read migration

- Added `getStaffPartyDetail`, a verified staff callable for the active party detail screen. It returns shaped party fields, shaped shared basket items, restaurant tax/terminal/fee settings, pricing tier config and the guest's available restaurant rewards/promotions.
- `ManagePartyScreen` now polls this callable instead of subscribing directly to `parties`, `shared_baskets`, `restaurants`, `appConfig/pricingTiers`, `customers/{id}/restaurantClubs` and `customers/{id}/promotions`.
- Server workers can view assigned or unassigned parties only; owner/manager and approved floor roles can view the party detail through the same staff-session boundary.
- The existing write actions remain callable-based: add items, close table, terminal payment, reward redemption, promotion redemption, discounts and service operations were not redesigned in this slice.

Validation: backend suite passed with 63 tests, including a new test proving party detail goes through verified staff permission and returns shaped basket, reward, promotion and restaurant settings data. Functions lint and JavaScript syntax checks passed for the changed backend, Manage Party screen and unit test. Rules were not changed for this slice, so the Firestore emulator suite was not rerun after this screen migration.

Release gates: deploy the callable with the compatible restaurant client. Device QA must cover opening assigned/unassigned party details as server, denial for another server's table, item display/grouping, reward/promotion display and redemption, terminal closeout handoff, cash closeout, add item, service request state and refresh timing. No deployment, commit, push or native build was performed.

## September 26: Table Management operational overlay read migration

- Updated `TableManagementScreen` so occupied, dirty and ready-item overlays are loaded through the verified `listStaffActiveTables` callable instead of direct `parties` and `kitchen_orders` listeners.
- Table setup records still use the existing table utility and owner/manager table-management callables. The sensitive operational join is now server-shaped and follows the same staff-session boundary used by Active Tables.
- The table header counts now derive from the enriched operational table state, so browser-created or recently seated parties are reflected consistently in both table cards and summary totals.

Validation: `TableManagementScreen` syntax passed, direct party/order listener search for that screen is clean, and the broader backend suite remains at 63 passing tests because this slice reuses the already-tested `listStaffActiveTables` callable. Rules were not changed for this client migration, so the Firestore emulator suite was not rerun.

Release gates: device QA must cover browser QR seating, native table scan seating, occupied/dirty/available table states, ready-item badges, force clear, clean and release, QR regenerate/disable, and server/manager visibility. No deployment, commit, push or native build was performed.

## September 26: Restaurant operations pulse read migration

- Updated `RestaurantDataContext` so bottom-tab badges and operational sound cues use verified staff callables instead of direct `parties` and `kitchen_orders` listeners.
- Host/front-floor pulses use `listStaffActiveTables` for unassigned check-ins and ready-item alerts, with role gating so back-of-house devices do not poll floor-only data.
- Kitchen/bar pulses and pickup counts use `listStaffKitchenOrders` only for owner/manager or prep roles. Service request badges use `listStaffServiceRequests`, preserving server-scoped filtering from the backend.
- The provider still exposes the same values to navigation: `newCheckInCount`, `newKitchenOrderCount`, `serviceRequestCount`, `readyItemAlertCount`, `pickupOrderCount` and `setKitchenQueueFocused`.

Validation: `RestaurantDataContext` syntax passed, direct raw party/kitchen listener search for that context is clean, functions lint passed and diff whitespace validation passed. Backend suite remains at 63 passing tests because this slice reuses previously tested staff callables. Rules were not changed for this client migration, so the Firestore emulator suite was not rerun.

Release gates: device QA must confirm host check-in badge/bell, kitchen/bar new-ticket badge/bell, server ready-item alert, service-request alert, pickup badge visibility by role, focus behavior on the Chef/Bar Q tab and polling refresh timing. No deployment, commit, push or native build was performed.

## September 26: Table order detail modal read migration

- Added `getStaffOrderDetail`, a verified staff callable for the table order detail modal. Party-backed table orders use the same assigned/unassigned server boundary as active table detail.
- Legacy individual check-in baskets are owner/manager-only until those old records have a reliable server/table assignment field. This avoids giving any floor worker broad read access by guessing a check-in ID.
- Updated `OrderDetailModal` to poll the callable while open instead of reading `checkIns`, `shared_baskets` or `baskets` directly.

Validation: backend suite passed with 64 tests, including a new test proving party-backed order detail uses the assigned party boundary and legacy individual check-ins are manager-only. Syntax passed for the backend, export file, modal and unit test. Functions lint passed after replacing newer JavaScript syntax with parser-compatible guards. Rules were not changed for this client/callable migration, so the Firestore emulator suite was not rerun.

Release gates: device QA must cover table detail open from floor plan, browser-party orders, native-party orders, manager legacy individual detail if still needed, discount modal behavior, live refresh timing and server denial on another server's assigned table. No deployment, commit, push or native build was performed.

## September 26: Manual Seating read migration

- Updated `ManualSeatingScreen` so active/occupied table state comes from the verified `listStaffActiveTables` callable instead of a direct `parties` listener.
- Table records still load through the existing table utility, while the operational occupied-table overlay follows the same staff-session boundary used by Active Tables and Table Management.
- Added a no-restaurant fallback so the screen does not stay indefinitely loading when a restaurant profile is unavailable.

Validation: `ManualSeatingScreen` syntax passed, functions lint passed, direct party-listener search for that screen is clean, and diff whitespace validation passed. Backend suite remains at 64 passing tests because this slice reuses the already-tested active-table callable. Rules were not changed for this client migration, so the Firestore emulator suite was not rerun.

Release gates: device QA must cover owner/manager/host/server manual seating visibility, seating an available table, occupied table exclusion, table status changes after seating, and refresh behavior while another device seats a guest. No deployment, commit, push or native build was performed.

## September 26: Pickup Queue read migration

- Added `listStaffPickupOrders`, a verified staff callable for pickup handoff. It requires owner/manager authority or host/support staff authority and returns only active `hotel_pickup` tickets for the current restaurant.
- Expanded the backend's public kitchen-order shaping for pickup-safe receipt and display fields, including customer/guest labels, pickup instructions and monetary totals needed by the pickup handoff screen.
- Updated `PickupQueueScreen` to poll `listStaffPickupOrders` instead of reading `kitchen_orders` directly. The screen keeps its pickup-only behavior and sorts by the backend-shaped created time.

Validation: backend suite passed with 65 tests, including a new test proving the pickup list uses verified pickup staff authority and the pickup-only query. Syntax passed for `restaurantFunctions`, `index`, `PickupQueueScreen` and the unit test. Functions lint, source credential scan and diff whitespace validation passed. Direct `PickupQueueScreen` raw `kitchen_orders` search is clean. Rules were not changed for this client/callable migration, so the Firestore emulator suite was not rerun.

Release gates: deploy the callable with the compatible restaurant client. Device QA must cover owner/manager/host/support pickup visibility, worker denial outside the pickup boundary, pickup order handoff, receipt/customer fields, refresh timing and confirmation that kitchen/bar prep tickets still appear in Chef/Bar Q. No deployment, commit, push or native build was performed.

## September 26: Host Stand read/write hardening

- Added `listStaffHostCheckIns`, a verified staff callable for pending host-stand arrivals. It requires owner/manager authority or host/server/support staff authority and returns shaped `REQUESTED` reservation-arrival and host-assigned walk-in rows only.
- Updated `HostStandScreen` to poll `listStaffHostCheckIns` instead of subscribing directly to `checkIns`.
- Tightened `handleCheckInResponse` so the seating write first verifies the stored check-in belongs to the supplied restaurant/customer and then requires a current verified staff session for owner, manager, host, server or support before table assignment writes begin.

Validation: backend suite passed with 67 tests, including a new test for verified host check-in queue access and a new test proving `handleCheckInResponse` checks staff authority before seating writes. Syntax passed for the changed backend, export file, Host Stand screen and tests. Functions lint passed. Direct `HostStandScreen` raw `checkIns` search is clean. Rules were not changed for this client/callable migration, so the Firestore emulator suite was not rerun.

Release gates: deploy the callable and hardened seating function with the compatible restaurant client. Device QA must cover host/server/support/manager queue visibility, kitchen/bar denial, assigning a table and server, reservation-arrival seating, walk-in seating, stale already-processed request handling and refresh timing. No deployment, commit, push or native build was performed.

## September 26: Reservation Operations read migration

- Added `listStaffReservationOperations`, a verified staff callable for the reservations operations screen. It requires owner/manager authority or host/server/support staff authority and returns shaped active reservations plus shaped waitlist entries.
- Updated `RestaurantReservationsScreen` to poll `listStaffReservationOperations` instead of subscribing directly to `reservations` and `reservationWaitlist`.
- Kept reservation actions on their existing protected callables: approve, decline, seat, status update and waitlist offer. The screen refreshes after successful actions and on a short polling interval.

Validation: backend suite passed with 68 tests, including a new test proving reservation operations reads use verified floor staff authority and bounded reservation/waitlist queries. Syntax passed for the changed backend, export file, reservation screen and unit test. Functions lint and diff whitespace validation passed. Direct `RestaurantReservationsScreen` raw reservation/waitlist subscription search is clean. Rules were not changed for this client/callable migration, so the Firestore emulator suite was not rerun.

Release gates: deploy the callable with the compatible restaurant client. Device QA must cover owner/manager/host/server/support reservation visibility, kitchen/bar denial, approve/decline, seat reservation, mark no-show/completed, waitlist grouping, waitlist offer, post-action refresh and stale reservation handling. No deployment, commit, push or native build was performed.

## September 26: Menu Management read migration

- Added `listStaffMenuItems`, a verified owner/manager callable that returns shaped menu rows for the restaurant menu builder.
- Updated `MenuManagementScreen` to poll `listStaffMenuItems` instead of subscribing directly to `menuItems`.
- Added immediate refresh after add/edit modal close and after archive/availability actions so the screen remains operational without a raw snapshot listener.

Validation: backend suite passed with 69 tests, including a new test proving staff menu list access uses verified manager authority and returns shaped menu rows. Syntax passed for the changed backend, export file, menu screen, menu item component and unit test. Functions lint and diff whitespace validation passed. Direct `MenuManagementScreen` raw `menuItems` subscription search is clean. Rules were not changed for this client/callable migration, so the Firestore emulator suite was not rerun.

Release gates: deploy the callable with the compatible restaurant client. Device QA must cover owner/manager menu visibility, worker denial, search/grouping, edit, add, archive, hide/show, modifier display, image fields and post-action refresh timing. No deployment, commit, push or native build was performed.

## September 26: Reservation Settings read migration

- Added `getStaffReservationSettings`, a verified owner/manager callable that returns shaped restaurant feature configuration and merged reservation settings.
- Updated `ReservationSettingsScreen` to load through `getStaffReservationSettings` instead of directly reading the restaurant root and `restaurants/{restaurantId}/reservationSettings/general`.
- Kept saves on the existing protected callables: `saveReservationSettings` and `saveRestaurantExperienceSettings`. The screen refreshes through the verified read path after successful saves.

Validation: backend suite passed with 70 tests, including a new test proving reservation settings reads use verified manager access and shaped config output. Syntax passed for the changed backend, export file, reservation settings screen and unit test. Functions lint and diff whitespace validation passed. Direct `ReservationSettingsScreen` raw restaurant/settings read search is clean. Rules were not changed for this client/callable migration, so the Firestore emulator suite was not rerun.

Release gates: deploy the callable with the compatible restaurant client. Device QA must cover owner/manager settings visibility, worker denial, initial load after PIN unlock, feature toggle saves, reservation slot saves, entitlement-clamped features, post-save refresh and no unsaved-form overwrite during editing. No deployment, commit, push or native build was performed.

## September 26: Rewards Settings read migration

- Added `getStaffRewardsSettings`, a verified owner/manager callable that returns shaped restaurant rewards configuration and eligible menu rows for loyalty setup.
- Updated `RestaurantRewardsScreen` to load through `getStaffRewardsSettings` instead of directly reading the restaurant root and `menuItems`.
- Kept reward-program saves on the existing `saveRestaurantLoyaltyProgram` callable. The screen refreshes through the verified read path after a successful save and avoids polling while the owner/manager is editing tier settings.

Validation: backend suite passed with 71 tests, including a new test proving rewards settings reads use verified manager authority and shaped menu rows. Syntax passed for the changed backend, export file, rewards settings screen and unit test. Functions lint and diff whitespace validation passed. Direct `RestaurantRewardsScreen` raw restaurant/menu read search is clean. Rules were not changed for this client/callable migration, so the Firestore emulator suite was not rerun.

Release gates: deploy the callable with the compatible restaurant client. Device QA must cover owner/manager rewards visibility, worker denial, entitlement-locked rewards, progressive tier display, visit/spend thresholds, discount and free-item reward configuration, eligible menu item selection, post-save refresh and no unsaved-form overwrite during editing. No deployment, commit, push or native build was performed.

## September 26: Back Office setup-status read migration

- Added `getStaffBackOfficeSetupStatus`, a verified owner/manager callable that returns only setup counts for employees, tables and menu items.
- Updated `BackOfficeScreen` to poll that callable instead of directly subscribing to `restaurants/{restaurantId}/tables` and `menuItems`. The first-owner bootstrap path still avoids the staff-session callable until the initial owner employee is created.
- Kept the launch checklist behavior the same: counts only drive completion badges, while actual setup flows remain on their existing screens and protected callables.

Validation: backend suite passed with 72 tests, including a new test proving Back Office setup status uses verified manager authority and returns count-only output. Syntax passed for the changed backend, export file, Back Office screen and unit test. Functions lint and diff whitespace validation passed. Direct `BackOfficeScreen` raw tables/menu read search is clean. Rules were not changed for this client/callable migration, so the Firestore emulator suite was not rerun.

Release gates: deploy the callable with the compatible restaurant client. Device QA must cover owner/manager Back Office entry, first-owner employee setup, checklist counts after adding staff/tables/menu items, worker denial, refresh timing, and no regression in Stripe onboarding links or logout. No deployment, commit, push or native build was performed.

## September 26: Restaurant Profile read migration

- Added `getStaffRestaurantProfile`, a verified owner/manager callable that returns only editable restaurant profile fields needed by the form.
- Updated `RestaurantProfile` to load through that callable instead of directly reading the restaurant root. The existing first-owner bootstrap fallback still hydrates from auth context before the initial owner employee is created.
- Profile saves still use `saveRestaurantProfile`, and the form refreshes local state from the sanitized profile returned by that callable after successful save.

Validation: backend suite passed with 74 tests, including new tests proving restaurant profile reads use verified manager authority, return editable fields, and omit protected root fields such as Stripe IDs, entitlements and platform-fee settings. Syntax passed for the changed backend, export file, Restaurant Profile screen and tests. Functions lint and diff whitespace validation passed. Direct `RestaurantProfile` raw restaurant-root read search is clean. Rules were not changed for this client/callable migration, so the Firestore emulator suite was not rerun.

Release gates: deploy the callable with the compatible restaurant client. Device QA must cover owner/manager profile load, first-owner bootstrap profile load, image upload/save, coordinate save, country picker, worker denial, and post-save form refresh. No deployment, commit, push or native build was performed.

## September 27: operations badge hook read migration

- Updated `useRestaurantOperationsBadges` to poll `listStaffReservationOperations` and `listStaffHostCheckIns` instead of directly subscribing to `reservations` and `checkIns`.
- The hook stays quiet before a verified staff session exists, avoiding expected permission errors while the restaurant app is locked or still at the PIN gate.
- Removed the legacy raw `users/{uid}` read from the older `RestaurantDashboard.js` file; the active app uses `RestaurantDashboardScreen`, but the source audit now stays clean for this restaurant staff scope.

Validation: syntax passed for the updated hook and legacy dashboard file. Direct raw-read search across `src/screens/restaurant`, `src/context/restaurant` and `src/hooks/restaurant` is clean for `collection`, `doc`, `onSnapshot`, `getDocs`, `getDoc` and `query` calls. Functions lint, diff whitespace validation and source credential-pattern scan passed. Backend suite remains at 74 passing tests; no backend behavior changed in this slice. Rules were not changed for this client migration, so the Firestore emulator suite was not rerun.

Release gates: deploy the already-created reservation/host callables with the compatible restaurant client. Device QA must cover bottom-tab attention badges, dashboard reservation/check-in badges, post-PIN refresh timing, worker/role visibility, and no badge errors before unlock. No deployment, commit, push or native build was performed.

## September 27: exported endpoint inventory started

- Added `docs/hardening/exported-endpoint-inventory.md` as the working inventory for exported Firebase callables, triggers, webhooks and scheduled jobs.
- Grouped endpoints into locally bounded staff/restaurant endpoints, customer/browser endpoints that still need ownership/concurrency review, payment endpoints that require special reconciliation review, internal admin/support controls, and background triggers.
- This is a source inventory, not deployed-state verification. It does not prove production IAM, App Check, admin whitelisting, Stripe/Resend configuration, or installed-client compatibility.

Validation: documentation-only slice. Functions lint, diff whitespace validation and source credential-pattern scan passed after the preceding operations-badge migration. Backend suite remains at 74 passing tests. No deployment, commit, push, native build or live environment action was performed.

Release gates: convert the inventory into a callable-by-callable authority matrix, explicitly disposition legacy payment rails, verify admin endpoint controls/auditing, and complete device/Terminal QA before treating Phase 1 as release-ready.

## September 27: legacy alternate payment rails fail closed

- PayPal exports `createPayPalOrder`, `capturePayPalOrder` and `chargeVaultedCard` now fail with `failed-precondition` before authentication branching, provider access, Firestore mutation or `fulfillOrder`.
- dLocal exports `getDlocalPublicKey`, `createDlocalCheckout`, `processDlocalNativePayment`, `processDlocalTokenCharge`, `createDlocalPayment`, `confirmDlocalPayment` and `chargeSavedDlocalCard` now fail with `failed-precondition` before provider access, Firestore mutation or `fulfillOrder`.
- `dlocalWebhook` now acknowledges and ignores while dLocal is disabled, preventing webhook retry storms while guaranteeing the disabled rail cannot fulfill an order.
- Added a unit test that statically verifies every exported PayPal and dLocal handler has the fail-closed guard as its first operational statement. This is intentional because those rails are out of scope while Scerv uses Stripe for the MVP.

Validation: syntax passed for the PayPal handler, dLocal handler and new unit test. Functions lint passed. Backend suite passed with 76 tests after rerunning outside the Windows sandbox path restriction. No deployment, commit, push, native build, live provider call or real payment action was performed.

Release gates: QA must confirm current checkout clients use Stripe `preparePayment`, browser Stripe checkout and Terminal Stripe flows only. Reintroducing PayPal or dLocal requires a new server-priced design, provider confirmation, webhook replay/idempotency handling, settlement reconciliation, regional compliance review and explicit product approval.

## September 27: exported endpoint authority matrix started

- Added `docs/hardening/exported-endpoint-authority-matrix.md` as the working control map for exported Firebase endpoints.
- Split endpoints by operational boundary: restaurant staff/management, staff financial/reporting, customer/browser/party, discovery/reviews/rewards, payments, internal Scerv admin/support, and background lifecycle jobs.
- Marked each group as locally bounded, fail-closed, Phase 1 review, Phase 2, or public/customer scoped so future work does not confuse staff-session authorization with customer ownership, admin authorization or payment correctness.

Validation: documentation-only slice after the legacy rail tests. Diff whitespace validation passed. No deployment, commit, push, native build or live environment action was performed.

Release gates: complete the remaining matrix rows for customer/public endpoints and admin/support controls, then run device/Terminal QA. Payment allocation, Stripe webhook replay, browser checkout concurrency and split-payment correctness remain Phase 2.
