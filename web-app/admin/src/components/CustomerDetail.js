import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/CustomerDetail.css";

const formatMoney = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

const CustomerDetail = () => {
	const { id } = useParams();
	const [profile, setProfile] = useState(null);
	const [loading, setLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState(false);
	const [error, setError] = useState("");
	const [actionMessage, setActionMessage] = useState("");
	const [resetLink, setResetLink] = useState("");
	const [accountReason, setAccountReason] = useState("");
	const [creatorReason, setCreatorReason] = useState("");

	const loadProfile = async () => {
		setLoading(true);
		setError("");
		try {
			const getProfile = httpsCallable(functions, "getScervCustomerProfile");
			const response = await getProfile({ customerId: id });
			setProfile(response.data);
		} catch (err) {
			console.error("Failed to load customer profile:", err);
			setError("Failed to load customer profile.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadProfile();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	const sendPasswordReset = async () => {
		setActionLoading(true);
		setActionMessage("");
		setResetLink("");
		try {
			const resetCustomer = httpsCallable(
				functions,
				"sendScervCustomerPasswordReset",
			);
			const response = await resetCustomer({ customerId: id });
			setResetLink(response.data?.resetLink || "");
			setActionMessage(
				response.data?.emailSent
					? "Password reset email sent."
					: response.data?.emailWarning || "Password reset link generated.",
			);
		} catch (err) {
			console.error("Failed to send password reset:", err);
			setActionMessage(err.message || "Failed to send password reset.");
		} finally {
			setActionLoading(false);
		}
	};

	const setCustomerDisabled = async (disabled) => {
		if (!accountReason.trim()) {
			setActionMessage("Add a reason before changing account status.");
			return;
		}
		setActionLoading(true);
		setActionMessage("");
		try {
			const updateDisabled = httpsCallable(functions, "setScervCustomerDisabled");
			await updateDisabled({
				customerId: id,
				disabled,
				reason: accountReason,
			});
			setActionMessage(disabled ? "Customer disabled." : "Customer reactivated.");
			setAccountReason("");
			await loadProfile();
		} catch (err) {
			console.error("Failed to update customer account:", err);
			setActionMessage(err.message || "Failed to update customer account.");
		} finally {
			setActionLoading(false);
		}
	};

	const setCreatorStatus = async (isApproved) => {
		if (!creatorReason.trim()) {
			setActionMessage("Add a reason before changing featured diner status.");
			return;
		}
		setActionLoading(true);
		setActionMessage("");
		try {
			const updateCreator = httpsCallable(
				functions,
				"setScervCustomerCreatorStatus",
			);
			await updateCreator({
				customerId: id,
				isApproved,
				reason: creatorReason,
			});
			setActionMessage(
				isApproved
					? "Customer approved as a featured diner."
					: "Customer removed from featured diner visibility.",
			);
			setCreatorReason("");
			await loadProfile();
		} catch (err) {
			console.error("Failed to update featured diner status:", err);
			setActionMessage(err.message || "Failed to update featured diner status.");
		} finally {
			setActionLoading(false);
		}
	};

	if (loading) {
		return <div className="customer-detail-container">Loading...</div>;
	}

	if (error) {
		return <div className="customer-detail-container error">{error}</div>;
	}

	if (!profile) {
		return <div className="customer-detail-container">Customer not found.</div>;
	}

	const customer = profile.customer || {};
	const rewards = customer.rewardsSummary || {};
	const isApprovedCreator =
		customer.isScervApprovedInfluencer ||
		customer.scervApprovedInfluencer ||
		customer.publicInfluencer ||
		customer.creatorStatus === "scerv_approved";

	return (
		<div className="customer-detail-container">
			<div className="customer-detail-header">
				<div>
					<Link to="/customers">Back to customers</Link>
					<h1>
						{customer.displayName ||
							customer.name ||
							`${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
							customer.email ||
							customer.id}
					</h1>
					<p>{customer.email || "No email"} - {customer.id}</p>
				</div>
				<div className="customer-action-links">
					<Link to="/support-cases">Create support case</Link>
					<Link to="/promotions">Issue promotion</Link>
				</div>
			</div>

			{actionMessage && <p className="customer-action-message">{actionMessage}</p>}
			{resetLink && (
				<p className="customer-reset-link">
					Reset link: <span>{resetLink}</span>
				</p>
			)}

			<div className="customer-detail-grid">
				<section className="customer-detail-panel">
					<h2>Account</h2>
					<dl>
						<dt>Phone</dt>
						<dd>{customer.phoneNumber || "--"}</dd>
						<dt>Role</dt>
						<dd>{customer.role || "--"}</dd>
						<dt>Auth status</dt>
						<dd>
							{profile.authUser?.missingFromAuth
								? "Missing auth user"
								: profile.authUser?.disabled
									? "Disabled"
									: "Active"}
						</dd>
						<dt>Email verified</dt>
						<dd>{profile.authUser?.emailVerified ? "Yes" : "No"}</dd>
					</dl>
				</section>

				<section className="customer-detail-panel">
					<h2>Account Actions</h2>
					<label className="customer-action-label">
						Reason
						<input
							value={accountReason}
							onChange={(event) => setAccountReason(event.target.value)}
							placeholder="Support reason for account change"
						/>
					</label>
					<div className="customer-action-buttons">
						<button
							type="button"
							onClick={sendPasswordReset}
							disabled={actionLoading}
						>
							Send reset
						</button>
						{profile.authUser?.disabled ? (
							<button
								type="button"
								onClick={() => setCustomerDisabled(false)}
								disabled={actionLoading}
							>
								Reactivate
							</button>
						) : (
							<button
								type="button"
								className="danger"
								onClick={() => setCustomerDisabled(true)}
								disabled={actionLoading}
							>
								Disable
							</button>
						)}
					</div>
				</section>

				<section className="customer-detail-panel">
					<h2>Rewards Wallet</h2>
					<dl>
						<dt>Available points</dt>
						<dd>
							{rewards.scervAvailablePoints ||
								rewards.availablePoints ||
								rewards.scervAvaialablePoints ||
								0}
						</dd>
						<dt>Lifetime points</dt>
						<dd>
							{rewards.scervLifetimeEarnedPoints ||
								rewards.lifetimeEarnedPoints ||
								0}
						</dd>
						<dt>Food credits</dt>
						<dd>
							{formatMoney(
								rewards.foodCreditCents ||
									rewards.scervFoodCreditCents ||
									rewards.availableFoodCreditCents ||
									0,
							)}
						</dd>
					</dl>
				</section>

				<section className="customer-detail-panel">
					<h2>Featured Diner</h2>
					<div
						className={`creator-status-pill ${
							isApprovedCreator ? "approved" : "standard"
						}`}
					>
						{isApprovedCreator ? "Featured in customer feeds" : "Standard customer"}
					</div>
					<p className="creator-status-help">
						Featured diners can appear in every customer's feed. Friends still
						appear separately through PIPs.
					</p>
					<label className="customer-action-label">
						Reason
						<input
							value={creatorReason}
							onChange={(event) => setCreatorReason(event.target.value)}
							placeholder="Why this featured status is changing"
						/>
					</label>
					<div className="customer-action-buttons">
						{isApprovedCreator ? (
							<button
								type="button"
								className="danger"
								onClick={() => setCreatorStatus(false)}
								disabled={actionLoading}
							>
								Remove featured
							</button>
						) : (
							<button
								type="button"
								onClick={() => setCreatorStatus(true)}
								disabled={actionLoading}
							>
								Make featured
							</button>
						)}
					</div>
				</section>
			</div>

			<section className="customer-detail-panel">
				<h2>Recent Orders</h2>
				{profile.orders?.length ? (
					<table className="customer-detail-table">
						<thead>
							<tr>
								<th>Order</th>
								<th>Restaurant</th>
								<th>Status</th>
								<th>Total</th>
							</tr>
						</thead>
						<tbody>
							{profile.orders.map((order) => (
								<tr key={order.id}>
									<td>
										<Link to={`/orders/${order.id}`}>
											{order.readableOrderId || order.id}
										</Link>
									</td>
									<td>{order.restaurantName || order.restaurantId || "--"}</td>
									<td>{order.paymentStatus || order.orderStatus || "--"}</td>
									<td>{formatMoney(order.totalPrice)}</td>
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<p>No recent orders.</p>
				)}
			</section>

			<section className="customer-detail-panel">
				<h2>Reservations</h2>
				{profile.reservations?.length ? (
					<table className="customer-detail-table">
						<thead>
							<tr>
								<th>Restaurant</th>
								<th>Status</th>
								<th>Party</th>
								<th>Time</th>
							</tr>
						</thead>
						<tbody>
							{profile.reservations.map((reservation) => (
								<tr key={reservation.id}>
									<td>
										{reservation.restaurantName ||
											reservation.restaurantId ||
											"--"}
									</td>
									<td>{reservation.status || "--"}</td>
									<td>{reservation.partySize || "--"}</td>
									<td>
										{reservation.reservationTime ||
											reservation.reservationDate ||
											"--"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<p>No reservations.</p>
				)}
			</section>

			<section className="customer-detail-panel">
				<h2>Restaurant Clubs And Promotions</h2>
				<div className="customer-detail-list">
					{profile.restaurantClubs?.map((club) => (
						<div key={club.id}>
							<strong>{club.restaurantName || club.id}</strong>
							<span>
								{club.visitCount || 0} visits - {club.clubPoints || 0} club
								points
							</span>
						</div>
					))}
					{profile.promotions?.map((promotion) => (
						<div key={promotion.id}>
							<strong>{promotion.title || promotion.label || promotion.id}</strong>
							<span>{promotion.status || "available"}</span>
						</div>
					))}
					{!profile.restaurantClubs?.length && !profile.promotions?.length && (
						<p>No club or promotion records.</p>
					)}
				</div>
			</section>
		</div>
	);
};

export default CustomerDetail;
