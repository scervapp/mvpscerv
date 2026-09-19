# Scerv Browser-First Rollout

This plan expands Scerv into browser-based guest access while protecting the native app, current restaurant workflows, and payment integrity.

## Strategic Position

Browser access should become the easiest first guest entry point. The native app remains the stronger repeat-user experience for saved preferences, rewards, history, push notifications, and deeper discovery.

The operating principle is simple: web removes adoption friction; the app builds long-term retention.

## Release Stages

### Stage 1: Public Restaurant Pages

Status: started.

- Add public restaurant URLs such as `/r/harbor-and-ember`.
- Show restaurant details, photos, dish-level menu data, ratings, and feature availability.
- Keep all behavior read-only.
- Do not create parties, payments, orders, or customer accounts from this page yet.

### Stage 2: Secure Table QR Entry

Status: started as a read-only shell.

- Add browser route `/dine/:token`.
- Resolve secure table tokens without exposing raw Firestore IDs.
- Show the correct restaurant, table, and available menu.
- Add admin controls later to regenerate or disable table tokens.
- Keep order submission disabled until identity, basket, and kitchen routing are connected safely.

### Stage 3: Lightweight Guest Identity

Status: started.

- Let a browser guest continue as a lightweight verified guest using email or phone OTP.
- Separate account creation, transactional messaging, and marketing consent.
- Link the browser guest to the same customer identity model used by the native app.
- Avoid requiring date of birth except for alcohol or birthday reward use cases.
- Browser table QR pages now support email OTP verification and create/update a customer profile after sign-in.

### Stage 4: Browser Basket and Order Submission

Status: browser basket, kitchen submission, live status, and pay-now checkout started.

- Verified guests can create a `browserTableSessions/{sessionId}` record from a secure table QR token.
- This session links the guest, restaurant, table, and QR token version without occupying the table or sending orders.
- Verified browser guests can add, update, and remove draft basket items tied to their table session.
- Cloud Functions validate the session, menu item ownership, item availability, and server-side price before updating basket totals.
- Browser basket submissions create standard active `kitchen_orders` tickets for ChefQ/BarQ.
- Submitted basket items are locked and linked to their ticket IDs so duplicate taps do not create duplicate orders.
- Browser guests can see live production status for sent items.
- Browser guests can start a simple Stripe Checkout pay-now flow for sent items.
- Paid browser table orders create normal Scerv order records through the existing Stripe webhook fulfillment path.
- Next step: add browser party visibility and invited guests once the single-guest table flow is stable.
- Reuse existing order validation and pricing logic where possible.
- Add idempotency keys to protect against double taps, reloads, and duplicate charges.
- Keep the same operational queue for web, app, and staff-entered orders.

### Stage 5: Browser Party Mode

Status: not started.

- Let guests join a table party through a link, QR code, or invite.
- Allow restaurants to control whether guests can order independently, view shared items, or pay for others.
- Keep the restaurant check as the source of truth.

### Stage 6: Payments, Split Pay, and Open Tabs

Status: simple pay-now started; split pay and open tabs remain later release.

- Start with simple pay-now checkout before open tabs.
- Browser pay-now uses Stripe-hosted Checkout instead of collecting card details directly inside Scerv web.
- Add split payment after the browser basket and check state are stable.
- Treat pre-authorization and delayed capture as a separate payments project after Stripe and legal review.
- Never allow restaurant-created tips or undisclosed fees.

### Stage 7: Reservation Hub

Status: placeholder route added.

- Every reservation should eventually have a secure browser hub.
- Guests can view, modify, cancel, invite friends, and convert the reservation into a dining party.
- Google Business Profile booking links can point here before any Reserve with Google certification.

## Data Guardrails

- Public restaurant pages read from existing restaurant, menu, and review data.
- Browser QR routes must use replaceable public tokens, not raw table IDs.
- Web ordering should write to new browser-specific session fields first, then bridge into existing party/order fields only after validation.
- Cloud Functions should be added with versioned names for risky behavior instead of changing existing production functions in place.
- Firestore rules should grant only the exact browser reads/writes required at each stage.

## Current Implementation Notes

- Production remains the default website Firebase environment.
- Development website access can use `REACT_APP_SCERV_ENV=development`.
- `/r/:slug` now serves the public restaurant page.
- `/dine/:token` now serves the table QR entry shell.
- `/r/:slug/reserve` now serves a basic reservation hub placeholder.
- Restaurant table management can prepare, copy, share, rotate, disable, and re-enable secure QR links in the dev backend.
- Browser table sessions now support a draft basket with server-validated item pricing and availability.
- Browser basket submissions now send active tickets to the same kitchen/bar queue used by the native app and staff devices.

## Next Decision

The next implementation choice is whether to expose live ticket progress to the browser guest before starting browser payment. The cleaner MVP sequence is live kitchen status first, then simple browser payment, and only then split pay or open tabs.
