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
	const [error, setError] = useState("");

	useEffect(() => {
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

		loadProfile();
	}, [id]);

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
					<p>{customer.email || "No email"} · {customer.id}</p>
				</div>
			</div>

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
								{club.visitCount || 0} visits · {club.clubPoints || 0} club
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
