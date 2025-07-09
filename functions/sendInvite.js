// functions/sendInvite.js
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// We no longer initialize the client here.

exports.sendInvite = functions.https.onCall(async (data, context) => {
	const { email } = data;

	try {
		// --- THIS IS THE FIX ---
		// Initialize the Mailjet client INSIDE the function.
		// This ensures functions.config() is available when the function is called.
		const mailjet = require("node-mailjet").apiConnect(
			functions.config().mailjet.api_key,
			functions.config().mailjet.secret_key
		);
		// --- END OF FIX ---

		const link = await admin.auth().generateSignInWithEmailLink(email, {
			url: "https://admin.scerv.com/handle-invite", // Your admin portal URL
			handleCodeInApp: true,
		});

		const request = mailjet.post("send", { version: "v3.1" }).request({
			Messages: [
				{
					From: {
						Email: "no-reply@scerv.com", // Your sender email
						Name: "Scerv Admin Portal",
					},
					To: [{ Email: email }],
					Subject: "Welcome to the Scerv Admin Portal",
					HTMLPart: `
                        <p>You've been invited to the Scerv Admin Portal!</p>
                        <p>Click the link below to create your account:</p>
                        <a href="${link}">${link}</a>
                    `,
				},
			],
		});

		await request;
		console.log(`Successfully sent invite to ${email}`);
		return { success: true };
	} catch (error) {
		console.error("Error sending invite:", error);
		throw new functions.https.HttpsError(
			"internal",
			"Failed to send invitation."
		);
	}
});
