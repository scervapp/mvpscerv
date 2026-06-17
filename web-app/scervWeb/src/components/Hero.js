import React from "react";
import styled from "styled-components";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import heroImage from "../images/hero-image.jpeg";
import SEO from "./SEO";

const HeroSection = styled.section`
	background: ${({ theme }) => theme.colors.primaryDark};
	color: ${({ theme }) => theme.colors.white};
	min-height: calc(100vh - 86px);
	overflow: hidden;
	position: relative;
`;

const HeroImage = styled.img`
	height: 100%;
	inset: 0;
	object-fit: cover;
	opacity: 0.34;
	position: absolute;
	width: 100%;
`;

const Overlay = styled.div`
	background:
		linear-gradient(90deg, rgba(8, 47, 58, 0.98), rgba(8, 47, 58, 0.78), rgba(8, 47, 58, 0.36)),
		linear-gradient(180deg, rgba(8, 47, 58, 0.24), rgba(8, 47, 58, 0.9));
	inset: 0;
	position: absolute;
`;

const Container = styled.div`
	margin: 0 auto;
	max-width: ${({ theme }) => theme.breakpoints.xl};
	padding: 96px ${({ theme }) => theme.spacing.md} 64px;
	position: relative;
	z-index: 1;
`;

const Content = styled.div`
	max-width: 820px;
`;

const Eyebrow = styled.p`
	color: ${({ theme }) => theme.colors.secondary};
	font-size: 0.88rem;
	font-weight: 800;
	letter-spacing: 0;
	margin-bottom: 14px;
	text-transform: uppercase;
`;

const Headline = styled.h1`
	color: ${({ theme }) => theme.colors.white};
	font-size: clamp(2.7rem, 7vw, 5.8rem);
	letter-spacing: 0;
	line-height: 0.98;
	margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Subheadline = styled.p`
	color: rgba(255, 255, 255, 0.9);
	font-size: clamp(1.12rem, 2vw, 1.35rem);
	line-height: 1.65;
	margin-bottom: ${({ theme }) => theme.spacing.lg};
	max-width: 760px;
`;

const CtaButtons = styled.div`
	display: flex;
	flex-wrap: wrap;
	gap: ${({ theme }) => theme.spacing.md};
	margin-bottom: 44px;
`;

const Button = styled(Link)`
	border-radius: ${({ theme }) => theme.radius.md};
	display: inline-block;
	font-weight: 800;
	padding: 14px 22px;
	text-decoration: none;
	transition:
		background-color 0.2s ease,
		border-color 0.2s ease,
		transform 0.2s ease;

	&:hover {
		transform: translateY(-2px);
	}
`;

const PrimaryButton = styled(Button)`
	background: ${({ theme }) => theme.colors.secondary};
	color: ${({ theme }) => theme.colors.white};

	&:hover {
		background: ${({ theme }) => theme.colors.secondaryDark};
		color: ${({ theme }) => theme.colors.white};
	}
`;

const SecondaryButton = styled(Button)`
	background: rgba(255, 255, 255, 0.08);
	border: 1px solid rgba(255, 255, 255, 0.34);
	color: ${({ theme }) => theme.colors.white};

	&:hover {
		background: rgba(255, 255, 255, 0.16);
		color: ${({ theme }) => theme.colors.white};
	}
`;

const ProofGrid = styled.div`
	display: grid;
	gap: 14px;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	max-width: 850px;

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr;
	}
`;

const ProofCard = styled.div`
	background: rgba(255, 255, 255, 0.09);
	border: 1px solid rgba(255, 255, 255, 0.18);
	border-radius: ${({ theme }) => theme.radius.md};
	padding: 18px;

	strong {
		color: ${({ theme }) => theme.colors.white};
		display: block;
		font-size: 1.05rem;
		margin-bottom: 6px;
	}

	span {
		color: rgba(255, 255, 255, 0.78);
		font-size: 0.94rem;
		line-height: 1.45;
	}
`;

const Hero = () => {
	const { t } = useTranslation();

	return (
		<HeroSection>
			<SEO titleKey="seo.home.title" descKey="seo.home.desc" />
			<HeroImage src={heroImage} alt="New York restaurant dining room" />
			<Overlay />
			<Container>
				<Content>
					<Eyebrow>{t("hero.eyebrow")}</Eyebrow>
					<Headline>{t("hero.headline")}</Headline>
					<Subheadline>{t("hero.subheadline")}</Subheadline>

					<CtaButtons>
						<PrimaryButton to="/request-demo">
							{t("hero.requestDemoBtn")}
						</PrimaryButton>
						<SecondaryButton to="/resources">
							{t("hero.resourcesBtn")}
						</SecondaryButton>
					</CtaButtons>
				</Content>

				<ProofGrid>
					<ProofCard>
						<strong>{t("hero.proof.service.title")}</strong>
						<span>{t("hero.proof.service.desc")}</span>
					</ProofCard>
					<ProofCard>
						<strong>{t("hero.proof.guest.title")}</strong>
						<span>{t("hero.proof.guest.desc")}</span>
					</ProofCard>
					<ProofCard>
						<strong>{t("hero.proof.operator.title")}</strong>
						<span>{t("hero.proof.operator.desc")}</span>
					</ProofCard>
				</ProofGrid>
			</Container>
		</HeroSection>
	);
};

export default Hero;
