const admin = require("firebase-admin");
admin.initializeApp();

const checkInFunctions = require("./checkInFunctions");
const orderFunctions = require("./orderFunctions");
const paymentFunctions = require("./paymentFunctions");
const userFunctions = require("./userFunctions");
const reportingFunctions = require("./reporting");
const stripeOnboardingFunctions = require("./stripeOnboardingFunctions");
const dishRatingFunction = require("./dishRatingFunction");
const partyFunctions = require("./partyFunctions");
const userSearchFunctions = require("./userSearchFunctions");
const basketFunctions = require("./basketFunctions");
const restaurantFunctions = require("./restaurantFunctions");
const terminalFunctions = require("./terminalFunctions");
const paypalHandlers = require("./paypalHandlers");
const dLocalFunctions = require("./dLocalFunctions");
// Export functions from other files
exports.addItemToBasket = require("./basketFunctions").addItemToBasket;
exports.removeItemFromBasket =
	require("./basketFunctions").removeItemFromBasket;
exports.updateBasketItemQuantity =
	require("./basketFunctions").updateBasketItemQuantity;

exports.sendToChefsQ = require("./basketFunctions").sendToChefsQ;

exports.clearBasket = require("./basketFunctions").clearBasket;

exports.addItemToSharedBasket = basketFunctions.addItemToSharedBasket;
exports.addStaffItemsToPartyAndSendToKitchen =
	basketFunctions.addStaffItemsToPartyAndSendToKitchen;
exports.sendItemsToChefsQ = basketFunctions.sendItemsToChefsQ;
exports.sendOrderToKitchen = basketFunctions.sendOrderToKitchen;
exports.linkBasketToCheckIn = basketFunctions.linkBasketToCheckIn;
exports.handleCheckIn = checkInFunctions.handleCheckIn;
exports.cancelCheckIn = checkInFunctions.cancelCheckIn;
exports.selfSeatingCheckIn = checkInFunctions.selfSeatingCheckIn;
exports.handleQRScan = checkInFunctions.handleQRScan;
exports.convertIndividualToParty = checkInFunctions.convertIndividualToParty;

exports.declineCheckIn = checkInFunctions.declineCheckIn;
exports.customerCancelSeatedCheckIn =
	checkInFunctions.customerCancelSeatedCheckIn;
exports.handleCheckInResponse = checkInFunctions.handleCheckInResponse;
exports.clearTable = checkInFunctions.clearTable;
exports.createOrder = orderFunctions.createOrder;
exports.createPendingOrder = orderFunctions.createPendingOrder;

// Payment Functions
exports.getStripePublishableKey = paymentFunctions.getStripePublishableKey;
exports.discountOrderItem = restaurantFunctions.discountOrderItem;

exports.preparePayment = paymentFunctions.preparePayment;

exports.stripeWebhookTest = paymentFunctions.stripeWebhookTest;
exports.stripeWebhookLive = paymentFunctions.stripeWebhookLive;
//exports.createCheckoutSession = paymentFunctions.createCheckoutSession;
exports.handleStripeEvent = paymentFunctions.handleStripeEvent;

exports.createStripeCustomer = userFunctions.createStripeCustomer;
exports.onUserCreate = userFunctions.onUserCreate;
exports.syncCustomerSearchIndex = userFunctions.syncCustomerSearchIndex;
exports.createUserAccount = userFunctions.createUserAccount;

exports.sendEmailOtp = userFunctions.sendEmailOtp;
exports.verifyEmailOtp = userFunctions.verifyEmailOtp;

exports.createConnectedAccount =
	stripeOnboardingFunctions.createConnectedAccount;
exports.createLoginLink = stripeOnboardingFunctions.createLoginLink;
exports.checkOnboardingStatus = stripeOnboardingFunctions.checkOnboardingStatus;
exports.getDailySalesReport = reportingFunctions.getDailySalesReport;
exports.getAggregatedSalesReport = reportingFunctions.getAggregatedSalesReport;
exports.getDashboardReport = reportingFunctions.getDashboardReport;

exports.getSalesReport = reportingFunctions.getSalesReport;

// Restaurant Party Control
exports.closePartyTable = restaurantFunctions.closePartyTable;
exports.createTerminalConnectionToken =
	terminalFunctions.createTerminalConnectionToken;
exports.prepareStaffTerminalPayment =
	terminalFunctions.prepareStaffTerminalPayment;
exports.captureStaffTerminalPayment =
	terminalFunctions.captureStaffTerminalPayment;

