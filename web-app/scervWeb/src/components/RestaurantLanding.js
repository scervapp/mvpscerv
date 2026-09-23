import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import styled from "styled-components";
import {
	getMenuForRestaurant,
	getRestaurantBySlug,
	getTopRatingsForMenuItems,
	slugify,
} from "../utils/browserOrderingData";
import { buildSeoUrl } from "./SEO";
import BrowserGuestIdentity, {
	readStoredBrowserGuest,
} from "./BrowserGuestIdentity";

export const PUBLIC_RESTAURANT_CART_PREFIX = "scerv_public_restaurant_cart:";

const Page = styled.div`
	background: #f7f8f8;
	color: ${({ theme }) => theme.colors.text};
	min-height: 100vh;
`;

const Hero = styled.section`
	background:
		linear-gradient(90deg, rgba(8, 47, 58, 0.92), rgba(8, 47, 58, 0.58)),
		url("${({ $image }) => $image}");
	background-position: center;
	background-size: cover;
	color: #ffffff;
	padding: 76px 20px 54px;
`;

const HeroInner = styled.div`
	margin: 0 auto;
	max-width: 1120px;
`;

const Eyebrow = styled.p`
	color: #f4b26b;
	font-size: 0.78rem;
	font-weight: 900;
	letter-spacing: 0.08em;
	margin-bottom: 14px;
	text-transform: uppercase;
`;

const Title = styled.h1`
	color: #ffffff;
	font-size: clamp(2.3rem, 7vw, 4.9rem);
	line-height: 0.98;
	margin: 0 0 18px;
	max-width: 850px;
`;

const Description = styled.p`
	color: rgba(255, 255, 255, 0.9);
	font-size: 1.1rem;
	line-height: 1.7;
	max-width: 680px;
`;

const HeroMeta = styled.div`
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	margin-top: 24px;
`;

const Pill = styled.span`
	background: rgba(255, 255, 255, 0.12);
	border: 1px solid rgba(255, 255, 255, 0.22);
	border-radius: 999px;
	color: #ffffff;
	font-size: 0.9rem;
	font-weight: 800;
	padding: 8px 12px;
`;

const Main = styled.main`
	display: grid;
	gap: 24px;
	grid-template-columns: minmax(0, 1fr) 340px;
	margin: 0 auto;
	max-width: 1120px;
	padding: 32px 20px 70px;

	@media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
		grid-template-columns: 1fr;
	}
`;

const Section = styled.section`
	background: #ffffff;
	border: 1px solid #dfe5e7;
	border-radius: 8px;
	padding: 22px;
`;

const SectionHeader = styled.div`
	align-items: flex-end;
	display: flex;
	justify-content: space-between;
	gap: 16px;
	margin-bottom: 18px;

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		align-items: flex-start;
		flex-direction: column;
	}
`;

const SectionTitle = styled.h2`
	font-size: 1.35rem;
	margin: 0;
`;

const Muted = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 0.95rem;
	margin: 0;
`;

const MenuGroup = styled.div`
	& + & {
		border-top: 1px solid #edf1f2;
		margin-top: 22px;
		padding-top: 22px;
	}
`;

const CategoryTitle = styled.h3`
	font-size: 1.02rem;
	letter-spacing: 0.04em;
	margin: 0 0 12px;
	text-transform: uppercase;
`;

const MenuGrid = styled.div`
	display: grid;
	gap: 14px;
	grid-template-columns: 1fr;

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr;
	}
`;

const MenuItem = styled.article`
	border: 1px solid #edf1f2;
	border-radius: 8px;
	display: grid;
	grid-template-columns: 112px 1fr;
	min-height: 128px;
	overflow: hidden;

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		grid-template-columns: 88px 1fr;
	}
`;

const ItemImage = styled.div`
	background:
		linear-gradient(135deg, rgba(14, 111, 127, 0.14), rgba(241, 130, 32, 0.14)),
		url("${({ $image }) => $image}");
	background-position: center;
	background-size: cover;
`;

const ItemBody = styled.div`
	display: grid;
	gap: 8px;
	padding: 12px;
