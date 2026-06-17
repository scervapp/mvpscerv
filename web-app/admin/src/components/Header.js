import React, { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getIdTokenResult } from "firebase/auth";
import "./Header.css";
import logo from "../assets/scerv_logo.png";
import { auth } from "../config/firebase";
import { canManageAdminUsers, normalizeAdminRole } from "../utils/adminRoles";

const Header = () => {
	const [role, setRole] = useState("");

	useEffect(() => {
		const loadRole = async () => {
			if (!auth.currentUser) {
				setRole("");
				return;
			}

			try {
				const token = await getIdTokenResult(auth.currentUser);
				setRole(normalizeAdminRole(token.claims.role));
			} catch (error) {
				console.error("Error loading admin header role:", error);
				setRole("");
			}
		};

		loadRole();
	}, []);

	return (
		<header className="header">
			<div className="header-container">
				<Link to="/" className="logo">
					<img src={logo} alt="Scerv Logo" className="logo-image" />
				</Link>
				<nav>
					<ul className="nav-list">
						<li>
							<NavLink
								to="/"
								className={({ isActive }) => (isActive ? "active" : "inactive")}
							>
								Dashboard
							</NavLink>
						</li>
						<li>
							<NavLink
								to="/command-center"
								className={({ isActive }) => (isActive ? "active" : "inactive")}
							>
								Command Center
							</NavLink>
						</li>
						<li>
							<NavLink
								to="/restaurants"
								className={({ isActive }) => (isActive ? "active" : "inactive")}
							>
								Restaurants
							</NavLink>
						</li>
						<li>
							<NavLink
								to="/customers"
								className={({ isActive }) => (isActive ? "active" : "inactive")}
							>
								Customers
							</NavLink>
						</li>
						<li>
							<NavLink
								to="/support-cases"
								className={({ isActive }) => (isActive ? "active" : "inactive")}
							>
								Support Cases
							</NavLink>
						</li>
						{canManageAdminUsers(role) && (
							<>
								<li>
									<NavLink
										to="/audit-logs"
										className={({ isActive }) =>
											isActive ? "active" : "inactive"
										}
									>
										Audit Logs
									</NavLink>
								</li>
								<li>
									<NavLink
										to="/admin-users"
										className={({ isActive }) =>
											isActive ? "active" : "inactive"
										}
									>
										Admin Users
									</NavLink>
								</li>
							</>
						)}
					</ul>
				</nav>
			</div>
		</header>
	);
};

export default Header;
