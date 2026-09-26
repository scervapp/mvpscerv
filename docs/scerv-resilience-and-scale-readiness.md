# Scerv resilience and scale readiness

Created: September 26, 2026  
Owner: Scerv leadership and engineering  
Audience: founder, technical leadership, operations, advisors, and future investors

## Executive summary

Scerv has moved beyond a prototype. After FSTEC, the product should be treated as a serious hospitality platform that will be judged on operational trust, not only product vision. Restaurants will not tolerate lost orders, duplicate payments, broken kitchen queues, unreliable table state, or unclear support answers during service.

The core risk is not whether Scerv can work for one demo restaurant. The risk is whether Scerv continues to behave correctly when many guests, servers, kitchens, browsers, payments, reservations, and restaurants are active at the same time.

This document defines the resilience standard Scerv must meet before a wider rollout. It focuses on correctness under real operating pressure: concurrency, realtime delivery, payment integrity, compliance, observability, backup, support recovery, and staged scale testing.

## Why this matters

Many startups fail at launch because they confuse a successful demo with production readiness. A demo proves the product can work. Production proves the company can be trusted.

Restaurant technology is especially unforgiving because failures happen in public:

- A kitchen ticket that does not appear becomes a guest experience failure.
- A duplicate charge becomes a trust failure.
- A broken table session becomes a staff workflow failure.
- A missing reservation becomes a host-stand failure.
- A permission mistake becomes a security and customer-data failure.
- A slow queue during peak service becomes a restaurant adoption failure.

Scerv must be engineered so failure is contained, visible, recoverable, and rare.

## Company posture

Scerv should operate as an enterprise hospitality infrastructure company, even while still early.

That means:

- We do not ship core operational workflows based only on happy-path testing.
- We do not rely on manual Firestore edits to recover normal service problems.
- We do not make scale claims without measured evidence.
- We do not expose payment, identity, or restaurant operations without clear permission boundaries.
- We do not treat compliance as paperwork after the fact.
- We do not add realtime features without understanding ordering, replay, reconnect, and duplication behavior.

The standard is simple: if a restaurant depends on Scerv during a dinner rush, Scerv must behave like infrastructure.

## Product surfaces included

This readiness standard applies to the full Scerv operating system:

- Customer native app
- Browser table ordering
- Restaurant staff app
- Host check-in and seating
- Reservations and waitlist
- Party mode and shared ordering
- Kitchen and bar queues
- Payments, tips, fees, refunds, and reconciliation
- Rewards, wallet, discounts, and redemptions
- Dish ratings, reviews, photos, and discovery
- Restaurant management tools
- Admin portal
- Public website and demo lead capture
- Cloud Functions, Firestore rules, storage, hosting, and Firebase project configuration

## Guiding principles

### 1. Correctness before speed

Fast failure is still failure. A payment flow that responds quickly but double-submits an order is worse than a slower flow that is correct. The first priority is financial and operational correctness.

### 2. Server authority

Clients can request actions, but the server must decide whether the action is allowed and how state changes. The client should not be trusted to set privileged fields such as payment status, payout state, loyalty balances, restaurant entitlements, staff role, or table closure.

### 3. Idempotency everywhere money or orders move

Every critical command must tolerate retries. Duplicate taps, mobile reconnects, function retries, webhooks, and browser refreshes must not create duplicate tickets, duplicate charges, duplicate rewards, or inconsistent party state.

### 4. Realtime is a delivery layer, not the source of truth

Sockets, listeners, and push notifications should reflect trusted state. They should not become the only place where truth exists.

### 5. Every state transition needs an owner

An order item should move through clear states. A reservation should move through clear states. A payment should move through clear states. Ambiguous state is where support failures and financial bugs live.

### 6. Go-live must be gradual

The correct launch path is pilot, observe, harden, expand. Scerv should not jump from controlled demos to broad usage without measured service evidence.

## Current strategic risk map

