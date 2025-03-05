import React from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";

const CallToActionSection = styled.section`
	padding: ${({ theme }) => theme.spacing.xl} 0;
	background-color: ${({ theme }) =>
		theme.colors.primary}; // Use your primary color
	color: ${({ theme }) => theme.colors.white};
	text-align: center;
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.xl};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const Headline = styled.h2`
	font-size: 2.5rem;
	margin-bottom: ${({ theme }) => theme.spacing.md};
	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 3rem; /* Larger font size on larger screens */
	}
`;

const Subheadline = styled.p`
	font-size: 1.2rem;
	margin-bottom: ${({ theme }) => theme.spacing.lg};
	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 1.5rem;
	}
`;

const CtaButtons = styled.div`
	display: flex;
	justify-content: center;
	gap: ${({ theme }) => theme.spacing.md};
`;

// Use Link for internal navigation
const Button = styled(Link)`
	display: inline-block;
	padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
	text-decoration: none;
	color: ${({ theme }) => theme.colors.white};
	border-radius: ${({ theme }) => theme.radius.md};
	transition: background-color 0.3s ease, transform 0.2s ease;
	font-weight: 600;
	border: 2px solid ${({ theme }) => theme.colors.white};

	&:hover {
		transform: translateY(-3px);
		background-color: ${({ theme }) => theme.colors.white};
		color: ${({ theme }) => theme.colors.primary};
	}
`;
const PrimaryButton = styled(Button)``;

const SecondaryButton = styled(Button)``;
const CallToAction = () => {
	return (
		<CallToActionSection>
			<Container>
				<Headline>Ready to Transform Your Restaurant?</Headline>
				<Subheadline>
					Join the Scerv revolution and see the difference today.
				</Subheadline>
				<CtaButtons>
					<PrimaryButton to="/request-demo">Request a Demo</PrimaryButton>{" "}
					{/* Changed to <Link> */}
					<SecondaryButton to="/contact">Contact Us</SecondaryButton>{" "}
					{/* Example - link to a contact page */}
				</CtaButtons>
			</Container>
		</CallToActionSection>
	);
};

export default CallToAction;
