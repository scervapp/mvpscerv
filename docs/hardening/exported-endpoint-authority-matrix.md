# Exported endpoint authority matrix

Updated September 27, 2026, America/New_York. Worktree: `hardening/phase-0-baseline`.

Purpose: convert the exported endpoint inventory into an operating control map. This is source-level local evidence only. It is not deployed-state verification, provider verification, App Check proof, IAM review, device QA or a production-readiness claim.

Legend:

- **Locally bounded**: current source has local unit/syntax/lint evidence for the intended boundary or uses a repaired callable path already documented in Phase 1.
- **Fail-closed**: endpoint remains exported but intentionally refuses the legacy behavior locally.
- **Needs Phase 1 review**: endpoint is still in scope for ownership/role/audit verification before Phase 1 exit.
- **Phase 2**: endpoint may be correctly authenticated, but payment/order concurrency correctness belongs to the next phase.
- **Public/customer scoped**: endpoint may be reachable by guests or public users, so the boundary is not a restaurant staff-session boundary.

## Restaurant staff and management endpoints

| Endpoint(s) | Intended caller | Local disposition | Remaining gate |
| --- | --- | --- | --- |
| `verifyEmployeePin`, `revokeStaffSession`, `listStaffDirectory` | Authenticated restaurant account and staff member | Locally bounded by staff-session/PIN controls and sanitized directory tests | Device QA for unlock, expiry, revocation and account switch |
| `addEmployee`, `updateEmployee`, `deleteEmployee` | Owner/manager with verified staff session | Locally bounded through staff authority helpers | Device QA for employee lifecycle and first-owner bootstrap |
| `setEmployeeRole` | No current caller | Fail-closed legacy endpoint | Keep retired unless rebuilt through admin/support workflow |
| `startWorkDay`, `getCurrentWorkDayStatus`, `endWorkDay` | Verified restaurant staff by allowed role | Locally bounded; status read migrated to minimal callable | Device QA for shared devices and shift transitions |
| `addTable`, `updateTable`, `deleteTable`, `regenerateTableQrToken`, `setTableQrEnabled`, `ensureRestaurantTableQrTokens` | Owner/manager | Locally bounded with active-table safeguards | Device QA for QR token regeneration, occupied-table denial and clean/release |
| `forceClearTable`, `markPartyTableClean` | Elevated restaurant staff | Locally bounded in restaurant operations helpers | Device QA for table lifecycle and audit expectations |
| `mutateRestaurantMenuItem`, `listStaffMenuItems` | Owner/manager | Locally bounded; menu reads/writes use verified callables | Device QA for add/edit/archive/availability/image fields |
| `getStaffRestaurantProfile`, `saveRestaurantProfile` | Owner/manager | Locally bounded; protected platform fields omitted/blocked | Device QA for profile/image/location save and worker denial |
| `getStaffReservationSettings`, `saveReservationSettings`, `saveRestaurantExperienceSettings` | Owner/manager | Locally bounded for read path and protected setting writes | Device QA for feature toggles and entitlement clamping |
| `getStaffRewardsSettings`, `saveRestaurantLoyaltyProgram`, `redeemRestaurantReward` | Owner/manager or allowed staff action depending endpoint | Locally bounded for rewards settings read/write and redemption flow | Device QA for automatic rewards, manual redemption and discount application |
| `listStaffServiceRequests`, `acknowledgePartyServiceRequest` | Assigned server or elevated staff | Locally bounded for server-scoped reads/actions | Device QA for customer request messaging and acknowledged/on-way states |
| `listStaffKitchenOrders`, `updateKitchenOrderStationStatus`, `releaseKitchenOrderPacing`, `markReadyKitchenItemsServed` | Kitchen/bar/manager/server by operation | Locally bounded for queue reads/actions | Device QA for KDS/bar routing, pacing, ready notifications and station role behavior |
| `listStaffPickupOrders`, `completePickupOrderHandoff` | Pickup-capable staff | Locally bounded for pickup-only query and handoff | Device QA for pickup feature toggle and fulfillment |
| `listStaffHostCheckIns`, `handleCheckInResponse`, `declineCheckIn`, `clearTable` | Host/server/support/manager | Locally bounded for host queue and seating authority | Device QA for walk-in, reservation arrival, stale request and party conversion |
| `listStaffActiveTables`, `getStaffPartyDetail`, `assignPartyServer`, `closePartyTable` | Floor staff scoped by assignment or elevated staff | Locally bounded for shaped active-table and party detail reads | Device QA for assigned-server visibility, closeout and browser/native parties |
| `getStaffOrderDetail` | Assigned server or manager; legacy check-ins manager-only | Locally bounded for table-order detail | Device QA for modal open paths and legacy record handling |
| `listStaffReservationOperations`, `approveReservation`, `declineReservation`, `seatReservation`, `updateReservationStatus`, `restaurantOfferWaitlistSlot` | Host/server/support/manager | Locally bounded for operations list and transition authority | Device QA for approvals, no-show/completed, waitlist offer and stale reservation handling |
| `getStaffBackOfficeSetupStatus` | Owner/manager | Locally bounded count-only read | Device QA for checklist counts and worker denial |

