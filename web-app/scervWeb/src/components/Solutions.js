import React, { useState } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";

// You can swap these out with your actual screenshots later
import fohImage from "../images/ordering.jpeg";
import bohImage from "../images/chefsQ.jpeg";
import guestImage from "../images/language.png";

const Section = styled.section`
	padding: ${({ theme }) => theme.spacing.xl} 0;
	background-color: ${({ theme }) => theme.colors.background};
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.xl};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const SectionHeader = styled.div`
	text-align: center;
	margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const Title = styled.h2`
	font-size: 2.5rem;
	color: ${({ theme }) => theme.colors.primary};
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
	gap: 15px;
	margin-bottom: 40px;
	border-bottom: 2px solid ${({ theme }) => theme.colors.gray}4D;
	flex-wrap: wrap;
`;

const TabButton = styled.button`
	background: transparent;
	border: none;
	font-size: 1.1rem;
	font-weight: 600;
	color: ${({ active, theme }) =>
		active ? theme.colors.primary : theme.colors.textLight};
	padding: 10px 15px;
	cursor: pointer;
	border-bottom: 3px solid
		${({ active, theme }) => (active ? theme.colors.primary : "transparent")};
	transition: all 0.2s ease;

	&:hover {
		color: ${({ theme }) => theme.colors.primary};
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		font-size: 1rem;
		padding: 8px 10px;
	}
`;

const ContentArea = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 40px;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		flex-direction: row;
		justify-content: space-between;
		align-items: flex-start;
	}
`;

const TextContent = styled.div`
	flex: 1;

	h3 {
		font-size: 2rem;
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
	flex: 1;
	display: grid;
	place-items: center;
	width: 100%;
`;

// 2. Added the stacking and crossfade logic
const TabImage = styled.img`
	grid-area: 1 / 1; /* This forces all images to sit in the exact same spot */
	max-width: 100%;
	height: auto;
	border-radius: ${({ theme }) => theme.radius.lg};
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);

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
		<Section>
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
