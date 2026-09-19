import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import styled from "styled-components";
import { getRestaurantBySlug } from "../utils/browserOrderingData";

const Page = styled.main`
	background: #f7f8f8;
	min-height: calc(100vh - 160px);
	padding: 48px 20px 70px;
`;

const Panel = styled.section`
	background: #ffffff;
	border: 1px solid #dfe5e7;
	border-radius: 8px;
	margin: 0 auto;
	max-width: 760px;
	padding: 28px;
`;

const Eyebrow = styled.p`
	color: ${({ theme }) => theme.colors.primary};
	font-size: 0.78rem;
	font-weight: 900;
	letter-spacing: 0.08em;
	margin-bottom: 12px;
	text-transform: uppercase;
`;

const Title = styled.h1`
	font-size: clamp(2rem, 7vw, 3.6rem);
	line-height: 1;
	margin-bottom: 14px;
`;

const Body = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 1rem;
	line-height: 1.7;
	margin-bottom: 20px;
`;

const ActionRow = styled.div`
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
`;

const PrimaryAction = styled(Link)`
	background: ${({ theme }) => theme.colors.secondary};
	border-radius: 8px;
	color: #ffffff;
	font-weight: 900;
	padding: 12px 16px;

	&:hover {
		background: ${({ theme }) => theme.colors.secondaryDark};
		color: #ffffff;
	}
`;

const SecondaryAction = styled(Link)`
	border: 1px solid #cbd5d8;
	border-radius: 8px;
	color: ${({ theme }) => theme.colors.text};
	font-weight: 900;
	padding: 11px 16px;
`;

const RestaurantReservationHub = () => {
	const { slug } = useParams();
	const [restaurant, setRestaurant] = useState(null);
	const [status, setStatus] = useState("loading");

	useEffect(() => {
		let isMounted = true;

		const load = async () => {
			try {
				const foundRestaurant = await getRestaurantBySlug(slug);
				if (!isMounted) return;
				setRestaurant(foundRestaurant);
				setStatus(foundRestaurant ? "ready" : "not_found");
			} catch (error) {
				console.error("RestaurantReservationHub load failed:", error);
				if (isMounted) setStatus("error");
			}
		};

		load();
		return () => {
			isMounted = false;
		};
	}, [slug]);

	const restaurantName = restaurant?.displayName || "this restaurant";

	return (
		<Page>
			<Helmet>
				<title>{restaurantName} Reservations | Scerv</title>
				<meta
					name="description"
					content={`Request a reservation at ${restaurantName} through Scerv.`}
				/>
			</Helmet>
			<Panel>
				<Eyebrow>Reservations</Eyebrow>
				<Title>
					{status === "loading"
						? "Loading reservation page"
						: `Reserve at ${restaurantName}`}
				</Title>
				<Body>
					{status === "ready"
						? "Browser reservations are being connected to the Scerv restaurant operations system. For this first web cut, guests can browse the menu here while the restaurant completes web booking setup."
						: "This reservation page is not available yet."}
				</Body>
				<ActionRow>
					<PrimaryAction to={restaurant ? `/r/${restaurant.slug}` : "/"}>
						View menu
					</PrimaryAction>
					<SecondaryAction to="/request-demo">Contact Scerv</SecondaryAction>
				</ActionRow>
			</Panel>
		</Page>
	);
};

export default RestaurantReservationHub;