| Area | Risk | Business impact | Required posture |
|---|---|---|---|
| Payments | Duplicate charges, failed fulfillment after capture, unclear refunds | Loss of trust, disputes, restaurant hesitation | Idempotent payment lifecycle and reconciliation |
| Kitchen/bar routing | Lost or duplicated tickets, stale queues, pacing errors | Bad service, staff rejection | Deterministic tickets and realtime recovery |
| Table sessions | Multiple guests or staff mutate same table at once | Wrong table state, wrong order, wrong server | Transaction-safe table/session operations |
| Reservations | Double booking, stale slot availability, no-show ambiguity | Host friction, guest frustration | Transactional booking and audit trail |
| Rewards/discounts | Multiple discounts, incorrect redemptions, abuse | Financial leakage | Server-controlled wallet and redemption ledger |
| Reviews/discovery | Restaurants reset bad ratings by recreating items | Loss of trust in Scerv score | Canonical dish identity and reputation preservation |
| Staff permissions | Shared login or forged staff IDs grant access | Tenant breach, operational risk | Verified employee sessions and role matrix |
| Realtime transport | Reconnect storms, missed events, duplicated events | Operational confusion | Event/state design with recovery |
| Compliance | PCI, privacy, consent, retention, accessibility gaps | Legal, platform, investor, and enterprise risk | Compliance-by-design roadmap |
| Observability | Failures invisible until a restaurant complains | Slow support, lost confidence | Logs, alerts, correlation IDs, dashboards |

## Realtime and sockets deep dive

The Swipe Savvy point about sockets is important. Realtime systems can look easy during demos and fail under production behavior.

Scerv currently uses Firebase/Firestore realtime patterns in many places. That is not inherently wrong. Firestore listeners are a managed realtime system and can support a strong MVP if the data model is correct. The key is not whether Scerv uses raw WebSockets, Firestore listeners, or another realtime layer. The key is whether state remains correct when connections drop, reconnect, replay, and compete.

### What can go wrong with realtime

Realtime failures usually come from assumptions like these:

- The message arrived, so the operation is complete.
- The client saw an event, so every other client saw it too.
- Events always arrive in order.
- Reconnecting clients will naturally recover the exact latest truth.
- Duplicate events are harmless.
- A socket connection proves the user is still authorized.
- Mobile devices stay connected during service.
- A busy restaurant creates the same load as a demo.

Those assumptions fail in production.

### Realtime risks Scerv must design for

| Risk | Example | Required control |
|---|---|---|
| Missed event | KDS tablet loses Wi-Fi as a ticket is created | Queue reload from authoritative state |
| Duplicate event | Function retries and sends same notification twice | Stable ticket/order IDs and idempotent handlers |
| Out-of-order event | "Ready" appears before "Preparing" on a reconnect | State machine with monotonic transitions |
| Reconnect storm | Internet blips and every tablet reconnects together | Efficient listeners, backoff, minimal fanout |
| Stale authorization | Fired employee session remains open | Session expiry and server permission checks |
| Split brain | Two clients think they own the same item/payment | Transactional claims and server allocation |
| Fanout cost | Many screens listen to broad collections | Narrow queries and materialized operational views |
| Background app | Customer app misses updates while backgrounded | Recover from persisted state on resume |

### Scerv realtime design position

For the next stage, Scerv should treat Firestore realtime listeners as the operational read layer, not as the command layer.

Commands should flow through server-controlled functions:

1. Client requests action.
2. Server validates identity, role, tenant, and state.
3. Server writes authoritative state transactionally.
4. Realtime listeners update screens from authoritative state.
5. Alerts/notifications are secondary and retryable.

This avoids the trap of using sockets as a shortcut around correctness.

### When raw sockets may make sense later

Scerv may eventually need a dedicated realtime gateway for high-volume restaurant operations. That decision should be evidence-based, not ego-based.

