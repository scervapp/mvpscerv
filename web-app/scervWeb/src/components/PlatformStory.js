import React from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";

const Section = styled.section`
	background: ${({ theme }) => theme.colors.white};
	padding: 78px 0;
`;

const Container = styled.div`
	margin: 0 auto;
	max-width: ${({ theme }) => theme.breakpoints.xl};
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const Header = styled.div`
	display: grid;
	gap: 28px;
	grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
	margin-bottom: 38px;

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr;
	}
`;

const Eyebrow = styled.p`
	color: ${({ theme }) => theme.colors.secondary};
	font-size: 0.84rem;
	font-weight: 800;
	letter-spacing: 0;
	margin-bottom: 12px;
	text-transform: uppercase;
`;

const Title = styled.h2`
	color: ${({ theme }) => theme.colors.text};
	font-size: clamp(2rem, 4vw, 3.7rem);
	line-height: 1.02;
	margin: 0;
`;

const Intro = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 1.1rem;
	line-height: 1.7;
	margin: 0;
`;

const JourneyGrid = styled.div`
	display: grid;
	gap: 16px;
	grid-template-columns: repeat(4, minmax(0, 1fr));

	@media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		grid-template-columns: 1fr;
	}
`;

const JourneyCard = styled.article`
	background:
		linear-gradient(180deg, rgba(14, 111, 127, 0.08), rgba(255, 255, 255, 0)),
		${({ theme }) => theme.colors.background};
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: ${({ theme }) => theme.radius.md};
	min-height: 254px;
	padding: 22px;
	position: relative;

	&::before {
		background: ${({ theme }) => theme.colors.secondary};
		border-radius: 999px;
		content: "";
		height: 8px;
		left: 22px;
		position: absolute;
		top: 22px;
		width: 8px;
	}
`;

const Step = styled.p`
	color: ${({ theme }) => theme.colors.primary};
	font-size: 0.78rem;
	font-weight: 800;
	margin: 24px 0 12px;
	text-transform: uppercase;
`;

const CardTitle = styled.h3`
	color: ${({ theme }) => theme.colors.text};
	font-size: 1.25rem;
	margin-bottom: 10px;
`;

const CardCopy = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 0.98rem;
	line-height: 1.55;
	margin: 0;
`;

const OperatorLine = styled.div`
	align-items: center;
	background: ${({ theme }) => theme.colors.primaryDark};
	border-radius: ${({ theme }) => theme.radius.md};
	color: ${({ theme }) => theme.colors.white};
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	justify-content: space-between;
	margin-top: 18px;
	padding: 18px 22px;
`;

const OperatorText = styled.p`
	color: rgba(255, 255, 255, 0.88);
	font-size: 0.98rem;
	line-height: 1.55;
	margin: 0;
	max-width: 820px;
`;

const Badge = styled.span`
	background: rgba(255, 255, 255, 0.1);
	border: 1px solid rgba(255, 255, 255, 0.18);
	border-radius: 999px;
	color: ${({ theme }) => theme.colors.white};
	font-size: 0.85rem;
	font-weight: 800;
	padding: 8px 12px;
	white-space: nowrap;
`;

const PlatformStory = () => {
	const { t } = useTranslation();
	const steps = t("platformStory.steps", { returnObjects: true });

	return (
		<Section>
			<Container>
				<Header>
					<div>
						<Eyebrow>{t("platformStory.eyebrow")}</Eyebrow>
						<Title>{t("platformStory.title")}</Title>
					</div>
					<Intro>{t("platformStory.intro")}</Intro>
				</Header>

				<JourneyGrid>
					{steps.map((step) => (
						<JourneyCard key={step.title}>
							<Step>{step.step}</Step>
							<CardTitle>{step.title}</CardTitle>
							<CardCopy>{step.copy}</CardCopy>
						</JourneyCard>
					))}
				</JourneyGrid>

				<OperatorLine>
					<OperatorText>{t("platformStory.operatorLine")}</OperatorText>
					<Badge>{t("platformStory.badge")}</Badge>
				</OperatorLine>
			</Container>
		</Section>
	);
};

export default PlatformStory;
