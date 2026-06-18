import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import logo from "../scerv_logo.png";

const HeaderWrapper = styled.header`
	background-color: rgba(255, 255, 255, 0.95);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	border-bottom: 1px solid rgba(223, 229, 231, 0.82);
	box-shadow: 0 10px 30px rgba(19, 32, 39, 0.04);
	padding: 10px 0;
	position: sticky;
	top: 0;
	z-index: 100;
`;

const Container = styled.div`
	align-items: center;
	display: flex;
	justify-content: space-between;
	margin: 0 auto;
	max-width: ${({ theme }) => theme.breakpoints.xl};
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const LogoLink = styled(Link)`
	align-items: center;
	display: flex;
	gap: 9px;
	text-decoration: none;
	z-index: 101;
`;

const Logo = styled.img`
	display: block;
	height: 48px;
	object-fit: contain;
	width: 48px;

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		height: 42px;
		width: 42px;
	}
`;

const BrandText = styled.span`
	color: ${({ theme }) => theme.colors.text};
	display: flex;
	flex-direction: column;
	font-family: ${({ theme }) => theme.fonts.heading};
	font-size: 1.02rem;
	font-weight: 800;
	letter-spacing: 0;
	line-height: 1;

	small {
		color: ${({ theme }) => theme.colors.textLight};
		font-family: ${({ theme }) => theme.fonts.body};
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0;
		margin-top: 4px;
		text-transform: uppercase;
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		display: none;
	}
`;

const MobileMenuIcon = styled.button`
	background: transparent;
	border: 0;
	cursor: pointer;
	display: none;
	flex-direction: column;
	gap: 6px;
	padding: 8px;
	z-index: 101;

	span {
		background-color: ${({ theme }) => theme.colors.text};
		border-radius: 2px;
		height: 3px;
		transition: all 0.3s ease;
		width: 25px;
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
		display: flex;
	}
`;

const Nav = styled.nav`
	align-items: center;
	display: flex;
	flex-grow: 1;
	gap: ${({ theme }) => theme.spacing.lg};
	justify-content: flex-end;

	ul {
		align-items: center;
		display: flex;
		gap: ${({ theme }) => theme.spacing.xl};
		list-style: none;
		margin: 0;
		padding: 0;

		li {
			a,
			button {
				background: transparent;
				border: 0;
				color: ${({ theme }) => theme.colors.text};
				cursor: pointer;
				font: inherit;
				font-size: 0.95rem;
				font-weight: 600;
				padding: 0;
				text-decoration: none;
				transition: color 0.2s ease;

				&:hover {
					color: ${({ theme }) => theme.colors.primary};
				}
			}
		}
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
		background-color: ${({ theme }) => theme.colors.white};
		box-shadow: ${({ $isOpen }) =>
			$isOpen ? "0 18px 35px rgba(19, 32, 39, 0.08)" : "none"};
		flex-direction: column;
		height: ${({ $isOpen }) => ($isOpen ? "auto" : "0")};
		left: 0;
		opacity: ${({ $isOpen }) => ($isOpen ? "1" : "0")};
		overflow: hidden;
		padding: ${({ $isOpen }) => ($isOpen ? "20px 0" : "0")};
		position: absolute;
		top: 100%;
		transition: all 0.3s ease-in-out;
		width: 100%;

		ul {
			flex-direction: column;
			gap: 0;
			width: 100%;

			li {
				margin: 15px 0;
			}
		}
	}
`;

const ActionButtons = styled.div`
	align-items: center;
	display: flex;
	gap: 12px;

	@media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
		flex-direction: column;
		gap: 15px;
		margin-top: 20px;
	}
`;

const LangToggle = styled.button`
	align-items: center;
	background: transparent;
	border: 1px solid ${({ theme }) => theme.colors.gray}40;
	border-radius: 999px;
	color: ${({ theme }) => theme.colors.text};
	cursor: pointer;
	display: flex;
	font-size: 0.84rem;
	font-weight: 800;
	gap: 8px;
	padding: 8px 12px;
	transition: all 0.2s ease;

	&:hover {
		background: ${({ theme }) => theme.colors.gray}10;
		border-color: ${({ theme }) => theme.colors.primary};
	}
`;

const Button = styled(Link)`
	border-radius: ${({ theme }) => theme.radius.md};
	display: inline-block;
	font-size: 0.95rem;
	font-weight: 800;
	padding: 10px 16px;
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
	const location = useLocation();
	const navigate = useNavigate();
	const isEnglish = i18n.language.startsWith("en");

	const closeMenu = () => setIsOpen(false);

	const scrollToSection = (sectionId) => {
		window.setTimeout(() => {
			document.getElementById(sectionId)?.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
		}, 40);
	};

	const goToSection = (sectionId) => {
		closeMenu();
		if (location.pathname !== "/") {
			navigate(`/#${sectionId}`);
			scrollToSection(sectionId);
			return;
		}

		window.history.replaceState(null, "", `/#${sectionId}`);
		scrollToSection(sectionId);
	};

	const toggleLanguage = () => {
		i18n.changeLanguage(isEnglish ? "es" : "en");
		closeMenu();
	};

	return (
		<HeaderWrapper>
			<Container>
				<LogoLink to="/" onClick={closeMenu}>
					<Logo src={logo} alt="Scerv Logo" />
					<BrandText>
						Scerv
						<small>Hospitality OS</small>
					</BrandText>
				</LogoLink>

				<MobileMenuIcon
					aria-expanded={isOpen}
					aria-label="Toggle navigation"
					onClick={() => setIsOpen(!isOpen)}
					type="button"
				>
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

				<Nav $isOpen={isOpen}>
					<ul>
						<li>
							<button type="button" onClick={() => goToSection("platform")}>
								{t("header.platform")}
							</button>
						</li>
						<li>
							<button type="button" onClick={() => goToSection("solutions")}>
								{t("header.solutions")}
							</button>
						</li>
						<li>
							<Link to="/resources" onClick={closeMenu}>
								{t("header.resources")}
							</Link>
						</li>
						<li>
							<Link to="/about" onClick={closeMenu}>
								{t("header.company")}
							</Link>
						</li>
					</ul>

					<ActionButtons>
						<LangToggle onClick={toggleLanguage}>
							{isEnglish ? "ES" : "EN"}
						</LangToggle>

						<PrimaryButton to="/request-demo" onClick={closeMenu}>
							{t("header.requestDemo")}
						</PrimaryButton>
					</ActionButtons>
				</Nav>
			</Container>
		</HeaderWrapper>
	);
};

export default Header;
