import React, { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import { functions } from "../config/firebase";
import "./styles/Customers.css";

const Customers = () => {
	const [customers, setCustomers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [nextPageToken, setNextPageToken] = useState(null);
	const [hasMore, setHasMore] = useState(true);
	const [totalCustomers, setTotalCustomers] = useState(null);
	const navigate = useNavigate();

	const pageSize = 25; // Adjust as needed

	const fetchCustomers = async (pageToken) => {
		setLoading(true);
		setError(null);
		try {
			const listCustomers = httpsCallable(functions, "listScervCustomers");
			const response = await listCustomers({
				pageSize,
				pageToken: pageToken || null,
			});
			const customerData = response.data?.customers || [];

			setTotalCustomers(response.data?.totalCustomers || 0);
			setNextPageToken(response.data?.nextPageToken || null);
			setHasMore(Boolean(response.data?.hasMore));
			setCustomers(
				(prevCustomers) =>
					pageToken
						? [...prevCustomers, ...customerData] // Append
						: customerData // Replace on initial load
			);
		} catch (err) {
			setError("Error fetching customers.");
			console.error("Error fetching data:", err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchCustomers();
	}, []);

	const loadMore = () => {
		if (nextPageToken) {
			fetchCustomers(nextPageToken);
		}
	};

	if (loading && customers.length === 0) {
		return <div className="customers-container">Loading...</div>;
	}

	if (error) {
		return <div className="customers-container error">{error}</div>;
	}
	return (
		<div className="customers-container">
			<h2>Customers</h2>
			<p className="customers-summary">
				Showing {customers.length} of{" "}
				{totalCustomers !== null ? totalCustomers : "unknown"} customer records.
			</p>
			{customers.length === 0 && !loading ? (
				<p>No Customers Found.</p>
			) : (
				<table className="customers-table">
					<thead>
						<tr>
							<th>Customer ID</th>
							<th>Name</th>
							<th>First Name</th>
							<th>Last Name</th>
							<th>Email</th>
							<th>Phone</th>
							<th>Role</th>
						</tr>
					</thead>
					<tbody>
						{customers.map((customer) => (
							<tr
								key={customer.id}
								className="customer-click-row"
								onClick={() => navigate(`/customers/${customer.id}`)}
							>
								<td className="customer-id-cell">{customer.id}</td>
								<td>{customer.displayName || "--"}</td>
								<td>{customer.firstName}</td>
								<td>{customer.lastName}</td>
								<td>{customer.email}</td>
								<td>{customer.phoneNumber || "--"}</td>
								<td>{customer.role || "--"}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{hasMore && !loading && (
				<button onClick={loadMore} className="load-more-button">
					Load More
				</button>
			)}
			{loading && customers.length > 0 && <div>Loading...</div>}
		</div>
	);
};

export default Customers;
