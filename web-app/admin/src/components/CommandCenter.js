import React, { useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/CommandCenter.css";

const formatMoney = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

const CommandCenter = () => {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const runSearch = async (event) => {
		event.preventDefault();
		setError("");
		setResults(null);

		if (query.trim().length < 2) {
			setError("Enter at least 2 characters.");
			return;
		}

		setLoading(true);
		try {
			const searchRecords = httpsCallable(functions, "searchScervAdminRecords");
			const response = await searchRecords({ query });
			setResults(response.data);
		} catch (err) {
			console.error("Admin command search failed:", err);
			setError("Search failed.");
		} finally {
			setLoading(false);
		}
	};

	const hasResults =
		results &&
		[
			results.customers,
			results.restaurants,
			results.orders,
			results.reservations,
		].some((rows) => rows && rows.length > 0);

	return (
		<div className="command-center-container">
			<section className="command-center-header">
				<div>
					<h1>Scerv Command Center</h1>
					<p>
						Search customers, restaurants, orders, and reservations from one
						place.
					</p>
				</div>
			</section>

			<form className="command-search" onSubmit={runSearch}>
				<input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Email, customer ID, restaurant name, order ID..."
				/>
				<button type="submit" disabled={loading}>
					{loading ? "Searching..." : "Search"}
				</button>
			</form>

			{error && <p className="command-error">{error}</p>}

			{results && !hasResults && (
				<p className="command-empty">No matching records found.</p>
			)}

			{results && hasResults && (
				<div className="command-results">
					{results.customers?.length > 0 && (
						<section className="command-panel">
							<h2>Customers</h2>
							{results.customers.map((customer) => (
								<Link
									className="command-result-row"
									to={`/customers/${customer.id}`}
									key={customer.id}
								>
									<strong>
										{customer.displayName ||
											customer.name ||
											customer.email ||
											customer.id}
									</strong>
									<span>{customer.email || customer.id}</span>
								</Link>
							))}
						</section>
					)}

					{results.restaurants?.length > 0 && (
						<section className="command-panel">
							<h2>Restaurants</h2>
							{results.restaurants.map((restaurant) => (
								<Link
									className="command-result-row"
									to={`/restaurants/${restaurant.id}`}
									key={restaurant.id}
								>
									<strong>
										{restaurant.restaurantName || restaurant.id}
									</strong>
									<span>
										{restaurant.city || "--"}, {restaurant.state || "--"} ·{" "}
										{restaurant.isActive ? "Active" : "Inactive"}
									</span>
								</Link>
							))}
						</section>
					)}

					{results.orders?.length > 0 && (
						<section className="command-panel">
							<h2>Orders</h2>
							{results.orders.map((order) => (
								<Link
									className="command-result-row"
									to={`/orders/${order.id}`}
									key={order.id}
								>
									<strong>{order.readableOrderId || order.id}</strong>
									<span>
										{order.restaurantName || order.restaurantId || "--"} ·{" "}
										{formatMoney(order.totalPrice)} ·{" "}
										{order.paymentStatus || "unknown"}
									</span>
								</Link>
							))}
						</section>
					)}

					{results.reservations?.length > 0 && (
						<section className="command-panel">
							<h2>Reservations</h2>
							{results.reservations.map((reservation) => (
								<div className="command-result-row" key={reservation.id}>
									<strong>{reservation.customerName || reservation.id}</strong>
									<span>
										{reservation.restaurantName || reservation.restaurantId} ·{" "}
										{reservation.status || "unknown"}
									</span>
								</div>
							))}
						</section>
					)}
				</div>
			)}
		</div>
	);
};

export default CommandCenter;
