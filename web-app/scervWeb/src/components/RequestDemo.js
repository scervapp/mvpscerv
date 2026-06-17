import React, { useState } from "react";
import styled from "styled-components";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { useTranslation } from "react-i18next"; // <-- 1. Import i18n hook
import SEO from "./SEO";

const FormSection = styled.section`
	padding: ${({ theme }) => theme.spacing.xl} 0;
	background-color: ${({ theme }) => theme.colors.background};
	min-height: calc(100vh - 200px); /* Keeps footer at the bottom */
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.xl};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
	display: flex;
	flex-direction: column;
	gap: 40px;

	/* Split layout for desktop */
	@media (min-width: ${({ theme }) => theme.breakpoints.lg}) {
		flex-direction: row;
		align-items: flex-start;
		justify-content: space-between;
	}
`;

const PitchSide = styled.div`
	flex: 1;
	max-width: 500px;

	h1 {
		font-size: 2.5rem;
		color: ${({ theme }) => theme.colors.primary};
		margin-bottom: 20px;
		line-height: 1.2;
	}

	p {
		font-size: 1.1rem;
		color: ${({ theme }) => theme.colors.textLight};
		margin-bottom: 30px;
		line-height: 1.6;
	}

	ul {
		list-style: none;
		padding: 0;

		li {
			font-size: 1.1rem;
			color: ${({ theme }) => theme.colors.text};
			margin-bottom: 15px;
			display: flex;
			align-items: flex-start;
			gap: 10px;

			&:before {
				content: "+";
				color: ${({ theme }) => theme.colors.secondary};
				font-weight: bold;
			}
		}
	}
`;

const FormSide = styled.div`
	flex: 1;
	width: 100%;
	max-width: 550px;
`;

const Form = styled.form`
	display: flex;
	flex-direction: column;
	background-color: ${({ theme }) => theme.colors.white};
	padding: ${({ theme }) => theme.spacing.xl};
	border-radius: ${({ theme }) => theme.radius.lg};
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
`;

const FormGroup = styled.div`
	margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
	display: block;
	margin-bottom: 6px;
	font-weight: 600;
	font-size: 0.95rem;
	color: ${({ theme }) => theme.colors.text};
`;

const Input = styled.input`
	width: 100%;
	padding: 12px;
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: ${({ theme }) => theme.radius.sm};
	font-size: 1rem;
	color: ${({ theme }) => theme.colors.text};
	transition: all 0.2s ease;
	box-sizing: border-box;

	&:focus {
		outline: none;
		border-color: ${({ theme }) => theme.colors.primary};
		box-shadow: 0 0 0 3px rgba(16, 107, 125, 0.1); /* Scerv teal glow */
	}

	&.invalid {
		border-color: ${({ theme }) => theme.colors.error};
	}
`;

const TextArea = styled.textarea`
	width: 100%;
	padding: 12px;
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: ${({ theme }) => theme.radius.sm};
	font-size: 1rem;
	color: ${({ theme }) => theme.colors.text};
	transition: all 0.2s ease;
	font-family: inherit;
	box-sizing: border-box;
	resize: vertical;

	&:focus {
		outline: none;
		border-color: ${({ theme }) => theme.colors.primary};
		box-shadow: 0 0 0 3px rgba(16, 107, 125, 0.1);
	}

	&.invalid {
		border-color: ${({ theme }) => theme.colors.error};
	}
`;

const ErrorMessage = styled.p`
	color: ${({ theme }) => theme.colors.error};
	font-size: 0.85rem;
	margin-top: 6px;
	font-weight: 500;
`;

const SubmitButton = styled.button`
	padding: 14px 24px;
	background-color: ${({ theme }) =>
		theme.colors.secondary}; /* Using Orange for high contrast CTA */
	color: ${({ theme }) => theme.colors.white};
	border: none;
	border-radius: ${({ theme }) => theme.radius.md};
	font-weight: 700;
	font-size: 1.1rem;
	cursor: pointer;
	transition: all 0.2s ease;
	margin-top: 10px;

	&:hover {
		background-color: ${({ theme }) => theme.colors.secondaryDark};
		transform: translateY(-2px);
	}

	&:disabled {
		background-color: ${({ theme }) => theme.colors.gray};
		cursor: not-allowed;
		transform: none;
	}
`;

const SuccessMessage = styled.div`
	background-color: rgba(40, 167, 69, 0.1);
	border: 1px solid ${({ theme }) => theme.colors.success};
	color: ${({ theme }) => theme.colors.success};
	padding: 30px;
	border-radius: ${({ theme }) => theme.radius.md};
	text-align: center;

	h3 {
		font-size: 1.5rem;
		margin-bottom: 10px;
	}

	p {
		font-size: 1.1rem;
	}
`;

