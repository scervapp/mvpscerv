import React from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next"; // <-- 1. Import the hook
import heroImage from "../images/hero-image.jpeg";
import SEO from "./SEO";

const HeroSection = styled.section`
	position: relative;
	text-align: center;
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100vh;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		text-align: left;
	}
`;

const HeroContent = styled.div`
	padding: ${({ theme }) => theme.spacing.xl} ${({ theme }) => theme.spacing.md};
	position: relative;
	z-index: 2;
	color: ${({ theme }) => theme.colors.white};

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		max-width: 60%;
	}
`;

const Headline = styled.h1`
	font-size: 2.8rem;
	margin-bottom: ${({ theme }) => theme.spacing.sm};
	color: ${({ theme }) => theme.colors.white};
	font-weight: 700;
	line-height: 1.2;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 3.5rem;
	}
	@media (min-width: ${({ theme }) => theme.breakpoints.lg}) {
		font-size: 4rem;
	}
`;

const Subheadline = styled.p`
	font-size: 1.1rem;
	margin-bottom: ${({ theme }) => theme.spacing.md};
	color: ${({ theme }) => theme.colors.white};
	line-height: 1.5;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 1.3rem;
	}
`;

const IntroParagraph = styled.p`
	font-size: 1rem;
	margin-bottom: ${({ theme }) => theme.spacing.lg};
	color: ${({ theme }) => theme.colors.white};
	line-height: 1.6;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 1.1rem;
	}
`;

const CtaButtons = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: ${({ theme }) => theme.spacing.md};
	margin-bottom: ${({ theme }) => theme.spacing.lg};

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		flex-direction: row;
		justify-content: flex-start;
	}
`;

const Button = styled.a`
	display: inline-block;
	padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.xl};
	text-decoration: none;
	color: ${({ theme }) => theme.colors.white};
	border-radius: ${({ theme }) => theme.radius.md};
	transition:
		background-color 0.3s ease,
		transform 0.2s ease,
		box-shadow 0.2s ease;
	font-weight: 600;
	white-space: nowrap;

	&:hover {
		transform: translateY(-3px);
	}
`;

const PrimaryButton = styled(Button)`
	background-color: ${({ theme }) => theme.colors.primary};

	&:hover {
		background-color: ${({ theme }) => theme.colors.primaryDark};
		box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
	}
`;

const HeroImageWrapper = styled.div`
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	z-index: 0;

	&::before {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.4);
		z-index: 1;
	}
`;

const HeroImage = styled.img`
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
`;

const Hero = () => {
	// 2. Initialize the translation function
	const { t } = useTranslation();

	return (
		<HeroSection>
			<SEO titleKey="seo.home.title" descKey="seo.home.desc" />
			<HeroImageWrapper>
				<HeroImage src={heroImage} alt="Restaurant scene using Scerv" />
			</HeroImageWrapper>
			<HeroContent>
				{/* 3. Replace text with dynamic translation keys */}
				<Headline>{t("hero.headline")}</Headline>

				<Subheadline>{t("hero.subheadline")}</Subheadline>

				<IntroParagraph>{t("hero.intro")}</IntroParagraph>

				<CtaButtons>
					<PrimaryButton href="/request-demo">
						{t("hero.requestDemoBtn")}
					</PrimaryButton>
				</CtaButtons>
			</HeroContent>
		</HeroSection>
	);
};

export default Hero;