`;

const ItemTop = styled.div`
	align-items: flex-start;
	display: flex;
	gap: 10px;
	justify-content: space-between;
`;

const ItemName = styled.h4`
	font-size: 1rem;
	margin: 0 0 6px;
`;

const Price = styled.span`
	color: ${({ theme }) => theme.colors.primary};
	font-weight: 900;
	white-space: nowrap;
`;

const ItemDescription = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 0.9rem;
	line-height: 1.45;
	margin: 0 0 10px;
`;

const RatingLine = styled.div`
	align-items: center;
	color: #61400f;
	display: flex;
	flex-wrap: wrap;
	font-size: 0.86rem;
	font-weight: 800;
	gap: 6px;
`;

const ReviewQuote = styled.p`
	color: ${({ theme }) => theme.colors.text};
	font-size: 0.86rem;
	line-height: 1.45;
	margin: 8px 0 0;
`;

const ItemActionRow = styled.div`
	align-items: center;
	display: grid;
	gap: 8px;
	grid-template-columns: minmax(0, 1fr) auto;

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		grid-template-columns: 1fr;
	}
`;

const NoteInput = styled.input`
	border: 1px solid #d8e1e4;
	border-radius: 8px;
	font: inherit;
	font-size: 0.86rem;
	min-height: 38px;
	padding: 0 10px;
`;

const AddButton = styled.button`
	background: ${({ theme }) => theme.colors.primary};
	border: 0;
	border-radius: 8px;
	color: #ffffff;
	cursor: pointer;
	font: inherit;
	font-size: 0.86rem;
	font-weight: 900;
	min-height: 38px;
	padding: 0 14px;
`;

const AddedChip = styled.span`
	background: #ecfdf3;
	border-radius: 999px;
	color: #146c43;
	display: inline-flex;
	font-size: 0.78rem;
	font-weight: 900;
	padding: 4px 8px;
	width: fit-content;
`;

const Sidebar = styled.aside`
	display: flex;
	flex-direction: column;
	gap: 16px;
`;

const ActionPanel = styled(Section)`
	position: sticky;
	top: 92px;

	@media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
		position: static;
	}
`;

const ButtonStack = styled.div`
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-top: 18px;
`;

const BasketPanel = styled(Section)`
	display: grid;
	gap: 12px;
`;

const BasketRow = styled.div`
	border-bottom: 1px solid #edf1f2;
	display: grid;
	gap: 8px;
	padding-bottom: 12px;

	&:last-of-type {
		border-bottom: 0;
		padding-bottom: 0;
	}
`;

const BasketTop = styled.div`
	align-items: flex-start;
	display: flex;
	gap: 10px;
	justify-content: space-between;
`;

const BasketName = styled.div`
	font-weight: 900;
`;

const BasketMeta = styled.div`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 0.84rem;
`;

const QuantityControls = styled.div`
	align-items: center;
	display: flex;
	gap: 8px;
`;

const QuantityButton = styled.button`
	background: #ffffff;
	border: 1px solid #d8e1e4;
	border-radius: 8px;
	cursor: pointer;
	font: inherit;
	font-weight: 900;
	height: 32px;
	width: 32px;
`;

const SendButton = styled.button`
	background: ${({ theme }) => theme.colors.secondary};
	border: 0;
	border-radius: 8px;
	color: #ffffff;
	cursor: pointer;
	font: inherit;
	font-weight: 900;
	min-height: 44px;
	padding: 0 14px;

	&:disabled {
		background: #cbd5d8;
		cursor: not-allowed;
	}
`;

const NoticePanel = styled.div`
	background: ${({ $tone }) => ($tone === "success" ? "#ecfdf3" : "#fff7ed")};
	border: 1px solid ${({ $tone }) => ($tone === "success" ? "#bbf7d0" : "#fed7aa")};
	border-radius: 8px;
	color: ${({ $tone }) => ($tone === "success" ? "#146c43" : "#9a3412")};
	font-size: 0.9rem;
	font-weight: 800;
	line-height: 1.45;
	padding: 12px;
`;

