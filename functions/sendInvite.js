const admin = require("firebase-admin");
const functions = require("firebase-functions");
const mailjet = require("node-mailjet").apiConnect(
	functions.config().mailjet.api_key,
	functions.config().mailjet.secret_key
);

exports.sendInvite = functions.https.onCall(async (data, context) => {
	const { email } = data; // Assuming you're passing teh emai in the data object

	try {
		const link = await admin.auth().generateSignInWithEmailLink(email, {
			// Configure setting like URL, handling of existing accounts
			url: "https://admin.scerv.com/handle-invite",
			handleCodeInApp: true,
		});

		const request = mailjet.post("send", { version: "v3.1" }).request({
			Messages: [
				{
					From: {
						Email: "no-reply@scerv.com", // Replace with your sender email
						Name: "Scerv Admin Portal",
					},
					To: [
						{
							Email: email,
						},
					],
					Subject: "Welcome to the Scerv Admin Portal",
					HTMLPart: `
                  <p>You've been invited to the Scerv Admin Portal!</p>
                  <p>Click the link below to create your account:</p>
                  <a href="<span class="math-inline">\{link\}"\></span>{link}</a>
                `,
				},
			],
		});

		await request;

		// Send the email invitation using your preferred method (e.g SnedGrid, Mailgun)
		// your email sending logic
	} catch (error) {
		console.error("Error", error);
	}
});
