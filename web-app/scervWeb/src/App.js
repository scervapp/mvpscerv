import React from "react";

import logo from "../src/scerv_logo.png";
import googlebadge from "../src/google-play-badge-logo.svg";
import appstorebadge from "../src/app-store-badge.svg";

import "./App.css";
import Header from "./components/Header";

const App = () => {
	return (
		<div
			style={{
				fontFamily: "Poppins, sans-serif",
				margin: 0,
				backgroundColor: "#f8f8f8",
				display: "flex",
				flexDirection: "column", // Add flexDirection: 'column'
				justifyContent: "center",
				alignItems: "center",
				minHeight: "100vh",
				textAlign: "center",
			}}
		>
			{" "}
			{/* Inline styles added here */}
			<img
				src={logo}
				alt="Scerv Logo"
				style={{
					width: 115,

					marginBottom: 20,
				}}
			/>
			<h1
				style={{
					fontSize: 36,
					fontWeight: 700,
					color: "#333",
					marginBottom: 10,
				}}
			>
				Scerv
			</h1>
			<p
				style={{
					fontSize: 20,
					color: "#666",
					marginBottom: 30,
				}}
			>
				The Future of Dining
			</p>
			<p
				style={{
					fontSize: 24,
					color: "#007bff",
					marginBottom: 20,
				}}
			>
				Coming Soon!
			</p>
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					gap: 20,
				}}
			>
				<img
					src={appstorebadge}
					alt="Download on the App Store"
					style={{ width: 80 }}
				/>
				<img
					src={googlebadge}
					alt="Get it on Google Play"
					style={{ width: 150 }}
				/>
			</div>
		</div>
	);
};

export default App;