## Staff financial and reporting endpoints

| Endpoint(s) | Intended caller | Local disposition | Remaining gate |
| --- | --- | --- | --- |
| `getReportingDashboard`, `getOrdersLedger`, `getOrderDetail`, `getDashboardReport`, `getSalesReport`, `getAggregatedSalesReport`, `getDailySalesReport` | Owner/manager or report-authorized staff | Locally bounded by report permission checks | Phase 3 report completeness/cost and device QA |
| `createTerminalConnectionToken`, `listRestaurantTerminalReaders`, `setDefaultTerminalCollector`, `prepareStaffTerminalPayment`, `prepareScervPayLiteTerminalPayment`, `captureStaffTerminalPayment`, `getStaffTerminalPaymentStatus`, `getScervPayLiteDailyReport` | Verified payment-capable staff for collection; owner/manager for default collector and Pay Lite daily report | Locally bounded for status, staff payment path and Pay Lite report shaping, but provider/device behavior is external | Physical Terminal QA, Stripe reconciliation, Pay Lite daily receipt print/share test and manager closeout review |
| `discountOrderItem` | Elevated restaurant staff | Needs Phase 1 review | Verify authority, audit trail, item ownership and checkout impact |

## Customer, browser and party endpoints

| Endpoint(s) | Intended caller | Local disposition | Remaining gate |
| --- | --- | --- | --- |
| `sendEmailOtp`, `verifyEmailOtp`, `completeBrowserGuestIdentity`, `createUserAccount`, `createStripeCustomer` | Public or authenticated customer | Public/customer scoped; OTP and Stripe customer ownership locally tested | Abuse controls, App Check rollout decision and end-to-end auth QA |
| `resolveBrowserTableToken`, `createBrowserTableSession`, `addBrowserBasketItem`, `updateBrowserBasketItem`, `removeBrowserBasketItem`, `submitBrowserBasketToKitchen`, `getBrowserOrderStatus` | Browser guest session | Public/customer scoped | Phase 2 concurrency/payment correctness and browser device QA |
| `addItemToBasket`, `removeItemFromBasket`, `updateBasketItemQuantity`, `clearBasket`, `sendToChefsQ`, `sendItemsToChefsQ`, `sendOrderToKitchen`, `addItemToSharedBasket`, `addStaffItemsToPartyAndSendToKitchen`, `linkBasketToCheckIn` | Authenticated guest or verified staff by flow | Mixed evidence; guest kitchen authorization locally repaired for key submission path | Phase 2 item-claim/idempotency review and broad endpoint matrix |
| `createParty`, `inviteToParty`, `joinParty`, `leaveParty`, `cancelParty`, `activatePartyCheckIn`, `cancelPartyCheckIn`, `addLocalPIPToParty`, `updateSharedBasketItemQuantity`, `removeSharedBasketItem`, `createPartySession` | Authenticated customer or party member | Fixed locally for ownership boundaries; public/customer scoped | `joinParty` now requires invite proof for new members, table-created parties preserve `hostUserId`, and host/member/item-owner checks are dispositioned in `b-10-customer-party-reservation-ownership-report.md`; testing deploy and device QA still pending |
| `getAvailableReservationSlots`, `createReservationRequest`, `createReservationParty`, `joinReservationWaitlist`, `acceptWaitlistOffer`, `passWaitlistOffer`, `cancelCustomerReservation` | Public or authenticated customer | Locally bounded for customer ownership; public/customer scoped | Customer ownership, duplicate-time checks and waitlist owner checks are dispositioned in `b-10-customer-party-reservation-ownership-report.md`; anti-abuse/rate controls and device QA still pending |
| `searchPIPs` | Authenticated customer | Needs Phase 1 privacy review | Verify minimum profile exposure and rate limits |

