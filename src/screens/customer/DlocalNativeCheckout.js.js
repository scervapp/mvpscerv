// components/checkout/DlocalNativeCheckout.js
import React, { useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { WebView } from "react-native-webview";

const DlocalNativeCheckout = ({
	publicKey,
	checkoutToken,
	amountFormatted,
	locale = "en",
	initialName = "",
	initialDocument = "",
	isLive = false, // 🚨 NEW: Pass this from your parent component!
	onTokenSuccess,
	onError,
	onProcessing,
}) => {
	const webViewRef = useRef(null);

	if (!checkoutToken) {
		return (
			<View
				style={[
					styles.container,
					{ justifyContent: "center", alignItems: "center" },
				]}
			>
				<ActivityIndicator size="large" color="#00D1B2" />
			</View>
		);
	}

	const cacheBuster = Date.now();

	// 🚨 THE FIX: Dynamically set the domain based on the environment
	const dlocalDomain = isLive
		? "https://checkout.dlocalgo.com"
		: "https://checkout-sbx.dlocalgo.com";

	const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        
        <script>
            function logScriptSuccess() {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOG', message: '✅ Network: dLocal JS downloaded successfully.' }));
            }
            function logScriptError() {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOG', message: '❌ Network: FAILED to download dLocal JS.' }));
            }
        </script>
        
        <script src="${dlocalDomain}/js/dlocalgo-smartfields-bundled.js?v=${cacheBuster}" onload="logScriptSuccess()" onerror="logScriptError()"></script>
        
        <style>
            body { font-family: -apple-system, sans-serif; padding: 0; margin: 0; background: transparent; }
            .form-row { margin-bottom: 20px; }
            label { display: block; margin-bottom: 8px; font-weight: bold; color: #333; font-size: 14px; }
            input[type="text"] { width: 100%; padding: 15px; border: 1px solid #E0E0E0; border-radius: 8px; box-sizing: border-box; font-size: 16px; margin-bottom: 15px;}
            .field-container { background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; padding: 2px; min-height: 50px; box-sizing: border-box; }
            #card-errors { color: #dc3545; margin-top: 8px; font-size: 14px; }
            button { background-color: #00D1B2; color: #fff; border: none; border-radius: 8px; padding: 15px; width: 100%; font-size: 16px; font-weight: bold; margin-top: 10px; }
            button:disabled { background-color: #a0aec0; }
            
            /* Styles for the Save Details Checkbox */
            .checkbox-container {
                display: flex;
                align-items: center;
                margin-bottom: 20px;
                padding: 10px 0;
                border-bottom: 1px solid #eee;
            }
            .checkbox-container input[type="checkbox"] {
                width: 24px;
                height: 24px;
                margin: 0 12px 0 0;
                accent-color: #00D1B2;
            }
            .checkbox-container label {
                margin: 0;
                font-size: 15px;
                font-weight: 500;
                color: #555;
            }
        </style>
    </head>
    <body>
        <form id="payment-form">
            <div class="form-row">
                <label for="card-holder">Cardholder Name</label>
                <input type="text" id="card-holder" placeholder="John Doe" value="${initialName}" required />

                <label for="card-document">Document ID (Cedula/Passport)</label>
                <input type="text" id="card-document" placeholder="8-123-4567" value="${initialDocument}" required />
                
                <div class="checkbox-container">
                    <input type="checkbox" id="save-details" />
                    <label for="save-details">Save name and Document ID for next time</label>
                </div>
                
                <label for="card-field">Credit or Debit Card</label>
                <div id="card-field" class="field-container"></div>
                <div id="card-errors" role="alert"></div>
            </div>
            <button id="submit-button" type="submit">Pay ${amountFormatted}</button>
        </form>

<script>
    (function() {
        var oldLog = console.log;
        console.log = function (message) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOG', message: 'JS Console: ' + message }));
            oldLog.apply(console, arguments);
        };
    })();

    let cardField;

    async function initializeDlocal() {
        try {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOG', message: 'Firing SDK Initialization...' }));
            
            await window.dlocalGo.initialize('${publicKey}', '${checkoutToken}');
            
            const fields = window.dlocalGo.fields();
            cardField = fields.create("card", {
                style: {
                    base: {
                        fontSize: "16px",
                        lineHeight: "24px",
                        fontFamily: "-apple-system, sans-serif",
                        color: "#32325d",
                        "::placeholder": { color: "#aab7c4" },
                    }
                }
            });

            cardField.mount(document.getElementById('card-field'));
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOG', message: '✅ SmartFields mounted successfully.' }));

        } catch (err) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOG', message: 'Init Error: ' + err.message }));
            document.getElementById('card-errors').textContent = "Failed to load payment form.";
            document.getElementById('card-errors').textContent = "Init Error: " + (err.message || JSON.stringify(err));
        }
    }

    let checkSDK = setInterval(function() {
        if (typeof window.dlocalGo !== 'undefined') {
            clearInterval(checkSDK); 
            initializeDlocal();      
        }
    }, 100);

    const form = document.getElementById('payment-form');
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        
        const nameValue = document.getElementById('card-holder').value.trim();
        const docValue = document.getElementById('card-document').value.trim();
        const wantsToSaveDetails = document.getElementById('save-details').checked;
        const submitButton = document.getElementById('submit-button');

        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PROCESSING' }));
        submitButton.disabled = true;
        document.getElementById('card-errors').textContent = ''; 

        try {
            const response = await window.dlocalGo.createCardToken(cardField, {
                name: nameValue
            });

            window.ReactNativeWebView.postMessage(JSON.stringify({ 
                type: 'SUCCESS', 
                token: response.token,
                cardholderName: nameValue,
                document: docValue,
                saveDetails: wantsToSaveDetails 
            }));

        } catch (error) {
            const msg = error.message || "Tokenization Failed. Please check card details.";
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOG', message: 'Tokenization Error: ' + msg }));
            document.getElementById('card-errors').textContent = msg;
            submitButton.disabled = false;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: msg }));
        }
    });
