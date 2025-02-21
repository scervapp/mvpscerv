import React, { useEffect, useState } from "react";
import {
	collection,
	getDocs,
	query,
	orderBy,
	limit,
	startAfter,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "./styles/Customers.css";

const Customers = () => {
	const [customers, setCustomers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [lastVisible, setLastVisible] = useState(null);
	const [hasMore, setHasMore] = useState(true);

	const pageSize = 25; // Adjust as needed

	const fetchCustomers = async (startAfterDoc) => {
		setLoading(true);
		setError(null);
		try {
			let q = query(
				collection(db, "customers"),
				orderBy("lastName"),
				limit(pageSize)
			); // Order by last name, for example
			if (startAfterDoc) {
				q = query(
					collection(db, "customers"),
					orderBy("lastName"),
					startAfter(startAfterDoc),
					limit(pageSize)
				);
			}
			const querySnapshot = await getDocs(q);

			if (querySnapshot.empty) {
				setHasMore(false);
				setLoading(false);
				return;
			}

			const customerData = [];
			querySnapshot.forEach((doc) => {
				customerData.push({ id: doc.id, ...doc.data() });
			});

			setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
			setCustomers(
				(prevCustomers) =>
					startAfterDoc
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
		if (lastVisible) {
			fetchCustomers(lastVisible);
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
			{customers.length === 0 && !loading ? (
				<p>No Customers Found.</p>
			) : (
				<table className="customers-table">
					<thead>
						<tr>
							<th>First Name</th>
							<th>Last Name</th>
							<th>Email</th>
							{/* Add other relevant fields here */}
						</tr>
					</thead>
					<tbody>
						{customers.map((customer) => (
							<tr key={customer.id}>
								<td>{customer.firstName}</td>
								<td>{customer.lastName}</td>
								<td>{customer.email}</td>
								{/* Add other relevant data cells here */}
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
