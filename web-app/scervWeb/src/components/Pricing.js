import React from "react";
import styled from "styled-components";
import { Link } from "react-router-dom";

const PricingSection = styled.section`
	padding: ${({ theme }) => theme.spacing.xl} 0;
	background-color: ${({ theme }) => theme.colors.background};
	text-align: center; /* Center everything initially */
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.lg};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const H1 = styled.h1`
	font-size: 2.5rem;
	margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const Subheadline = styled.p`
	font-size: 1.2rem;
	color: ${({ theme }) => theme.colors.textLight};
	margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const PricingCard = styled.div`
	background-color: ${({ theme }) => theme.colors.white};
	padding: ${({ theme }) => theme.spacing.lg};
	border-radius: ${({ theme }) => theme.radius.md};
	box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
	transition: transform 0.2s ease, box-shadow 0.2s ease;
	max-width: 400px; /* Limit the width of the card */
	margin: 0 auto; /* Center the card horizontally */

	&:hover {
		transform: translateY(-5px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
	}
`;

const PlanName = styled.h2`
	font-size: 2rem;
	margin-bottom: ${({ theme }) => theme.spacing.sm};
	color: ${({ theme }) => theme.colors.primary};
`;

const Price = styled.p`
	font-size: 2.5rem; /*  large font size for "Free" */
	font-weight: bold;
	margin-bottom: ${({ theme }) => theme.spacing.md};
	color: ${({ theme }) => theme.colors.text};
`;

const Offer = styled.p`
	font-size: 1.2rem;
	font-weight: 600;
	color: ${({ theme }) =>
		theme.colors.success}; /* Use a green color for emphasis */
	margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const FeaturesList = styled.ul`
	list-style: none;
	padding: 0;
	margin-bottom: ${({ theme }) => theme.spacing.lg};
	text-align: left; /* Align feature list to the left */

	li {
		margin-bottom: ${({ theme }) => theme.spacing.sm};
		&::before {
			content: "✓ "; /* Add a checkmark before each feature */
			color: ${({ theme }) => theme.colors.primary};
			font-weight: bold;
		}
	}
`;

const Button = styled(Link)`
	display: inline-block;
	padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
	background-color: ${({ theme }) => theme.colors.primary};
	color: ${({ theme }) => theme.colors.white};
	border-radius: ${({ theme }) => theme.radius.md};
	text-decoration: none;
	font-weight: 600;
	transition: background-color 0.2s ease;

	&:hover {
		background-color: ${({ theme }) => theme.colors.primaryDark};
	}
`;

const LimitedTime = styled.p`
	font-size: 0.9rem;
	color: ${({ theme }) => theme.colors.textLight};
	margin-top: ${({ theme }) => theme.spacing.md};
`;
const Bold = styled.b`
	font-weight: bold;
`;

const Pricing = () => {
	return (
		<PricingSection>
			<Container>
				<H1>Transform Your Restaurant Operations – Absolutely Free!</H1>{" "}
				{/* Changed headline */}
				<Subheadline>
					For a limited time, experience the complete Scerv platform with no
					subscription fees and zero transaction costs. This is your chance to
					revolutionize your restaurant without any financial commitment.
				</Subheadline>
				<PricingCard>
					<PlanName>Join Us!</PlanName> {/* Changed plan name */}
					<Price>Free</Price>
					<Offer>+ No Transaction Fees!</Offer> {/* Changed offer text */}
					<FeaturesList>
						<li>
							<Bold>Unified Ordering and Payment:</Bold> Streamlined customer
							ordering and automatic payments.
						</li>
						<li>
							<Bold>Chef's Q&trade;:</Bold> Efficient kitchen order management.
						</li>
						<li>
							<Bold>Real-Time Analytics & Reporting:</Bold> Data-driven insights
							for your restaurant.
						</li>
						<li>
							<Bold>Dynamic Menu Management:</Bold> Easy real-time menu updates.
						</li>
						<li>
							<Bold>Customer Relationship Management (CRM):</Bold> Build
							customer loyalty.
						</li>
						<li>
							<Bold>Admin Web Portal:</Bold> Manage everything in one place.
						</li>
					</FeaturesList>
					<Button to="/request-demo">Get Started Now</Button>
					<LimitedTime>Limited-time offer. Sign up today!</LimitedTime>
				</PricingCard>
			</Container>
		</PricingSection>
	);
};

export default Pricing;
