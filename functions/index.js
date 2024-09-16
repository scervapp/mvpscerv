const admin = require("firebase-admin");
admin.initializeApp();

const checkInFunctions = require("./checkInFunctions");
const orderFunctions = require("./orderFunctions");
const paymentFunctions = require("./paymentFunctions");
const userFunctions = require("./userFunctions");

// Export functions from other files
exports.addItemToBasket = require("./basketFunctions").addItemToBasket;
exports.removeItemFromBasket =
	require("./basketFunctions").removeItemFromBasket;
exports.updateBasketItemQuantity =
	require("./basketFunctions").updateBasketItemQuantity;

exports.sendToChefsQ = require("./basketFunctions").sendToChefsQ;

exports.clearBasket = require("./basketFunctions").clearBasket;

exports.handleCheckIn = checkInFunctions.handleCheckIn;
exports.cancelCheckIn = checkInFunctions.cancelCheckIn;
exports.createOrder = orderFunctions.createOrder;
exports.createPaymentIntent = paymentFunctions.createPaymentIntent;
exports.createSetupIntent = paymentFunctions.createSetupIntent;
exports.getStripePublishableKey = paymentFunctions.getStripePublishableKey;
exports.createEphemeralKey = paymentFunctions.createEphemeralKey;
exports.createStripeCustomer = userFunctions.createStripeCustomer;

