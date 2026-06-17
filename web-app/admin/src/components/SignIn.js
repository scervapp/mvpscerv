import React, { useState } from "react";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../config/firebase";
import { useNavigate } from "react-router-dom";
import "./styles/SignIn.css";

const SignIn = () => {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(null);
	const [message, setMessage] = useState(null);
	const [loading, setLoading] = useState(false);
	const [resetLoading, setResetLoading] = useState(false);
	const navigate = useNavigate(); // Get the navigate function

	const handleSignIn = async (event) => {
		event.preventDefault();
		setError(null);
		setMessage(null);
		setLoading(true);

		// Basic email validation (remains the same)
		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			setError("Please enter a valid email address.");
			setLoading(false);
			return;
		}

		if (!password) {
			setError("Please enter a password");
			setLoading(false);
			return;
		}

		try {
			await signInWithEmailAndPassword(auth, email, password);
			navigate("/"); // Redirect on success
		} catch (error) {
			// Generic error message for *all* authentication failures
			setError("Invalid email or password.");
			console.error("Sign-in error:", error); // Log the full error for debugging
		} finally {
			setLoading(false);
		}
	};

	const handlePasswordReset = async () => {
		setError(null);
		setMessage(null);

		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			setError("Enter your admin email first, then request a reset link.");
			return;
		}

		setResetLoading(true);
		try {
			await sendPasswordResetEmail(auth, email);
			setMessage("Password reset email sent if that admin account exists.");
		} catch (error) {
			setError("Unable to send a password reset email right now.");
			console.error("Password reset error:", error);
		} finally {
			setResetLoading(false);
		}
	};

	return (
		<div className="signin-container">
			<h2>Scerv Admin</h2>
			{error && <p className="error-message">{error}</p>}
			{message && <p className="success-message">{message}</p>}
			<form onSubmit={handleSignIn}>
				<div>
					<label htmlFor="email">Email:</label>
					<input
						type="email"
						id="email"
						placeholder="Enter your email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
					/>
				</div>
				<div>
					<label htmlFor="password">Password:</label>
					<input
						type="password"
						id="password"
						placeholder="Enter your password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
				</div>
				<button type="submit" disabled={loading}>
					{loading ? "Signing In..." : "Sign In"}
				</button>
			</form>
			<button
				type="button"
				className="reset-button"
				disabled={resetLoading}
				onClick={handlePasswordReset}
			>
				{resetLoading ? "Sending reset..." : "Send password reset"}
			</button>
		</div>
	);
};

export default SignIn;
