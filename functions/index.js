const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const checkInFunctions = require("./checkInFunctions");
const orderFuntions = require("./orderFunctions");

// Export functions from other files
exports.addItemToBasket = require("./basketFunctions").addItemToBasket;
exports.removeItemFromBasket =
	require("./basketFunctions").removeItemFromBasket;
exports.updateBasketItemQuantity =
	require("./basketFunctions").updateBasketItemQuantity;

exports.clearBasket = require("./basketFunctions").clearBasket;

exports.handleCheckIn = checkInFunctions.handleCheckIn;
exports.cancelCheckIn = checkInFunctions.cancelCheckIn;
exports.sendToChefsQ = orderFuntions.sendToChefsQ;