## Customer discovery, reviews and rewards

| Endpoint(s) | Intended caller | Local disposition | Remaining gate |
| --- | --- | --- | --- |
| `submitDishRating`, `submitMenuItemRating`, `submitServerRating` | Authenticated customer after dining/payment context | Needs Phase 1 review | Verify confirmed-visit/payment linkage, duplicate review policy and server privacy |
| `aggregateDishRating`, `aggregateMenuItemRating`, `aggregateMenuItemOrderStats` | Firestore triggers | Needs trigger idempotency review | Phase 3 retry/rebuild strategy and aggregation correctness |
| `getScervTasteRecommendations`, `getScervFeed` | Authenticated customer | Needs Phase 1 privacy/recommendation review | Confirm no hidden social/feed surface is exposed while feature is parked |
| `awardRewardsForPaidOrder`, `redeemCustomerPromotion` | Trigger/customer reward redemption path | Mixed; rewards accrual was not the main Phase 1 payment focus | Verify idempotency, one-discount policy and support reconciliation |
| `translateInstruction`, `autoTranslateMenuItem` | Customer/staff translation or background translation | Needs Phase 1 data-boundary review | Verify provider input redaction, cost limits and retry behavior |

## Payment endpoints

| Endpoint(s) | Intended caller | Local disposition | Remaining gate |
| --- | --- | --- | --- |
| `preparePayment`, `createBrowserCheckoutSession`, `syncBrowserCheckoutSession`, `finalizeStripePayment`, `getStripePublishableKey` | Authenticated customer/browser guest using server-priced Stripe flow | Locally bounded for core input validation and Stripe customer ownership; browser flow still under review | Phase 2 allocation, retry, split-payment and reconciliation tests |
| `handleStripeEvent`, `stripeWebhookTest`, `stripeWebhookLive` | Stripe webhook | Needs Phase 2 webhook replay/idempotency review | Provider event verification, duplicate/reordered webhook tests and settlement reconciliation |
| `createPendingOrder` | No current supported caller | Fail-closed legacy endpoint | Keep retired; never restore client-priced pending orders |
| `createPayPalOrder`, `capturePayPalOrder`, `chargeVaultedCard` | No current supported caller | Fail-closed locally | Rebuild only with explicit product/compliance approval |
| `getDlocalPublicKey`, `createDlocalCheckout`, `dlocalWebhook`, `processDlocalNativePayment`, `processDlocalTokenCharge`, `createDlocalPayment`, `confirmDlocalPayment`, `chargeSavedDlocalCard` | No current supported caller | Fail-closed locally; webhook acknowledges and ignores | Rebuild only with server-priced flow, regional compliance and reconciliation |

## Internal Scerv admin/support endpoints

