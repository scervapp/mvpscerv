import React from "react";
import styled from "styled-components";
import FeatureBlock from "./FeatureBlock";
import posIcon from "../images/pos-icon.svg"; // Import your actual icon paths
import orderingIcon from "../images/ordering-icon.svg";
import queueIcon from "../images/queue-icon.svg";
import analyticsIcon from "../images/analytics-icon.svg";
import crmIcon from "../images/crm-icon.svg";
import webPortalIcon from "../images/web-portal-icon.svg";

// Import placeholder images for now, replace with actual screenshots/mockups
import unifiedOrderingScreenshot from "../images/ordering.jpeg";
import orderingScreenshot from "../images/placeholder.png";
import analyticsScreenshot from "../images/analytics.jpeg";
import queueScreenshot from "../images/chefsQ.jpeg";
import crmScreenshot from "../images/placeholder.png";
import adminScreenshot from "../images/placeholder.png";

const Section = styled.section`
	padding: ${({ theme }) => theme.spacing.xl} 0;
	background-color: ${({ theme }) => theme.colors.background};
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.xl};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const H2 = styled.h2`
	font-size: 2rem;
	margin-bottom: 1rem;
	text-align: center;
`;

const FeatureGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); /*  Grid */
	gap: 40px;
	margin-top: 40px;
	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr;
	}
`;

const FeatureCard = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	padding: ${({ theme }) => theme.spacing.lg};
	background-color: ${({ theme }) => theme.colors.white};
	border-radius: ${({ theme }) => theme.radius.md};
	box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
	transition: transform 0.2s ease, box-shadow 0.2s ease;

	&:hover {
		transform: translateY(-5px);
		box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
	}
`;

const FeatureImage = styled.img`
	max-width: 100%;
	height: auto;
	margin-bottom: ${({ theme }) => theme.spacing.md};
	border-radius: ${({ theme }) => theme.radius.sm};
`;

const FeatureTitle = styled.h3`
	font-size: 1.5rem;
	margin-bottom: ${({ theme }) => theme.spacing.sm};
	color: ${({ theme }) => theme.colors.primary};
`;

const FeatureDescription = styled.p`
	font-size: 1rem;
	color: ${({ theme }) => theme.colors.textLight};
	margin-bottom: ${({ theme }) => theme.spacing.md};
	line-height: 1.6;
	flex-grow: 1;
`;

const FeatureIcon = styled.img`
	width: 64px;
	height: auto;
	margin-bottom: ${({ theme }) => theme.spacing.md};
`;
const CTASection = styled.div`
	text-align: center;
	margin-top: ${({ theme }) => theme.spacing.xl};
`;

const CTAButton = styled.a`
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
		box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
	}
`;
const FeaturesRestaurants = () => {
	return (
		<Section>
			<Container>
				<H2>Empower Your Restaurant with Scerv</H2>
				<FeatureGrid>
					{/* Feature 1: Unified Ordering and Payment */}
					<FeatureCard>
						<FeatureImage
							src={unifiedOrderingScreenshot}
							alt="Scerv Unified Ordering and Payment Screenshot"
						/>
						<FeatureTitle>Integrated Ordering and Payment</FeatureTitle>
						<FeatureDescription>
							Scerv revolutionizes the dining experience with a seamless,
							integrated ordering and payment system. Customers order directly
							through the app, eliminating the need for traditional POS
							terminals and reducing wait times. Payments are processed
							automatically upon checkout, streamlining operations and enhancing
							customer satisfaction.
						</FeatureDescription>
						<FeatureIcon src={orderingIcon} alt="Unified Ordering Icon" />{" "}
						{/* Use the ordering icon */}
					</FeatureCard>

					{/* Feature 3: Queue Management */}
					<FeatureCard>
						<FeatureImage
							src={queueScreenshot}
							alt="Scerv Chef's Q Screenshot"
						/>
						<FeatureTitle>Chef's Q&trade;</FeatureTitle>
						<FeatureDescription>
							Streamline your kitchen operations with Scerv's Chef's Q. Incoming
							orders are automatically grouped by table and displayed clearly on
							a dedicated kitchen display system (KDS). This eliminates the need
							for paper tickets, reduces errors, and improves communication
							between front-of-house and back-of-house staff. Special
							instructions are clearly displayed, ensuring order accuracy and
							customer satisfaction. Optimize order preparation and delivery for
							maximum efficiency.
						</FeatureDescription>
						<FeatureIcon src={queueIcon} alt="Queue Icon" />
					</FeatureCard>

					{/* Feature 4: CRM */}
					{/* <FeatureCard>
						<FeatureImage src={crmScreenshot} alt="Scerv CRM Screenshot" />
						<FeatureTitle>Customer Relationship Management (CRM)</FeatureTitle>
						<FeatureDescription>
							Build lasting customer relationships with Scerv's built-in CRM.
							Track customer preferences, purchase history, and loyalty program
							participation. Personalize offers, send targeted promotions, and
							foster customer loyalty.
						</FeatureDescription>
						<FeatureIcon src={crmIcon} alt="CRM Icon" />
					</FeatureCard> */}

					{/* Feature 5: Admin */}
					{/* <FeatureCard>
						<FeatureImage
							src={adminScreenshot}
							alt="Scerv Analytics Dashboard Screenshot"
						/>
						<FeatureTitle>Admin Web Portal</FeatureTitle>
						<FeatureDescription>
							Effortlessly manage your restaurant's settings, menus, staff, and
							customer data from anywhere with our intuitive web portal.
						</FeatureDescription>
						<FeatureIcon src={webPortalIcon} alt="Web Portal Icon" />
					</FeatureCard> */}
					{/* Feature 2: Analytics */}
					<FeatureCard>
						<FeatureImage
							src={analyticsScreenshot}
							alt="Scerv Analytics Dashboard Screenshot"
						/>
						<FeatureTitle>Real-Time Analytics & Reporting</FeatureTitle>
						<FeatureDescription>
							Gain valuable insights into your restaurant's performance with
							Scerv's comprehensive reporting tools. Track sales, identify
							popular items, monitor customer behavior, and make data-driven
							decisions to optimize your menu, pricing, and staffing.
						</FeatureDescription>
						<FeatureIcon src={analyticsIcon} alt="Analytics Icon" />
					</FeatureCard>
				</FeatureGrid>
				<CTASection>
					<CTAButton href="#">Request a Demo</CTAButton>
				</CTASection>
			</Container>
		</Section>
	);
};

export default FeaturesRestaurants;
