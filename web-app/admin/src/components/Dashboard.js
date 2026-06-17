import React, { useEffect, useState } from "react";
import { getAuth, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import "./styles/Dashboard.css";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";

const Dashboard = () => {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const navigate = useNavigate();
	const [userName, setUserName] = useState("");
	const [totalRestaurants, setTotalRestaurants] = useState(null); //for total restaurants
	const [totalCustomers, setTotalCustomers] = useState(null); //for total customers
	const [totalOrders, setTotalOrders] = useState(null);

	const auth = getAuth();

	useEffect(() => {
		const checkRoleAndFetchData = async () => {
			setLoading(true);
			setError(null); // Clear previous errors
			if (auth.currentUser) {
				try {
					// Get user's display name (or email if name is not available)
					setUserName(auth.currentUser.displayName || auth.currentUser.email);

					const getStats = httpsCallable(
						functions,
						"getScervAdminDashboardStats"
					);
					const response = await getStats({});
					setTotalRestaurants(response.data?.totalRestaurants || 0);
					setTotalCustomers(response.data?.totalCustomers || 0);
					setTotalOrders(response.data?.totalOrders || 0);
				} catch (error) {
					console.error("Error fetching data:", error);
					setError("Failed to load dashboard data.");
				}
			}
			setLoading(false);
		};
		checkRoleAndFetchData();
	}, [auth]);

	const handleSignOut = () => {
		signOut(auth)
			.then(() => {
				// Sign-out successful.
				navigate("/signin");
			})
			.catch((error) => {
				// An error happened.
				console.error("Sign-out error:", error);
				setError("Failed to sign out.");
			});
	};

	if (loading) {
		return <div className="dashboard-container">Loading...</div>;
	}

	if (error) {
		return <div className="dashboard-container error">{error}</div>;
	}
	return (
		<div className="dashboard-container">
			<h1>Admin Dashboard</h1>
			<p>Welcome, {userName}.</p>

			<section className="dashboard-section">
				<h2>Quick Actions</h2>
				<button
					className="dashboard-button"
					onClick={() => navigate("/command-center")}
				>
					Command Center
				</button>
				<button className="dashboard-button" onClick={handleSignOut}>
					Sign Out
				</button>
			</section>

			<section className="dashboard-section">
				<h2>Statistics</h2>
				<div className="dashboard-stats">
					<div className="dashboard-stat">
						<h3>Total Restaurants</h3>
						<p className="stat-count">
							{totalRestaurants !== null ? totalRestaurants : "Loading..."}
						</p>
					</div>
					<div className="dashboard-stat">
						<h3>Total Customers</h3>
						<p className="stat-count">
							{totalCustomers !== null ? totalCustomers : "Loading..."}
						</p>
					</div>
					<div className="dashboard-stat">
						<h3>Total Orders</h3>
						<p className="stat-count">
							{totalOrders !== null ? totalOrders : "Loading..."}
						</p>
					</div>
				</div>
			</section>

			{/* Add more sections as needed (e.g., recent orders, reports, etc.) */}
		</div>
	);
};
export default Dashboard;
