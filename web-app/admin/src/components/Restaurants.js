import React, { useEffect, useState } from "react";
import { db } from "../config/firebase";
import {
	collection,
	getDocs,
	limit,
	orderBy,
	query,
	startAfter,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import "./styles/Restaurants.css";

const Restaurants = () => {
	const [restaurants, setRestaurants] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [lastVisible, setLastVisible] = useState(null); // For pagination
	const [hasMore, setHasMore] = useState(true); // For pagination
	const navigate = useNavigate(); // For programmatic navigation

	// --- Pagination (Basic Example) ---
	const pageSize = 10; // Number of restaurants per page

	const fetchRestaurants = async (startAfterDoc) => {
		setLoading(true);
		setError(null);
		try {
			let q = query(
				collection(db, "restaurants"),
				orderBy("restaurantName"),
				limit(pageSize)
			); // Basic ordering
			if (startAfterDoc) {
				q = query(
					collection(db, "restaurants"),
					orderBy("restaurantName"),
					startAfter(startAfterDoc),
					limit(pageSize)
				);
			}
			const querySnapshot = await getDocs(q);

			if (querySnapshot.empty) {
				setHasMore(false);
				setLoading(false);
				return; // No more documents
			}

			const restaurantData = [];
			querySnapshot.forEach((doc) => {
				restaurantData.push({ id: doc.id, ...doc.data() });
			});

			// Update lastVisible for the next page
			setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
			setRestaurants(
				(prevRestaurants) =>
					startAfterDoc
						? [...prevRestaurants, ...restaurantData] // Append
						: restaurantData // Replace on initial load
			);
		} catch (err) {
			setError("Error fetching restaurants.");
			console.error("Error fetching data:", err);
		} finally {
			setLoading(false);
		}
	};
	//Initial Load
	useEffect(() => {
		fetchRestaurants();
	}, []);

	const loadMore = () => {
		if (lastVisible) {
			fetchRestaurants(lastVisible);
		}
	};

	const handleViewDetails = (id) => {
		navigate(`/restaurants/${id}`); // Programmatically navigate
	};

	if (loading && restaurants.length === 0) {
		return <div className="restaurants-container">Loading...</div>;
	}

	if (error) {
		return <div className="restaurants-container error">{error}</div>;
	}

	return (
		<div className="restaurants-container">
			<div className="restaurants-header">
				<h2>Restaurants</h2>
				<button
					type="button"
					className="view-details-button"
					onClick={() => navigate("/restaurants/new")}
				>
					Add Restaurant
				</button>
			</div>
			{restaurants.length === 0 && !loading ? (
				<p>No Restaurants Found</p>
			) : (
				<table className="restaurants-table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Store #</th>
							<th>City</th>
							<th>State</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{restaurants.map((restaurant) => (
							<tr key={restaurant.id}>
								<td>{restaurant.restaurantName}</td>
								<td>{restaurant.restaurantNumber}</td>
								<td>{restaurant.city}</td>
								<td>{restaurant.state}</td>
								<td>
									<button
										onClick={() => handleViewDetails(restaurant.id)}
										className="view-details-button"
									>
										View Details
									</button>
								</td>
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
			{loading && restaurants.length > 0 && <div>Loading...</div>}
		</div>
	);
};

export default Restaurants;