const PrimaryAction = styled(Link)`
	background: ${({ theme }) => theme.colors.secondary};
	border-radius: 8px;
	color: #ffffff;
	display: block;
	font-weight: 900;
	padding: 13px 16px;
	text-align: center;

	&:hover {
		background: ${({ theme }) => theme.colors.secondaryDark};
		color: #ffffff;
	}
`;

const SecondaryAction = styled(Link)`
	border: 1px solid #cbd5d8;
	border-radius: 8px;
	color: ${({ theme }) => theme.colors.text};
	display: block;
	font-weight: 900;
	padding: 12px 16px;
	text-align: center;

	&:hover {
		border-color: ${({ theme }) => theme.colors.primary};
	}
`;

const StatusList = styled.div`
	display: grid;
	gap: 10px;
	margin-top: 12px;
`;

const StatusRow = styled.div`
	align-items: center;
	display: flex;
	gap: 10px;
	font-size: 0.92rem;
	font-weight: 700;
`;

const Dot = styled.span`
	background: ${({ $enabled, theme }) =>
		$enabled ? theme.colors.success : "#9aa7ad"};
	border-radius: 50%;
	height: 9px;
	width: 9px;
`;

const EmptyState = styled.div`
	background: #ffffff;
	border: 1px solid #dfe5e7;
	border-radius: 8px;
	margin: 50px auto;
	max-width: 720px;
	padding: 32px 22px;
	text-align: center;
`;

const formatPrice = (value) => {
	const numeric = Number(value || 0);
	if (!Number.isFinite(numeric) || numeric <= 0) return "";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(numeric);
};

const formatCents = (value) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(Number(value || 0) / 100);

const groupMenuItems = (items = []) =>
	items.reduce((groups, item) => {
		const category = item.category || "Menu";
		if (!groups[category]) groups[category] = [];
		groups[category].push(item);
		return groups;
	}, {});

const isFeatureEnabled = (restaurant, featureKey) =>
	restaurant?.features?.[featureKey] === true ||
	restaurant?.featureEntitlements?.[featureKey] === true ||
	restaurant?.subscriptionFeatures?.[featureKey] === true;

