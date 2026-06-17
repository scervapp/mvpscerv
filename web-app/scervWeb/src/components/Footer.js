import React from "react";
import styled from "styled-components";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import logo from "../scerv_logo.png"; // Bringing in the logo

const FooterWrapper = styled.footer`
	background-color: ${({ theme }) => theme.colors.black || "#111"};
	color: ${({ theme }) => theme.colors.white || "#fff"};
	padding: ${({ theme }) => theme.spacing.xl} 0
		${({ theme }) => theme.spacing.md};
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.xl};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
`;

const TopSection = styled.div`
	display: grid;
	grid-template-columns: 2fr 1fr 1fr 1fr;
	gap: 40px;
	margin-bottom: 40px;

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr 1fr;
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.sm || "500px"}) {
		grid-template-columns: 1fr;
	}
`;

const BrandColumn = styled.div`
	display: flex;
	flex-direction: column;
	align-items: flex-start;
`;

const Logo = styled.img`
	width: 60px;
	margin-bottom: 15px;
	/* Optional: filter to make it white/monochrome if it clashes with the dark background */
	/* filter: brightness(0) invert(1); */
`;

const Tagline = styled.p`
	font-size: 0.95rem;
	color: #a0a0a0;
	line-height: 1.5;
	max-width: 300px;
`;

const Column = styled.div`
	display: flex;
	flex-direction: column;
`;

const ColumnTitle = styled.h4`
	font-size: 1.1rem;
	margin-bottom: 20px;
	font-weight: 600;
	color: ${({ theme }) => theme.colors.white};
`;

const NavList = styled.ul`
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 12px;
`;

const NavItem = styled.li`
	a {
		color: #a0a0a0;
		text-decoration: none;
		font-size: 0.95rem;
		transition: color 0.2s ease;

		&:hover {
			color: ${({ theme }) => theme.colors.primary};
		}
	}
`;

const BottomSection = styled.div`
	border-top: 1px solid #333;
	padding-top: 20px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	flex-wrap: wrap;
	gap: 15px;
`;

const Copyright = styled.p`
	font-size: 0.85rem;
	color: #a0a0a0;
`;

const Footer = () => {
	const { t } = useTranslation();
	const currentYear = new Date().getFullYear();

	return (
		<FooterWrapper>
			<Container>
				<TopSection>
					<BrandColumn>
						<Link to="/">
							<Logo src={logo} alt="Scerv Logo" />
						</Link>
						<Tagline>{t("footer.tagline")}</Tagline>
					</BrandColumn>

					<Column>
						<ColumnTitle>{t("footer.product")}</ColumnTitle>
						<NavList>
							<NavItem>
								<Link to="/">{t("footer.features")}</Link>
							</NavItem>
							<NavItem>
								<Link to="/pricing">{t("footer.pricing")}</Link>
							</NavItem>
							<NavItem>
								<Link to="/request-demo">{t("footer.requestDemo")}</Link>
							</NavItem>
							<NavItem>
								<Link to="/resources">Resources</Link>
							</NavItem>
						</NavList>
					</Column>

					<Column>
						<ColumnTitle>{t("footer.company")}</ColumnTitle>
						<NavList>
							<NavItem>
								<Link to="/contact">{t("footer.contact")}</Link>
							</NavItem>
							{/* Placeholders for future pages */}
							<NavItem>
								<Link to="/about">{t("footer.about")}</Link>
							</NavItem>
						</NavList>
					</Column>

					<Column>
						<ColumnTitle>{t("footer.legal")}</ColumnTitle>
						<NavList>
							<NavItem>
								<Link to="/privacy-policy">{t("footer.privacy")}</Link>
							</NavItem>
							<NavItem>
								<Link to="/terms-of-service">{t("footer.terms")}</Link>
							</NavItem>
						</NavList>
					</Column>
				</TopSection>

				<BottomSection>
					<Copyright>
						&copy; 2021-{currentYear} Scerv. {t("footer.rights")}
					</Copyright>
				</BottomSection>
			</Container>
		</FooterWrapper>
	);
};

export default Footer;
