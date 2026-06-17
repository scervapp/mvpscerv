import React from "react";
import styled from "styled-components";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SEO from "./SEO"; // Remember to import your SEO component!

const AboutWrapper = styled.div`
	background-color: ${({ theme }) => theme.colors.background};
	padding: ${({ theme }) => theme.spacing.xl} 0;
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.lg};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const HeroSection = styled.div`
	text-align: center;
	margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const Title = styled.h1`
	font-family: ${({ theme }) => theme.fonts.heading};
	color: ${({ theme }) => theme.colors.primary};
	font-size: 3rem;
	margin-bottom: ${({ theme }) => theme.spacing.sm};

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 2.5rem;
	}
`;

const Subtitle = styled.p`
	font-size: 1.2rem;
	color: ${({ theme }) => theme.colors.text};
	opacity: 0.8;
	max-width: 700px;
	margin: 0 auto;
	line-height: 1.6;
`;

const ContentGrid = styled.div`
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: ${({ theme }) => theme.spacing.xl};
	align-items: center;
	margin-bottom: ${({ theme }) => theme.spacing.xl};

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr;
		gap: ${({ theme }) => theme.spacing.lg};
	}
`;

const TextBlock = styled.div`
	h2 {
		font-family: ${({ theme }) => theme.fonts.heading};
		color: ${({ theme }) => theme.colors.secondary};
		font-size: 2rem;
		margin-bottom: ${({ theme }) => theme.spacing.md};
	}
	p {
		font-size: 1.1rem;
		color: ${({ theme }) => theme.colors.text};
		line-height: 1.8;
		margin-bottom: ${({ theme }) => theme.spacing.md};
	}
`;

const HighlightBox = styled.div`
	background: ${({ theme }) => theme.colors.white};
	padding: ${({ theme }) => theme.spacing.lg};
	border-radius: ${({ theme }) => theme.radius.lg};
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
	border-left: 5px solid ${({ theme }) => theme.colors.primary};

	h3 {
		color: ${({ theme }) => theme.colors.primary};
		margin-bottom: 15px;
		font-size: 1.5rem;
	}

	p {
		line-height: 1.6;
		color: ${({ theme }) => theme.colors.text};
	}
`;

const CTAWrapper = styled.div`
	text-align: center;
	margin-top: ${({ theme }) => theme.spacing.xl};
	padding-top: ${({ theme }) => theme.spacing.lg};
	border-top: 1px solid ${({ theme }) => theme.colors.gray}30;
`;

const PrimaryButton = styled(Link)`
	display: inline-block;
	background-color: ${({ theme }) => theme.colors.secondary};
	color: ${({ theme }) => theme.colors.white};
	padding: 15px 30px;
	border-radius: ${({ theme }) => theme.radius.md};
	font-weight: 700;
	text-decoration: none;
	font-size: 1.1rem;
	transition: all 0.2s ease;

	&:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(241, 130, 32, 0.3);
	}
`;

const AboutUs = () => {
	const { t } = useTranslation();

	return (
		<AboutWrapper>
			{/* Added SEO Tags specific to the About page */}
			<SEO titleKey="about.heroTitle" descKey="about.heroSubtitle" />

			<Container>
				<HeroSection>
					<Title>{t("about.heroTitle")}</Title>
					<Subtitle>{t("about.heroSubtitle")}</Subtitle>
				</HeroSection>

				<ContentGrid>
					<TextBlock>
						<h2>{t("about.missionTitle")}</h2>
						<p>{t("about.missionP1")}</p>
						<p>{t("about.missionP2")}</p>
					</TextBlock>

					<HighlightBox>
						<h3>{t("about.marketTitle")}</h3>
						<p>{t("about.marketP")}</p>
					</HighlightBox>
				</ContentGrid>

				<CTAWrapper>
					<Title as="h2" style={{ fontSize: "2rem", color: "#333" }}>
						{t("about.ctaTitle")}
					</Title>
					<p style={{ marginBottom: "20px", fontSize: "1.1rem" }}>
						{t("about.ctaSubtitle")}
					</p>
					<PrimaryButton to="/request-demo">
						{t("header.requestDemo")}
					</PrimaryButton>
				</CTAWrapper>
			</Container>
		</AboutWrapper>
	);
};

export default AboutUs;
