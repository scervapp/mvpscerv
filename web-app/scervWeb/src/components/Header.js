import React, { useState } from "react";
import logo from "../scerv_logo.png";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { useTranslation } from "react-i18next";

const HeaderWrapper = styled.header`
	background-color: rgba(255, 255, 255, 0.95);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	padding: ${({ theme }) => theme.spacing.md} 0;
	box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
	position: sticky;
	top: 0;
	z-index: 100;
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.xl};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
	display: flex;
	align-items: center;
	justify-content: space-between;
`;

const LogoLink = styled(Link)`
	display: flex;
	align-items: center;
	text-decoration: none;
	z-index: 101;
`;

const Logo = styled.img`
	width: 55px;
	height: auto;
`;

const MobileMenuIcon = styled.div`
	display: none;
	cursor: pointer;
	flex-direction: column;
	gap: 6px;
	z-index: 101;

	span {
		width: 25px;
		height: 3px;
		background-color: ${({ theme }) => theme.colors.text};
		border-radius: 2px;
		transition: all 0.3s ease;
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		display: flex;
	}
`;

const Nav = styled.nav`
	display: flex;
	align-items: center;
	flex-grow: 1; /* 1. Allows Nav to take up remaining space */

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		align-items: center;
		margin-right: auto; /* 2. This is the magic rule that pushes the buttons to the right! */

		li {
			margin-left: ${({ theme }) => theme.spacing.lg};

			a {
				color: ${({ theme }) => theme.colors.text};
				text-decoration: none;
				font-weight: 600;
				transition: color 0.2s ease;

				&:hover {
					color: ${({ theme }) => theme.colors.primary};
				}
			}
		}
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		position: absolute;
		top: 100%;
		left: 0;
		width: 100%;
		background-color: ${({ theme }) => theme.colors.white};
		flex-direction: column;
		padding: ${({ isOpen }) => (isOpen ? "20px 0" : "0")};
		height: ${({ isOpen }) => (isOpen ? "auto" : "0")};
		overflow: hidden;
		box-shadow: ${({ isOpen }) =>
			isOpen ? "0 10px 15px rgba(0,0,0,0.05)" : "none"};
		transition: all 0.3s ease-in-out;
		opacity: ${({ isOpen }) => (isOpen ? "1" : "0")};

		ul {
			flex-direction: column;
			width: 100%;
			margin-right: 0; /* Reset for mobile */
			li {
				margin: 15px 0;
			}
		}
	}
`;

const ActionButtons = styled.div`
	display: flex;
	align-items: center;
	gap: 20px; /* 3. Adds clean spacing between the toggle and the Request Demo button */

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		flex-direction: column;
		gap: 15px;
		margin-top: 20px;
	}
`;

const LangToggle = styled.button`
	display: flex;
	align-items: center;
	gap: 8px; /* Space between flag and text */
	background: transparent;
	border: 1px solid ${({ theme }) => theme.colors.gray}40;
	color: ${({ theme }) => theme.colors.text};
	padding: 8px 16px;
	border-radius: 20px;
	cursor: pointer;
	font-weight: 600;
	font-size: 0.9rem;
	transition: all 0.2s ease;

	&:hover {
		background: ${({ theme }) => theme.colors.gray}10; /* Subtle hover effect */
		border-color: ${({ theme }) => theme.colors.primary};
	}
`;

const Button = styled(Link)`
	display: inline-block;
	padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
	border-radius: ${({ theme }) => theme.radius.md};
	font-weight: 600;
	text-decoration: none;
	transition:
		background-color 0.2s ease,
		transform 0.1s ease,
		box-shadow 0.2s ease;
	white-space: nowrap;

	&:hover {
		transform: translateY(-2px);
	}
`;

const PrimaryButton = styled(Button)`
	background-color: ${({ theme }) => theme.colors.secondary};
	color: ${({ theme }) => theme.colors.white};

	&:hover {
		background-color: ${({ theme }) => theme.colors.secondaryDark || "#d9741c"};
		box-shadow: 0 4px 12px rgba(241, 130, 32, 0.3);
	}
`;

const Header = () => {
	const { t, i18n } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);

	const toggleLanguage = () => {
		const newLang = i18n.language.startsWith("en") ? "es" : "en";
		i18n.changeLanguage(newLang);
		setIsOpen(false);
	};

	// Determine if we are currently in English
	const isEnglish = i18n.language.startsWith("en");

	return (
		<HeaderWrapper>
			<Container>
				<LogoLink to="/" onClick={() => setIsOpen(false)}>
					<Logo src={logo} alt="Scerv Logo" />
				</LogoLink>

				<MobileMenuIcon onClick={() => setIsOpen(!isOpen)}>
					<span
						style={{
							transform: isOpen ? "rotate(45deg) translate(5px, 5px)" : "none",
						}}
					/>
					<span style={{ opacity: isOpen ? 0 : 1 }} />
					<span
						style={{
							transform: isOpen
								? "rotate(-45deg) translate(7px, -8px)"
								: "none",
						}}
					/>
				</MobileMenuIcon>

				<Nav isOpen={isOpen}>
					<ul>
						<li>
							<Link to="/" onClick={() => setIsOpen(false)}>
								{t("header.home")}
							</Link>
						</li>
						<li>
							<Link to="/pricing" onClick={() => setIsOpen(false)}>
								{t("header.pricing")}
							</Link>
						</li>
						<li>
							<Link to="/contact" onClick={() => setIsOpen(false)}>
								{t("header.contact")}
							</Link>
						</li>
					</ul>

					<ActionButtons>
						{/* 4. The updated Language Toggle */}
						<LangToggle onClick={toggleLanguage}>
							{isEnglish ? "🇵🇦 Español" : "🇺🇸 English"}
						</LangToggle>

						<PrimaryButton to="/request-demo" onClick={() => setIsOpen(false)}>
							{t("header.requestDemo")}
						</PrimaryButton>
					</ActionButtons>
				</Nav>
			</Container>
		</HeaderWrapper>
	);
};

export default Header;
