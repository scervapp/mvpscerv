import React from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next"; // <-- 1. Import i18n hook

import posIcon from "../images/pos-icon.svg";
import orderingIcon from "../images/ordering-icon.svg";
import queueIcon from "../images/queue-icon.svg";
import analyticsIcon from "../images/analytics-icon.svg";
import crmIcon from "../images/crm-icon.svg";
import webPortalIcon from "../images/web-portal-icon.svg";

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
	grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
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
	transition:
		transform 0.2s ease,
		box-shadow 0.2s ease;

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
	// 2. Initialize the translation function
	const { t } = useTranslation();

	return (
		<Section>
			<Container>
				{/* 3. Replace text with dynamic translation keys */}
				<H2>{t("features.restaurants.title")}</H2>
				<FeatureGrid>
					{/* Feature 1: Unified Ordering and Payment */}
					<FeatureCard>
						<FeatureImage
							src={unifiedOrderingScreenshot}
							alt="Scerv Unified Ordering and Payment Screenshot"
						/>
						<FeatureTitle>
							{t("features.restaurants.ordering.title")}
						</FeatureTitle>
						<FeatureDescription>
							{t("features.restaurants.ordering.desc")}
						</FeatureDescription>
						<FeatureIcon src={orderingIcon} alt="Unified Ordering Icon" />
					</FeatureCard>

					{/* Feature 3: Queue Management */}
					<FeatureCard>
						<FeatureImage
							src={queueScreenshot}
							alt="Scerv Chef's Q Screenshot"
						/>
						<FeatureTitle>{t("features.restaurants.queue.title")}</FeatureTitle>
						<FeatureDescription>
							{t("features.restaurants.queue.desc")}
						</FeatureDescription>
						<FeatureIcon src={queueIcon} alt="Queue Icon" />
					</FeatureCard>

					{/* Feature 2: Analytics */}
					<FeatureCard>
						<FeatureImage
							src={analyticsScreenshot}
							alt="Scerv Analytics Dashboard Screenshot"
						/>
						<FeatureTitle>
							{t("features.restaurants.analytics.title")}
						</FeatureTitle>
						<FeatureDescription>
							{t("features.restaurants.analytics.desc")}
						</FeatureDescription>
						<FeatureIcon src={analyticsIcon} alt="Analytics Icon" />
					</FeatureCard>
				</FeatureGrid>
				<CTASection>
					<CTAButton href="/request-demo">
						{t("features.restaurants.cta")}
					</CTAButton>
				</CTASection>
			</Container>
		</Section>
	);
};

export default FeaturesRestaurants;