// Dish ratings
exports.submitDishRating = dishRatingFunction.submitDishRating;
exports.aggregateDishRating = dishRatingFunction.aggregateDishRating;
exports.submitMenuItemRating = dishRatingFunction.submitMenuItemRating;
exports.aggregateMenuItemRating = dishRatingFunction.aggregateMenuItemRating;
exports.aggregateMenuItemOrderStats =
	dishRatingFunction.aggregateMenuItemOrderStats;

// Party Functions
exports.createParty = partyFunctions.createParty;
exports.inviteToParty = partyFunctions.inviteToParty;
exports.joinParty = partyFunctions.joinParty;
exports.leaveParty = partyFunctions.leaveParty;
exports.cancelParty = partyFunctions.cancelParty;
exports.activatePartyCheckIn = partyFunctions.activatePartyCheckIn;
exports.cancelPartyCheckIn = partyFunctions.cancelPartyCheckIn;
exports.addLocalPIPToParty = partyFunctions.addLocalPipToParty;
exports.updateSharedBasketItemQuantity =
	partyFunctions.updateSharedBasketItemQuantity;
exports.removeSharedBasketItem = partyFunctions.removeSharedBasketItem;

exports.createPartySession = partyFunctions.createPartySession;

// User Search Functions
exports.searchPIPs = userSearchFunctions.searchPIPs;

// Restaurant Functions
exports.startWorkDay = restaurantFunctions.startWorkDay;
exports.endWorkDay = restaurantFunctions.endWorkDay;
exports.setManagerPin = restaurantFunctions.setManagerPin;
exports.verifyEmployeePin = restaurantFunctions.verifyEmployeePin;
exports.addEmployee = restaurantFunctions.addEmployee;
exports.updateEmployee = restaurantFunctions.updateEmployee;
exports.deleteEmployee = restaurantFunctions.deleteEmployee;
exports.setEmployeeRole = restaurantFunctions.setEmployeeRole;
exports.forceClearTable = restaurantFunctions.forceClearTable;
exports.assignPartyServer = restaurantFunctions.assignPartyServer;
exports.acknowledgePartyServiceRequest =
	restaurantFunctions.acknowledgePartyServiceRequest;
exports.updateKitchenOrderStationStatus =
	restaurantFunctions.updateKitchenOrderStationStatus;
exports.markReadyKitchenItemsServed =
	restaurantFunctions.markReadyKitchenItemsServed;
exports.completePickupOrderHandoff =
	restaurantFunctions.completePickupOrderHandoff;
exports.markPartyTableClean = restaurantFunctions.markPartyTableClean;
exports.autoCloseStaleWorkDays = restaurantFunctions.autoCloseStaleWorkDays;
//exports.updateEmployee = restaurantFunctions.updateEmployee;

exports.emitDgiInvoice = restaurantFunctions.emitDgiInvoice;

((exports.getReportingDashboard = reportingFunctions.getReportingDashboard),
	(exports.getOrdersLedger = reportingFunctions.getOrdersLedger),
	(exports.getOrderDetail = reportingFunctions.getOrderDetail),
	// Table functions
	(exports.addTable = restaurantFunctions.addTable));
exports.deleteTable = restaurantFunctions.deleteTable;
exports.updateTable = restaurantFunctions.updateTable;

exports.autoTranslateMenuItem = restaurantFunctions.autoTranslateMenuItem;

exports.createPayPalOrder = paypalHandlers.createPayPalOrder;
exports.capturePayPalOrder = paypalHandlers.capturePayPalOrder;
exports.chargeVaultedCard = paypalHandlers.chargeVaultedCard;

exports.createDlocalCheckout = dLocalFunctions.createDlocalCheckout;
exports.dlocalWebhook = dLocalFunctions.dlocalWebhook;
exports.processDlocalNativePayment = dLocalFunctions.processDlocalNativePayment;
exports.processDlocalTokenCharge = dLocalFunctions.processDlocalTokenCharge;
exports.getDlocalPublicKey = dLocalFunctions.getDlocalPublicKey;
exports.createDlocalPayment = dLocalFunctions.createDlocalPayment;
exports.confirmDlocalPayment = dLocalFunctions.confirmDlocalPayment;
exports.chargeSavedDlocalCard = dLocalFunctions.chargeSavedDlocalCard;
//
exports.translateInstruction = partyFunctions.translateInstruction;

//
exports.seedMenuOnce = paymentFunctions.seedMenuOnce;
