import React, { useState } from "react";
import styled from "styled-components";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { useTranslation } from "react-i18next"; // <-- 1. Import i18n hook
import SEO from "./SEO";

const ContactSection = styled.section`
	padding: ${({ theme }) => theme.spacing.xl} 0;
	background-color: ${({ theme }) => theme.colors.background};
	min-height: calc(100vh - 200px);
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.lg};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
	display: grid;
	grid-template-columns: 1fr;
	gap: ${({ theme }) => theme.spacing.xl};

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr 1fr;
	}
`;

const ContactInfo = styled.div`
	display: flex;
	flex-direction: column;
	justify-content: center;
`;

const H1 = styled.h1`
	font-size: 2.5rem;
	color: ${({ theme }) => theme.colors.primary};
	margin-bottom: ${({ theme }) => theme.spacing.md};
	text-align: center;
	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		text-align: left;
	}
`;

const H2 = styled.h2`
	font-size: 1.5rem;
	margin-bottom: ${({ theme }) => theme.spacing.md};
	color: ${({ theme }) => theme.colors.text};
	text-align: center;
	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		text-align: left;
	}
`;

const P = styled.p`
	font-size: 1.1rem;
	line-height: 1.6;
	color: ${({ theme }) => theme.colors.textLight};
	margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const ContactItem = styled.div`
	display: flex;
	align-items: center;
	margin-bottom: ${({ theme }) => theme.spacing.md};
	font-size: 1.1rem;

	i {
		font-size: 1.5rem;
		margin-right: ${({ theme }) => theme.spacing.sm};
		color: ${({ theme }) =>
			theme.colors.secondary}; /* Accent color for icons */
	}

	a {
		color: ${({ theme }) => theme.colors.text};
		text-decoration: none;
		transition: color 0.2s ease;

		&:hover {
			color: ${({ theme }) => theme.colors.primary};
		}
	}
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
		box-shadow: 0 0 0 3px rgba(16, 107, 125, 0.1);
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
	background-color: ${({ theme }) => theme.colors.secondary};
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

const ContactUs = () => {
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

		if (!formData.name.trim()) newErrors.name = t("contact.errors.name");
		if (!formData.restaurantName.trim())
			newErrors.restaurantName = t("contact.errors.restaurant");

		if (!formData.email.trim()) {
			newErrors.email = t("contact.errors.emailReq");
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
			newErrors.email = t("contact.errors.emailInv");
		}

		if (!formData.phone.trim()) {
			newErrors.phone = t("contact.errors.phoneReq");
		} else if (!/^[\d\s\-\+\(\)]{8,15}$/.test(formData.phone)) {
			newErrors.phone = t("contact.errors.phoneInv");
		}

		if (!formData.message.trim()) {
			newErrors.message = t("contact.errors.messageReq");
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!validateForm()) return;

		setLoading(true);

		try {
			await addDoc(collection(db, "contacts"), {
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
			setErrors({ submit: t("contact.errors.submit") });
		} finally {
			setLoading(false);
		}
	};

	return (
		<ContactSection>
			<SEO titleKey="seo.contact.title" descKey="seo.contact.desc" />
			<Container>
				<ContactInfo>
					<H1>{t("contact.info.title")}</H1>
					<P>{t("contact.info.desc")}</P>
					<H2>{t("contact.info.subtitle")}</H2>
					<ContactItem>
						<i className="fas fa-envelope"></i>
						<a href="mailto:support@scerv.com">support@scerv.com</a>
					</ContactItem>
					<ContactItem>
						<i className="fas fa-phone"></i>
						<a href="tel:+50767844726">(507) 6784-4726</a>
					</ContactItem>
				</ContactInfo>

				<div>
					{success ? (
						<SuccessMessage>
							<h3>{t("contact.success.title")}</h3>
							<p>{t("contact.success.desc")}</p>
						</SuccessMessage>
					) : (
						<Form onSubmit={handleSubmit}>
							<FormGroup>
								<Label htmlFor="name">{t("contact.form.name")}</Label>
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
									{t("contact.form.restaurantName")}
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
								<Label htmlFor="email">{t("contact.form.email")}</Label>
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
								<Label htmlFor="phone">{t("contact.form.phone")}</Label>
								<Input
									type="tel"
									id="phone"
									name="phone"
									value={formData.phone}
									onChange={handleChange}
									className={errors.phone ? "invalid" : ""}
									placeholder="+507 1234 5678"
								/>
								{errors.phone && <ErrorMessage>{errors.phone}</ErrorMessage>}
							</FormGroup>

							<FormGroup>
								<Label htmlFor="message">{t("contact.form.message")}</Label>
								<TextArea
									id="message"
									name="message"
									value={formData.message}
									onChange={handleChange}
									rows="4"
									className={errors.message ? "invalid" : ""}
								/>
								{errors.message && (
									<ErrorMessage>{errors.message}</ErrorMessage>
								)}
							</FormGroup>

							{errors.submit && <ErrorMessage>{errors.submit}</ErrorMessage>}

							<SubmitButton type="submit" disabled={loading}>
								{loading
									? t("contact.form.submitting")
									: t("contact.form.submit")}
							</SubmitButton>
						</Form>
					)}
				</div>
			</Container>
		</ContactSection>
	);
};

export default ContactUs;
