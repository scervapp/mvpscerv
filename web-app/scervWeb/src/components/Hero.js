import React from "react";
import styled from "styled-components";
import heroImage from "../images/hero-image.jpeg"; // Replace with your actual hero image

const HeroSection = styled.section`
	position: relative; /* Ensures child elements (image & text) are positioned within it */
	text-align: center;
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100vh; /* Make it take full screen height */

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		text-align: left;
	}
`;

const HeroContent = styled.div`
	padding: ${({ theme }) => theme.spacing.xl} ${({ theme }) => theme.spacing.md};
	position: relative; //  Correct: Keeps element in flow, enables z-index
	z-index: 2;
	color: ${({ theme }) => theme.colors.white};
	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		max-width: 60%; /* Limit the width of the text on larger screens */
	}
`;

const Headline = styled.h1`
	font-size: 2.8rem;
	margin-bottom: ${({ theme }) => theme.spacing.sm}; /* Reduced margin */
	color: ${({ theme }) => theme.colors.white};
	font-weight: 700;
	line-height: 1.2;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 3.5rem;
	}
	@media (min-width: ${({ theme }) => theme.breakpoints.lg}) {
		font-size: 4rem;
	}
`;

const Subheadline = styled.p`
	font-size: 1.1rem;
	margin-bottom: ${({ theme }) => theme.spacing.md}; /* Reduced margin */
	color: ${({ theme }) => theme.colors.white};
	line-height: 1.5;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 1.3rem;
	}
`;

// Optional Paragraph
const IntroParagraph = styled.p`
	font-size: 1rem;
	margin-bottom: ${({ theme }) => theme.spacing.lg};
	color: ${({ theme }) => theme.colors.white};
	line-height: 1.6;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		font-size: 1.1rem;
	}
`;

const CtaButtons = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: ${({ theme }) => theme.spacing.md};
	margin-bottom: ${({ theme }) => theme.spacing.lg};

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		flex-direction: row;
		justify-content: flex-start;
	}
`;

const Button = styled.a`
	display: inline-block;
	padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.xl};
	text-decoration: none;
	color: ${({ theme }) => theme.colors.white};
	border-radius: ${({ theme }) => theme.radius.md};
	transition: background-color 0.3s ease, transform 0.2s ease,
		box-shadow 0.2s ease; /* Added box-shadow to transition */
	font-weight: 600;
	white-space: nowrap;

	&:hover {
		transform: translateY(-3px);
	}
`;

const PrimaryButton = styled(Button)`
	background-color: ${({ theme }) => theme.colors.primary};

	&:hover {
		background-color: ${({ theme }) => theme.colors.primaryDark};
		box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
	}
`;

const SecondaryButton = styled(Button)`
	background-color: transparent; /* Transparent background */
	border: 2px solid ${({ theme }) => theme.colors.white}; /* White border */

	&:hover {
		background-color: ${({ theme }) => theme.colors.white};
		color: ${({ theme }) => theme.colors.primary};
		box-shadow: 0 4px 8px rgba(255, 255, 255, 0.3);
	}
`;
const HeroImageWrapper = styled.div`
	position: absolute; /* Stretches the image to cover the full section */
	top: 0;
	left: 0;
	width: 100%;
	height: 100%; /* Ensure it covers the full height */
	z-index: 0; /* Keep it behind the content */

	&::before {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.4); /* Dark overlay */
		z-index: 1; /* Ensures overlay is above the image */
	}
`;

const HeroImage = styled.img`
	width: 100%;
	height: 100%;
	object-fit: cover; /* Ensures the image fills the container */
	display: block;
`;

const Hero = () => {
	return (
		<HeroSection>
			<HeroImageWrapper>
				<HeroImage src={heroImage} alt="Restaurant scene using Scerv" />
			</HeroImageWrapper>
			<HeroContent>
				<Headline>Modernize Your Restaurant, Maximize Your Efficiency</Headline>
				<Subheadline>
					Streamline your entire operation – from front-of-house to
					back-of-house – increase table turnover, and reduce costly errors.
					Scerv is the all-in-one platform built for restaurant success.
				</Subheadline>
				{/* Optional Intro Paragraph */}
				<IntroParagraph>
					Scerv empowers you to take control of your restaurant, optimize your
					workflow, and deliver exceptional customer experiences, all while
					boosting your bottom line.
				</IntroParagraph>
				<CtaButtons>
					<PrimaryButton href="/request-demo">Request a Demo</PrimaryButton>
					{/* <SecondaryButton href="#">Watch Video</SecondaryButton> */}
				</CtaButtons>
			</HeroContent>
		</HeroSection>
	);
};

export default Hero;
