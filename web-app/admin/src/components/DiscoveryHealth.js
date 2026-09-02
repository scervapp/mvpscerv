import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db, selectedAdminEnvironment } from "../config/firebase";
import "./styles/DiscoveryHealth.css";

const normalizeStatus = (restaurant = {}) => {
	const status = String(
		restaurant.listingStatus ||
			restaurant.scervStatus ||
			restaurant.claimStatus ||
			"scerv_enabled",
	)
		.trim()
		.toLowerCase();

	if (
		restaurant.isCommunityProfile === true ||
		restaurant.isClaimed === false ||
		["community", "community_listed", "unclaimed", "discovery_only"].includes(
			status,
		)
	) {
		return "community";
	}
	if (["claimed", "verified", "restaurant_claimed"].includes(status)) {
		return "claimed";
	}
	return "scerv_enabled";
};

const hasPhoto = (record = {}) =>
	Boolean(record.imageUri || record.imageUrl || record.thumbnailUri) ||
	(Array.isArray(record.media) &&
		record.media.some((media) => media?.url || media?.imageUrl));

const hasUsefulMetadata = (item = {}) =>
	[
		item.standardCategory,
		item.discoveryLabel,
		item.category,
		item.cuisineTags,
		item.dishTypeTags,
		item.ingredientTags,
		item.flavorTags,
		item.dietaryTags,
		item.searchKeywords,
	].some((value) => (Array.isArray(value) ? value.length > 0 : Boolean(value)));

const buildRestaurantHealth = (restaurant, menuItems) => {
	const listingStatus = normalizeStatus(restaurant);
	const activeItems = menuItems.filter((item) => item.isArchived !== true);
	const itemsWithPhotos = activeItems.filter(hasPhoto).length;
	const itemsWithMetadata = activeItems.filter(hasUsefulMetadata).length;
	const ratedItems = activeItems.filter(
		(item) => Number(item.ratingCount || item.reviewCount || 0) > 0,
	).length;
	const missing = [];

	if (!hasPhoto(restaurant)) missing.push("restaurant photo");
	if (!restaurant.claimContactEmail && !restaurant.email) {
		missing.push("claim contact");
	}
	if (activeItems.length < 5) missing.push("menu depth");
	if (activeItems.length > 0 && itemsWithPhotos / activeItems.length < 0.7) {
		missing.push("dish photos");
	}
	if (activeItems.length > 0 && itemsWithMetadata / activeItems.length < 0.7) {
		missing.push("food metadata");
	}
	if (ratedItems < 3) missing.push("rating volume");

	const readinessScore = Math.max(0, Math.round(100 - missing.length * 15));

	return {
		...restaurant,
		listingStatus,
		menuCount: activeItems.length,
		itemsWithPhotos,
		itemsWithMetadata,
		ratedItems,
		missing,
		readinessScore,
	};
};