</script>
    </body>
    </html>
    `;

	const handleMessage = (event) => {
		try {
			const data = JSON.parse(event.nativeEvent.data);
			if (data.type === "LOG") {
				console.log("🌐 [WebView X-Ray]:", data.message);
			} else if (data.type === "SUCCESS") {
				onTokenSuccess({
					token: data.token,
					name: data.cardholderName,
					document: data.document,
					saveDetails: data.saveDetails,
				});
			} else if (data.type === "ERROR") {
				onError(data.message);
			} else if (data.type === "PROCESSING") {
				onProcessing();
			}
		} catch (error) {
			console.error("WebView Message Parsing Error", error);
		}
	};

	return (
		<View style={styles.container}>
			<WebView
				ref={webViewRef}
				originWhitelist={["*"]}
				source={{
					html: htmlContent,
					// 🚨 THE FIX: Inject dynamic base URL here too!
					baseUrl: dlocalDomain,
				}}
				onMessage={handleMessage}
				javaScriptEnabled={true}
				domStorageEnabled={true}
				keyboardDisplayRequiresUserAction={false}
				nestedScrollEnabled={true}
				style={[styles.webview, { opacity: 0.99 }]}
				startInLoadingState={true}
				renderLoading={() => (
					<ActivityIndicator
						size="large"
						color="#00D1B2"
						style={styles.loader}
					/>
				)}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		height: 520,
		width: "100%",
		backgroundColor: "transparent",
		marginTop: 10,
	},
	webview: { flex: 1, backgroundColor: "transparent" },
	loader: {
		position: "absolute",
		top: "50%",
		left: "50%",
		marginLeft: -18,
		marginTop: -18,
	},
});

export default React.memo(DlocalNativeCheckout, (prevProps, nextProps) => {
	return prevProps.checkoutToken === nextProps.checkoutToken;
});
