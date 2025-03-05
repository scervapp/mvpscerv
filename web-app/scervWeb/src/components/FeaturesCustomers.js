import React from "react";
import styled from "styled-components";
import FeatureBlock from "./FeatureBlock"; // Import FeatureBlock
import mobileOrderingIcon from "../images/mobile-ordering-icon.svg"; // Replace with your actual icon paths
import basketIcon from "../images/basket-icon.svg";
import checkoutIcon from "../images/checkout-icon.svg";
import discoverIcon from "../images/discover-icon.svg";
import checkInIcon from "../images/checkin-icon.svg";
import personalizedIcon from "../images/personalized-icon.svg";

const FeatureGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(
		auto-fit,
		minmax(250px, 1fr)
	); /* Responsive grid */
	gap: 20px;
	margin-top: 40px;
`;
const Container = styled.div`
	max-width: 1200px;
	margin: 0 auto;
	padding: 0 20px;
`;
const Section = styled.section`
	padding: 50px 0;
`;
const H2 = styled.h2`
	font-size: 2rem;
	margin-bottom: 1rem;
	text-align: center;
`;
const FeaturesCustomers = () => {
	return (
		<Section>
			<Container>
				<H2>Experience the Future of Dining with Scerv</H2>
				<FeatureGrid>
					<FeatureBlock
						iconSrc={mobileOrderingIcon}
						altText="Mobile Ordering Icon"
						title="Easy Mobile Ordering"
						description="Browse menus, customize your order, and send it directly to the kitchen – all from your phone."
					/>
					<FeatureBlock
						iconSrc={basketIcon}
						altText="Basket Icon"
						title="Seamless Basket Management"
						description="Add items to your basket, modify your order, and easily review everything before sending."
					/>
					<FeatureBlock
						iconSrc={checkoutIcon}
						altText="check out Icon"
						title="Secure Mobile Checkout"
						description="Pay your bill quickly and securely through the app. No need to wait for the check or handle cash."
					/>
					<FeatureBlock
						iconSrc={discoverIcon}
						altText="Discover Icon"
						title="Discover Great Restaurants"
						description="Find your favorite local spots and explore new dining experiences, all within the Scerv app."
					/>
					<FeatureBlock
						iconSrc={checkInIcon}
						altText="Check in Icon"
						title="Effortless Check-In & Check-Out"
						description="Let the restaurant know you've arrived and leave when you're ready, all with a simple tap."
					/>
					<FeatureBlock
						iconSrc={personalizedIcon}
						altText="Personalized Icon"
						title="Personalized Experience"
						description="Save your favorite restaurants and orders for quick and easy reordering."
					/>
				</FeatureGrid>
			</Container>
		</Section>
	);
};

export default FeaturesCustomers;
