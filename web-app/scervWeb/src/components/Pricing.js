import React from "react";
import styled from "styled-components";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next"; // <-- 1. Import i18n hook
import SEO from "./SEO";

const PricingSection = styled.section`
	padding: ${({ theme }) => theme.spacing.xl} 0;
	background-color: ${({ theme }) => theme.colors.background};
	min-height: calc(100vh - 200px);
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.lg};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const HeaderWrapper = styled.div`
	text-align: center;
	max-width: 800px;
	margin: 0 auto ${({ theme }) => theme.spacing.xl};
`;

const H1 = styled.h1`
	font-size: 2.5rem;
	color: ${({ theme }) => theme.colors.primary};
	margin-bottom: ${({ theme }) => theme.spacing.md};
	font-weight: 700;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 3rem;
	}
`;

const Subheadline = styled.p`
	font-size: 1.2rem;
	color: ${({ theme }) => theme.colors.textLight};
	line-height: 1.6;
`;

const PricingCard = styled.div`
	background-color: ${({ theme }) => theme.colors.white};
	padding: ${({ theme }) => theme.spacing.xl};
	border-radius: ${({ theme }) => theme.radius.lg};
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
	max-width: 500px;
	margin: 0 auto;
	border-top: 6px solid ${({ theme }) => theme.colors.primary}; /* Enterprise accent border */
	position: relative;
	transition:
		transform 0.3s ease,
		box-shadow 0.3s ease;

	&:hover {
		transform: translateY(-5px);
		box-shadow: 0 15px 35px rgba(0, 0, 0, 0.12);
	}
`;

const Badge = styled.div`
	position: absolute;
	top: -15px;
	left: 50%;
	transform: translateX(-50%);
	background-color: ${({ theme }) => theme.colors.secondary};
	color: ${({ theme }) => theme.colors.white};
	padding: 6px 16px;
	border-radius: 20px;
	font-size: 0.85rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 1px;
	white-space: nowrap;
`;

const PriceWrapper = styled.div`
	text-align: center;
	margin-bottom: ${({ theme }) => theme.spacing.lg};
	padding-bottom: ${({ theme }) => theme.spacing.lg};
	border-bottom: 1px solid ${({ theme }) => theme.colors.gray}33; /* Light transparent gray line */
`;

const Price = styled.div`
	font-size: 4rem;
	font-weight: 800;
	color: ${({ theme }) => theme.colors.text};
	line-height: 1;
	margin-bottom: 10px;
`;

const Offer = styled.p`
	font-size: 1.1rem;
	font-weight: 600;
	color: ${({ theme }) => theme.colors.success};
`;

const FeaturesList = styled.ul`
	list-style: none;
	padding: 0;
	margin-bottom: ${({ theme }) => theme.spacing.xl};

	li {
		margin-bottom: 16px;
		font-size: 1.05rem;
		color: ${({ theme }) => theme.colors.text};
		display: flex;
		align-items: flex-start;
		gap: 12px;

		&::before {
			content: "✓";
			color: ${({ theme }) => theme.colors.primary};
			font-weight: bold;
			font-size: 1.2rem;
			line-height: 1;
		}
	}
`;

const Button = styled(Link)`
	display: block;
	text-align: center;
	padding: 16px;
	background-color: ${({ theme }) => theme.colors.primary};
	color: ${({ theme }) => theme.colors.white};
	border-radius: ${({ theme }) => theme.radius.md};
	text-decoration: none;
	font-weight: 700;
	font-size: 1.1rem;
	transition: all 0.2s ease;

	&:hover {
		background-color: ${({ theme }) => theme.colors.primaryDark};
		box-shadow: 0 6px 15px rgba(16, 107, 125, 0.3);
		transform: translateY(-2px);
	}
`;

const LimitedTime = styled.p`
	font-size: 0.9rem;
	color: ${({ theme }) => theme.colors.textLight};
	margin-top: ${({ theme }) => theme.spacing.md};
	text-align: center;
	font-style: italic;
`;

const Pricing = () => {
	// 2. Initialize the translation function
	const { t } = useTranslation();

	return (
		<PricingSection>
			<SEO titleKey="seo.pricing.title" descKey="seo.pricing.desc" />
			<Container>
				<HeaderWrapper>
					<H1>{t("pricing.header.title")}</H1>
					<Subheadline>{t("pricing.header.subtitle")}</Subheadline>
				</HeaderWrapper>

				<PricingCard>
					<Badge>{t("pricing.card.badge")}</Badge>

					<PriceWrapper>
						<Price>{t("pricing.card.price")}</Price>
						<Offer>{t("pricing.card.offer")}</Offer>
					</PriceWrapper>

					<FeaturesList>
						<li>
							<span
								dangerouslySetInnerHTML={{
									__html: t("pricing.card.features.f1"),
								}}
							/>
						</li>
						<li>
							<span
								dangerouslySetInnerHTML={{
									__html: t("pricing.card.features.f2"),
								}}
							/>
						</li>
						<li>
							<span
								dangerouslySetInnerHTML={{
									__html: t("pricing.card.features.f3"),
								}}
							/>
						</li>
						<li>
							<span
								dangerouslySetInnerHTML={{
									__html: t("pricing.card.features.f4"),
								}}
							/>
						</li>
						<li>
							<span
								dangerouslySetInnerHTML={{
									__html: t("pricing.card.features.f5"),
								}}
							/>
						</li>
					</FeaturesList>

					<Button to="/request-demo">{t("pricing.card.cta")}</Button>
					<LimitedTime>{t("pricing.card.note")}</LimitedTime>
				</PricingCard>
			</Container>
		</PricingSection>
	);
};

export default Pricing;