const DiscoveryHealth = () => {
	const [restaurants, setRestaurants] = useState([]);
	const [menuItems, setMenuItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [lastLoadedAt, setLastLoadedAt] = useState(null);

	const loadDiscoveryHealth = async () => {
		setLoading(true);
		setError("");

		try {
			const [restaurantSnap, menuSnap] = await Promise.all([
				getDocs(collection(db, "restaurants")),
				getDocs(collection(db, "menuItems")),
			]);

			setRestaurants(
				restaurantSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
			);
			setMenuItems(menuSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
			setLastLoadedAt(new Date());
		} catch (err) {
			console.error("Discovery health load failed:", err);
			setError(
				`Failed to load discovery health from ${selectedAdminEnvironment.projectId}: ${
					err.message || err.code || "Unknown error"
				}`,
			);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadDiscoveryHealth();
	}, []);

	const healthRows = useMemo(() => {
		const itemsByRestaurant = new Map();
		menuItems.forEach((item) => {
			const restaurantId = item.restaurantId;
			if (!restaurantId) return;
			if (!itemsByRestaurant.has(restaurantId)) {
				itemsByRestaurant.set(restaurantId, []);
			}
			itemsByRestaurant.get(restaurantId).push(item);
		});

		return restaurants
			.map((restaurant) =>
				buildRestaurantHealth(
					restaurant,
					itemsByRestaurant.get(restaurant.id) || [],
				),
			)
			.sort((a, b) => {
				if (a.readinessScore !== b.readinessScore) {
					return a.readinessScore - b.readinessScore;
				}
				return String(a.restaurantName || a.name || "").localeCompare(
					String(b.restaurantName || b.name || ""),
				);
			});
	}, [menuItems, restaurants]);

	const summary = useMemo(
		() => ({
			community: healthRows.filter((row) => row.listingStatus === "community")
				.length,
			claimed: healthRows.filter((row) => row.listingStatus === "claimed").length,
			scervEnabled: healthRows.filter(
				(row) => row.listingStatus === "scerv_enabled",
			).length,
			needsWork: healthRows.filter((row) => row.missing.length > 0).length,
		}),
		[healthRows],
	);

	return (
		<div className="discovery-health-container">
			<div className="discovery-health-header">
				<div>
					<p className="discovery-health-kicker">
						{selectedAdminEnvironment.label} / {selectedAdminEnvironment.projectId}
					</p>
					<h2>Discovery Health</h2>
					<span>
						{healthRows.length} listings
						{lastLoadedAt ? ` · refreshed ${lastLoadedAt.toLocaleTimeString()}` : ""}
					</span>
				</div>
				<button type="button" onClick={loadDiscoveryHealth} disabled={loading}>
					{loading ? "Refreshing..." : "Refresh"}
				</button>
			</div>

			{error ? <div className="discovery-health-error">{error}</div> : null}

			<div className="discovery-health-metrics">
				<div><strong>{summary.community}</strong><span>Community listed</span></div>
				<div><strong>{summary.claimed}</strong><span>Claimed discovery</span></div>
				<div><strong>{summary.scervEnabled}</strong><span>Scerv enabled</span></div>
				<div><strong>{summary.needsWork}</strong><span>Need cleanup</span></div>
			</div>

			<div className="discovery-health-panel">
				<table className="discovery-health-table">
					<thead>
						<tr>
							<th>Listing</th>
							<th>Status</th>
							<th>Readiness</th>
							<th>Menu</th>
							<th>Ratings</th>
							<th>Needs</th>
							<th>Action</th>
						</tr>
					</thead>
					<tbody>
						{healthRows.map((row) => (
							<tr key={row.id}>
								<td>
									<strong>{row.restaurantName || row.name || "Restaurant"}</strong>
									<span>{[row.area, row.city, row.state].filter(Boolean).join(", ")}</span>
								</td>
								<td>
									<span className={`discovery-status ${row.listingStatus}`}>
										{row.listingStatus === "scerv_enabled"
											? "Scerv enabled"
											: row.listingStatus === "claimed"
												? "Claimed"
												: "Community"}
									</span>
								</td>
								<td>
									<div className="readiness-meter">
										<span style={{ width: `${row.readinessScore}%` }} />
									</div>
									<small>{row.readinessScore}%</small>
								</td>
								<td>{row.menuCount}</td>
								<td>{row.ratedItems}</td>
								<td>
									{row.missing.length > 0 ? (
										<div className="needs-list">
											{row.missing.map((need) => (
												<span key={need}>{need}</span>
											))}
										</div>
									) : (
										<span className="ready-pill">Ready</span>
									)}
								</td>
								<td>
									<Link to={`/restaurants/${row.id}`}>Review</Link>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{!loading && healthRows.length === 0 ? (
					<div className="discovery-health-empty">
						No restaurant records found.
					</div>
				) : null}
			</div>
		</div>
	);
};

export default DiscoveryHealth;
