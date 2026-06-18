import React, { useState } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";

// You can swap these out with your actual screenshots later
import fohImage from "../images/ordering.jpeg";
import bohImage from "../images/chefsQ.jpeg";
import guestImage from "../images/language.png";

const Section = styled.section`
	padding: 72px 0;
	background-color: ${({ theme }) => theme.colors.background};
	scroll-margin-top: 86px;
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.xl};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const SectionHeader = styled.div`
	text-align: center;
	margin-bottom: 42px;
`;

const Title = styled.h2`
	font-size: clamp(2rem, 4vw, 3.2rem);
	color: ${({ theme }) => theme.colors.text};
	margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const Subtitle = styled.p`
	font-size: 1.2rem;
	color: ${({ theme }) => theme.colors.textLight};
	max-width: 600px;
	margin: 0 auto;
`;

const TabContainer = styled.div`
	display: flex;
	justify-content: center;
	gap: 10px;
	margin-bottom: 36px;
	flex-wrap: wrap;
`;

const TabButton = styled.button`
	background: ${({ active, theme }) =>
		active ? theme.colors.primaryDark : theme.colors.white};
	border: 1px solid ${({ active, theme }) =>
		active ? theme.colors.primaryDark : theme.colors.gray};
	border-radius: 999px;
	font-size: 1.1rem;
	font-weight: 600;
	color: ${({ active, theme }) =>
		active ? theme.colors.white : theme.colors.textLight};
	padding: 10px 18px;
	cursor: pointer;
	transition: all 0.2s ease;

	&:hover {
		border-color: ${({ theme }) => theme.colors.primary};
		color: ${({ active, theme }) =>
		active ? theme.colors.white : theme.colors.primary};
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		font-size: 1rem;
		padding: 8px 10px;
	}
`;

const ContentArea = styled.div`
	background: ${({ theme }) => theme.colors.white};
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: ${({ theme }) => theme.radius.lg};
	box-shadow: 0 18px 50px rgba(19, 32, 39, 0.08);
	display: grid;
	gap: 36px;
	grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
	padding: 34px;

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr;
		padding: 24px;
	}
`;

const TextContent = styled.div`
	flex: 1;

	h3 {
		font-size: clamp(1.7rem, 3vw, 2.4rem);
		margin-bottom: 20px;
		color: ${({ theme }) => theme.colors.text};
	}

	p {
		font-size: 1.1rem;
		line-height: 1.6;
		color: ${({ theme }) => theme.colors.textLight};
		margin-bottom: 20px;
	}
`;

// 1. Changed to a Grid layout so images can stack perfectly
const ImageContent = styled.div`
	display: grid;
	place-items: center;
	width: 100%;
`;

// 2. Added the stacking and crossfade logic
const TabImage = styled.img`
	grid-area: 1 / 1; /* This forces all images to sit in the exact same spot */
	max-width: 100%;
	height: auto;
	border-radius: ${({ theme }) => theme.radius.md};
	box-shadow: 0 12px 35px rgba(19, 32, 39, 0.12);

	/* Crossfade animation logic */
	opacity: ${({ isActive }) => (isActive ? 1 : 0)};
	visibility: ${({ isActive }) => (isActive ? "visible" : "hidden")};
	transition:
		opacity 0.4s ease-in-out,
		visibility 0.4s ease-in-out;
`;

const Solutions = () => {
	const { t } = useTranslation();
	const [activeTab, setActiveTab] = useState("foh");

	const images = {
		foh: fohImage,
		boh: bohImage,
		guests: guestImage,
	};

	return (
		<Section id="solutions">
			<Container>
				<SectionHeader>
					<Title>{t("solutions.title")}</Title>
					<Subtitle>{t("solutions.subtitle")}</Subtitle>
				</SectionHeader>

				<TabContainer>
					<TabButton
						active={activeTab === "foh"}
						onClick={() => setActiveTab("foh")}
					>
						{t("solutions.tabs.foh")}
					</TabButton>
					<TabButton
						active={activeTab === "boh"}
						onClick={() => setActiveTab("boh")}
					>
						{t("solutions.tabs.boh")}
					</TabButton>
					<TabButton
						active={activeTab === "guests"}
						onClick={() => setActiveTab("guests")}
					>
						{t("solutions.tabs.guests")}
					</TabButton>
				</TabContainer>

				<ContentArea>
					<TextContent>
						<h3>{t(`solutions.content.${activeTab}.headline`)}</h3>
						<p>{t(`solutions.content.${activeTab}.desc`)}</p>
					</TextContent>
					<ImageContent>
						{/* 3. We map through ALL images so they download immediately */}
						{Object.keys(images).map((key) => (
							<TabImage
								key={key}
								src={images[key]}
								alt={`${key} Scerv interface`}
								isActive={activeTab === key}
							/>
						))}
					</ImageContent>
				</ContentArea>
			</Container>
		</Section>
	);
};

export default Solutions;
