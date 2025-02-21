import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../config/firebase";
import { useNavigate } from "react-router-dom";
import "./styles/SignIn.css";

const SignIn = () => {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(null);
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate(); // Get the navigate function

	const handleSignIn = async (event) => {
		event.preventDefault();
		setError(null);
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

	return (
		<div className="signin-container">
			<h2>Sign In</h2>
			{error && <p className="error-message">{error}</p>}
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
		</div>
	);
};

export default SignIn;