Consider a dedicated WebSocket or managed realtime gateway only when:

- Firestore listener cost or latency becomes measurable bottleneck.
- KDS/bar screens need lower-latency event delivery than Firestore provides.
- We need richer presence, device status, or local network service behavior.
- We have enough production traffic to justify operating that layer.

Even then, sockets should deliver events from an authoritative command/event store. They should not replace transactions, ledgers, permission checks, or reconciliation.

## Transaction correctness

Scerv has multiple workflows where concurrency matters:

- Two guests submit items at the same table.
- A server adds items while a guest pays.
- A host seats a reservation while another host edits it.
- A kitchen marks items ready while a server is viewing active tables.
- A guest pays while another guest modifies a shared basket.
- A pickup order is submitted while the restaurant disables pickup.
- A discount is applied while rewards are being recalculated.

These workflows need explicit invariants.

### Required invariants

- One payment obligation can only be settled once.
- One submitted item can only produce the intended ticket once.
- One table can only have one active service session unless explicitly designed otherwise.
- One restaurant feature setting must be enforced consistently across customer, staff, browser, and backend paths.
- One reward redemption must have one ledger entry and one checkout application.
- One customer-visible receipt must reconcile to payment provider records.
- One KDS item must never disappear because a screen refreshed.

## Payment resilience

Payment correctness is non-negotiable.

Scerv must support:

- Stripe test and live mode separation.
- Stable payment attempt IDs.
- Stripe idempotency keys for provider calls.
- Server-side amount calculation.
- Item allocation before payment capture.
- Reconciliation between pending orders, Stripe intents, order history, receipts, rewards, and kitchen tickets.
- Retry-safe fulfillment after payment.
- Refund and dispute audit history.
- Clear separation between captured payment and completed operational side effects.

### Payment failure scenarios to test

| Scenario | Expected behavior |
|---|---|
| Guest taps pay twice | One successful charge or one clear failure, never duplicate settlement |
| Stripe succeeds but function crashes before clearing party | Payment recorded, fulfillment resumes safely |
| Stripe webhook arrives twice | Second event is ignored or reconciled without duplicate side effects |
| Guest loses network after payment | App recovers to receipt/order status |
| Restaurant closes table while payment is pending | Server rejects unsafe transition or resolves from authoritative payment state |
| Split payment overlaps with another guest | Items cannot be paid twice |
| Discount applied during payment | Final amount is locked per checkout attempt |
| Refund requested | Refund is tied to original charge and order ledger |

## Kitchen and bar resilience

The kitchen and bar queue must be treated as production infrastructure.

Required behavior:

- Tickets are created from trusted submitted items.
- Kitchen and bar routing is deterministic.
- Ticket IDs are stable.
- Status transitions are monotonic and auditable.
- KDS screens can reload from Firestore and recover full state.
- Ready notifications are generated from state changes, not fragile screen events.
- Pacing cannot hide or lose upcoming items.
- Bar and kitchen views must not interfere with each other.

### KDS scale tests

Minimum tests before broader rollout:

- One table submits 20 items quickly.
- Ten tables submit orders at the same time.
- Kitchen tablet refreshes during incoming orders.
- Kitchen tablet loses network and reconnects.
- Bar and kitchen process tickets at the same time.
- Server device receives ready signals while on active tables.
- Upcoming paced items release manually and automatically if supported.
- Completed items remain visible in history long enough for support.

## Table and party resilience

Tables, parties, and check-ins are central to Scerv. They must not be loosely coordinated.

Required controls:

- A table session must have a unique service identity.
- Browser QR sessions must use replaceable tokens, not raw database IDs.
- Table status changes must be transaction-safe.
- Seat/check-in actions must be tied to staff identity.
- Party basket state must survive refresh/reconnect.
- Paid parties must cleanly exit customer active state.
- Staff should see clear status: open, ordering, items sent, ready, paid, needs cleaning.

## Reservation and waitlist resilience