| Endpoint(s) | Intended caller | Local disposition | Remaining gate |
| --- | --- | --- | --- |
| `getScervAdminDashboardStats`, `searchScervAdminRecords`, `getScervCustomerProfile`, `getScervRestaurantProfile`, `listScervCustomers`, `listScervAdminAuditLogs`, `rebuildRestaurantPublicProfiles` | Scerv admin portal user | Needs admin-role/audit review; `rebuildRestaurantPublicProfiles` is admin-only and dry-run unless explicitly confirmed | Verify environment switch, super-admin role, audit logging, production whitelist and projection backfill runbooks |
| `createScervRestaurantOnboarding`, `assignScervRestaurantOwner`, `resendRestaurantOwnerSetupEmail`, `updateScervRestaurantProfile` | Scerv admin portal user | Needs admin-role/audit review | Verify owner assignment, email side effects and support recovery controls |
| `sendScervCustomerPasswordReset`, `setScervCustomerDisabled`, `setScervCustomerCreatorStatus` | Scerv admin portal user | Needs admin-role/audit review | Verify customer-service permissions and audit trail |
| `listScervDemoLeads`, `updateScervDemoLead`, `submitScervDemoRequest`, `submitScervNewsletterSignup`, `listScervNewsletterSubscribers`, `updateScervNewsletterSubscriber` | Public lead capture or Scerv admin | Needs split public/admin review | Verify spam controls, Resend behavior and admin-only listing |
| `listScervSupportCases`, `saveScervSupportCase`, `addScervSupportCaseNote`, `getScervOrderSupportDetail`, `addScervOrderSupportNote`, `refundScervStripeOrder` | Scerv support/admin | Needs admin-role/audit/payment review | Refund authority, audit trail and Stripe reconciliation |
| `saveRestaurantFeatureEntitlements`, `listScervPromotionLedger`, `issueScervCustomerPromotion`, `cancelScervCustomerPromotion`, `saveScervWalletDefinition`, `saveScervMenuItem`, `archiveScervMenuItem` | Scerv admin | Needs admin-role/audit review | Verify feature gating, promotion ledger, one-discount policy and menu ownership |
| `getScervFirestoreCollection`, `getScervFirestoreDocument`, `setScervFirestoreDocument`, `deleteScervFirestoreDocument` | Super-admin only | High-risk internal tooling; needs explicit controls | Confirm god-mode access is restricted, audited and environment-labeled before production use |
| `listScervAdminUsers`, `createScervAdminUser`, `updateScervAdminUserRole`, `setScervAdminUserDisabled` | Super-admin only | Needs admin-role/audit review | Verify bootstrap, role escalation controls and lockout recovery |

## Background and lifecycle endpoints

| Endpoint(s) | Intended caller | Local disposition | Remaining gate |
| --- | --- | --- | --- |
| `onUserCreate`, `syncCustomerSearchIndex` | Auth/background trigger | Needs trigger review | Confirm idempotency, privacy and index rebuild process |
| `handleCheckIn`, `clearTable` | Firestore trigger / operational lifecycle | Needs retry review | Verify retries, stale state and table cleanup interaction with browser/native flows |
| `releaseDueKitchenOrderPacing` | Scheduled job | Needs Phase 3 pacing review | Overdue backlog, pagination and duplicate release tests |
| `autoCloseStaleWorkDays` | Scheduled job | Needs operations review | Confirm business-day policy and no accidental active-shift closure |
| `emitDgiInvoice` | Tax/invoice side effect | Needs provider/compliance review | Confirm regional applicability and idempotent invoice emission |
| `seedMenuOnce` | Development/seed utility | Needs environment guard review | Confirm not callable in production without explicit dev-only control |

## Next review sequence

1. Complete Phase 1 review for customer/party/reservation public endpoints where ownership and privacy are separate from staff-session controls.
2. Complete admin/support endpoint review before using the portal as an unrestricted production support tool.
3. Move payment allocation, Stripe webhook replay, split payments, browser checkout and concurrent kitchen submission into Phase 2.
4. Keep PayPal/dLocal disabled until the product decision changes and a new payment design is approved.
5. Use this matrix as the checklist for QA release notes; do not mark an endpoint production-ready from local source evidence alone.
