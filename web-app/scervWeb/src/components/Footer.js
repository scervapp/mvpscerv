import React from "react";
import styled from "styled-components";
import { Link } from "react-router-dom"; // Import Link for internal links

const FooterWrapper = styled.footer`
	background-color: ${({ theme }) => theme.colors.black};
	color: ${({ theme }) => theme.colors.white};
	padding: ${({ theme }) => theme.spacing.lg} 0;
	text-align: center;
	position: relative;
	bottom: 0;
	width: 100%;
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.xl};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
	display: flex;
	justify-content: space-between;
	align-items: center;

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		flex-direction: column;
		gap: 1rem;
	}
`;

const Copyright = styled.p`
	font-size: 0.9rem;
`;

const Nav = styled.nav`
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
	}

	li {
		margin-left: ${({ theme }) => theme.spacing.md};
	}

	a {
		color: ${({ theme }) => theme.colors.white};
		text-decoration: none;
		transition: color 0.2s ease;

		&:hover {
			color: ${({ theme }) => theme.colors.primary};
		}
	}
`;

const Footer = () => {
	return (
		<FooterWrapper>
			<Container>
				<Copyright>
					&copy; {new Date().getFullYear()} Scerv. All rights reserved.
				</Copyright>
				<Nav>
					<ul>
						<li>
							<Link to="/privacy-policy">Privacy Policy</Link>
						</li>
						<li>
							<Link to="/terms-of-service">Terms of Service</Link>
						</li>{" "}
						{/* Add TOS link */}
						<li>
							<Link to="/contact">Contact Us</Link>
						</li>
					</ul>
				</Nav>
			</Container>
		</FooterWrapper>
	);
};

export default Footer;