const RestaurantLanding = () => {
	const { slug } = useParams();
	const [restaurant, setRestaurant] = useState(null);
	const [menuItems, setMenuItems] = useState([]);
	const [ratingsByItem, setRatingsByItem] = useState({});
	const [status, setStatus] = useState("loading");
	const [guest, setGuest] = useState(() => readStoredBrowserGuest());
	const [draftCart, setDraftCart] = useState([]);
	const [itemNotes, setItemNotes] = useState({});
	const [checkoutIntent, setCheckoutIntent] = useState(false);
	const [cartNotice, setCartNotice] = useState("");

	useEffect(() => {
		let isMounted = true;

		const loadRestaurant = async () => {
			setStatus("loading");
			try {
				const foundRestaurant = await getRestaurantBySlug(slug);
				if (!isMounted) return;

				if (!foundRestaurant) {
					setStatus("not_found");
					return;
				}

				const menu = await getMenuForRestaurant(foundRestaurant.id);
				const ratings = await getTopRatingsForMenuItems(menu);
				if (!isMounted) return;

				setRestaurant(foundRestaurant);
				setMenuItems(menu);
				setRatingsByItem(ratings);
				setStatus("ready");
			} catch (error) {
				console.error("RestaurantLanding load failed:", error);
				if (isMounted) setStatus("error");
			}
		};

		loadRestaurant();
		return () => {
			isMounted = false;
		};
	}, [slug]);

	const menuGroups = useMemo(() => groupMenuItems(menuItems), [menuItems]);
	const draftCartQuantityByMenuItem = useMemo(
		() =>
			draftCart.reduce((totals, item) => {
				totals[item.menuItemId] =
					Number(totals[item.menuItemId] || 0) + Number(item.quantity || 0);
				return totals;
			}, {}),
		[draftCart],
	);
	const cartSubtotalCents = draftCart.reduce(
		(total, item) => total + Number(item.lineTotalCents || 0),
		0,
	);
	const cartItemCount = draftCart.reduce(
		(total, item) => total + Number(item.quantity || 0),
		0,
	);
	const canonicalSlug = restaurant?.slug || slugify(restaurant?.displayName || slug);
	const title = restaurant
		? `${restaurant.displayName} Menu, Reviews and Reservations | Scerv`
		: "Restaurant on Scerv";
	const description = restaurant
		? `${restaurant.displayName} on Scerv. Browse the menu, view dish ratings, and plan your visit.`
		: "Browse restaurants on Scerv.";

	const savePublicCart = (nextCart = draftCart) => {
		if (!restaurant?.id || nextCart.length === 0) return;
		window.localStorage.setItem(
			`${PUBLIC_RESTAURANT_CART_PREFIX}${restaurant.id}`,
			JSON.stringify({
				restaurantId: restaurant.id,
				restaurantName: restaurant.displayName,
				createdAt: Date.now(),
				items: nextCart.map((item) => ({
					menuItemId: item.menuItemId,
					name: item.name,
					quantity: item.quantity,
					notes: item.notes || "",
				})),
			}),
		);
	};

	const addPreviewItem = (item) => {
		const notes = itemNotes[item.id] || "";
		const priceCents = Math.round(Number(item.price || 0) * 100);
		const cartId = `${item.id}:${notes}`;
		const nextCart = (() => {
			const existing = draftCart.find((entry) => entry.id === cartId);
			if (existing) {
				return draftCart.map((entry) =>
					entry.id === cartId
						? {
								...entry,
								quantity: entry.quantity + 1,
								lineTotalCents: priceCents * (entry.quantity + 1),
							}
						: entry,
				);
			}
			return [
				...draftCart,
				{
					id: cartId,
					menuItemId: item.id,
					name: item.name || "Menu item",
					quantity: 1,
					notes,
					priceCents,
					lineTotalCents: priceCents,
				},
			];
		})();
		setDraftCart(nextCart);
		savePublicCart(nextCart);
		setItemNotes((current) => ({ ...current, [item.id]: "" }));
		setCartNotice("");
	};

	const updatePreviewQuantity = (cartItem, nextQuantity) => {
		const nextCart =
			nextQuantity <= 0
				? draftCart.filter((item) => item.id !== cartItem.id)
				: draftCart.map((item) =>
						item.id === cartItem.id
							? {
									...item,
									quantity: nextQuantity,
									lineTotalCents: item.priceCents * nextQuantity,
								}
							: item,
					);
		setDraftCart(nextCart);
		if (nextCart.length > 0) {
			savePublicCart(nextCart);
		} else if (restaurant?.id) {
			window.localStorage.removeItem(`${PUBLIC_RESTAURANT_CART_PREFIX}${restaurant.id}`);
		}
	};

	const handleSendPreviewCart = () => {
		if (draftCart.length === 0) return;
		savePublicCart(draftCart);
		setCheckoutIntent(true);
		if (guest?.uid) {
			setCartNotice(
				"Saved. Scan your table QR code at the restaurant and we will bring this basket into the ordering session.",
			);
		}
	};

	if (status === "loading") {
		return (
			<Page>
				<EmptyState>
					<h1>Loading restaurant</h1>
					<Muted>Opening the Scerv dining page.</Muted>
				</EmptyState>
			</Page>
		);
	}

	if (status === "not_found" || status === "error") {
		return (
			<Page>
				<Helmet>
					<title>Restaurant Not Found | Scerv</title>
					<meta
						name="description"
						content="This Scerv restaurant page could not be found."
					/>
				</Helmet>
				<EmptyState>
					<h1>Restaurant not found</h1>
					<Muted>
						This dining page is not available yet. Check the link or return to
						Scerv.
					</Muted>
					<ButtonStack>
						<PrimaryAction to="/">Go to Scerv</PrimaryAction>
					</ButtonStack>
				</EmptyState>
			</Page>
		);
	}

	return (
		<Page>
			<Helmet>
				<title>{title}</title>
				<link rel="canonical" href={buildSeoUrl(`/r/${canonicalSlug}`)} />
				<meta name="description" content={description} />
				<meta property="og:title" content={title} />
				<meta property="og:description" content={description} />
				<meta property="og:type" content="restaurant.restaurant" />
				<meta property="og:url" content={buildSeoUrl(`/r/${canonicalSlug}`)} />
			</Helmet>

			<Hero $image={restaurant.imageUrl || "/logo512.png"}>
				<HeroInner>
					<Eyebrow>Scerv restaurant page</Eyebrow>
					<Title>{restaurant.displayName}</Title>
					<Description>
						{restaurant.description ||
							"Browse the menu, see what guests recommend, and plan your visit."}
					</Description>
					<HeroMeta>
						{restaurant.cuisine || restaurant.cuisineType ? (
							<Pill>{restaurant.cuisine || restaurant.cuisineType}</Pill>
						) : null}
						{restaurant.area || restaurant.city ? (
							<Pill>
								{[restaurant.area, restaurant.city, restaurant.state]
									.filter(Boolean)
									.join(", ")}
							</Pill>
						) : null}
						{Number(restaurant.averageRating || restaurant.rating || 0) > 0 ? (
							<Pill>
								{Number(
									restaurant.averageRating || restaurant.rating,
								).toFixed(1)}{" "}
								guest rating
							</Pill>
						) : (
							<Pill>New on Scerv</Pill>
						)}
					</HeroMeta>
				</HeroInner>
			</Hero>

			<Main>
				<Section>
					<SectionHeader>
						<div>
							<SectionTitle>Menu</SectionTitle>
							<Muted>
								Dish details, guest ratings, and reviews appear here before the
								table ordering flow opens.
							</Muted>
						</div>
						<Muted>{menuItems.length} items</Muted>
					</SectionHeader>

					{Object.entries(menuGroups).length > 0 ? (
						Object.entries(menuGroups).map(([category, items]) => (
							<MenuGroup key={category}>
								<CategoryTitle>{category}</CategoryTitle>
								<MenuGrid>
									{items.map((item) => {
										const rating = Number(item.averageRating || item.rating || 0);
										const reviewCount = Number(
											item.reviewCount || item.ratingCount || 0,
										);
										const reviews = ratingsByItem[item.id] || [];
										const image =
											item.imageUrl ||
											item.imageUri ||
											item.media?.[0]?.url ||
											restaurant.imageUrl ||
											"/logo512.png";

										return (
											<MenuItem key={item.id}>
												<ItemImage $image={image} />
												<ItemBody>
													<ItemTop>
														<ItemName>{item.name || "Menu item"}</ItemName>
														<Price>{formatPrice(item.price)}</Price>
													</ItemTop>
													{draftCartQuantityByMenuItem[item.id] ? (
														<AddedChip>
															{draftCartQuantityByMenuItem[item.id]} added
														</AddedChip>
													) : null}
													<ItemDescription>
														{item.description ||
															"Details will appear as the restaurant updates this item."}
													</ItemDescription>
													{rating > 0 ? (
														<RatingLine>
															<span>{rating.toFixed(1)}</span>
															<span>Scerv Score</span>
															<span>
																{reviewCount}{" "}
																{reviewCount === 1 ? "rating" : "ratings"}
															</span>
														</RatingLine>
													) : null}
													{reviews[0]?.reviewText || reviews[0]?.comment ? (
														<ReviewQuote>
															"{reviews[0].reviewText || reviews[0].comment}"
														</ReviewQuote>
													) : item.reviewHighlight ? (
														<ReviewQuote>"{item.reviewHighlight}"</ReviewQuote>
													) : null}
													<ItemActionRow>
														<NoteInput
															aria-label={`Notes for ${item.name || "menu item"}`}
															onChange={(event) =>
																setItemNotes((current) => ({
																	...current,
																	[item.id]: event.target.value,
																}))
															}
															placeholder="Notes"
															value={itemNotes[item.id] || ""}
														/>
														<AddButton
															onClick={() => addPreviewItem(item)}
															type="button"
														>
															Add
														</AddButton>
													</ItemActionRow>
												</ItemBody>
											</MenuItem>
										);
									})}
								</MenuGrid>
							</MenuGroup>
						))
					) : (
						<Muted>This restaurant has not published menu items yet.</Muted>
					)}
				</Section>

				<Sidebar>
					<BasketPanel>
						<SectionHeader>
							<div>
								<SectionTitle>Your basket</SectionTitle>
								<Muted>
									Build now. Verify and connect to a table before anything reaches
									the kitchen.
								</Muted>
							</div>
						</SectionHeader>
						{draftCart.length === 0 ? (
							<Muted>Add menu items while you browse.</Muted>
						) : (
							draftCart.map((item) => (
								<BasketRow key={item.id}>
									<BasketTop>
										<div>
											<BasketName>{item.name}</BasketName>
											<BasketMeta>
												Qty {item.quantity}
												{item.notes ? ` - ${item.notes}` : ""}
											</BasketMeta>
										</div>
										<strong>{formatCents(item.lineTotalCents)}</strong>
									</BasketTop>
									<QuantityControls>
										<QuantityButton
											onClick={() => updatePreviewQuantity(item, item.quantity - 1)}
											type="button"
										>
											-
										</QuantityButton>
										<strong>{item.quantity}</strong>
										<QuantityButton
											onClick={() => updatePreviewQuantity(item, item.quantity + 1)}
											type="button"
										>
											+
										</QuantityButton>
									</QuantityControls>
								</BasketRow>
							))
						)}
						<BasketTop>
							<BasketName>{cartItemCount} items</BasketName>
							<strong>{formatCents(cartSubtotalCents)}</strong>
						</BasketTop>
						<SendButton
							disabled={draftCart.length === 0}
							onClick={handleSendPreviewCart}
							type="button"
						>
							Send to kitchen
						</SendButton>
						{checkoutIntent && !guest?.uid ? (
							<BrowserGuestIdentity
								onVerified={(verifiedGuest) => {
									setGuest(verifiedGuest);
									savePublicCart(draftCart);
									setCartNotice(
										"Saved. Scan your table QR code at the restaurant and we will bring this basket into the ordering session.",
									);
								}}
								restaurantId={restaurant.id}
								tableId="public_menu"
							/>
						) : null}
						{cartNotice ? (
							<NoticePanel $tone="success">{cartNotice}</NoticePanel>
						) : checkoutIntent ? (
							<NoticePanel>
								To send this order, scan the table QR code when you are seated.
								That connects the basket to the restaurant table.
							</NoticePanel>
						) : null}
					</BasketPanel>

					<ActionPanel>
						<SectionTitle>Plan your visit</SectionTitle>
						<Muted>
							Browse freely. Ordering opens from a secure table QR code when the
							restaurant enables browser dining.
						</Muted>
						<ButtonStack>
							{isFeatureEnabled(restaurant, "reservations") ? (
								<PrimaryAction to={`/r/${canonicalSlug}/reserve`}>
									Request reservation
								</PrimaryAction>
							) : (
								<PrimaryAction to="/request-demo">
									Bring Scerv here
								</PrimaryAction>
							)}
							<SecondaryAction to="/scan">Open from table QR</SecondaryAction>
						</ButtonStack>
					</ActionPanel>

					<Section>
						<SectionTitle>Available on Scerv</SectionTitle>
						<StatusList>
							<StatusRow>
								<Dot $enabled={isFeatureEnabled(restaurant, "reviews")} />
								Dish reviews
							</StatusRow>
							<StatusRow>
								<Dot $enabled={isFeatureEnabled(restaurant, "reservations")} />
								Reservations
							</StatusRow>
							<StatusRow>
								<Dot $enabled={isFeatureEnabled(restaurant, "qrSelfCheckIn")} />
								Table QR ordering
							</StatusRow>
							<StatusRow>
								<Dot $enabled={isFeatureEnabled(restaurant, "loyaltyClub")} />
								Rewards
							</StatusRow>
						</StatusList>
					</Section>

					<Section>
						<SectionTitle>Restaurant details</SectionTitle>
						<StatusList>
							{restaurant.address ? <Muted>{restaurant.address}</Muted> : null}
							{restaurant.phoneNumber ? <Muted>{restaurant.phoneNumber}</Muted> : null}
							{restaurant.priceLevel ? <Muted>{restaurant.priceLevel}</Muted> : null}
						</StatusList>
					</Section>
				</Sidebar>
			</Main>
		</Page>
	);
};

export default RestaurantLanding;
