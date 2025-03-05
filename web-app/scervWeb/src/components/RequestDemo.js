import React, { useState } from "react";
import styled from "styled-components";

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";

const FormSection = styled.section`
	padding: ${({ theme }) => theme.spacing.xl} 0;
	background-color: ${({ theme }) => theme.colors.background};
`;

const Container = styled.div`
	max-width: ${({ theme }) =>
		theme.breakpoints.md}; /* Smaller container for the form */
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const Form = styled.form`
	display: flex;
	flex-direction: column;
	background-color: ${({ theme }) => theme.colors.white};
	padding: ${({ theme }) => theme.spacing.lg};
	border-radius: ${({ theme }) => theme.radius.md};
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const H2 = styled.h2`
	font-size: 2rem;
	margin-bottom: 1rem;
	text-align: center;
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

const RequestDemo = () => {
	const [formData, setFormData] = useState({
		name: "",
		restaurantName: "",
		email: "",
		phone: "",
		message: "", // Optional message
	});

	const [errors, setErrors] = useState({});
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	const handleChange = (e) => {
		setFormData({ ...formData, [e.target.name]: e.target.value });
		// Clear error for the field when it's changed
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
			newErrors.restaurantName = "Restaurant name is required";
		}
		if (!formData.email.trim()) {
			newErrors.email = "Email is required";
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
			newErrors.email = "Invalid email format";
		}
		if (!formData.phone.trim()) {
			newErrors.phone = "Phone is required";
		} else if (!/^\d{10}$/.test(formData.phone)) {
			newErrors.phone = "Invalid phone number. Must be 10 digits.";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0; // Return true if no errors
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		if (!validateForm()) {
			return; // Stop if validation fails
		}

		setLoading(true);

		try {
			const docRef = await addDoc(collection(db, "demoRequests"), {
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
			}); // Reset form
			setSuccess(true);
		} catch (error) {
			console.error("Error adding document: ", error);
			setErrors({ submit: "Failed to submit request. Please try again." });
		} finally {
			setLoading(false);
		}
	};
	return (
		<FormSection>
			<Container>
				<H2>Request a Demo</H2>
				{success ? (
					<SuccessMessage>
						Thank you! Your request has been submitted. We'll be in touch soon.
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
							<Label htmlFor="message">Message (Optional):</Label>
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
							{loading ? "Submitting..." : "Request Demo"}
						</SubmitButton>
					</Form>
				)}
			</Container>
		</FormSection>
	);
};

export default RequestDemo;
