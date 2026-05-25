import React, { useState } from "react";
import {
	View,
	Text,
	TextInput,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
} from "react-native";
import formatCurrency from "../../utils/currencyFormatter";

const NativeCheckoutForm = ({ onPayPress, isProcessing, totalAmount }) => {
	const [cardName, setCardName] = useState("");
	const [cardNumber, setCardNumber] = useState("");
	const [expiry, setExpiry] = useState("");
	const [cvv, setCvv] = useState("");
	const [documentId, setDocumentId] = useState(""); // Crucial for dLocal/LATAM!

	// --- Formatters ---
	const handleCardNumberChange = (text) => {
		// Remove all non-digits, then add a space every 4 digits
		let formatted = text.replace(/\D/g, "");
		formatted = formatted.replace(/(.{4})/g, "$1 ").trim();
		setCardNumber(formatted);
	};

	const handleExpiryChange = (text) => {
		// Remove non-digits, add a slash after the first 2 digits, limit to 5 chars (MM/YY)
		let formatted = text.replace(/\D/g, "");
		if (formatted.length >= 2) {
			formatted = `${formatted.slice(0, 2)}/${formatted.slice(2, 4)}`;
		}
		setExpiry(formatted);
	};

	const handleCvvChange = (text) => {
		setCvv(text.replace(/\D/g, "").substring(0, 4));
	};

	const handlePaySubmit = () => {
		// Strip the formatting spaces/slashes before sending to the API!
		const rawCardData = {
			name: cardName,
			number: cardNumber.replace(/\s/g, ""),
			exp_month: expiry.split("/")[0],
			exp_year: expiry.split("/")[1] || "",
			cvv: cvv,
			document: documentId,
		};
		onPayPress(rawCardData);
	};

	return (
		<View style={styles.container}>
			<Text style={styles.header}>Payment Details</Text>

			<TextInput
				style={styles.input}
				placeholder="Cardholder Name"
				placeholderTextColor="#999"
				value={cardName}
				onChangeText={setCardName}
				autoCapitalize="words"
			/>

			<TextInput
				style={styles.input}
				placeholder="Card Number (0000 0000 0000 0000)"
				placeholderTextColor="#999"
				keyboardType="numeric"
				maxLength={19}
				value={cardNumber}
				onChangeText={handleCardNumberChange}
			/>

			<View style={styles.row}>
				<TextInput
					style={[styles.input, styles.halfInput]}
					placeholder="MM/YY"
					placeholderTextColor="#999"
					keyboardType="numeric"
					maxLength={5}
					value={expiry}
					onChangeText={handleExpiryChange}
				/>
				<TextInput
					style={[styles.input, styles.halfInput]}
					placeholder="CVV"
					placeholderTextColor="#999"
					keyboardType="numeric"
					secureTextEntry
					maxLength={4}
					value={cvv}
					onChangeText={handleCvvChange}
				/>
			</View>

			{/* dLocal requires a Document/ID for fraud prevention in LATAM */}
			<TextInput
    style={styles.input}
    placeholder="ID Number (Cedula, Passport, or Driver's License)" // <--- Make it obvious for tourists
    placeholderTextColor="#999"
    value={documentId}
    onChangeText={setDocumentId}
/>

			<TouchableOpacity
				style={styles.payButton}
				onPress={handlePaySubmit}
				disabled={isProcessing}
			>
				{isProcessing ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.payButtonText}>
						Pay {formatCurrency(totalAmount)}
					</Text>
				)}
			</TouchableOpacity>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		marginTop: 20,
		padding: 20,
		backgroundColor: "#fff",
		borderRadius: 12,
		shadowColor: "#000",
		shadowOpacity: 0.05,
		shadowRadius: 10,
		elevation: 2,
	},
	header: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 15,
		color: "#333",
	},
	input: {
		borderWidth: 1,
		borderColor: "#ddd",
		borderRadius: 8,
		padding: 15,
		marginBottom: 15,
		fontSize: 16,
		backgroundColor: "#f9f9f9",
	},
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
	},
	halfInput: {
		width: "48%",
	},
	payButton: {
		backgroundColor: "#000",
		padding: 16,
		borderRadius: 8,
		alignItems: "center",
		marginTop: 10,
	},
	payButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "bold",
	},
});

export default NativeCheckoutForm;
