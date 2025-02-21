const admin = require("firebase-admin");


admin.initializeApp();

const uid = "6gSxhe3WJRXBU6Ps4DZLzal3Iz42";

admin
	.auth()
	.setCustomUserClaims(uid, { role: "godmode" })
	.then(() => {
		console.log("Custom  GODMODEclaim set for user with UID: ", uid);
	})
	.catch((error) => {
		console.log("Error setting custom claim for user." + error);
	});