const RequestDemo = () => {
	const { t } = useTranslation();

	const [formData, setFormData] = useState({
		name: "",
		restaurantName: "",
		email: "",
		phone: "",
		message: "",
	});

	const [errors, setErrors] = useState({});
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	const handleChange = (e) => {
		setFormData({ ...formData, [e.target.name]: e.target.value });
		if (errors[e.target.name]) {
			setErrors({ ...errors, [e.target.name]: null });
		}
	};

	const validateForm = () => {
		let newErrors = {};
		if (!formData.name.trim()) newErrors.name = t("demo.errors.name");
		if (!formData.restaurantName.trim())
			newErrors.restaurantName = t("demo.errors.restaurant");

		if (!formData.email.trim()) {
			newErrors.email = t("demo.errors.emailReq");
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
			newErrors.email = t("demo.errors.emailInv");
		}

		// Support common US and international phone formats.
		if (!formData.phone.trim()) {
			newErrors.phone = t("demo.errors.phoneReq");
		} else if (!/^[\d\s\-+()]{8,20}$/.test(formData.phone)) {
			newErrors.phone = t("demo.errors.phoneInv");
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!validateForm()) return;

		setLoading(true);

		try {
			await addDoc(collection(db, "demoRequests"), {
				...formData,
				timestamp: serverTimestamp(),
			});
			setFormData({
				name: "",
				restaurantName: "",
				email: "",
				phone: "",
				message: "",
			});
			setSuccess(true);
		} catch (error) {
			console.error("Error adding document: ", error);
			setErrors({ submit: t("demo.errors.submit") });
		} finally {
			setLoading(false);
		}
	};

	return (
		<FormSection>
			<SEO titleKey="seo.demo.title" descKey="seo.demo.desc" />
			<Container>
				<PitchSide>
					<h1>{t("demo.pitch.title")}</h1>
					<p>{t("demo.pitch.subtitle")}</p>
					<ul>
						<li>{t("demo.pitch.bullet1")}</li>
						<li>{t("demo.pitch.bullet2")}</li>
						<li>{t("demo.pitch.bullet3")}</li>
					</ul>
				</PitchSide>

				<FormSide>
					{success ? (
						<SuccessMessage>
							<h3>{t("demo.success.title")}</h3>
							<p>{t("demo.success.desc")}</p>
						</SuccessMessage>
					) : (
						<Form onSubmit={handleSubmit}>
							<FormGroup>
								<Label htmlFor="name">{t("demo.form.name")}</Label>
								<Input
									type="text"
									id="name"
									name="name"
									value={formData.name}
									onChange={handleChange}
									className={errors.name ? "invalid" : ""}
								/>
								{errors.name && <ErrorMessage>{errors.name}</ErrorMessage>}
							</FormGroup>

							<FormGroup>
								<Label htmlFor="restaurantName">
									{t("demo.form.restaurantName")}
								</Label>
								<Input
									type="text"
									id="restaurantName"
									name="restaurantName"
									value={formData.restaurantName}
									onChange={handleChange}
									className={errors.restaurantName ? "invalid" : ""}
								/>
								{errors.restaurantName && (
									<ErrorMessage>{errors.restaurantName}</ErrorMessage>
								)}
							</FormGroup>

							<FormGroup>
								<Label htmlFor="email">{t("demo.form.email")}</Label>
								<Input
									type="email"
									id="email"
									name="email"
									value={formData.email}
									onChange={handleChange}
									className={errors.email ? "invalid" : ""}
								/>
								{errors.email && <ErrorMessage>{errors.email}</ErrorMessage>}
							</FormGroup>

							<FormGroup>
								<Label htmlFor="phone">{t("demo.form.phone")}</Label>
								<Input
									type="tel"
									id="phone"
									name="phone"
									value={formData.phone}
									onChange={handleChange}
									className={errors.phone ? "invalid" : ""}
									placeholder="+1 (718) 555-0147"
								/>
								{errors.phone && <ErrorMessage>{errors.phone}</ErrorMessage>}
							</FormGroup>

							<FormGroup>
								<Label htmlFor="message">{t("demo.form.message")}</Label>
								<TextArea
									id="message"
									name="message"
									value={formData.message}
									onChange={handleChange}
									rows="4"
								/>
							</FormGroup>

							{errors.submit && <ErrorMessage>{errors.submit}</ErrorMessage>}

							<SubmitButton type="submit" disabled={loading}>
								{loading ? t("demo.form.submitting") : t("demo.form.submit")}
							</SubmitButton>
						</Form>
					)}
				</FormSide>
			</Container>
		</FormSection>
	);
};

export default RequestDemo;
