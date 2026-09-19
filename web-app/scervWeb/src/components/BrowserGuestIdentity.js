import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { httpsCallable } from "firebase/functions";
import { signInWithCustomToken } from "firebase/auth";
import { auth, functions } from "../config/firebase";

const STORAGE_KEY = "scerv_browser_guest";

const Panel = styled.form`
	background: ${({ theme }) => theme.colors.background};
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: 8px;
	display: grid;
	gap: 12px;
	margin-top: 18px;
	padding: 16px;
`;

const Header = styled.div`
	display: grid;
	gap: 4px;
`;

const Title = styled.h2`
	color: ${({ theme }) => theme.colors.text};
	font-size: 1rem;
	line-height: 1.2;
	margin: 0;
`;

const Helper = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 0.88rem;
	line-height: 1.5;
	margin: 0;
`;

const Field = styled.label`
	color: ${({ theme }) => theme.colors.text};
	display: grid;
	font-size: 0.86rem;
	font-weight: 800;
	gap: 6px;
`;

const Input = styled.input`
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: 8px;
	box-sizing: border-box;
	font: inherit;
	min-height: 44px;
	padding: 0 12px;
	width: 100%;

	&:focus {
		border-color: ${({ theme }) => theme.colors.primary};
		box-shadow: 0 0 0 3px rgba(14, 111, 127, 0.12);
		outline: none;
	}
`;

const CheckboxLabel = styled.label`
	align-items: flex-start;
	color: ${({ theme }) => theme.colors.textLight};
	display: flex;
	font-size: 0.82rem;
	font-weight: 700;
	gap: 8px;
	line-height: 1.45;
`;

const Button = styled.button`
	background: ${({ theme }) => theme.colors.secondary};
	border: 0;
	border-radius: 8px;
	color: #ffffff;
	cursor: pointer;
	font: inherit;
	font-weight: 900;
	min-height: 44px;
	padding: 0 14px;

	&:disabled {
		cursor: not-allowed;
		opacity: 0.66;
	}
`;

const SecondaryButton = styled.button`
	background: transparent;
	border: 0;
	color: ${({ theme }) => theme.colors.primary};
	cursor: pointer;
	font: inherit;
	font-size: 0.88rem;
	font-weight: 900;
	padding: 4px 0;
	text-align: left;
`;

const Notice = styled.p`
	color: ${({ $error, theme }) =>
		$error ? theme.colors.error : theme.colors.success};
	font-size: 0.86rem;
	font-weight: 800;
	line-height: 1.45;
	margin: 0;
`;

const sanitizeName = (value) =>
	String(value || "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 60);

const normalizeEmail = (value) =>
	String(value || "")
		.trim()
		.toLowerCase();

export const readStoredBrowserGuest = () => {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch (error) {
		return null;
	}
};

const BrowserGuestIdentity = ({ restaurantId, tableId, onVerified }) => {
	const [step, setStep] = useState("email");
	const [firstName, setFirstName] = useState("");
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [marketingConsent, setMarketingConsent] = useState(false);
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		const storedGuest = readStoredBrowserGuest();
		if (storedGuest?.uid && storedGuest?.email && storedGuest?.firstName) {
			onVerified?.(storedGuest);
		}
	}, [onVerified]);

	const canRequestCode = useMemo(
		() =>
			sanitizeName(firstName).length >= 2 &&
			/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)),
		[firstName, email],
	);

	const handleRequestCode = async (event) => {
		event.preventDefault();
		setError("");
		setMessage("");

		if (!canRequestCode) {
			setError("Enter your first name and a valid email.");
			return;
		}

		setLoading(true);
		try {
			const sendEmailOtp = httpsCallable(functions, "sendEmailOtp");
			await sendEmailOtp({
				email: normalizeEmail(email),
				purpose: "browser_dining",
			});
			setStep("code");
			setMessage("We sent a 6-digit code to your email.");
		} catch (err) {
			console.error("Browser OTP request failed:", err);
			setError(
				err.message || "We could not send the code. Please try again.",
			);
		} finally {
			setLoading(false);
		}
	};

	const handleVerifyCode = async (event) => {
		event.preventDefault();
		setError("");
		setMessage("");

		if (!/^\d{6}$/.test(code.trim())) {
			setError("Enter the 6-digit code.");
			return;
		}

		setLoading(true);
		try {
			const cleanEmail = normalizeEmail(email);
			const verifyEmailOtp = httpsCallable(functions, "verifyEmailOtp");
			const otpResponse = await verifyEmailOtp({
				email: cleanEmail,
				code: code.trim(),
			});

			if (!otpResponse.data?.token) {
				throw new Error("Verification failed.");
			}

			const credential = await signInWithCustomToken(
				auth,
				otpResponse.data.token,
			);
			const completeIdentity = httpsCallable(
				functions,
				"completeBrowserGuestIdentity",
			);
			const identityResponse = await completeIdentity({
				email: cleanEmail,
				firstName: sanitizeName(firstName),
				marketingConsent,
				source: "browser_dining",
				restaurantId,
				tableId,
			});

			const guest = {
				uid: credential.user.uid,
				...(identityResponse.data?.customer || {}),
				verifiedAt: new Date().toISOString(),
			};

			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
			setMessage("You are verified for this dining session.");
			onVerified?.(guest);
		} catch (err) {
			console.error("Browser OTP verification failed:", err);
			setError(err.message || "That code did not work. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	if (step === "code") {
		return (
			<Panel onSubmit={handleVerifyCode}>
				<Header>
					<Title>Verify your email</Title>
					<Helper>
						This protects your order, receipt, rewards, and payment history.
					</Helper>
				</Header>
				<Field>
					6-digit code
					<Input
						autoComplete="one-time-code"
						inputMode="numeric"
						maxLength={6}
						onChange={(event) =>
							setCode(event.target.value.replace(/[^\d]/g, ""))
						}
						value={code}
					/>
				</Field>
				<Button disabled={loading} type="submit">
					{loading ? "Verifying..." : "Verify"}
				</Button>
				<SecondaryButton
					disabled={loading}
					onClick={() => {
						setStep("email");
						setCode("");
						setMessage("");
						setError("");
					}}
					type="button"
				>
					Use a different email
				</SecondaryButton>
				{message ? <Notice>{message}</Notice> : null}
				{error ? <Notice $error>{error}</Notice> : null}
			</Panel>
		);
	}

	return (
		<Panel onSubmit={handleRequestCode}>
			<Header>
				<Title>Verify to continue</Title>
				<Helper>
					Guests can browse freely. Verification is required before table
					actions, rewards, receipts, or payments.
				</Helper>
			</Header>
			<Field>
				First name
				<Input
					autoComplete="given-name"
					onChange={(event) => setFirstName(event.target.value)}
					value={firstName}
				/>
			</Field>
			<Field>
				Email
				<Input
					autoComplete="email"
					inputMode="email"
					onChange={(event) => setEmail(event.target.value)}
					type="email"
					value={email}
				/>
			</Field>
			<CheckboxLabel>
				<input
					checked={marketingConsent}
					onChange={(event) => setMarketingConsent(event.target.checked)}
					type="checkbox"
				/>
				Send me Scerv rewards, dining updates, and restaurant offers. This is
				separate from transactional receipts and reservation messages.
			</CheckboxLabel>
			<Button disabled={loading || !canRequestCode} type="submit">
				{loading ? "Sending..." : "Send code"}
			</Button>
			{message ? <Notice>{message}</Notice> : null}
			{error ? <Notice $error>{error}</Notice> : null}
		</Panel>
	);
};

export default BrowserGuestIdentity;