Reservation systems fail when slot state is stale or staff workflows are ambiguous.

Required controls:

- Availability calculation must account for existing holds, approvals, cancellations, and seating.
- A requested reservation must not guarantee a slot until confirmed according to restaurant rules.
- Cancelled reservations must release capacity according to policy.
- Waitlist offers should have expiration windows.
- Staff actions must include employee identity and timestamp.
- No-show handling must be visible and auditable.
- Reservation-to-party conversion must be one controlled transition.

## Rewards, wallet, and discounts resilience

Rewards are financial promises. They require controls similar to payments.

Required controls:

- Restaurant-owned loyalty rules are versioned.
- Scerv points and restaurant club rewards are separate ledgers.
- Discounts are applied server-side.
- Only one discount applies at checkout unless a rule explicitly allows stacking.
- Redemptions are immutable ledger entries.
- Refunds can reverse rewards correctly.
- Promotions such as "first-time user gets 10 percent off up to 10 dollars" need eligibility, redemption, and reconciliation records.

## Data model and ledger requirements

Scerv should prefer append-only or auditable records for critical events.

Critical ledgers:

- Payment attempts
- Captured charges
- Refunds
- Order item allocations
- Kitchen/bar ticket creation
- Reward accrual
- Reward redemption
- Discount application
- Reservation state changes
- Table session state changes
- Staff operational actions
- Admin overrides

Not every screen needs to display every ledger. But support and engineering need the data to reconstruct what happened.

## Compliance readiness

Compliance should be built into the system now. It is cheaper to design correctly than retrofit after restaurants, investors, or payment partners ask.

This is not legal advice. Scerv should validate requirements with qualified counsel and payment/compliance advisors before broader launch.

### Payment compliance

Scerv should minimize PCI scope by using Stripe-hosted payment collection and never storing raw card data.

Required posture:

- No raw card numbers stored in Scerv systems.
- No card data in logs, support notes, screenshots, or analytics.
- Stripe customer/payment identifiers treated as sensitive operational data.
- Access to payment dashboards restricted and audited.
- Refunds and staff-assisted payments require role controls.
- Terminal flows must be tested separately from in-app checkout.

### Privacy and customer data

Scerv holds customer identity, restaurant visits, order history, ratings, preferences, rewards, and possibly dietary information. That is sensitive behavioral data.

Required posture:

- Clear account creation disclosure.
- Separate transactional messages from marketing consent.
- Data deletion and account export procedure.
- Restaurant-level customer data separation.
- Admin access logging.
- Least-privilege internal access.
- Retention policy for orders, logs, receipts, reviews, and support cases.

### Email, SMS, and notifications

Transactional messages and marketing messages must be separate.

Required posture:

- Reservation confirmations and receipts can be transactional.
- Newsletters and promotions require opt-in consent.
- Unsubscribe handling for marketing.
- SMS consent if text messaging is used.
- Resend or other email-provider errors must be observable.

### Accessibility

Guest-facing browser ordering, reservation pages, and payment flows should meet accessibility expectations.

Required posture:

- Usable text contrast.
- Keyboard and screen-reader support where web is used.
- Clear labels for controls.
- Error messages that are understandable.
- No critical action hidden only behind color.

### Restaurant operations and labor data

Staff sessions, ratings, assignments, and operational history can become employee-related data.

Required posture:

- Make staff ratings/reporting an owner-visible business tool, not an uncontrolled surveillance feature.
- Log who performed sensitive actions.
- Avoid exposing unnecessary staff performance data to other employees.
- Define retention and access controls.

### Food, alcohol, and age-sensitive features

If Scerv supports alcohol ordering or age-sensitive products, additional controls are required.

Required posture:

- Restaurant-configurable item restrictions.
- Age verification workflow where required.
- Staff confirmation before restricted item fulfillment.
- Clear responsibility boundaries with the restaurant.

## Security posture

