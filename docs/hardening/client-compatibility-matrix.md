# Client compatibility matrix

Purpose: track which app/web builds can safely call each backend/rules generation. Do not deploy breaking rules until this matrix shows compatible clients and a minimum-version gate strategy.

Status: initial placeholder. Fill during Phase A/B.

| Client surface | Version/build | Environment | Uses staff session credential | Direct collections read | Direct collections written | Required callables | Compatible through wave | Breaking wave | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iOS native | Unknown | Production | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Populate from deployed build and source inventory |
| Android native | Unknown | Production | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Populate from deployed build and source inventory |
| Browser dining | Unknown | Production/hosting | N/A | Unknown | Unknown | Unknown | Unknown | Unknown | Include hosted bundle/version once inventoried |
| Admin portal | Unknown | Production/hosting | N/A | Unknown | Unknown | Unknown | Unknown | Unknown | Include environment switch and god-mode controls |

## Required checks

- Minimum native version source of truth identified.
- Store/TestFlight build numbers recorded.
- Web bundle version/reload behavior recorded.
- Each Firestore rules lockdown step maps to affected clients.
- Expected old-client failure mode is explicit and user-readable.
