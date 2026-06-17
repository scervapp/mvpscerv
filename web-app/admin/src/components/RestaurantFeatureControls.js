import React, { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/RestaurantFeatureControls.css";

const FEATURE_DEFINITIONS = [
	["reservations", "Reservations", "Guest reservation requests and host reservation queue."],
	["reservationWaitlist", "Waitlist", "Waitlist offers and guest confirmations."],
	["hostCheckInRequests", "Host check-in", "Walk-in check-in requests routed to host staff."],
	["reviews", "Reviews", "Dish ratings and review surfaces."],
	["rewards", "Rewards", "Restaurant loyalty clubs and automatic perks."],
	["qrSelfCheckIn", "QR self check-in", "Guest self check-in from table QR codes."],
	["parties", "Parties", "Shared party sessions and group ordering."],
	["pickup", "Pickup", "Hotel pickup or takeout-style ordering."],
	["tableScanOrdering", "Table scan ordering", "Ordering from seated table sessions."],
	["serviceRequests", "Service requests", "Guest requests from active table sessions."],
	["advancedReporting", "Advanced reporting", "Premium reporting and analytics access."],
];

const PLAN_OPTIONS = ["starter", "pro", "premium", "enterprise"];
const STATUS_OPTIONS = ["trial", "active", "past_due", "paused", "cancelled", "comped"];

const getInitialFeatureState = (restaurant = {}) => {
	const source = restaurant.featureEntitlements || restaurant.subscriptionFeatures || {};
	return FEATURE_DEFINITIONS.reduce((acc, [key]) => {
		acc[key] = source[key] !== false;
		return acc;
	}, {});
};

const RestaurantFeatureControls = ({ restaurantId, restaurant, onSaved }) => {
	const [features, setFeatures] = useState({});
	const [planLevel, setPlanLevel] = useState("starter");
	const [subscriptionStatus, setSubscriptionStatus] = useState("trial");
	const [trialEndsAt, setTrialEndsAt] = useState("");
	const [billingProvider, setBillingProvider] = useState("");
	const [externalSubscriptionId, setExternalSubscriptionId] = useState("");
	const [billingNotes, setBillingNotes] = useState("");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		const subscription = restaurant?.subscription || {};
		setFeatures(getInitialFeatureState(restaurant));
		setPlanLevel(restaurant?.planLevel || subscription.planLevel || "starter");
		setSubscriptionStatus(
			restaurant?.subscriptionStatus || subscription.status || "trial",
		);
		setTrialEndsAt(subscription.trialEndsAt || "");
		setBillingProvider(subscription.billingProvider || "");
		setExternalSubscriptionId(subscription.externalSubscriptionId || "");
		setBillingNotes(subscription.billingNotes || "");
	}, [restaurant]);

	const updateFeature = (key, value) => {
		setFeatures((prev) => ({ ...prev, [key]: value }));
	};

	const saveControls = async (event) => {
		event.preventDefault();
		setSaving(true);
		setMessage("");
		setError("");

		try {
			const saveEntitlements = httpsCallable(
				functions,
				"saveRestaurantFeatureEntitlements",
			);
			const response = await saveEntitlements({
				restaurantId,
				featureEntitlements: features,
				subscription: {
					planLevel,
					subscriptionStatus,
					trialEndsAt,
					billingProvider,
					externalSubscriptionId,
					billingNotes,
				},
			});
			setMessage("Subscription controls saved.");
			onSaved?.({
				...restaurant,
				featureEntitlements: response.data?.featureEntitlements || features,
				subscriptionFeatures: response.data?.featureEntitlements || features,
				planLevel,
				subscriptionStatus,
				subscription: {
					...(restaurant?.subscription || {}),
					planLevel,
					status: subscriptionStatus,
					trialEndsAt: trialEndsAt || null,
					billingProvider: billingProvider || null,
					externalSubscriptionId: externalSubscriptionId || null,
					billingNotes: billingNotes || null,
				},
			});
		} catch (err) {
			console.error("Failed to save restaurant subscription controls:", err);
			setError("Failed to save subscription controls.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="restaurant-feature-panel">
			<div className="restaurant-feature-header">
				<div>
					<h3>Feature And Subscription Controls</h3>
					<p>Scerv-side access gates for paid features and future billing.</p>
				</div>
				<span className={`subscription-badge status-${subscriptionStatus}`}>
					{subscriptionStatus}
				</span>
			</div>

			{message && <p className="restaurant-feature-message">{message}</p>}
			{error && <p className="restaurant-feature-error">{error}</p>}

			<form onSubmit={saveControls}>
				<div className="restaurant-subscription-grid">
					<label>
						Plan
						<select
							value={planLevel}
							onChange={(event) => setPlanLevel(event.target.value)}
						>
							{PLAN_OPTIONS.map((option) => (
								<option value={option} key={option}>
									{option}
								</option>
							))}
						</select>
					</label>
					<label>
						Status
						<select
							value={subscriptionStatus}
							onChange={(event) => setSubscriptionStatus(event.target.value)}
						>
							{STATUS_OPTIONS.map((option) => (
								<option value={option} key={option}>
									{option}
								</option>
							))}
						</select>
					</label>
					<label>
						Trial ends
						<input
							type="date"
							value={trialEndsAt}
							onChange={(event) => setTrialEndsAt(event.target.value)}
						/>
					</label>
					<label>
						Billing provider
						<input
							value={billingProvider}
							onChange={(event) => setBillingProvider(event.target.value)}
							placeholder="Manual, Stripe, comped..."
						/>
					</label>
					<label>
						External subscription ID
						<input
							value={externalSubscriptionId}
							onChange={(event) =>
								setExternalSubscriptionId(event.target.value)
							}
						/>
					</label>
				</div>

				<div className="restaurant-feature-grid">
					{FEATURE_DEFINITIONS.map(([key, label, description]) => (
						<label className="restaurant-feature-toggle" key={key}>
							<input
								type="checkbox"
								checked={Boolean(features[key])}
								onChange={(event) => updateFeature(key, event.target.checked)}
							/>
							<span>
								<strong>{label}</strong>
								<small>{description}</small>
							</span>
						</label>
					))}
				</div>

				<label className="restaurant-feature-notes">
					Billing notes
					<textarea
						value={billingNotes}
						onChange={(event) => setBillingNotes(event.target.value)}
						placeholder="Internal Scerv billing or subscription notes"
					/>
				</label>

				<button type="submit" disabled={saving}>
					{saving ? "Saving..." : "Save Subscription Controls"}
				</button>
			</form>
		</section>
	);
};

export default RestaurantFeatureControls;
