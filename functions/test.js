const clientId =
	"AWsYpZuFlD_1X2xjW37yO-yzo0paygCwjteRSYSkR2sy66yHl-k8v3ve2vI8kd9Ft7my0XxgYrNfo-ad";
const secret =
	"ELm98XJ4k5TI47TsoKOsXxoxblwZjP0fnV7s_xlAak1dtbkSB5hmF4akv-ejObKRXitzN8ptZlGS47c2";
const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");

async function testKeys() {
	const response = await fetch(
		"https://api-m.sandbox.paypal.com/v1/oauth2/token",
		{
			method: "POST",
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "grant_type=client_credentials",
		},
	);

	const data = await response.json();
	console.log(
		data.access_token ? "✅ SUCCESS: Token Received" : "❌ FAILED",
		data,
	);
}

testKeys();
