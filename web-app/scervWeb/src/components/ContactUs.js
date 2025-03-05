import React, { useState } from "react";
import styled from "styled-components";

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";

const ContactSection = styled.section`
	padding: ${({ theme }) => theme.spacing.xl} 0;
	background-color: ${({ theme }) => theme.colors.background};
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.lg};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
	display: grid;
	grid-template-columns: 1fr; /* One column by default */
	gap: ${({ theme }) => theme.spacing.lg};

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr 1fr; /* Two columns on larger screens */
	}
`;

const ContactInfo = styled.div`
	display: flex;
	flex-direction: column;
	justify-content: center; /* Center content vertically */
`;

const H1 = styled.h1`
	font-size: 2.5rem;
	margin-bottom: ${({ theme }) => theme.spacing.md};
	text-align: center;
	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		text-align: left;
	}
`;

const H2 = styled.h2`
	font-size: 1.5rem;
	margin-bottom: ${({ theme }) => theme.spacing.md};
	text-align: center;
	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		text-align: left;
	}
`;

const P = styled.p`
	font-size: 1rem;
	line-height: 1.6;
	margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const ContactItem = styled.div`
	display: flex;
	align-items: center;
	margin-bottom: ${({ theme }) => theme.spacing.sm};

	i {
		/* Assuming you'll use font icons */
		font-size: 1.5rem;
		margin-right: ${({ theme }) => theme.spacing.sm};
		color: ${({ theme }) => theme.colors.primary};
	}
`;
const Form = styled.form`
	display: flex;
	flex-direction: column;
	background-color: ${({ theme }) => theme.colors.white};
	padding: ${({ theme }) => theme.spacing.lg};
	border-radius: ${({ theme }) => theme.radius.md};
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const FormGroup = styled.div`
	margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
	display: block;
	margin-bottom: ${({ theme }) => theme.spacing.xs};
	font-weight: 600;
	color: ${({ theme }) => theme.colors.text};
`;

const Input = styled.input`
	width: 100%;
	padding: ${({ theme }) => theme.spacing.sm};
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: ${({ theme }) => theme.radius.sm};
	font-size: 1rem;
	color: ${({ theme }) => theme.colors.text};
	transition: border-color 0.2s ease;

	&:focus {
		outline: none;
		border-color: ${({ theme }) => theme.colors.primary};
	}

	/* Style for invalid input */
	&.invalid {
		border-color: ${({ theme }) =>
			theme.colors.error}; /*  add an error color to your theme */
	}
`;
const TextArea = styled.textarea`
	width: 100%;
	padding: ${({ theme }) => theme.spacing.sm};
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: ${({ theme }) => theme.radius.sm};
	font-size: 1rem;
	color: ${({ theme }) => theme.colors.text};
	transition: border-color 0.2s ease;
	font-family: inherit; /* Important for textareas */

	&:focus {
		outline: none;
		border-color: ${({ theme }) => theme.colors.primary};
	}
	/* Style for invalid input */
	&.invalid {
		border-color: ${({ theme }) =>
			theme.colors.error}; /*  add an error color to your theme */
	}
`;

const ErrorMessage = styled.p`
	color: ${({ theme }) => theme.colors.error};
	font-size: 0.9rem;
	margin-top: ${({ theme }) => theme.spacing.xs};
`;

const SubmitButton = styled.button`
	padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
	background-color: ${({ theme }) => theme.colors.primary};
	color: ${({ theme }) => theme.colors.white};
	border: none;
	border-radius: ${({ theme }) => theme.radius.md};
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.2s ease;

	&:hover {
		background-color: ${({ theme }) => theme.colors.primaryDark};
	}

	&:disabled {
		background-color: ${({ theme }) => theme.colors.gray};
		cursor: not-allowed;
	}
`;
const SuccessMessage = styled.p`
	color: ${({ theme }) => theme.colors.success};
	font-size: 1.1rem;
	text-align: center;
	margin-top: ${({ theme }) => theme.spacing.md};
`;
const ContactUs = () => {
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

		if (!formData.name.trim()) {
			newErrors.name = "Name is required";
		}
		if (!formData.restaurantName.trim()) {
			newErrors.restaurantName = "Restaurant Name is required";
		}
		if (!formData.email.trim()) {
			newErrors.email = "Email is required";
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
			newErrors.email = "Invalid email format";
		}
		if (!formData.phone.trim()) {
			newErrors.phone = "Phone number is required";
		} else if (!/^\d{10}$/.test(formData.phone)) {
			newErrors.phone = "Invalid phone number. Must be 10 digits.";
		}
		if (!formData.message.trim()) {
			newErrors.message = "Message is required";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		if (!validateForm()) {
			return;
		}

		setLoading(true);

		try {
			const docRef = await addDoc(collection(db, "contacts"), {
				//Change to contacts collection
				...formData,
				timestamp: serverTimestamp(),
			});
			console.log("Document written with ID: ", docRef.id);
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
			setErrors({ submit: "Failed to submit request. Please try again." });
		} finally {
			setLoading(false);
		}
	};

	return (
		<ContactSection>
			<Container>
				<ContactInfo>
					<H1>Contact Us</H1>
					<P>
						We'd love to hear from you! Whether you have questions about Scerv,
						need support, or want to request a demo, please get in touch.
					</P>
					<H2>Contact Information</H2>
					<ContactItem>
						<i className="fas fa-envelope"></i>{" "}
						{/* Example icon - use your preferred icon library */}
						<a href="mailto:info@scerv.com">support@scerv.com</a>{" "}
						{/* Replace with your email */}
					</ContactItem>
					<ContactItem>
						<i className="fas fa-phone"></i> {/* Example icon */}
						<a href="tel:+15551234567">(315) 816-4744</a>{" "}
						{/* Replace with your phone number */}
					</ContactItem>
					{/* Add other contact methods, e.g., social media links */}
				</ContactInfo>
				<div>
					{success ? (
						<SuccessMessage>
							Thank you! Your message has been sent. We'll be in touch soon.
						</SuccessMessage>
					) : (
						<Form onSubmit={handleSubmit}>
							<FormGroup>
								<Label htmlFor="name">Your Name:</Label>
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
								<Label htmlFor="restaurantName">Restaurant Name:</Label>
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
								<Label htmlFor="email">Email:</Label>
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
								<Label htmlFor="phone">Phone:</Label>
								<Input
									type="tel"
									id="phone"
									name="phone"
									value={formData.phone}
									onChange={handleChange}
									className={errors.phone ? "invalid" : ""}
								/>
								{errors.phone && <ErrorMessage>{errors.phone}</ErrorMessage>}
							</FormGroup>

							<FormGroup>
								<Label htmlFor="message">Message:</Label>
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
								{loading ? "Submitting..." : "Send Message"}
							</SubmitButton>
						</Form>
					)}
				</div>
			</Container>
		</ContactSection>
	);
};

export default ContactUs;
