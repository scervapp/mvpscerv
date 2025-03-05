import React from "react";
import styled from "styled-components";

const TestimonialWrapper = styled.div`
	background-color: ${({ theme }) => theme.colors.white};
	padding: ${({ theme }) => theme.spacing.lg};
	border-radius: ${({ theme }) => theme.radius.md};
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	text-align: center; // Center the content within the card
	transition: transform 0.2s ease, box-shadow 0.2s ease;

	&:hover {
		transform: translateY(-5px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
	}
`;

const Quote = styled.p`
	font-style: italic;
	font-size: 1.1rem;
	color: ${({ theme }) => theme.colors.text};
	margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Attribution = styled.p`
	font-weight: 600;
	color: ${({ theme }) => theme.colors.text};
`;

const AuthorImage = styled.img`
	width: 60px; /* Adjust as needed */
	height: 60px;
	border-radius: 50%; /* Make it a circle */
	margin-bottom: ${({ theme }) => theme.spacing.sm};
	object-fit: cover; /* Ensure the image covers the area */
`;

const TestimonialCard = ({ quote, author, title, imageSrc }) => {
	return (
		<TestimonialWrapper>
			{imageSrc && <AuthorImage src={imageSrc} alt={author} />}
			<Quote>{quote}</Quote>
			<Attribution>
				{author}, {title}
			</Attribution>
		</TestimonialWrapper>
	);
};

export default TestimonialCard;
