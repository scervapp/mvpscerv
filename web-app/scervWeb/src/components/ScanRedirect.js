import React, { useEffect } from "react";

const ScanRedirect = () => {
	useEffect(() => {
		// Grab the device information
		const userAgent = navigator.userAgent || navigator.vendor || window.opera;

		// 1. Android Detection
		if (/android/i.test(userAgent)) {
			// Replace with your actual Google Play Store link
			window.location.href =
				"https://play.google.com/store/apps/details?id=com.scerv.eat&hl=en";
		}
		// 2. iOS Detection
		else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
			// Replace with your actual Apple App Store link
			window.location.href = "https://apps.apple.com/do/app/scerv/id1591335061";
		}
		// 3. Desktop / Web Fallback
		else {
			// If they scan it with an iPad or Laptop, send them to the homepage
			window.location.href = "/";
		}
	}, []);

	// This UI only shows for a fraction of a second while the redirect fires
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				alignItems: "center",
				height: "100vh",
				backgroundColor: "#f8f9fa",
			}}
		>
			<h2 style={{ color: "#333" }}>Opening Scerv...</h2>
			<p style={{ color: "#666" }}>Redirecting you to the App Store.</p>
		</div>
	);
};

export default ScanRedirect;
