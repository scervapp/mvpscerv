import React, { useState } from "react";
import styled from "styled-components";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";

const SignupWrap = styled.section`
	background: ${({ theme }) => theme.colors.primaryDark};
	border-radius: ${({ theme }) => theme.radius.md};
	color: ${({ theme }) => theme.colors.white};
	margin: 24px auto 48px;
	max-width: 960px;
	padding: 28px;

	h2 {
		color: inherit;
		font-size: clamp(1.6rem, 3vw, 2.15rem);
		line-height: 1.16;
		margin: 0 0 10px;
	}

	p {
		color: rgba(255, 255, 255, 0.82);
		line-height: 1.65;
		margin: 0;
		max-width: 720px;
	}
`;

const SignupForm = styled.form`
	display: grid;
	gap: 12px;
	grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto;
	margin-top: 20px;

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr;
	}
`;

const Field = styled.label`
	display: grid;
	font-size: 0.86rem;
	font-weight: 700;
	gap: 7px;
`;

const Input = styled.input`
	border: 1px solid rgba(255, 255, 255, 0.22);
	border-radius: ${({ theme }) => theme.radius.sm};
	font: inherit;
	min-height: 46px;
	padding: 0 12px;
`;

const Select = styled.select`
	border: 1px solid rgba(255, 255, 255, 0.22);
	border-radius: ${({ theme }) => theme.radius.sm};
	font: inherit;
	min-height: 46px;
	padding: 0 12px;
`;

const SubmitButton = styled.button`
	align-self: end;
	background: ${({ theme }) => theme.colors.secondary};
	border: 0;
	border-radius: ${({ theme }) => theme.radius.sm};
	color: ${({ theme }) => theme.colors.white};
	cursor: pointer;
	font: inherit;
	font-weight: 800;
	min-height: 46px;
	padding: 0 18px;

	&:disabled {
		cursor: not-allowed;
		opacity: 0.72;
	}
`;

const HelperText = styled.p`
	font-size: 0.86rem;
	margin-top: 12px !important;
`;

const Notice = styled.p`
	color: ${({ $error, theme }) =>
		$error ? "#ffd7d7" : theme.colors.accent} !important;
	font-weight: 700;
	margin-top: 12px !important;
`;

const NewsletterSignup = ({ source = "resources" }) => {
	const [email, setEmail] = useState("");
	const [audience, setAudience] = useState("restaurant_operator");
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	const handleSubmit = async (event) => {
		event.preventDefault();
		setMessage("");
		setError("");

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
			setError("Enter a valid email address.");
			return;
		}

		setLoading(true);
		try {
			const submitNewsletterSignup = httpsCallable(
				functions,
				"submitScervNewsletterSignup",
			);
			const response = await submitNewsletterSignup({
				email,
				audience,
				source,
				pagePath: window.location.pathname,
				userAgent: window.navigator.userAgent,
			});
			setEmail("");
			setMessage(
				response.data?.alreadySubscribed
					? "You are already on the Scerv list. We will keep you in the loop."
					: "You are in. Watch for Scerv hospitality notes and restaurant growth ideas.",
			);
		} catch (err) {
			console.error("Newsletter signup failed:", err);
			setError("We could not save your signup. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<SignupWrap>
			<h2>Get the Scerv hospitality newsletter.</h2>
			<p>
				Join operators, founders, and hospitality builders getting practical
				ideas on restaurant growth, guest engagement, and the future of dining.
			</p>
			<SignupForm onSubmit={handleSubmit}>
				<Field>
					Email
					<Input
						type="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						placeholder="you@example.com"
						required
					/>
				</Field>
				<Field>
					I am interested as
					<Select
						value={audience}
						onChange={(event) => setAudience(event.target.value)}
					>
						<option value="restaurant_operator">Restaurant operator</option>
						<option value="dining_guest">Dining guest</option>
						<option value="both">Both</option>
					</Select>
				</Field>
				<SubmitButton type="submit" disabled={loading}>
					{loading ? "Joining..." : "Join"}
				</SubmitButton>
			</SignupForm>
			<HelperText>
				No spam. Just useful Scerv resources, launch updates, and hospitality
				thinking.
			</HelperText>
			{message && <Notice>{message}</Notice>}
			{error && <Notice $error>{error}</Notice>}
		</SignupWrap>
	);
};

export default NewsletterSignup;
