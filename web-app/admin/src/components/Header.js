import React, { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getIdTokenResult } from "firebase/auth";
import "./Header.css";
import logo from "../assets/scerv_logo.png";
import {
	ADMIN_ENVIRONMENTS,
	auth,
	selectedAdminEnvironment,
	selectedAdminEnvironmentKey,
	switchAdminEnvironment,
} from "../config/firebase";
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

	const handleEnvironmentChange = (event) => {
		const nextEnvironmentKey = event.target.value;
		if (nextEnvironmentKey === selectedAdminEnvironmentKey) return;

		const nextEnvironment = ADMIN_ENVIRONMENTS[nextEnvironmentKey];
		if (
			nextEnvironmentKey === "production" &&
			!window.confirm(
				"Switch to PRODUCTION? This portal will manage live Scerv records.",
			)
		) {
			return;
		}

		if (
			nextEnvironment &&
			window.confirm(
				`Switch admin portal to ${nextEnvironment.label} (${nextEnvironment.projectId})? You will be sent back to sign in for that environment.`,
			)
		) {
			switchAdminEnvironment(nextEnvironmentKey);
		}
	};

	return (
		<header className="header">
			<div className="header-status-line">
				<span className="status-dot" />
				<span>{selectedAdminEnvironment.description}</span>
			</div>
			<div className="header-container">
				<div className="brand-lockup">
					<Link to="/" className="logo">
						<img src={logo} alt="Scerv Logo" className="logo-image" />
					</Link>
					<div>
						<p className="brand-eyebrow">Scerv Admin</p>
						<h1>Operator Console</h1>
					</div>
				</div>
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
						<li>
							<NavLink
								to="/demo-leads"
								className={({ isActive }) => (isActive ? "active" : "inactive")}
							>
								Demo Leads
							</NavLink>
						</li>
						<li>
							<NavLink
								to="/newsletter"
								className={({ isActive }) => (isActive ? "active" : "inactive")}
							>
								Newsletter
							</NavLink>
						</li>
						<li>
							<NavLink
								to="/promotions"
								className={({ isActive }) => (isActive ? "active" : "inactive")}
							>
								Promotions
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
										to="/data-explorer"
										className={({ isActive }) =>
											isActive ? "active" : "inactive"
										}
									>
										Data Explorer
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
				<div className="environment-switcher">
					<label htmlFor="admin-environment">Workspace</label>
					<select
						id="admin-environment"
						value={selectedAdminEnvironmentKey}
						onChange={handleEnvironmentChange}
					>
						{Object.values(ADMIN_ENVIRONMENTS).map((environment) => (
							<option key={environment.key} value={environment.key}>
								{environment.label}
							</option>
						))}
					</select>
					<span className={`environment-chip ${selectedAdminEnvironment.tone}`}>
						{selectedAdminEnvironment.shortLabel}
					</span>
				</div>
			</div>
		</header>
	);
};

export default Header;
