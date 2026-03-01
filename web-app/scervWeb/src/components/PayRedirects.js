import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export const PaymentSuccess = () => {
	const location = useLocation();
	const [appLink, setAppLink] = useState("scerv://payment-success");

	useEffect(() => {
		// 1. Grab the orderId from the URL
		const queryParams = new URLSearchParams(location.search);
		const orderId = queryParams.get("orderId");

		// 2. Build the Scerv app deep link
		const deepLink = `scerv://payment-success?orderId=${orderId}`;
		setAppLink(deepLink);

		// 3. Try the auto-redirect (Works on some Androids, blocked on most iOS)
		const timeout = setTimeout(() => {
			window.location.href = deepLink;
		}, 500);

		return () => clearTimeout(timeout);
	}, [location]);

	return (
		<div
			style={{
				textAlign: "center",
				padding: "100px 20px",
				fontFamily: "sans-serif",
			}}
		>
			<h2 style={{ color: "#4CAF50" }}>Payment Successful! 🎉</h2>
			<p style={{ fontSize: "18px", color: "#555" }}>
				Your payment has been secured.
			</p>

			{/* THE FIX: A physical button for iOS/Android to allow the redirect */}
			<div style={{ marginTop: "40px" }}>
				<p style={{ fontSize: "14px", color: "#888", marginBottom: "15px" }}>
					If you are not redirected automatically, tap the button below.
				</p>
				<a
					href={appLink}
					style={{
						display: "inline-block",
						backgroundColor: "#000",
						color: "#fff",
						padding: "16px 32px",
						textDecoration: "none",
						borderRadius: "8px",
						fontWeight: "bold",
						fontSize: "18px",
					}}
				>
					Return to Scerv App
				</a>
			</div>
		</div>
	);
};

export const PaymentCancel = () => {
	useEffect(() => {
		const timeout = setTimeout(() => {
			window.location.href = "scerv://payment-cancel";
		}, 500);
		return () => clearTimeout(timeout);
	}, []);

	return (
		<div
			style={{
				textAlign: "center",
				padding: "100px 20px",
				fontFamily: "sans-serif",
			}}
		>
			<h2 style={{ color: "#f44336" }}>Payment Cancelled</h2>
			<p style={{ fontSize: "18px", color: "#555" }}>
				No charges were made to your card.
			</p>

			<div style={{ marginTop: "40px" }}>
				<p style={{ fontSize: "14px", color: "#888", marginBottom: "15px" }}>
					If you are not redirected automatically, tap below.
				</p>
				<a
					href="scerv://payment-cancel"
					style={{
						display: "inline-block",
						backgroundColor: "#000",
						color: "#fff",
						padding: "16px 32px",
						textDecoration: "none",
						borderRadius: "8px",
						fontWeight: "bold",
						fontSize: "18px",
					}}
				>
					Return to Scerv App
				</a>
			</div>
		</div>
	);
};
