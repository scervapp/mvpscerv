const admin = require("firebase-admin");
admin.initializeApp();

const checkInFunctions = require("./checkInFunctions");
const orderFunctions = require("./orderFunctions");
const paymentFunctions = require("./paymentFunctions");
const userFunctions = require("./userFunctions");
const reportingFunctions = require("./reporting");
const stripeOnboardingFunctions = require("./stripeOnboardingFunctions");
const generateCustomToken = require("./generateCustomTokenFunction");
const sendInvite = require("./sendInvite");
const setAdminClaim = require("./SetAdminClaimFunction");
const dishRatingFunction = require("./dishRatingFunction");
const partyFunctions = require("./partyFunctions");
const userSearchFunctions = require("./userSearchFunctions");
const basketFunctions = require("./basketFunctions");
const restaurantFunctions = require("./restaurantFunctions");

// Export functions from other files
exports.addItemToBasket = require("./basketFunctions").addItemToBasket;
exports.removeItemFromBasket =
	require("./basketFunctions").removeItemFromBasket;
exports.updateBasketItemQuantity =
	require("./basketFunctions").updateBasketItemQuantity;

exports.sendToChefsQ = require("./basketFunctions").sendToChefsQ;

exports.clearBasket = require("./basketFunctions").clearBasket;

exports.addItemToSharedBasket = basketFunctions.addItemToSharedBasket;
exports.sendItemsToChefsQ = basketFunctions.sendItemsToChefsQ;
exports.sendOrderToKitchen = basketFunctions.sendOrderToKitchen;
exports.linkBasketToCheckIn = basketFunctions.linkBasketToCheckIn;
exports.handleCheckIn = checkInFunctions.handleCheckIn;
exports.cancelCheckIn = checkInFunctions.cancelCheckIn;
exports.handleCheckInResponse = checkInFunctions.handleCheckInResponse;
exports.clearTable = checkInFunctions.clearTable;
exports.createOrder = orderFunctions.createOrder;
exports.createPendingOrder = orderFunctions.createPendingOrder;
exports.createPaymentIntent = paymentFunctions.createPaymentIntent;
exports.createSetupIntent = paymentFunctions.createSetupIntent;
exports.getStripePublishableKey = paymentFunctions.getStripePublishableKey;
exports.createEphemeralKey = paymentFunctions.createEphemeralKey;
exports.preparePaymentSheetData = paymentFunctions.preparePaymentSheetData;
exports.preparePartyPaymentSheet = paymentFunctions.preparePartyPaymentSheet;

exports.stripeWebhookTest = paymentFunctions.stripeWebhookTest;
exports.stripeWebhookLive = paymentFunctions.stripeWebhookLive;
//exports.createCheckoutSession = paymentFunctions.createCheckoutSession;
exports.handleStripeEvent = paymentFunctions.handleStripeEvent;

exports.createStripeCustomer = userFunctions.createStripeCustomer;
exports.createConnectedAccount =
	stripeOnboardingFunctions.createConnectedAccount;
exports.createLoginLink = stripeOnboardingFunctions.createLoginLink;
exports.checkOnboardingStatus = stripeOnboardingFunctions.checkOnboardingStatus;
exports.getDailySalesReport = reportingFunctions.getDailySalesReport;
exports.generateCustomToken = generateCustomToken.generateCustomToken;
exports.sendInvite = sendInvite.sendInvite;
exports.setAdminClaim = setAdminClaim.setAdminClaim;

// Dish ratings
exports.submitDishRating = dishRatingFunction.submitDishRating;
exports.aggregateDishRating = dishRatingFunction.aggregateDishRating;

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

// User Search Functions
exports.searchPIPs = userSearchFunctions.searchPIPs;

// Restaurant Functions
exports.startWorkDay = restaurantFunctions.startWorkDay;
exports.endWorkDay = restaurantFunctions.endWorkDay;
