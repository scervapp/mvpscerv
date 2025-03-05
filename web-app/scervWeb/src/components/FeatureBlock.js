// src/components/FeatureBlock.js
import React from "react";
import styled from "styled-components";

const FeatureContainer = styled.div`
	text-align: center;
	padding: ${({ theme }) => theme.spacing.lg};
	border: 1px solid #ddd;
	border-radius: ${({ theme }) => theme.radius.md};
	transition: transform 0.2s ease, box-shadow 0.2s ease;

	&:hover {
		transform: translateY(-5px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
	}
`;

const Icon = styled.img`
	width: 80px; /* Or whatever size you want */
	height: auto;
	margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Title = styled.h3`
	font-size: 1.5rem;
	margin-bottom: ${({ theme }) => theme.spacing.sm};
	color: ${({ theme }) => theme.colors.primary}; /* Use your primary color */
`;

const Description = styled.p`
	font-size: 1rem;
	color: ${({ theme }) => theme.colors.textLight};
`;

const FeatureBlock = ({ iconSrc, altText, title, description }) => {
	return (
		<FeatureContainer>
			<Icon src={iconSrc} alt={altText} />
			<Title>{title}</Title>
			<Description>{description}</Description>
		</FeatureContainer>
	);
};

export default FeatureBlock;
