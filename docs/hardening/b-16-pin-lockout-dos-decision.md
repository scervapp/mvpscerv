# B-16 PIN Lockout Denial-of-Service Decision

Date: 2026-09-27

Status: Done. Decision recorded; no code change implemented in this slice.

## Scope

B-16 decides how Scerv should handle incorrect staff PIN attempts without letting one person lock out the restaurant during service.

This is a product/security operations decision. It does not certify brute-force resistance, staff-device custody or live-service QA.

## Current Source Posture

- `verifyEmployeePin` checks the submitted PIN against the employee's bcrypt `pinHash`.
- The function returns a generic failed response on mismatch.
- No current source-level hard lockout was found in `verifyEmployeePin`.
- No production `staffPinAttempts` records were found during B-15.

Because no hard lockout exists today, the specific denial-of-service risk is not currently active. The larger remaining risk is brute-force resistance for 4-6 digit staff PINs on shared restaurant devices.

## Decision

Do **not** add a global employee lockout for the MVP pilot.

If Scerv adds PIN throttling before or during the first pilot, it must follow this pattern:

- Throttle by restaurant + employee + device/session fingerprint where practical, not by employee globally.
- Use short local cooldowns, such as 30 seconds, 2 minutes and 5 minutes, instead of a blanket 15-minute staff lockout.
- Keep a manager/owner override or unlock path available during service.
- Audit failed attempts, cooldowns and unlocks.
- Keep user-facing errors generic so staff cannot enumerate whether a PIN, employee or role is valid.
- Keep the restaurant owner account recovery path outside the POS PIN system.

## Rationale

A global employee lockout is dangerous in hospitality operations. A frustrated worker, guest with device access or accidental repeated tap can disable a manager/server during service. That is worse than the current risk profile for a pre-pilot system with no production staff PIN records.

The right pilot posture is controlled access, short cooldowns and operational recovery, not brittle account locks.

## Required Before Any Lockout Implementation

- Define the device/session identifier used for throttling.
- Add a manager/owner unlock or override workflow.
- Add emulator tests for:
  - repeated failed attempts on one device/session;
  - another device/session remaining usable;
  - successful PIN clearing the local attempt state;
  - manager override/unlock;
  - no disclosure of whether the employee ID or PIN was the failing element.
- Device-test during a simulated rush before production.

## Follow-Up

Treat this as a design constraint for future staff-session hardening. It does not block current local B-phase documentation work, but any future PIN throttling implementation must use this decision as the acceptance bar.
