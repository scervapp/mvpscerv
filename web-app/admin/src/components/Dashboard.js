import React, { useEffect, useState } from "react";
import InitialSetup from "./InitialSetup";
import {
	getAuth,
	getIdToken,
	getIdTokenResult,
	onAuthStateChanged,
	signOut,
} from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import "./styles/Dashboard.css";
import { collection, getCountFromServer, query } from "firebase/firestore";
import { db } from "../config/firebase";

const Dashboard = () => {
	const [isGodMode, setIsGodMode] = useState(false);
	const [isBizDev, setIsBizDev] = useState(false);
	const [isSales, setIsSales] = useState(false);
	const [isAdmin, setIsAdmin] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const navigate = useNavigate();
	const [userName, setUserName] = useState("");
	const [totalRestaurants, setTotalRestaurants] = useState(null); //for total restaurants
	const [totalCustomers, setTotalCustomers] = useState(null); //for total customers

	const auth = getAuth();

	useEffect(() => {
		const checkRoleAndFetchData = async () => {
			setLoading(true);
			setError(null); // Clear previous errors
			if (auth.currentUser) {
				try {
					const idTokenResult = await getIdTokenResult(auth.currentUser);
					const role = idTokenResult.claims.role;
					setIsGodMode(role === "godmode");
					setIsAdmin(role === "admin" || role === "godmode");

					// Get user's display name (or email if name is not available)
					setUserName(auth.currentUser.displayName || auth.currentUser.email);

					// --- Fetch Total Restaurants ---
					const restaurantsQuery = query(collection(db, "restaurants"));
					const restaurantsSnapshot = await getCountFromServer(
						restaurantsQuery
					);
					setTotalRestaurants(restaurantsSnapshot.data().count);

					// --- Fetch Total Customers ---
					const customersQuery = query(collection(db, "customers"));
					const customersSnapshot = await getCountFromServer(customersQuery);
					setTotalCustomers(customersSnapshot.data().count);
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
			<p>Welcome, {userName}! 👋</p>

			<section className="dashboard-section">
				<h2>Quick Actions</h2>
				{isAdmin && (
					<Link to="/invite-users" className="dashboard-button">
						Invite Users
					</Link>
				)}
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
						<h3>Recent Activity</h3>
						<p>--</p>
					</div>
				</div>
			</section>

			{/* Add more sections as needed (e.g., recent orders, reports, etc.) */}
		</div>
	);
};
export default Dashboard;
