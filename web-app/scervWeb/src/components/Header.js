import React, { useState } from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import logo from "../scerv_logo.png";

const HeaderWrapper = styled.header`
	background-color: rgba(255, 255, 255, 0.95);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
	padding: ${({ theme }) => theme.spacing.md} 0;
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
	text-decoration: none;
	z-index: 101;
`;

const Logo = styled.img`
	height: auto;
	width: 55px;
`;

const MobileMenuIcon = styled.div`
	cursor: pointer;
	display: none;
	flex-direction: column;
	gap: 6px;
	z-index: 101;

	span {
		background-color: ${({ theme }) => theme.colors.text};
		border-radius: 2px;
		height: 3px;
		transition: all 0.3s ease;
		width: 25px;
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		display: flex;
	}
`;

const Nav = styled.nav`
	align-items: center;
	display: flex;
	flex-grow: 1;

	ul {
		align-items: center;
		display: flex;
		list-style: none;
		margin: 0 auto 0 0;
		padding: 0;

		li {
			margin-left: ${({ theme }) => theme.spacing.lg};

			a {
				color: ${({ theme }) => theme.colors.text};
				font-weight: 600;
				text-decoration: none;
				transition: color 0.2s ease;

				&:hover {
					color: ${({ theme }) => theme.colors.primary};
				}
			}
		}
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		background-color: ${({ theme }) => theme.colors.white};
		box-shadow: ${({ isOpen }) =>
			isOpen ? "0 10px 15px rgba(0,0,0,0.05)" : "none"};
		flex-direction: column;
		height: ${({ isOpen }) => (isOpen ? "auto" : "0")};
		left: 0;
		opacity: ${({ isOpen }) => (isOpen ? "1" : "0")};
		overflow: hidden;
		padding: ${({ isOpen }) => (isOpen ? "20px 0" : "0")};
		position: absolute;
		top: 100%;
		transition: all 0.3s ease-in-out;
		width: 100%;

		ul {
			flex-direction: column;
			margin-right: 0;
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
	gap: 20px;

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		flex-direction: column;
		gap: 15px;
		margin-top: 20px;
	}
`;

const LangToggle = styled.button`
	align-items: center;
	background: transparent;
	border: 1px solid ${({ theme }) => theme.colors.gray}40;
	border-radius: 20px;
	color: ${({ theme }) => theme.colors.text};
	cursor: pointer;
	display: flex;
	font-size: 0.9rem;
	font-weight: 600;
	gap: 8px;
	padding: 8px 16px;
	transition: all 0.2s ease;

	&:hover {
		background: ${({ theme }) => theme.colors.gray}10;
		border-color: ${({ theme }) => theme.colors.primary};
	}
`;

const Button = styled(Link)`
	border-radius: ${({ theme }) => theme.radius.md};
	display: inline-block;
	font-weight: 600;
	padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
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
	const isEnglish = i18n.language.startsWith("en");

	const closeMenu = () => setIsOpen(false);

	const toggleLanguage = () => {
		i18n.changeLanguage(isEnglish ? "es" : "en");
		closeMenu();
	};

	return (
		<HeaderWrapper>
			<Container>
				<LogoLink to="/" onClick={closeMenu}>
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
							<Link to="/" onClick={closeMenu}>
								{t("header.home")}
							</Link>
						</li>
						<li>
							<Link to="/pricing" onClick={closeMenu}>
								{t("header.pricing")}
							</Link>
						</li>
						<li>
							<Link to="/resources" onClick={closeMenu}>
								Resources
							</Link>
						</li>
						<li>
							<Link to="/contact" onClick={closeMenu}>
								{t("header.contact")}
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
