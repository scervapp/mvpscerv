import React from "react";
import logo from "../scerv_logo.png";
import { Link } from "react-router-dom";
import styled from "styled-components";

const HeaderWrapper = styled.header`
	background-color: ${({ theme }) => theme.colors.white};
	padding: ${({ theme }) => theme.spacing.md} 0;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	position: sticky;
	top: 0;
	z-index: 100; /*  high z-index to stay on top */
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.xl};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
	display: flex;
	align-items: center;
	justify-content: space-between; /*  space between logo and nav */
`;

const LogoLink = styled(Link)`
	display: flex;
	align-items: center;
	text-decoration: none;
`;

const Logo = styled.img`
	width: 50px; /* Adjust as needed */
	height: auto;
`;

const Nav = styled.nav`
	display: flex; /* Use flexbox for horizontal layout */
	align-items: center; /* Vertically center items */

	ul {
		list-style: none;
		padding: 0;
		margin: 10px;
		display: flex; /* Horizontal list */

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
`;

const Button = styled(Link)`
	// Changed to Link
	display: inline-block;
	padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
	border-radius: ${({ theme }) => theme.radius.md};
	font-weight: 600;
	text-decoration: none;
	transition: background-color 0.2s ease, transform 0.1s ease,
		box-shadow 0.2s ease;
	white-space: nowrap; /* Prevent button text from wrapping */

	&:hover {
		transform: translateY(-2px);
	}
`;

const PrimaryButton = styled(Button)`
	background-color: ${({ theme }) => theme.colors.primary};
	color: ${({ theme }) => theme.colors.white};
	&:hover {
		box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
	}
`;

const SecondaryButton = styled(Button)`
	// Added a secondary button
	background-color: ${({ theme }) => theme.colors.secondary};
	color: ${({ theme }) => theme.colors.white};

	margin-left: ${({ theme }) => theme.spacing.md};
	&:hover {
		box-shadow: 0 4px 8px rgba(108, 117, 125, 0.3); /* Shadow for secondary button */
	}
`;

const Header = () => {
	return (
		<HeaderWrapper>
			<Container>
				<LogoLink to="/">
					<Logo src={logo} alt="Scerv Logo" />
				</LogoLink>
				<Nav>
					<ul>
						<li>
							<Link to="/">Home</Link>
						</li>
						{/* <li>
							<Link to="/features">Features</Link>
						</li> */}
						<li>
							<Link to="/pricing">Pricing</Link>
						</li>
						{/* <li><Link to="/about">About Us</Link></li> Removed */}
						<li>
							<Link to="/contact">Contact</Link>
						</li>
					</ul>
					<PrimaryButton to="/request-demo">Request a Demo</PrimaryButton>
					{/* <SecondaryButton to="/signup">Sign Up</SecondaryButton>{" "} */}
					{/* Add sign up button */}
				</Nav>
			</Container>
		</HeaderWrapper>
	);
};

export default Header;
