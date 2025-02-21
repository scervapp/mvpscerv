import React from "react";
import { Link, NavLink } from "react-router-dom";
import "./Header.css";
import logo from "../assets/scerv_logo.png";

const Header = () => {
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
					</ul>
				</nav>
			</div>
		</header>
	);
};

export default Header;
