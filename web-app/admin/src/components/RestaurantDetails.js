import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import RestaurantFeatureControls from "./RestaurantFeatureControls";
import "./styles/RestaurantDetails.css";

const TABS = [
	"overview",
	"profile",
	"features",
	"menu",
	"orders",
	"reservations",
	"operations",
	"owner",
	"audit",
];

const formatMoney = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

const formatDate = (value) => {
	if (!value) return "--";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const getFeatureCount = (features = {}) =>
	Object.values(features).filter((value) => value !== false).length;

const RestaurantDetails = () => {
	const { id } = useParams();
	const [profile, setProfile] = useState(null);
	const [restaurant, setRestaurant] = useState(null);
	const [formData, setFormData] = useState({});
	const [activeTab, setActiveTab] = useState("overview");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [setupResult, setSetupResult] = useState(null);

	const loadProfile = async () => {
		setLoading(true);
		setError("");
		try {
			const getProfile = httpsCallable(functions, "getScervRestaurantProfile");
			const response = await getProfile({ restaurantId: id });
			const data = response.data || {};
			setProfile(data);
			setRestaurant(data.restaurant);
			setFormData(data.restaurant || {});
		} catch (err) {
			console.error("Error fetching restaurant data:", err);
			setError("Error fetching restaurant data.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadProfile();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	const orders = useMemo(() => profile?.orders || [], [profile]);
	const reservations = useMemo(() => profile?.reservations || [], [profile]);
	const checkIns = useMemo(() => profile?.checkIns || [], [profile]);
	const tables = useMemo(() => profile?.tables || [], [profile]);
	const employees = useMemo(() => profile?.employees || [], [profile]);
	const menuItems = useMemo(() => profile?.menuItems || [], [profile]);
	const owner = profile?.owner || {};
	const entitlements = restaurant?.featureEntitlements || {};

	const orderTotals = useMemo(
		() =>
			orders.reduce(
				(acc, order) => {
					acc.total += Number(order.totalPrice || 0);
					acc.refunded += Number(order.refundedAmount || 0);
					return acc;
				},
				{ total: 0, refunded: 0 },
			),
		[orders],
	);

	const handleChange = (event) => {
		const { name, value, type, checked } = event.target;
		setFormData((prev) => ({
			...prev,
			[name]: type === "checkbox" ? checked : value,
		}));
	};

	const saveProfile = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		setMessage("");

		try {
			const updateProfile = httpsCallable(
				functions,
				"updateScervRestaurantProfile",
			);
			const updates = {
				...formData,
				restaurantNumber: Number(formData.restaurantNumber || 0),
				taxRate: Number(formData.taxRate || 0),
			};
			await updateProfile({ restaurantId: id, updates });
			setRestaurant(updates);
			setMessage("Restaurant profile saved.");
			await loadProfile();
		} catch (err) {
			console.error("Error updating restaurant:", err);
			setError("Error updating restaurant.");
		} finally {
			setSaving(false);
		}
	};

	const resendOwnerSetup = async () => {
		setSaving(true);
		setError("");
		setMessage("");
		setSetupResult(null);

		try {
			const resendSetup = httpsCallable(
				functions,
				"resendRestaurantOwnerSetupEmail",
			);
			const response = await resendSetup({ restaurantId: id });
			setSetupResult(response.data);
			setMessage("Owner setup link generated.");
		} catch (err) {
			console.error("Error resending owner setup:", err);
			setError("Could not generate owner setup link.");
		} finally {
			setSaving(false);
		}
	};

	if (loading) return <div className="restaurant-details-container">Loading...</div>;
	if (error && !restaurant) {
		return <div className="restaurant-details-container error">{error}</div>;
	}
	if (!restaurant) {
		return <div className="restaurant-details-container">Restaurant not found.</div>;
	}

	return (
		<div className="restaurant-details-container">
			<div className="restaurant-hero">
				<div>
					<Link to="/restaurants">Back to restaurants</Link>
					<h1>{restaurant.restaurantName || "Restaurant"}</h1>
					<p>
						Store #{restaurant.restaurantNumber || "--"} ·{" "}
						{restaurant.city || "--"}, {restaurant.state || "--"}
					</p>
				</div>
				<div className="restaurant-status-stack">
					<span className={restaurant.isActive ? "good-pill" : "bad-pill"}>
						{restaurant.isActive ? "Active" : "Inactive"}
					</span>
					<span className={restaurant.isLive ? "good-pill" : "warn-pill"}>
						{restaurant.isLive ? "Live" : "Not live"}
					</span>
					<span className="neutral-pill">
						{restaurant.planLevel || restaurant.subscription?.planLevel || "starter"}
					</span>
				</div>
			</div>

			{message && <p className="restaurant-message">{message}</p>}
			{error && <p className="restaurant-error">{error}</p>}

			<div className="restaurant-tabs">
				{TABS.map((tab) => (
					<button
						key={tab}
						type="button"
						className={activeTab === tab ? "active" : ""}
						onClick={() => setActiveTab(tab)}
					>
						{tab}
					</button>
				))}
			</div>

			{activeTab === "overview" && (
				<div className="restaurant-grid">
					<section className="restaurant-panel">
						<h2>Readiness</h2>
						<dl>
							<dt>Stripe</dt>
							<dd>{restaurant.stripeAccountStatus || "unverified"}</dd>
							<dt>Onboarding</dt>
							<dd>{restaurant.onboardingStatus || "--"}</dd>
							<dt>Subscription</dt>
							<dd>{restaurant.subscriptionStatus || restaurant.subscription?.status || "--"}</dd>
							<dt>Features enabled</dt>
							<dd>{getFeatureCount(entitlements)}</dd>
						</dl>
					</section>
					<section className="restaurant-panel">
						<h2>Activity Snapshot</h2>
						<div className="metric-grid">
							<div><strong>{menuItems.length}</strong><span>Menu items</span></div>
							<div><strong>{orders.length}</strong><span>Recent orders</span></div>
							<div><strong>{reservations.length}</strong><span>Reservations</span></div>
							<div><strong>{checkIns.length}</strong><span>Check-ins</span></div>
						</div>
					</section>
					<section className="restaurant-panel">
						<h2>Money Snapshot</h2>
						<div className="metric-grid">
							<div><strong>{formatMoney(orderTotals.total)}</strong><span>Recent paid</span></div>
							<div><strong>{formatMoney(orderTotals.refunded)}</strong><span>Refunded</span></div>
						</div>
					</section>
					<section className="restaurant-panel">
						<h2>Shortcuts</h2>
						<div className="shortcut-row">
							<Link to={`/restaurants/${id}/menu`}>Manage Menu</Link>
							<Link to="/command-center">Command Center</Link>
						</div>
					</section>
				</div>
			)}

			{activeTab === "profile" && (
				<section className="restaurant-panel">
					<h2>Profile</h2>
					<form className="restaurant-profile-form" onSubmit={saveProfile}>
						{[
							["restaurantName", "Restaurant name"],
							["restaurantNumber", "Store #"],
							["address", "Address"],
							["city", "City"],
							["state", "State"],
							["zipcode", "Zip code"],
							["phoneNumber", "Phone"],
							["email", "Email"],
							["cuisineType", "Cuisine"],
							["taxRate", "Tax rate"],
							["website", "Website"],
							["imageUri", "Image URL"],
						].map(([field, label]) => (
							<label key={field}>
								{label}
								<input
									name={field}
									value={formData[field] || ""}
									onChange={handleChange}
								/>
							</label>
						))}
						<label className="wide-field">
							Description
							<textarea
								name="description"
								value={formData.description || ""}
								onChange={handleChange}
							/>
						</label>
						<label className="check-field">
							<input
								type="checkbox"
								name="isActive"
								checked={formData.isActive !== false}
								onChange={handleChange}
							/>
							Active
						</label>
						<button type="submit" disabled={saving}>
							{saving ? "Saving..." : "Save Profile"}
						</button>
					</form>
				</section>
			)}

			{activeTab === "features" && (
				<RestaurantFeatureControls
					restaurantId={id}
					restaurant={restaurant}
					onSaved={(updatedRestaurant) => {
						setRestaurant(updatedRestaurant);
						setFormData(updatedRestaurant);
					}}
				/>
			)}

			{activeTab === "menu" && (
				<section className="restaurant-panel">
					<h2>Menu</h2>
					<Link className="primary-link" to={`/restaurants/${id}/menu`}>
						Manage Menu
					</Link>
					<table className="restaurant-table">
						<thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Status</th></tr></thead>
						<tbody>
							{menuItems.slice(0, 25).map((item) => (
								<tr key={item.id}>
									<td>{item.name}</td>
									<td>{item.category || "--"}</td>
									<td>{formatMoney(Number(item.price || 0) * 100)}</td>
									<td>{item.isArchived ? "Archived" : item.isActive ? "Active" : "Inactive"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}

			{activeTab === "orders" && (
				<section className="restaurant-panel">
					<h2>Recent Orders</h2>
					<table className="restaurant-table">
						<thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th></tr></thead>
						<tbody>
							{orders.map((order) => (
								<tr key={order.id}>
									<td><Link to={`/orders/${order.id}`}>{order.readableOrderId || order.id}</Link></td>
									<td>{order.customerName || order.customerEmail || "--"}</td>
									<td>{order.paymentStatus || order.orderStatus || "--"}</td>
									<td>{formatMoney(order.totalPrice)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}

			{activeTab === "reservations" && (
				<section className="restaurant-panel">
					<h2>Reservations</h2>
					<table className="restaurant-table">
						<thead><tr><th>Guest</th><th>Status</th><th>Party</th><th>Time</th></tr></thead>
						<tbody>
							{reservations.map((reservation) => (
								<tr key={reservation.id}>
									<td>{reservation.customerName || reservation.customerEmail || "--"}</td>
									<td>{reservation.status || "--"}</td>
									<td>{reservation.partySize || "--"}</td>
									<td>{reservation.reservationTime || formatDate(reservation.reservationDate)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}

			{activeTab === "operations" && (
				<div className="restaurant-grid">
					<section className="restaurant-panel">
						<h2>Tables</h2>
						<table className="restaurant-table">
							<tbody>
								{tables.slice(0, 30).map((table) => (
									<tr key={table.id}><td>{table.name || table.tableNumber || table.id}</td><td>{table.status || "--"}</td></tr>
								))}
							</tbody>
						</table>
					</section>
					<section className="restaurant-panel">
						<h2>Employees</h2>
						<table className="restaurant-table">
							<tbody>
								{employees.slice(0, 30).map((employee) => (
									<tr key={employee.id}><td>{employee.name || `${employee.firstName || ""} ${employee.lastName || ""}`.trim() || employee.id}</td><td>{employee.role || employee.jobTitle || "--"}</td></tr>
								))}
							</tbody>
						</table>
					</section>
					<section className="restaurant-panel wide-panel">
						<h2>Recent Check-ins</h2>
						<table className="restaurant-table">
							<tbody>
								{checkIns.slice(0, 30).map((checkIn) => (
									<tr key={checkIn.id}><td>{checkIn.customerName || checkIn.customerId || checkIn.id}</td><td>{checkIn.status || "--"}</td><td>{formatDate(checkIn.createdAt)}</td></tr>
								))}
							</tbody>
						</table>
					</section>
				</div>
			)}

			{activeTab === "owner" && (
				<section className="restaurant-panel">
					<h2>Owner Setup</h2>
					<dl>
						<dt>Name</dt><dd>{owner.fullName || `${owner.firstName || ""} ${owner.lastName || ""}`.trim() || "--"}</dd>
						<dt>Email</dt><dd>{owner.email || restaurant.email || "--"}</dd>
						<dt>Phone</dt><dd>{owner.phoneNumber || restaurant.phoneNumber || "--"}</dd>
						<dt>Auth UID</dt><dd>{restaurant.uid || id}</dd>
					</dl>
					<button type="button" onClick={resendOwnerSetup} disabled={saving}>
						{saving ? "Generating..." : "Resend Setup Link"}
					</button>
					{setupResult && (
						<label className="setup-link-box">
							Setup link
							<textarea readOnly value={setupResult.resetLink || ""} />
						</label>
					)}
				</section>
			)}

			{activeTab === "audit" && (
				<section className="restaurant-panel">
					<h2>Recent Admin Audit</h2>
					<table className="restaurant-table">
						<thead><tr><th>Action</th><th>Actor</th><th>When</th></tr></thead>
						<tbody>
							{(profile?.auditLogs || []).map((log) => (
								<tr key={log.id}>
									<td>{log.action}</td>
									<td>{log.actorUid}</td>
									<td>{formatDate(log.createdAt)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}
		</div>
	);
};

export default RestaurantDetails;
