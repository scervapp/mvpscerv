import React, { useState, useEffect } from "react";
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { auth } from "../config/firebase";
import { useNavigate } from "react-router-dom"; // Import useNavigate

const HandleInvite = () => {
	const [email, setEmail] = useState("");
	const navigate = useNavigate();

	useEffect(() => {
		if (isSignInWithEmailLink(auth, window.location.href)) {
			let emailFromLink = window.localStorage.getItem("emailForSignIn");
			if (!emailFromLink) {
				emailFromLink = window.prompt(
					"Please provide your email for confirmation"
				);
				window.localStorage.setItem("emailForSignIn", emailFromLink);
			}
			setEmail(emailFromLink);
		}
	}, []);

	const handleConfirm = async () => {
		try {
			await signInWithEmailLink(auth, email, window.location.href);
			// Redirect to dashboard or another page after successful sign-in
			navigate("/"); // Example: Navigate to the dashboard
		} catch (error) {
			console.error(error);
			// Handle errors (e.g., display an error message)
		}
	};

	return (
		<div>
			{email ? (
				<button onClick={handleConfirm}>Confirm Sign In</button>
			) : (
				<div>Checking for invitation...</div>
			)}
		</div>
	);
};

export default HandleInvite;