Security must move from "rules exist" to "rules are verified and monitored."

Required controls:

- Verified tenant isolation.
- Employee session binding.
- Role-based access matrix.
- Server-owned privileged fields.
- Firestore rules tests for forbidden writes.
- Cloud Function authorization tests.
- Admin portal role separation.
- Production rules drift detection.
- Secrets inventory and rotation plan.
- App Check evaluation for abuse-prone endpoints.
- Rate limiting for OTP, reservation requests, demo forms, and expensive functions.

## Observability and support

Scerv cannot support restaurants if it cannot see what happened.

Required observability:

- Correlation ID per order/payment/session.
- Structured logs for critical functions.
- Alerts for failed payments, failed fulfillment, old pending orders, KDS lag, email failure, and reservation errors.
- Admin portal support view for customer, restaurant, order, payment, reservation, and table history.
- Redaction of sensitive data in logs.
- Daily reconciliation report.

### Minimum support questions Scerv must answer

- Did the guest pay?
- Did Stripe capture the money?
- Was the order created?
- Did the kitchen/bar receive the ticket?
- Did the table close?
- Were rewards applied?
- Who changed the reservation?
- Who seated the party?
- Which device or user submitted the command?
- What failed, and can it be retried safely?

## Backup, recovery, and rollback

Backup and recovery should be verified, not assumed.

Required controls:

- Firestore backup/PITR policy decision.
- Restore test in nonproduction.
- Release rollback plan.
- Feature disable switches for risky workflows.
- Manual restaurant fallback procedures.
- Known-good app version strategy.
- Cloud Functions deployment rollback plan.
- Rules rollback plan that does not reopen known vulnerabilities.

## Scale testing plan

Scale must be tested in stages. The objective is not to brag about a number. The objective is to understand the first bottleneck and prove the business-critical flows remain correct.

### Stage 1: single-table correctness

Prove one active table under contention:

- Multiple guests join.
- Multiple items are added.
- Items are sent to kitchen.
- Kitchen/bar updates status.
- Guest pays.
- Rewards apply.
- Table moves to needs-cleaning.
- Support records reconcile.

### Stage 2: one restaurant busy service

Synthetic profile:

- 25 active tables
- 4 guests per table
- 5 staff devices
- 2 KDS/bar displays
- Reservations, check-ins, ordering, payments, rewards, and reports active

Success criteria:

- No lost orders.
- No duplicate charges.
- KDS p95 visible update under target.
- Payments reconcile.
- Tables close correctly.
- Reports remain usable.

### Stage 3: multi-restaurant concurrent service

Synthetic profile:

- 20 restaurants
- 25 active tables each
- 4 guests per table
- 5 staff devices per restaurant
- Active reservations, browser ordering, native ordering, payments, rewards, and KDS

Success criteria:

- Tenant isolation holds.
- Cost is measured.
- Function latency is measured.
- Firestore read/write volume is measured.
- Queue lag is measured.
- No cross-restaurant data leak.
- No global bottleneck emerges without documentation.

### Stage 4: burst and recovery

Test:

- Reconnect storm.
- Payment provider timeout.
- Email provider timeout.
- KDS offline and reconnect.
- Function retry.
- Duplicate webhook.
- Admin support recovery.

Success criteria:

- System recovers without manual database surgery.
- Support can identify state.
- No money/order mismatch remains unresolved.

## Suggested service objectives

These are internal targets, not public SLAs.

| Workflow | Suggested internal target |
|---|---|
| Order submit accepted | p95 under 2 seconds on healthy network |
| Accepted order visible on KDS | p95 under 2 seconds, p99 under 5 seconds |
| Table state update visible to staff | p95 under 3 seconds |
| Payment confirmation after provider success | p95 under 3 seconds after provider response |
| Reservation request submission | p95 under 3 seconds |
| Critical function error rate | under 0.5 percent in controlled QA |
| Lost order tolerance | zero |
| Duplicate settlement tolerance | zero |
| Cross-tenant data leak tolerance | zero |

