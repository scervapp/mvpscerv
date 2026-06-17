import React from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { useTranslation } from "react-i18next"; // <-- 1. Import i18n hook

const CallToActionSection = styled.section`
	padding: 72px 0;
	background:
		linear-gradient(135deg, ${({ theme }) => theme.colors.primaryDark}, #071d25);
	color: ${({ theme }) => theme.colors.white};
	text-align: center;
`;

const Container = styled.div`
	max-width: ${({ theme }) =>
		theme.breakpoints.md}; /* Narrower container for better text wrapping */
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const Headline = styled.h2`
	font-size: 2.5rem;
	margin-bottom: ${({ theme }) => theme.spacing.md};
	font-weight: 700;
	line-height: 1.2;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 3rem;
	}
`;

const Subheadline = styled.p`
	font-size: 1.2rem;
	margin-bottom: ${({ theme }) => theme.spacing.lg};
	opacity: 0.88;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 1.3rem;
	}
`;

const CtaButtons = styled.div`
	display: flex;
	justify-content: center;
	gap: ${({ theme }) => theme.spacing.md};

	@media (max-width: ${({ theme }) => theme.breakpoints.sm || "500px"}) {
		flex-direction: column; /* Stack buttons on small phones */
	}
`;

const BaseButton = styled(Link)`
	display: inline-block;
	padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
	text-decoration: none;
	border-radius: ${({ theme }) => theme.radius.md};
	transition: all 0.2s ease;
	font-weight: 600;
	font-size: 1.1rem;
`;

/* 2. Primary Button: Solid White to pop off the primary colored background */
const PrimaryButton = styled(BaseButton)`
	background-color: ${({ theme }) => theme.colors.secondary};
	color: ${({ theme }) => theme.colors.white};
	border: 2px solid ${({ theme }) => theme.colors.secondary};

	&:hover {
		transform: translateY(-3px);
		box-shadow: 0 10px 20px rgba(0, 0, 0, 0.15);
	}
`;

/* 3. Secondary Button: Outlined / Ghost button */
const SecondaryButton = styled(BaseButton)`
	background-color: transparent;
	color: ${({ theme }) => theme.colors.white};
	border: 2px solid rgba(255, 255, 255, 0.55);

	&:hover {
		background-color: rgba(255, 255, 255, 0.1);
		transform: translateY(-3px);
	}
`;

const CallToAction = () => {
	// 4. Initialize translation hook
	const { t } = useTranslation();

	return (
		<CallToActionSection>
			<Container>
				<Headline>{t("cta.headline")}</Headline>
				<Subheadline>{t("cta.subheadline")}</Subheadline>
				<CtaButtons>
					<PrimaryButton to="/request-demo">
						{t("cta.primaryBtn")}
					</PrimaryButton>
					<SecondaryButton to="/contact">
						{t("cta.secondaryBtn")}
					</SecondaryButton>
				</CtaButtons>
			</Container>
		</CallToActionSection>
	);
};

export default CallToAction;