## Compliance and due-diligence evidence package

Scerv should maintain an evidence package before serious restaurant expansion, fundraising diligence, or enterprise conversations.

Required evidence:

- Architecture diagram
- Data-flow diagram
- Payment-flow diagram
- Realtime state-flow diagram
- Permission matrix
- Firestore rules test results
- Cloud Function test results
- Load test report
- Backup and restore evidence
- Incident response plan
- Security risk register
- Vendor list
- Secrets handling policy
- Privacy/data retention summary
- Release checklist
- Rollback checklist
- Pilot metrics

## Go-live readiness checklist

Scerv should not expand beyond controlled pilots until each item is answered clearly.

### Product and operations

- [ ] Restaurant can complete a full service flow without engineering help.
- [ ] Staff can recover from a device refresh/restart.
- [ ] Support can trace a payment/order/reservation issue.
- [ ] Admin portal can handle common support tasks safely.
- [ ] Feature flags can disable risky features per restaurant.

### Payments

- [ ] Duplicate payment attempts are safe.
- [ ] Stripe webhooks are idempotent.
- [ ] Captured payments reconcile to orders.
- [ ] Refund flow is documented and tested.
- [ ] Discounts and rewards reconcile.

### Realtime

- [ ] KDS reloads from authoritative state.
- [ ] Reconnect behavior is tested.
- [ ] Ready notifications do not duplicate incorrectly.
- [ ] Old tickets cannot disappear without audit.

### Security

- [ ] Staff permissions are enforced server-side.
- [ ] Restaurant tenant isolation is tested.
- [ ] Customer privileged fields are server-owned.
- [ ] Admin roles are separated.
- [ ] Production rules match reviewed release.

### Compliance

- [ ] PCI scope is minimized and documented.
- [ ] Privacy disclosures are reviewed.
- [ ] Marketing consent is separated from transactional messaging.
- [ ] Data deletion/export path exists.
- [ ] Accessibility review is scheduled or completed.

### Reliability

- [ ] Backup policy is active.
- [ ] Restore has been tested.
- [ ] Critical alerts exist.
- [ ] Incident response owner is assigned.
- [ ] Rollback or feature-disable path is verified.

## Recommended execution roadmap

### Phase A: stop avoidable failure

Focus:

- Authorization hardening.
- Payment idempotency.
- Table/session concurrency.
- KDS recovery.
- Production rules drift.

Outcome:

Scerv can support a controlled live restaurant without obvious operational or financial failure modes.

### Phase B: prove one restaurant

Focus:

- Full service QA.
- Staff workflow recovery.
- Reconciliation.
- Reporting accuracy.
- Support tooling.

Outcome:

Scerv can run a complete restaurant shift and explain every critical event afterward.

### Phase C: prove multi-restaurant concurrency

Focus:

- Load test with 20 restaurants.
- Reconnect storms.
- Multiple KDS screens.
- Concurrent checkouts.
- Cost and latency reporting.

Outcome:

Scerv can state a measured capacity envelope honestly.

### Phase D: enterprise readiness

Focus:

- Compliance evidence.
- Security review.
- Backup/restore evidence.
- Incident response.
- Investor/customer due-diligence package.

Outcome:

Scerv looks like a serious infrastructure company, not just an exciting app.

## Leadership conclusion

The product vision is strong. The FSTEC response confirms Scerv is not a toy. But that means the standard rises.

Scerv should now behave like a company preparing to handle real money, real guests, real restaurant pressure, and real investor diligence. The path forward is not to slow down. The path forward is to build the discipline that lets Scerv move faster without becoming fragile.

The goal is not perfection before launch. The goal is controlled exposure, measured risk, recoverable failures, and no preventable failures in the flows that matter most: orders, payments, kitchen routing, reservations, table state, rewards, and customer trust.

